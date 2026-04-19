export type PersonProfile = {
  crustdata_person_id: number;
  basic_profile?: {
    name?: string;
    current_title?: string;
    headline?: string;
    summary?: string;
    location?: { raw?: string };
  };
  social_handles?: {
    professional_network_identifier?: { profile_url?: string };
    twitter_identifier?: { slug?: string };
  };
  professional_network?: {
    profile_url?: string;
    profile_picture_permalink?: string;
  };
};

export type CompanyData = {
  crustdata_company_id: number;
  basic_info?: {
    name?: string;
    primary_domain?: string;
    website?: string;
    year_founded?: string;
    professional_network_url?: string;
  };
  headcount?: { total?: number };
  funding?: {
    total_investment_usd?: number;
    last_round_type?: string;
    last_fundraise_date?: string;
    investors?: string[];
  };
  locations?: { hq_country?: string; headquarters?: string };
  taxonomy?: { professional_network_industry?: string; categories?: string[] };
  people?: {
    decision_makers?: PersonProfile[];
    founders?: PersonProfile[];
    cxos?: PersonProfile[];
  };
};
