import type { CompanyData, PersonProfile } from "@/lib/company-data";

const BASE_URL = "https://api.crustdata.com";
const API_VERSION = "2025-11-01";

function headers() {
  const key = process.env.CRUSTDATA_API_KEY;
  if (!key) throw new Error("CRUSTDATA_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "x-api-version": API_VERSION,
    "Content-Type": "application/json",
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Crustdata ${path} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ---------- Company Enrich ----------

export type CompanyEnrichRequest = (
  | { crustdata_company_ids: number[] }
  | { domains: string[] }
  | { names: string[] }
  | { professional_network_profile_urls: string[] }
) & { fields?: string[] };

export type CompanyEnrichMatch = {
  confidence_score: number;
  company_data: CompanyData;
};

export type CompanyEnrichResponse = Array<{
  matched_on: string;
  match_type: string;
  matches: CompanyEnrichMatch[];
}>;

// ---------- Person Enrich ----------

export type PersonEnrichRequest =
  | { professional_network_profile_urls: string[]; fields?: string[]; force_fetch?: boolean }
  | { business_emails: string[]; min_similarity_score?: number; fields?: string[] };

export type PersonEnrichData = PersonProfile & {
  contact?: {
    business_emails?: Array<string | { email?: string }>;
    personal_emails?: Array<string | { email?: string }>;
    phone_numbers?: string[];
    websites?: string[];
  };
  experience?: {
    employment_details?: {
      current?: Array<{ company_name?: string; title?: string }>;
      past?: Array<{ company_name?: string; title?: string }>;
    };
  };
};

export type PersonEnrichResponse = Array<{
  matched_on: string;
  match_type: string;
  matches: Array<{ confidence_score: number; person_data: PersonEnrichData }>;
}>;

// ---------- Company Search ----------

export type CompanySearchFilter =
  | { field: string; type: "=" | "!=" | ">" | "<" | "=>" | "=<" | "in" | "not_in" | "is_null" | "is_not_null" | "(.)" | "[.]"; value?: unknown }
  | { op: "and" | "or"; conditions: CompanySearchFilter[] };

export type CompanySearchRequest = {
  filters?: CompanySearchFilter;
  fields?: string[];
  sorts?: Array<{ column: string; order: "asc" | "desc" }>;
  limit?: number;
  cursor?: string;
};

export type CompanySearchResult = {
  crustdata_company_id: number;
  basic_info?: { name?: string; primary_domain?: string; year_founded?: string };
  headcount?: { total?: number };
  funding?: { total_investment_usd?: number; last_round_type?: string; last_fundraise_date?: string };
  locations?: { hq_country?: string; hq_city?: string; headquarters?: string };
  taxonomy?: { professional_network_industry?: string };
  roles?: { distribution?: Record<string, number> };
};

export type CompanySearchResponse = {
  companies: CompanySearchResult[];
  next_cursor: string | null;
  total_count: number | null;
};

// ---------- Person Search (kept for later stages) ----------

export type FilterCondition =
  | {
      field: string;
      type:
        | "="
        | "!="
        | ">"
        | "<"
        | "in"
        | "not_in"
        | "(.)"
        | "geo_distance";
      value: unknown;
    }
  | {
      op: "and" | "or";
      conditions: FilterCondition[];
    };

export type PersonSearchRequest = {
  filters: FilterCondition;
  fields?: string[];
  sorts?: Array<{ field: string; order: "asc" | "desc" }>;
  limit?: number;
  cursor?: string;
};

export type PersonSearchResponse = {
  profiles: PersonProfile[];
  next_cursor: string | null;
  total_count: number | null;
};

// ---------- Endpoints ----------

export const crustdata = {
  companySearch: (body: CompanySearchRequest) => post<CompanySearchResponse>("/company/search", body),
  companyEnrich: (body: CompanyEnrichRequest) =>
    post<CompanyEnrichResponse>("/company/enrich", body),
  personSearch: (body: PersonSearchRequest) =>
    post<PersonSearchResponse>("/person/search", body),
  personEnrich: (body: PersonEnrichRequest) =>
    post<PersonEnrichResponse>("/person/enrich", body),
  jobSearch: (body: unknown) => post<unknown>("/job/search", body),
  webSearchLive: (body: unknown) => post<unknown>("/web/search/live", body),
  webEnrichLive: (body: unknown) => post<unknown>("/web/enrich/live", body),
};
