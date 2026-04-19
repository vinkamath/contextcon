export type DemoCompany = {
  id: string;
  slug: string; // matches filename in data/{slug}.json
  name: string;
  domain: string;
  funding_stage: "pre_seed" | "seed" | "series_a";
  headcount: number;
};

// Hardcoded MVP watchlist. Swap with real Crustdata company_ids before demo.
export const DEMO_COMPANIES: DemoCompany[] = [
  {
    id: "6036032",
    slug: "crustdata",
    name: "Crustdata",
    domain: "crustdata.com",
    funding_stage: "seed",
    headcount: 20,
  },
  {
    id: "demo_company_2",
    slug: "demo_company_2",
    name: "Company B",
    domain: "company-b.example",
    funding_stage: "pre_seed",
    headcount: 11,
  },
];
