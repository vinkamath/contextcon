import {
  crustdata,
  type CompanySearchFilter,
  type CompanySearchResult,
} from "@/lib/crustdata";

const FIELDS = [
  "crustdata_company_id",
  "basic_info.name",
  "basic_info.primary_domain",
  "basic_info.year_founded",
  "headcount.total",
  "funding.total_investment_usd",
  "funding.last_round_type",
  "funding.last_fundraise_date",
  "locations.headquarters",
  "locations.hq_city",
  "taxonomy.professional_network_industry",
  "roles.distribution",
];

const DESIGN_ROLE_KEYS = ["design", "product_design", "ux", "ui_ux"];

function hasDesigner(distribution: Record<string, number> | undefined): boolean {
  if (!distribution) return false;
  return DESIGN_ROLE_KEYS.some((k) => (distribution[k] ?? 0) > 0);
}

export type DiscoverEvent =
  | { type: "start"; limit: number }
  | { type: "page"; page: number; fetched: number; running_total: number }
  | { type: "match"; company: CompanySearchResult }
  | { type: "skip"; company_id: number; reason: string }
  | { type: "done"; total: number }
  | { type: "error"; error: string };

export type DiscoverEmitter = (event: DiscoverEvent) => void;

const noop: DiscoverEmitter = () => {};

/** LinkedIn primary industry label in Crustdata — covers most fintech / banking startups. */
const FINTECH_INDUSTRY = "Financial Services";

async function paginateCompaniesWithoutDesigner(
  limit: number,
  emit: DiscoverEmitter,
  filters: CompanySearchFilter
): Promise<CompanySearchResult[]> {
  const results: CompanySearchResult[] = [];
  let cursor: string | undefined;
  let page = 0;

  emit({ type: "start", limit });

  while (results.length < limit) {
    page += 1;
    const res = await crustdata.companySearch({
      filters,
      fields: FIELDS,
      sorts: [{ column: "funding.last_fundraise_date", order: "desc" }],
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });

    emit({
      type: "page",
      page,
      fetched: res.companies.length,
      running_total: results.length,
    });

    for (const company of res.companies) {
      if (hasDesigner(company.roles?.distribution)) {
        emit({
          type: "skip",
          company_id: company.crustdata_company_id,
          reason: "has designer",
        });
        continue;
      }
      results.push(company);
      emit({ type: "match", company });
      if (results.length >= limit) break;
    }

    if (!res.next_cursor) break;
    cursor = res.next_cursor;
  }

  emit({ type: "done", total: results.length });
  return results;
}

export async function findSFSeedCompaniesWithoutDesigner(
  limit = 50,
  emit: DiscoverEmitter = noop
): Promise<CompanySearchResult[]> {
  return paginateCompaniesWithoutDesigner(limit, emit, {
    op: "and",
    conditions: [
      {
        field: "locations.headquarters",
        type: "(.)",
        value: "San Francisco",
      },
      {
        field: "funding.last_round_type",
        type: "=",
        value: "seed",
      },
    ],
  });
}

/** NYC HQ, Financial Services (fintech), seed, under 20 employees; excludes companies with design headcount. */
export async function findNYCSeedFintechSmallWithoutDesigner(
  limit = 50,
  emit: DiscoverEmitter = noop
): Promise<CompanySearchResult[]> {
  return paginateCompaniesWithoutDesigner(limit, emit, {
    op: "and",
    conditions: [
      {
        field: "locations.headquarters",
        type: "(.)",
        value: "New York",
      },
      {
        field: "taxonomy.professional_network_industry",
        type: "[.]",
        value: FINTECH_INDUSTRY,
      },
      {
        field: "funding.last_round_type",
        type: "=",
        value: "seed",
      },
      {
        field: "headcount.total",
        type: "<",
        value: 20,
      },
    ],
  });
}
