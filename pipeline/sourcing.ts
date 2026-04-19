import {
  crustdata,
  type FilterCondition,
  type PersonSearchRequest,
  type PersonEnrichData,
} from "@/lib/crustdata";
import { supabase } from "@/lib/supabase";
import { cacheCutoffIso } from "@/lib/config";
import type { DemoCompany } from "@/lib/demo-companies";
import type { Candidate } from "@/lib/types";
import type { CompanyData, PersonProfile } from "@/lib/company-data";
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

async function getCompanySignals(
  companyId: string
): Promise<{ headquarters: string | null; industry: string | null }> {
  const db = supabase();
  const { data } = await db
    .from("companies")
    .select("raw_enrich")
    .eq("id", companyId)
    .maybeSingle();

  const cd = data?.raw_enrich as CompanyData | null;
  return {
    headquarters: cd?.locations?.headquarters ?? null,
    industry: cd?.taxonomy?.professional_network_industry ?? null,
  };
}

async function getCachedCandidates(
  companyId: string
): Promise<{ candidates: Candidate[]; sourcedAt: string | null } | null> {
  const db = supabase();
  const cutoff = cacheCutoffIso("person");

  const { data: sourcing } = await db
    .from("candidate_sourcing")
    .select("sourced_at")
    .eq("company_id", companyId)
    .gte("sourced_at", cutoff)
    .order("sourced_at", { ascending: false })
    .limit(1);

  if (!sourcing || sourcing.length === 0) return null;

  const ids =
    (
      await db
        .from("candidate_sourcing")
        .select("candidate_id")
        .eq("company_id", companyId)
    ).data?.map((r: { candidate_id: string }) => r.candidate_id) ?? [];

  const { data: rows } = await db
    .from("candidates")
    .select(
      "id, name, current_title, current_company, location, headline, linkedin_url, portfolio_url, portfolio_score, signals, enriched_at"
    )
    .in("id", ids);

  return {
    candidates: (rows ?? []) as Candidate[],
    sourcedAt: sourcing[0].sourced_at ?? null,
  };
}

function buildSearchRequest(
  headquarters: string,
  industry: string
): PersonSearchRequest {
  const andConditions: FilterCondition[] = [
    {
      op: "or",
      conditions: [
        { field: "experience.employment_details.current.title", type: "(.)", value: "product designer" },
        { field: "experience.employment_details.current.title", type: "(.)", value: "ux designer" },
        { field: "experience.employment_details.current.title", type: "(.)", value: "founding designer" },
        { field: "experience.employment_details.current.title", type: "(.)", value: "design lead" },
      ],
    },
    {
      field: "experience.employment_details.current.seniority_level",
      type: "in",
      value: ["Senior", "Lead", "Staff"],
    },
    {
      field: "basic_profile.location.full_location",
      type: "(.)",
      value: headquarters,
    },
    {
      field: "experience.employment_details.current.company_professional_network_industry",
      type: "(.)",
      value: industry,
    },
  ];

  return {
    filters: { op: "and", conditions: andConditions },
    limit: 50,
  };
}

async function enrichBatch(
  profiles: PersonProfile[],
  emit: PipelineEmitter
): Promise<Map<number, PersonEnrichData>> {
  const result = new Map<number, PersonEnrichData>();
  const BATCH = 10;
  const totalBatches = Math.ceil(profiles.length / BATCH);

  for (let i = 0; i < profiles.length; i += BATCH) {
    const batchNum = i / BATCH + 1;
    const batch = profiles.slice(i, i + BATCH);
    const urls = batch
      .map(
        (p) =>
          p.social_handles?.professional_network_identifier?.profile_url ?? null
      )
      .filter((u): u is string => u !== null);

    if (urls.length === 0) continue;

    emit({
      type: "log",
      stage: "sourcing",
      message: `Enriching batch ${batchNum}/${totalBatches} (${urls.length} profiles)`,
    });

    try {
      const res = await crustdata.personEnrich({
        professional_network_profile_urls: urls,
        fields: ["basic_profile", "contact", "experience", "social_handles"],
      });

      for (const item of res) {
        const personData = item.matches?.[0]?.person_data;
        if (personData?.crustdata_person_id) {
          result.set(personData.crustdata_person_id, personData);
        }
      }
    } catch (err) {
      console.error(`personEnrich batch ${i}–${i + BATCH} failed:`, err);
      emit({
        type: "log",
        stage: "sourcing",
        message: `Batch ${batchNum}/${totalBatches} failed — skipping`,
      });
    }
  }

  return result;
}

