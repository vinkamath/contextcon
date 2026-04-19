# Riffle — ContextCon Hackathon Build Plan

## What we're building

An agentic recruiting pipeline that proactively identifies pre-A startups likely to need a
founding product designer, sources qualified candidates, evaluates their portfolios, and
delivers a ranked candidate brief to the company's decision makers.

The core insight: we get ahead of the job posting rather than reacting to it. A company
hiring engineers and PMs but no designers is a stronger signal than a design JD going live.

---

## MVP scope (start here)

Demo-first. Everything that risks breaking live on stage is cut or cached.

**In scope for MVP:**
- Hardcoded watchlist of 2 demo companies (`lib/demo-companies.ts`)
- Stages 1–4 run end-to-end against those 2 companies
- Web UI on Vercel: company list → "Run pipeline" button → rendered brief
- Supabase caches every stage output so the demo is instant on re-run

**Deferred (post-MVP, see bottom of doc):**
- Phase 0: trigger detection (job posting scans, funding deltas)
- Phase 1: interactive watchlist refinement loop
- Live email sending

**Demo story:** "We pre-identified [Company] as hiring engineers without a designer.
Watch us run our pipeline live — decision makers, candidates, portfolio scoring, brief."

---

## Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Hosting:** Vercel (required — competition needs a hosted demo)
- **UI:** Tailwind CSS; shadcn/ui components added as needed
- **APIs:** Crustdata (company search, person search, enrich, web search, web fetch, job search)
- **LLM:** Anthropic Claude (`claude-sonnet-4-6`) for scoring, extraction, brief generation
- **Storage:** Supabase (Postgres — watchlist, enrichment cache, candidate results)
- **Secrets:** Vercel env vars (`CRUSTDATA_API_KEY`, `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

All Crustdata endpoints are at `https://api.crustdata.com` with headers:
```
Authorization: Bearer $CRUSTDATA_API_KEY
x-api-version: 2025-11-01
```

---

## System overview

```
[UI: company list] → [API: /api/pipeline/:companyId]
                          → Stage 1: Decision makers
                          → Stage 2: Source candidates
                          → Stage 3: Qualify portfolios
                          → Stage 4: Generate brief
                          → [UI: rendered brief]
```

All stages are server-side (Next.js API routes / Server Actions). Results are written to
Supabase after each stage so subsequent runs hit cache.

---

## MVP: Hardcoded watchlist

`lib/demo-companies.ts` exports 2 companies we've pre-qualified by hand. Each entry has
the shape Crustdata enrich returns, so the pipeline is agnostic to whether the watchlist
came from hardcoding or from Phase 0/1.

```ts
// lib/demo-companies.ts
export const DEMO_COMPANIES = [
  { id: "crustdata_co_1", name: "...", domain: "...", funding_stage: "seed", headcount: 18 },
  { id: "crustdata_co_2", name: "...", domain: "...", funding_stage: "pre_seed", headcount: 11 },
];
```

On first boot, `app/page.tsx` upserts these into Supabase `companies` with
`on_watchlist = true`. Everything downstream reads from Supabase.

---

## Stage 1 — Find decision makers

**Goal:** For each company on the watchlist, find the CEO, CPO, or CTO.

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
- Title normalisation: use Claude to canonicalise titles before filtering
- Pull top 50, enrich all via `POST /person/enrich`, store in `candidates` table
- Sourcing runs once across the whole watchlist — not per company

---

## Stage 3 — Portfolio qualification

**Goal:** Find each candidate's portfolio URL, scrape it, and score it against the
founding designer rubric.

**Step 1 — Find portfolio URL:**
Call `POST /web/search/live` with query: `"{name} {current_company} product designer portfolio"`
Parse the top result for a portfolio domain. Fallback: check `/person/enrich` response
for social/portfolio links first.

**Step 2 — Scrape portfolio:**
Call `POST /web/enrich/live` with the portfolio URL.
If SPA-heavy (Webflow, Framer, Cargo), raw HTML may be sparse.
Fallback: Jina Reader at `https://r.jina.ai/{portfolio_url}`.

Extract structured signals using Claude. Return as a Zod-validated object.

**Extracted facts (direct from portfolio):**
- `case_studies: string[]` — project names and industries
- `tools_mentioned: string[]` — Figma, Framer, etc.
- `product_types: string[]` — B2B SaaS, mobile, consumer, etc.
- `years_of_work_shown: number`

**Inferred signals (Claude-scored 1–5):**
- `narrative_clarity` — explains decisions, not just visuals
- `complexity_handled` — evidence of 0→1 or ambiguous problem spaces
- `startup_fit` — small teams, wearing multiple hats

**Step 3 — Score against founding designer rubric:**

| Dimension | Weight |
|---|---|
| Narrative clarity (explains decisions) | 30% |
| 0→1 or ambiguous problem experience | 25% |
| Startup/small team context | 20% |
| B2B or relevant domain | 15% |
| Tool proficiency (Figma, prototyping) | 10% |

**Demo safety:** pre-run Stage 3 for the 2 demo companies before the demo. Cache in
Supabase. Live path stays available but the demo serves cached scores.

**Output:** `candidates` table updated with `portfolio_score`, `portfolio_url`, `signals`

---

## Stage 4 — Deliver candidate brief

**Goal:** Generate a ranked candidate brief for each watchlist company.

**Step 1 — Re-rank per company:**
Use Claude to re-rank the top 10 candidates given company context (industry, product
type, stage). Output top 5.

**Step 2 — Generate brief:**
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

**Step 3 — Render in UI:**
For MVP, render the brief in the web page with a copy-to-clipboard button. No live email.
Decision maker email is looked up via `/person/enrich` (`verified_email` field) and shown
as "would send to: foo@bar.com".

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
  raw_enrich jsonb
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
  signals jsonb,
  enriched_at timestamptz,
  raw_enrich jsonb
);

