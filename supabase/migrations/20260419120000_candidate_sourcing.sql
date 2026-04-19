alter table candidates
  add column if not exists location     text,
  add column if not exists headline     text,
  add column if not exists linkedin_url text;

create table if not exists candidate_sourcing (
  candidate_id text references candidates(id),
  company_id   text references companies(id),
  sourced_at   timestamptz default now(),
  primary key  (candidate_id, company_id)
);
