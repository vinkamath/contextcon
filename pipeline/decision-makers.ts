import {
  crustdata,
  type PersonEnrichData,
} from "@/lib/crustdata";
import { supabase } from "@/lib/supabase";
import { cacheCutoffIso } from "@/lib/config";
import type { DemoCompany } from "@/lib/demo-companies";
import type { DecisionMaker } from "@/lib/types";
import type { CompanyData } from "@/lib/company-data";

async function getCompanyData(company: DemoCompany): Promise<CompanyData> {
  const db = supabase();
  const cutoff = cacheCutoffIso("company");

  const { data: cached, error: readErr } = await db
    .from("companies")
    .select("raw_enrich, enriched_at")
    .eq("id", company.id)
    .gte("enriched_at", cutoff)
    .maybeSingle();
  if (readErr) throw new Error(`company cache read: ${readErr.message}`);
  if (cached?.raw_enrich) return cached.raw_enrich as CompanyData;

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
  linkedinUrl: string | null
): Promise<PersonEnrichData | null> {
  if (!linkedinUrl) return null;

  const db = supabase();
  const cutoff = cacheCutoffIso("person");

  const { data: cached } = await db
    .from("decision_makers")
    .select("raw_enrich, enriched_at")
    .eq("id", personId)
    .gte("enriched_at", cutoff)
    .maybeSingle();
  if (cached?.raw_enrich) return cached.raw_enrich as PersonEnrichData;

  const res = await crustdata.personEnrich({
    professional_network_profile_urls: [linkedinUrl],
    fields: ["basic_profile", "contact", "social_handles"],
  });
  return res?.[0]?.matches?.[0]?.person_data ?? null;
}

export async function findDecisionMakers(
  company: DemoCompany
): Promise<DecisionMaker[]> {
  const companyData = await getCompanyData(company);
  const rawDMs = companyData.people?.decision_makers ?? [];
  const db = supabase();
  const results: DecisionMaker[] = [];

  for (const p of rawDMs) {
    const name = p.basic_profile?.name;
    if (!name) continue;

    const id = String(p.crustdata_person_id);
    const title = p.basic_profile?.current_title ?? null;
    const linkedinUrl =
      p.social_handles?.professional_network_identifier?.profile_url ?? null;

    let personData: PersonEnrichData | null = null;
    try {
      personData = await getPersonEnrich(id, linkedinUrl);
    } catch (err) {
      console.error(`person enrich failed for ${name}:`, err);
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

  return results;
}
