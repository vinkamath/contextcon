# Riffle — ContextCon Hackathon Build Plan

## What we're building

An agentic recruiting pipeline that proactively identifies pre-A startups likely to need a
founding product designer, sources qualified candidates, evaluates their portfolios, and
delivers a ranked candidate brief to the company's decision makers.

The core insight: we get ahead of the job posting rather than reacting to it. A company
hiring engineers and PMs but no designers is a stronger signal than a design JD going live.

---

## Stack

- **Language:** Python
- **APIs:** Crustdata (company search, person search, enrich, web search, web fetch, job search)
- **LLM:** Anthropic Claude (claude-sonnet-4-20250514) for scoring, brief generation
- **Storage:** Supabase (watchlist state, enrichment cache, candidate results)
- **Scheduler:** simple cron or manual trigger for hackathon
- **Env:** Railway or local; keep it simple for the demo

All Crustdata endpoints are at `https://api.crustdata.com` with headers:
```
Authorization: Bearer $CRUSTDATA_API_KEY
x-api-version: 2025-11-01
```

---

## System overview

```
[TRIGGER] → [WATCHLIST LOOP] → [STAGE 1: Decision makers]
                                → [STAGE 2: Source candidates]
                                → [STAGE 3: Qualify portfolios]
                                → [STAGE 4: Deliver brief]
```

---

## Phase 0 — Trigger detection

**Goal:** Detect companies that have entered a "hiring but no designer" state.

**Primary trigger — non-design job postings:**
- Call `POST /job/search` filtered to eng/PM/sales roles
- For each company returned, check if any active design JD exists (same API)
- If eng/PM jobs exist but zero design jobs → company qualifies as a trigger candidate

**Secondary signals (used for scoring, not gating):**
- Funding round detected: `company.funding_rounds` field changed (new seed/pre-A entry)
- Headcount growth spike: headcount delta > threshold over 30 days (from `/company/enrich`)
- Web traffic inflection: month-on-month web traffic growth above threshold

**Cron fallback:** Weekly full re-scan of the tracked company universe as a safety net.

**Implementation notes:**
- Store last-seen state per company in Supabase (`companies` table) to detect deltas
- On first run, seed with `POST /company/search` using firmographic filters (see Phase 1)
- Trigger produces a list of `company_id`s passed into the watchlist loop

---

## Phase 1 — Iterative watchlist refinement (human-in-the-loop)

**Goal:** Build and refine a list of target companies using Crustdata company search.
This loop runs interactively until the user is satisfied, then locks the list.

**Step 1 — Define filters and search:**

Call `POST /company/search` with firmographic filters. Starting filter set:
```json
{
  "funding_stage": ["seed", "pre_seed"],
  "headcount_min": 5,
  "headcount_max": 50,
  "industry": ["saas", "fintech", "healthtech", "consumer"],
  "location": ["United States"]
}
```

**Step 2 — Enrich and score each result:**

For each company from search, call `POST /company/enrich` and compute a qualification score:

| Signal | Weight | Source |
|---|---|---|
| Has active non-design JDs | 30% | `/job/search` |
| No current design headcount | 25% | `/company/enrich` employee breakdown |
| Web traffic growth MoM > 10% | 20% | `/company/enrich` web_traffic |
| Funding stage is seed/pre-A | 15% | `/company/enrich` funding_rounds |
| Headcount 10–50 | 10% | `/company/enrich` headcount |

**Step 3 — Present results for human review:**

Print a ranked table: `company_name | score | headcount | funding | why_qualified`

**Step 4 — Human decision:**
- User can adjust filters and re-run (loop back to Step 1)
- User can manually include/exclude specific companies
- When satisfied, user types "lock" → list is written to Supabase `watchlist` table

**Implementation notes:**
- Cache enrichment results in Supabase by `company_id` — do not re-call enrich for
  companies already scored in this session
- Persist filter configs so each iteration diffs cleanly against the last
- For the hackathon demo: a simple CLI loop is sufficient (rich table output)

