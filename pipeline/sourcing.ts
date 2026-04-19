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

async function getCachedCandidates(companyId: string): Promise<Candidate[] | null> {
  const db = supabase();
  const cutoff = cacheCutoffIso("person");

  const { data: sourcing } = await db
    .from("candidate_sourcing")
    .select("sourced_at")
    .eq("company_id", companyId)
    .gte("sourced_at", cutoff)
    .limit(1);

  if (!sourcing || sourcing.length === 0) return null;

  const { data: rows } = await db
    .from("candidates")
    .select(
      "id, name, current_title, current_company, location, headline, linkedin_url, portfolio_url, portfolio_score, signals, enriched_at"
    )
    .in(
      "id",
      (
        await db
          .from("candidate_sourcing")
          .select("candidate_id")
          .eq("company_id", companyId)
      ).data?.map((r: { candidate_id: string }) => r.candidate_id) ?? []
    );

  return (rows ?? []) as Candidate[];
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
  profiles: PersonProfile[]
): Promise<Map<number, PersonEnrichData>> {
  const result = new Map<number, PersonEnrichData>();
  const BATCH = 10;

  for (let i = 0; i < profiles.length; i += BATCH) {
    const batch = profiles.slice(i, i + BATCH);
    const urls = batch
      .map(
        (p) =>
          p.social_handles?.professional_network_identifier?.profile_url ?? null
      )
      .filter((u): u is string => u !== null);

    if (urls.length === 0) continue;

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
    }
  }

  return result;
}

export async function sourceCandidates(company: DemoCompany): Promise<Candidate[]> {
  const cached = await getCachedCandidates(company.id);
  if (cached && cached.length > 0) return cached;

  const { headquarters, industry } = await getCompanySignals(company.id);
  if (!headquarters) throw new Error(`No headquarters in enrich data for company ${company.id}`);
  if (!industry) throw new Error(`No industry in enrich data for company ${company.id}`);
  const searchBody = buildSearchRequest(headquarters, industry);

  const searchRaw = await crustdata.personSearch(searchBody);
  const profiles = searchRaw.profiles ?? [];

  if (profiles.length === 0) return [];

  const enrichMap = await enrichBatch(profiles);

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

  return results;
}
