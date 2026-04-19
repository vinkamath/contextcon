import { crustdata } from "@/lib/crustdata";
import { supabase } from "@/lib/supabase";
import type { CompanyData } from "@/lib/company-data";

export type WatchlistCompany = {
  id: string;
  name: string;
  domain: string | null;
  funding_stage: string | null;
  headcount: number | null;
};

export async function getWatchlist(): Promise<WatchlistCompany[]> {
  const { data, error } = await supabase()
    .from("companies")
    .select("id, name, domain, funding_stage, headcount")
    .eq("on_watchlist", true)
    .order("name", { ascending: true });
  if (error) throw new Error(`watchlist read: ${error.message}`);
  return (data ?? []) as WatchlistCompany[];
}

export async function getWatchlistCompany(
  id: string
): Promise<WatchlistCompany | null> {
  const { data, error } = await supabase()
    .from("companies")
    .select("id, name, domain, funding_stage, headcount, on_watchlist")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`company read: ${error.message}`);
  if (!data || !data.on_watchlist) return null;
  return {
    id: data.id,
    name: data.name,
    domain: data.domain,
    funding_stage: data.funding_stage,
    headcount: data.headcount,
  };
}

function fundingStageFromEnrich(cd: CompanyData): string | null {
  const raw = cd.funding?.last_round_type ?? null;
  return raw ? String(raw).toLowerCase().replace(/\s+/g, "_") : null;
}

export async function addCompanyByDomain(
  domain: string
): Promise<WatchlistCompany> {
  const cleaned = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleaned) throw new Error("Empty domain");

  const res = await crustdata.companyEnrich({
    domains: [cleaned],
    fields: [
      "basic_info",
      "headcount",
      "funding",
      "locations",
      "taxonomy",
      "people",
    ],
  });
  const match = res?.[0];
  const companyData = match?.matches?.[0]?.company_data;
  if (!companyData || !companyData.crustdata_company_id) {
    throw new Error(`No Crustdata match for domain "${cleaned}"`);
  }

  const id = String(companyData.crustdata_company_id);
  const name = companyData.basic_info?.name ?? cleaned;
  const resolvedDomain = companyData.basic_info?.primary_domain ?? cleaned;
  const headcount = companyData.headcount?.total ?? null;
  const fundingStage = fundingStageFromEnrich(companyData);

  const { error } = await supabase().from("companies").upsert(
    {
      id,
      name,
      domain: resolvedDomain,
      funding_stage: fundingStage,
      headcount,
      on_watchlist: true,
      raw_enrich: companyData,
      enriched_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`watchlist upsert: ${error.message}`);

  return {
    id,
    name,
    domain: resolvedDomain,
    funding_stage: fundingStage,
    headcount,
  };
}

export async function addCompanyByCrustdataId(
  crustdataId: string,
  fields: {
    name: string;
    domain: string | null;
    funding_stage: string | null;
    headcount: number | null;
  }
): Promise<WatchlistCompany> {
  const { error } = await supabase().from("companies").upsert(
    {
      id: crustdataId,
      name: fields.name,
      domain: fields.domain,
      funding_stage: fields.funding_stage,
      headcount: fields.headcount,
      on_watchlist: true,
    },
    { onConflict: "id" }
  );
  if (error) throw new Error(`watchlist upsert: ${error.message}`);

  return { id: crustdataId, ...fields };
}

export async function removeFromWatchlist(id: string): Promise<void> {
  const { error } = await supabase()
    .from("companies")
    .update({ on_watchlist: false })
    .eq("id", id);
  if (error) throw new Error(`watchlist remove: ${error.message}`);
}
