import { claude, CLAUDE_MODEL } from "@/lib/llm";
import { supabase } from "@/lib/supabase";
import { cacheCutoffIso } from "@/lib/config";
import type { Brief, Candidate, DecisionMaker } from "@/lib/types";
import type { WatchlistCompany } from "@/lib/watchlist";
import type { PipelineEmitter } from "@/lib/pipeline-events";
import type { QualificationSignals } from "@/pipeline/qualification";

const noop: PipelineEmitter = () => {};

function websiteTitle(c: Candidate): string {
  const sig = c.signals as QualificationSignals | null;
  const first = sig?.qualification?.websites?.find((w) => w.ok);
  if (first?.page_title) return first.page_title;
  if (first?.text) return first.text.slice(0, 80).replace(/\s+/g, " ").trim() + "…";
  return c.headline ?? c.current_title ?? "Portfolio";
}

function buildPrompt(
  dm: DecisionMaker,
  company: WatchlistCompany,
  top3: Candidate[]
): string {
  const candidateLines = top3
    .map(
      (c, i) =>
        `${i + 1}. ${c.name} (${c.current_title ?? "Designer"}) — ${c.portfolio_url ?? c.websites?.[0] ?? "no portfolio"}\n   "${websiteTitle(c)}"`
    )
    .join("\n");

  return `You are Riffle, an AI recruiting assistant. Write a short cold email to a startup founder persuading them to hire their first Founding Designer right now.

Context:
- Company: ${company.name} (${company.funding_stage ?? "early"} stage, ~${company.headcount ?? "?"} people)
- Recipient: ${dm.name}${dm.title ? `, ${dm.title}` : ""}

Top 3 designer candidates already sourced and vetted:
${candidateLines}

Instructions:
- Under 180 words in the body
- Be specific, warm, and direct
- Reference the company stage as a reason now is the right time
- Name each of the 3 candidates and include their portfolio link inline
- End with a low-friction CTA (e.g. "Happy to share full profiles — just reply")
- Sign as "Riffle, your AI recruiting co-pilot"

Respond ONLY with valid JSON — no markdown, no explanation:
{"subject":"...","body":"..."}`;
}

export async function generateBriefs(
  qualified: Candidate[],
  decisionMakers: DecisionMaker[],
  company: WatchlistCompany,
  emit: PipelineEmitter = noop
): Promise<Brief[]> {
  const db = supabase();
  const cutoff = cacheCutoffIso("person");

  const top3 = qualified
    .filter((c) => c.portfolio_url ?? c.websites?.length)
    .slice(0, 3);

  if (top3.length === 0) {
    emit({
      type: "stage_done",
      stage: "brief",
      summary: "0 drafts — no qualified candidates with portfolios",
    });
    return [];
  }

  const dmsWithEmail = decisionMakers.filter((dm) => dm.email);
  const dmsAll = dmsWithEmail.length > 0 ? dmsWithEmail : decisionMakers;

  const { data: cached } = await db
    .from("briefs")
    .select("id, decision_maker_id, subject, body, candidate_ids, generated_at")
    .eq("company_id", company.id)
    .gte("generated_at", cutoff);

  const cachedByDm = new Map(
    (cached ?? []).map((r: {
      id: string;
      decision_maker_id: string;
      subject: string;
      body: string;
      candidate_ids: string[];
      generated_at: string;
    }) => [r.decision_maker_id, r])
  );

  const allCached = dmsAll.every((dm) => cachedByDm.has(dm.id));
  if (allCached) {
    emit({
      type: "cache",
      stage: "brief",
      hit: true,
      detail: `${dmsAll.length} draft${dmsAll.length === 1 ? "" : "s"} cached`,
    });
    const briefs: Brief[] = dmsAll.map((dm) => {
      const r = cachedByDm.get(dm.id)!;
      return {
        id: r.id,
        decision_maker_id: dm.id,
        decision_maker_name: dm.name,
        decision_maker_email: dm.email,
        subject: r.subject,
        body: r.body,
        candidate_ids: r.candidate_ids,
        generated_at: r.generated_at,
      };
    });
    emit({
      type: "stage_done",
      stage: "brief",
      summary: `${briefs.length} draft${briefs.length === 1 ? "" : "s"} (from cache)`,
    });
    return briefs;
  }

  emit({
    type: "cache",
    stage: "brief",
    hit: false,
    detail: `Generating ${dmsAll.length} email draft${dmsAll.length === 1 ? "" : "s"} with Claude`,
  });

  const now = new Date().toISOString();
  const briefs: Brief[] = [];
  const llm = claude();

  for (const dm of dmsAll) {
    if (cachedByDm.has(dm.id)) {
      const r = cachedByDm.get(dm.id)!;
      briefs.push({
        id: r.id,
        decision_maker_id: dm.id,
        decision_maker_name: dm.name,
        decision_maker_email: dm.email,
        subject: r.subject,
        body: r.body,
        candidate_ids: r.candidate_ids,
        generated_at: r.generated_at,
      });
      continue;
    }

    emit({
      type: "log",
      stage: "brief",
      message: `Generating draft for ${dm.name}…`,
    });

    let subject = "";
    let body = "";

    try {
      const msg = await llm.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 512,
        messages: [{ role: "user", content: buildPrompt(dm, company, top3) }],
      });
      const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      const parsed = JSON.parse(raw) as { subject: string; body: string };
      subject = parsed.subject;
      body = parsed.body;
    } catch (err) {
      console.error(`brief generation failed for ${dm.name}:`, err);
      emit({
        type: "log",
        stage: "brief",
        message: `✗ ${dm.name} — generation failed`,
      });
      continue;
    }

    const candidateIds = top3.map((c) => c.id);
    const { data: row, error } = await db
      .from("briefs")
      .upsert(
        {
          company_id: company.id,
          decision_maker_id: dm.id,
          candidate_ids: candidateIds,
          subject,
          body,
          generated_at: now,
        },
        { onConflict: "company_id,decision_maker_id" }
      )
      .select("id")
      .single();

    if (error) {
      console.error(`briefs upsert failed for ${dm.name}:`, error.message);
    }

    emit({
      type: "log",
      stage: "brief",
      message: `✓ ${dm.name} — draft ready`,
    });

    briefs.push({
      id: row?.id ?? crypto.randomUUID(),
      decision_maker_id: dm.id,
      decision_maker_name: dm.name,
      decision_maker_email: dm.email,
      subject,
      body,
      candidate_ids: candidateIds,
      generated_at: now,
    });
  }

  emit({
    type: "stage_done",
    stage: "brief",
    summary: `${briefs.length} draft${briefs.length === 1 ? "" : "s"} generated`,
  });

  return briefs;
}