---

## Stage 1 — Find decision makers

**Goal:** For each company on the locked watchlist, find the CEO, CPO, or CTO.

**API call:** `POST /person/search` filtered by company and title seniority:
```json
{
  "company_id": "<id>",
  "title_keywords": ["CEO", "founder", "CPO", "CTO", "head of product"],
  "seniority": ["c_suite", "vp", "director"]
}
```

**Fallback:** If no C-level found with confidence, flag the company and skip (don't guess).

**Output:** `decision_makers` table in Supabase: `person_id, name, title, company_id`

---

## Stage 2 — Source founding designer candidates

**Goal:** Find 20–50 product designers who fit a founding designer profile.

**Note:** There is no JD, so the search query is based on a generic founding designer
rubric — not a specific role. Candidates are sourced once and re-ranked per company context.

**API call:** `POST /person/search`:
```json
{
  "title_keywords": ["product designer", "UX designer", "founding designer", "design lead"],
  "seniority": ["senior", "lead", "staff"],
  "years_experience_min": 4,
  "years_experience_max": 12
}
```

**Implementation notes:**
- Title normalisation is a known bottleneck. Use Claude to canonicalise titles before
  filtering: "Senior Product Designer", "Product Design Lead", "UX/UI Designer" → same bucket
- Pull top 50 candidates, enrich all via `POST /person/enrich` (employment history, skills)
- Store in `candidates` table in Supabase

---

## Stage 3 — Portfolio qualification

**Goal:** Find each candidate's portfolio URL, scrape it, and score it against the
founding designer rubric.

**Step 1 — Find portfolio URL:**

Call `POST /web/search/live` with query: `"{name} {current_company} product designer portfolio"`

Parse the top result for a portfolio domain (Notion, Cargo, Webflow, personal site, etc.).
Fallback: check `/person/enrich` response for any social/portfolio links first.

**Step 2 — Scrape portfolio:**

Call `POST /web/enrich/live` with the portfolio URL.

If the page is SPA-heavy (Webflow, Framer, Cargo), the raw HTML may be sparse.
Use Jina Reader as fallback: `https://r.jina.ai/{portfolio_url}`

Extract structured signals using Claude:
```python
# Prompt Claude to extract structured facts from scraped text
# Return as Pydantic model — separate extracted facts from inferred signals
```

**Extracted facts (direct from portfolio):**
- `case_studies: list[str]` — project names and industries
- `tools_mentioned: list[str]` — Figma, Framer, etc.
- `product_types: list[str]` — B2B SaaS, mobile, consumer, etc.
- `years_of_work_shown: int`

**Inferred signals (Claude-scored):**
- `narrative_clarity: int` — 1–5, how well they explain decisions not just visuals
- `complexity_handled: int` — 1–5, evidence of 0→1 or ambiguous problem spaces
- `startup_fit: int` — 1–5, evidence of working in small teams, wearing multiple hats

**Step 3 — Score against founding designer rubric:**

| Dimension | Weight |
|---|---|
| Narrative clarity (explains decisions) | 30% |
| 0→1 or ambiguous problem experience | 25% |
| Startup/small team context | 20% |
| B2B or relevant domain | 15% |
| Tool proficiency (Figma, prototyping) | 10% |

**Output:** `candidates` table updated with `portfolio_score`, `portfolio_url`, `signals_json`

---

## Stage 4 — Deliver candidate brief

**Goal:** Generate a ranked candidate brief for each watchlist company and send it to
the decision maker.

**Step 1 — Re-rank candidates per company:**

Use Claude to re-rank the top 10 candidates based on company context (industry, product
type, stage) against each candidate's signals. Output top 5.

**Step 2 — Generate brief:**

Prompt Claude to produce a brief in this format per company:
```
Subject: 5 founding designers worth meeting — [Company Name]

We've been tracking [Company] and noticed you're scaling your eng team
without a designer yet. Here are 5 candidates we think are worth a conversation.

1. [Name] — [One-line why they fit, grounded in portfolio evidence]
   Portfolio: [URL]

2. ...

Want intros to any of these? Reply and we'll make it happen.
— Riffle
```

**Step 3 — Get decision maker email:**

Call `POST /person/enrich` for each decision maker identified in Stage 1.
Use the `verified_email` field. Skip if no verified email found.

**Step 4 — Send:**

For the hackathon: print to stdout or write to file. No live email sending needed for demo.
In production: Brevo transactional email API.

---

## Data model (Supabase)

```sql
-- companies: enriched company universe
create table companies (
  id text primary key,           -- crustdata company_id
  name text,
  domain text,
  funding_stage text,
  headcount int,
  web_traffic_rank int,
  qual_score float,              -- 0.0–1.0 watchlist qualification score
  on_watchlist boolean default false,
  enriched_at timestamptz,
  raw_enrich jsonb               -- full crustdata response cached
);

-- decision_makers: C-level contacts at watchlist companies
create table decision_makers (
  id text primary key,           -- crustdata person_id
  company_id text references companies(id),
  name text,
  title text,
  verified_email text,
  enriched_at timestamptz
);

-- candidates: sourced product designers
create table candidates (
  id text primary key,           -- crustdata person_id
  name text,
  current_title text,
  current_company text,
  portfolio_url text,
  portfolio_score float,         -- 0.0–1.0 rubric score
  signals jsonb,                 -- extracted facts + inferred signals
  enriched_at timestamptz,
  raw_enrich jsonb
);

-- briefs: generated output per company
create table briefs (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  decision_maker_id text references decision_makers(id),
  candidate_ids text[],          -- ordered top-5
  brief_text text,
  generated_at timestamptz
);
```

---

## File structure

```
riffle-contextcon/
├── CLAUDE.md                  ← this file
├── .env                       ← CRUSTDATA_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
├── main.py                    ← CLI entry point
├── pipeline/
│   ├── trigger.py             ← Phase 0: job posting + signal detection
│   ├── watchlist.py           ← Phase 1: iterative company loop
│   ├── decision_makers.py     ← Stage 1
│   ├── sourcing.py            ← Stage 2
│   ├── qualification.py       ← Stage 3: portfolio scraping + scoring
│   └── brief.py               ← Stage 4: brief generation
├── models/
│   ├── company.py             ← Pydantic models for company signals
│   └── candidate.py           ← Pydantic models for portfolio signals
├── db/
│   ├── client.py              ← Supabase client
│   └── schema.sql             ← table definitions above
└── utils/
    ├── crustdata.py           ← thin wrapper around all Crustdata endpoints
    ├── llm.py                 ← Claude API calls (scoring, extraction, brief gen)
    └── scraper.py             ← web/enrich/live + Jina fallback chain
```

---

## Build order

Build in this sequence — each phase is independently testable:

1. `utils/crustdata.py` — get all API calls working with real data first
2. `db/` — stand up Supabase schema, verify read/write
3. `pipeline/watchlist.py` — interactive loop with CLI table output (Phase 1)
4. `pipeline/trigger.py` — job posting detection (Phase 0)
5. `models/` — Pydantic schemas for company and candidate signals
6. `utils/scraper.py` — portfolio scraping with Jina fallback
7. `pipeline/qualification.py` — Stage 3, most complex, test in isolation
8. `pipeline/sourcing.py` + `pipeline/decision_makers.py` — Stages 1 & 2
9. `pipeline/brief.py` — Stage 4, wire everything together
10. `main.py` — end-to-end CLI entry point for demo

---

## Hackathon demo script

1. Run `python main.py watchlist` — show interactive filter loop, lock 5 companies
2. Run `python main.py pipeline --company <id>` — run full pipeline for one company
3. Show the printed candidate brief with 5 ranked designers and why-they-fit summaries

The demo story: "We detected that [Company] is hiring engineers but has no designer.
Here are 5 founding designers we'd introduce them to, qualified from portfolio review."