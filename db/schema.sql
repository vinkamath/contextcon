-- Apply in the Supabase SQL editor.

create table if not exists companies (
  id text primary key,
  name text,
  domain text,
  funding_stage text,
  headcount int,
  web_traffic_rank int,
  qual_score float,
  on_watchlist boolean default false,
  enriched_at timestamptz,
  raw_enrich jsonb
);

create table if not exists decision_makers (
  id text primary key,
  company_id text references companies(id),
  name text,
  title text,
  verified_email text,
  enriched_at timestamptz
);

create table if not exists candidates (
  id text primary key,
  name text,
  current_title text,
  current_company text,
  portfolio_url text,
  portfolio_score float,
  signals jsonb,
  enriched_at timestamptz,
  raw_enrich jsonb
);

create table if not exists briefs (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  decision_maker_id text references decision_makers(id),
  candidate_ids text[],
  brief_text text,
  generated_at timestamptz default now()
);