-- briefs: generated output per company
create table briefs (
  id uuid primary key default gen_random_uuid(),
  company_id text references companies(id),
  decision_maker_id text references decision_makers(id),
  candidate_ids text[],
  brief_text text,
  generated_at timestamptz
);
```

---

## File structure

```
contextcon/
├── plan/
│   └── README.md              ← this doc
├── app/
│   ├── layout.tsx
│   ├── page.tsx               ← watchlist view + "Run pipeline" buttons
│   ├── globals.css
│   └── api/
│       └── pipeline/
│           └── [companyId]/
│               └── route.ts   ← orchestrates Stages 1–4 for one company
├── lib/
│   ├── crustdata.ts           ← thin wrapper around all Crustdata endpoints
│   ├── llm.ts                 ← Claude API calls (scoring, extraction, brief gen)
│   ├── scraper.ts             ← web/enrich/live + Jina fallback chain
│   ├── supabase.ts            ← Supabase client (service-role, server-only)
│   ├── demo-companies.ts      ← hardcoded MVP watchlist
│   └── types.ts               ← Zod schemas for company and candidate signals
├── pipeline/
│   ├── decision-makers.ts     ← Stage 1
│   ├── sourcing.ts            ← Stage 2
│   ├── qualification.ts       ← Stage 3
│   └── brief.ts               ← Stage 4
├── supabase/
│   └── migrations/            ← `supabase db push` applies these
├── .env.example
├── package.json
├── tsconfig.json
├── next.config.ts
└── README.md                  ← root README pointing at plan/
```

---

## Build order

Each step is independently testable. Ship each one before moving on.

1. **Skeleton** — Next.js scaffold, Tailwind, env plumbing, Supabase client, deploy to Vercel
2. **`lib/crustdata.ts`** — wrapper with one working call (e.g. `/company/enrich`)
3. **`supabase/migrations/`** applied via `supabase db push`; verify read/write from a server action
4. **Hardcoded watchlist** — `lib/demo-companies.ts` + seed on boot; UI shows 2 cards
5. **Stage 1** — decision-makers lookup, render results inline on the card
6. **Stage 2** — sourcing (run once, shared across companies); store in `candidates`
7. **`lib/scraper.ts`** — portfolio scraping with Jina fallback
8. **Stage 3** — portfolio qualification; pre-warm cache for demo companies
9. **Stage 4** — brief generation; render with copy button
10. **Polish** — loading states, error toasts, clean typography for the demo

---

## Post-MVP (deferred)

### Phase 0 — Trigger detection
Detect companies that have entered a "hiring but no designer" state.

- `POST /job/search` filtered to eng/PM/sales roles
- Check for active design JD on same company — if none, qualify
- Secondary signals: funding-round delta, headcount growth, web-traffic MoM
- Weekly cron re-scan of tracked universe
- Store last-seen state per company to detect deltas

### Phase 1 — Iterative watchlist refinement
Interactive loop for refining the target list.

- `POST /company/search` with firmographic filters (funding stage, headcount, industry, geo)
- Enrich + score each result across 5 weighted signals
- Present ranked table; user can adjust filters, re-run, or include/exclude manually
- Lock → write to Supabase `watchlist`
- CLI initially; promote to a web UI if time allows

### Live email send
Wire `briefs` output into Brevo transactional email. Verify decision-maker consent flow first.

---

## Hackathon demo script

1. Open the hosted Vercel URL — shows 2 pre-qualified companies
2. Click "Run pipeline" on Company A — stages animate through decision makers, candidates, scores, brief
3. Click "Run pipeline" on Company B — same, faster (cache is warm)
4. Read the generated brief out loud; highlight the "why they fit" lines grounded in portfolio evidence
5. Mention Phase 0/1 as the roadmap: "today we hardcoded 2; next we detect these automatically"
