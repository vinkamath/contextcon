import {
  crustdata,
  type PersonEnrichData,
} from "@/lib/crustdata";
import { supabase } from "@/lib/supabase";
import { cacheCutoffIso } from "@/lib/config";
import type { WatchlistCompany } from "@/lib/watchlist";
import type { DecisionMaker } from "@/lib/types";
import type { CompanyData } from "@/lib/company-data";
import type { PipelineEmitter } from "@/lib/pipeline-events";

const noop: PipelineEmitter = () => {};

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

async function getCompanyData(
  company: WatchlistCompany,
  emit: PipelineEmitter
): Promise<CompanyData> {
  const db = supabase();
  const cutoff = cacheCutoffIso("company");

  const { data: cached, error: readErr } = await db
    .from("companies")
    .select("raw_enrich, enriched_at")
    .eq("id", company.id)
    .gte("enriched_at", cutoff)
    .maybeSingle();
  if (readErr) throw new Error(`company cache read: ${readErr.message}`);

  if (cached?.raw_enrich) {
    emit({
      type: "cache",
      stage: "decision_makers",
      hit: true,
      detail: `Company profile cached (${ageLabel(cached.enriched_at)})`,
    });
    return cached.raw_enrich as CompanyData;
  }

  emit({
    type: "cache",
    stage: "decision_makers",
    hit: false,
    detail: "Company profile not cached — calling Crustdata /company/enrich",
  });
  const res = await crustdata.companyEnrich({
    crustdata_company_ids: [Number(company.id)],
    fields: ["basic_info", "people", "headcount", "funding", "locations", "taxonomy"],
  });
  const companyData = res?.[0]?.matches?.[0]?.company_data;
  if (!companyData) {
    throw new Error(`No company enrich result for ${company.id}`);
  }

  const { error: writeErr } = await db.from("companies").upsert(
    {
      id: company.id,
      name: company.name,
      domain: company.domain,
      funding_stage: company.funding_stage,
      headcount: companyData.headcount?.total ?? company.headcount,
      on_watchlist: true,
      raw_enrich: companyData,
      enriched_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (writeErr) throw new Error(`company cache write: ${writeErr.message}`);
  emit({
    type: "log",
    stage: "decision_makers",
    message: "Wrote company profile to Supabase",
  });

  return companyData;
}

function extractBusinessEmail(data: PersonEnrichData | null): string | null {
  const emails = data?.contact?.business_emails;
  if (!Array.isArray(emails) || emails.length === 0) return null;
  const first = emails[0];
  if (typeof first === "string") return first;
  return first?.email ?? null;
}

async function getPersonEnrich(
  personId: string,
  linkedinUrl: string | null,
  emit: PipelineEmitter,
  label: string
): Promise<{ data: PersonEnrichData | null; fromCache: boolean }> {
  if (!linkedinUrl) return { data: null, fromCache: false };

  const db = supabase();
  const cutoff = cacheCutoffIso("person");

  const { data: cached } = await db
    .from("decision_makers")
    .select("raw_enrich, enriched_at")
    .eq("id", personId)
    .gte("enriched_at", cutoff)
    .maybeSingle();
  if (cached?.raw_enrich) {
    emit({
      type: "log",
      stage: "decision_makers",
      message: `${label} — cached (${ageLabel(cached.enriched_at)})`,
    });
    return { data: cached.raw_enrich as PersonEnrichData, fromCache: true };
  }

  emit({
    type: "log",
    stage: "decision_makers",
    message: `${label} — enriching via Crustdata`,
  });
  const res = await crustdata.personEnrich({
    professional_network_profile_urls: [linkedinUrl],
    fields: ["basic_profile", "contact", "social_handles"],
  });
  return {
    data: res?.[0]?.matches?.[0]?.person_data ?? null,
    fromCache: false,
  };
}

export async function findDecisionMakers(
  company: WatchlistCompany,
  emit: PipelineEmitter = noop
): Promise<DecisionMaker[]> {
  const companyData = await getCompanyData(company, emit);
  const rawDMs = companyData.people?.decision_makers ?? [];
  emit({
    type: "log",
    stage: "decision_makers",
    message: `Found ${rawDMs.length} C-level contacts to enrich`,
  });

  const db = supabase();
  const results: DecisionMaker[] = [];
  let cacheHits = 0;
  let liveCalls = 0;

  for (let i = 0; i < rawDMs.length; i++) {
    const p = rawDMs[i];
    const name = p.basic_profile?.name;
    if (!name) continue;

    const id = String(p.crustdata_person_id);
    const title = p.basic_profile?.current_title ?? null;
    const linkedinUrl =
      p.social_handles?.professional_network_identifier?.profile_url ?? null;
    const label = `${name} (${i + 1}/${rawDMs.length})`;

    let personData: PersonEnrichData | null = null;
    try {
      const r = await getPersonEnrich(id, linkedinUrl, emit, label);
      personData = r.data;
      if (r.fromCache) cacheHits++;
      else if (personData) liveCalls++;
    } catch (err) {
      console.error(`person enrich failed for ${name}:`, err);
      emit({
        type: "log",
        stage: "decision_makers",
        message: `${label} — enrich failed`,
      });
    }

    const email = extractBusinessEmail(personData);
    const enrichedAt = personData ? new Date().toISOString() : null;

    const { error } = await db.from("decision_makers").upsert(
      {
        id,
        company_id: company.id,
        name,
        title,
        linkedin_url: linkedinUrl,
        verified_email: email,
        raw_enrich: personData,
        enriched_at: enrichedAt,
      },
      { onConflict: "id" }
    );
    if (error) console.error(`decision_maker upsert failed for ${name}:`, error.message);

    results.push({
      id,
      company_id: company.id,
      name,
      title,
      linkedin_url: linkedinUrl,
      email,
    });
  }

  emit({
    type: "stage_done",
    stage: "decision_makers",
    summary: `${results.length} decision makers · ${cacheHits} cached · ${liveCalls} enriched`,
  });

  return results;
}
