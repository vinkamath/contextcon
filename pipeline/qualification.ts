import { crustdata, type WebFetchResult } from "@/lib/crustdata";
import { supabase } from "@/lib/supabase";
import { cacheCutoffIso } from "@/lib/config";
import type { Candidate } from "@/lib/types";
import type { PipelineEmitter } from "@/lib/pipeline-events";

const noop: PipelineEmitter = () => {};

const MAX_URLS_PER_CALL = 10;
const TEXT_TRUNCATE = 8000;

export type WebsiteCheck = {
  url: string;
  ok: boolean;
  page_title: string | null;
  text: string | null;
  text_length: number;
  error: string | null;
};

export type QualificationSignals = {
  qualification: {
    checked_at: string;
    qualified: boolean;
    websites: WebsiteCheck[];
  };
};

function ageLabel(iso: string | null | undefined): string {
  if (!iso) return "just now";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  );
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function hasQualification(signals: unknown): signals is QualificationSignals {
  if (!signals || typeof signals !== "object") return false;
  const q = (signals as { qualification?: unknown }).qualification;
  return !!q && typeof q === "object" && "checked_at" in (q as object);
}

function isFresh(checkedAt: string, cutoff: string): boolean {
  return checkedAt >= cutoff;
}

function resultToCheck(r: WebFetchResult): WebsiteCheck {
  if (!r.success) {
    return {
      url: r.url,
      ok: false,
      page_title: null,
      text: null,
      text_length: 0,
      error: r.error,
    };
  }
  const text = htmlToText(r.content);
  const truncated = text.length > TEXT_TRUNCATE ? text.slice(0, TEXT_TRUNCATE) : text;
  return {
    url: r.url,
    ok: true,
    page_title: r.pageTitle ?? null,
    text: truncated,
    text_length: text.length,
    error: null,
  };
}

async function fetchUrls(
  urls: string[],
  emit: PipelineEmitter,
  totalBatches: number,
  batchOffset: number
): Promise<Map<string, WebsiteCheck>> {
  const out = new Map<string, WebsiteCheck>();
  for (let i = 0; i < urls.length; i += MAX_URLS_PER_CALL) {
    const batchNum = batchOffset + i / MAX_URLS_PER_CALL + 1;
    const batch = urls.slice(i, i + MAX_URLS_PER_CALL);
    emit({
      type: "log",
      stage: "qualification",
      message: `Batch ${batchNum}/${totalBatches} — scraping ${batch.length} URL${batch.length === 1 ? "" : "s"}…`,
    });
    try {
      const res = await crustdata.webFetch({ urls: batch });
      for (const r of res) out.set(r.url, resultToCheck(r));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const url of batch) {
        out.set(url, {
          url,
          ok: false,
          page_title: null,
          text: null,
          text_length: 0,
          error: msg,
        });
      }
    }
  }
  return out;
}

export async function qualifyCandidates(
  candidates: Candidate[],
  emit: PipelineEmitter = noop
): Promise<Candidate[]> {
  const db = supabase();
  const cutoff = cacheCutoffIso("person");

  const withWebsites = candidates.filter(
    (c) => Array.isArray(c.websites) && c.websites.length > 0
  );
  const withoutWebsites = candidates.length - withWebsites.length;

  emit({
    type: "log",
    stage: "qualification",
    message: `${withWebsites.length}/${candidates.length} candidates have websites (${withoutWebsites} skipped)`,
  });

  if (withWebsites.length === 0) {
    emit({
      type: "stage_done",
      stage: "qualification",
      summary: "0 qualified — no candidates had websites",
    });
    return [];
  }

  const { data: existing } = await db
    .from("candidates")
    .select("id, signals")
    .in(
      "id",
      withWebsites.map((c) => c.id)
    );
  const signalsById = new Map<string, unknown>(
    (existing ?? []).map((r: { id: string; signals: unknown }) => [r.id, r.signals])
  );

  const urlsToFetch = new Set<string>();
  const cachedByCandidate = new Map<string, WebsiteCheck[]>();
  let cacheHits = 0;

  for (const c of withWebsites) {
    const sig = signalsById.get(c.id);
    if (hasQualification(sig) && isFresh(sig.qualification.checked_at, cutoff)) {
      cachedByCandidate.set(c.id, sig.qualification.websites);
      cacheHits++;
      continue;
    }
    for (const u of c.websites ?? []) urlsToFetch.add(u);
  }

  emit({
    type: "cache",
    stage: "qualification",
    hit: cacheHits > 0,
    detail:
      cacheHits === withWebsites.length
        ? `All ${cacheHits} candidates cached (${ageLabel(cutoff)} TTL)`
        : `${cacheHits} cached · scraping ${urlsToFetch.size} URLs for ${withWebsites.length - cacheHits} candidates`,
  });

  let fetched = new Map<string, WebsiteCheck>();
  if (urlsToFetch.size > 0) {
    const urls = Array.from(urlsToFetch);
    const totalBatches = Math.ceil(urls.length / MAX_URLS_PER_CALL);
    emit({
      type: "log",
      stage: "qualification",
      message: `Scraping ${urls.length} URL${urls.length === 1 ? "" : "s"} across ${totalBatches} batch${totalBatches === 1 ? "" : "es"}`,
    });
    fetched = await fetchUrls(urls, emit, totalBatches, 0);
  }

  const now = new Date().toISOString();
  const qualified: Candidate[] = [];

  for (const c of withWebsites) {
    const cachedChecks = cachedByCandidate.get(c.id);
    const checks: WebsiteCheck[] = cachedChecks
      ? cachedChecks
      : (c.websites ?? []).map(
          (u) =>
            fetched.get(u) ?? {
              url: u,
              ok: false,
              page_title: null,
              text: null,
              text_length: 0,
              error: "no result returned",
            }
        );

    const firstLive = checks.find((ck) => ck.ok)?.url ?? null;
    const portfolioUrl = firstLive ?? c.websites?.[0] ?? null;
    const signals: QualificationSignals = {
      qualification: {
        checked_at: cachedChecks ? (signalsById.get(c.id) as QualificationSignals).qualification.checked_at : now,
        qualified: true,
        websites: checks,
      },
    };

    const liveSites = checks.filter((k) => k.ok).length;
    emit({
      type: "log",
      stage: "qualification",
      message: `${liveSites > 0 ? "✓" : "✗"} ${c.name} — ${liveSites}/${checks.length} site${checks.length === 1 ? "" : "s"} live`,
    });

    if (!cachedChecks) {
      const { error } = await db
        .from("candidates")
        .update({ signals, portfolio_url: portfolioUrl })
        .eq("id", c.id);
      if (error) console.error(`candidate qualify upsert failed for ${c.name}:`, error.message);
    }

    qualified.push({ ...c, signals, portfolio_url: portfolioUrl });
  }

  emit({
    type: "stage_done",
    stage: "qualification",
    summary: `${qualified.length} qualified · ${withoutWebsites} skipped (no website)`,
  });

  return qualified;
}
