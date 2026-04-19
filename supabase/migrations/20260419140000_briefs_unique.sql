alter table briefs
  add column if not exists subject text,
  add column if not exists body    text;

create unique index if not exists briefs_company_dm_idx
  on briefs (company_id, decision_maker_id);
