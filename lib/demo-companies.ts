export type DemoCompany = {
  id: string;
  name: string;
  domain: string;
  funding_stage: "pre_seed" | "seed" | "series_a";
  headcount: number;
};

// Hardcoded MVP watchlist. Swap with real Crustdata company_ids before demo.
export const DEMO_COMPANIES: DemoCompany[] = [
  {
    id: "6036032",
    name: "Crustdata",
    domain: "crustdata.com",
    funding_stage: "seed",
    headcount: 20,
  },
  {
    id: "demo_company_2",
    name: "Company B",
    domain: "company-b.example",
    funding_stage: "pre_seed",
    headcount: 11,
  },
];