export async function sourceCandidates(
  company: DemoCompany,
  emit: PipelineEmitter = noop
): Promise<Candidate[]> {
  const cached = await getCachedCandidates(company.id);
  if (cached && cached.candidates.length > 0) {
    emit({
      type: "cache",
      stage: "sourcing",
      hit: true,
      detail: `Sourcing cached (${ageLabel(cached.sourcedAt)}) — ${cached.candidates.length} candidates`,
    });
    emit({
      type: "stage_done",
      stage: "sourcing",
      summary: `${cached.candidates.length} candidates (from cache)`,
    });
    return cached.candidates;
  }

  emit({
    type: "cache",
    stage: "sourcing",
    hit: false,
    detail: "No cached sourcing — running live search",
  });

  const { headquarters, industry } = await getCompanySignals(company.id);
  if (!headquarters) throw new Error(`No headquarters in enrich data for company ${company.id}`);
  if (!industry) throw new Error(`No industry in enrich data for company ${company.id}`);

  emit({
    type: "log",
    stage: "sourcing",
    message: `Searching senior designers in ${headquarters} · industry "${industry}"`,
  });

  const searchBody = buildSearchRequest(headquarters, industry);
  const searchRaw = await crustdata.personSearch(searchBody);
  const profiles = searchRaw.profiles ?? [];

  emit({
    type: "log",
    stage: "sourcing",
    message: `Crustdata returned ${profiles.length} matching profiles`,
  });

  if (profiles.length === 0) {
    emit({
      type: "stage_done",
      stage: "sourcing",
      summary: "0 candidates — search returned no profiles",
    });
    return [];
  }

  const enrichMap = await enrichBatch(profiles, emit);

  emit({
    type: "log",
    stage: "sourcing",
    message: `Writing ${profiles.length} candidates to Supabase`,
  });

  const db = supabase();
  const results: Candidate[] = [];

  for (const profile of profiles) {
    const id = String(profile.crustdata_person_id);
    const name = profile.basic_profile?.name;
    if (!name) continue;

    const enriched = enrichMap.get(profile.crustdata_person_id) ?? null;
    const linkedinUrl =
      profile.social_handles?.professional_network_identifier?.profile_url ?? null;
    const currentCompany =
      enriched?.experience?.employment_details?.current?.[0]?.company_name ?? null;

    const { error: upsertErr } = await db.from("candidates").upsert(
      {
        id,
        name,
        current_title: profile.basic_profile?.current_title ?? null,
        current_company: currentCompany,
        location: profile.basic_profile?.location?.raw ?? null,
        headline: profile.basic_profile?.headline ?? null,
        linkedin_url: linkedinUrl,
        portfolio_url: null,
        portfolio_score: null,
        signals: null,
        enriched_at: new Date().toISOString(),
        raw_enrich: enriched,
      },
      { onConflict: "id" }
    );
    if (upsertErr) {
      console.error(`candidates upsert failed for ${name}:`, upsertErr.message);
      continue;
    }

    const { error: linkErr } = await db.from("candidate_sourcing").upsert(
      { candidate_id: id, company_id: company.id },
      { onConflict: "candidate_id,company_id" }
    );
    if (linkErr) {
      console.error(`candidate_sourcing upsert failed for ${name}:`, linkErr.message);
    }

    results.push({
      id,
      name,
      current_title: profile.basic_profile?.current_title ?? null,
      current_company: currentCompany,
      location: profile.basic_profile?.location?.raw ?? null,
      headline: profile.basic_profile?.headline ?? null,
      linkedin_url: linkedinUrl,
      portfolio_url: null,
      portfolio_score: null,
      signals: null,
      enriched_at: new Date().toISOString(),
    });
  }

  emit({
    type: "stage_done",
    stage: "sourcing",
    summary: `${results.length} candidates sourced`,
  });

  return results;
}
