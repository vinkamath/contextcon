# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start Next.js dev server
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit (no test suite exists)
supabase db push     # apply migrations from supabase/migrations/
```

## Architecture

**Riffle** is an agentic recruiting pipeline. The demo flow: a watchlist of 2 hardcoded companies → "Run pipeline" → Stages 1–4 execute → rendered candidate brief.

### Data flow

```
app/page.tsx  (watchlist UI)
  → POST /api/pipeline/[companyId]  (route.ts)
      → pipeline/decision-makers.ts  (Stage 1)
      → pipeline/sourcing.ts         (Stage 2, TODO)
      → pipeline/qualification.ts    (Stage 3, TODO)
      → pipeline/brief.ts            (Stage 4, TODO)
```

Each stage follows the same pattern: **check Supabase cache → call Crustdata API → write result back to Supabase → return typed data**. Cache freshness is controlled by `lib/config.ts` via `cacheCutoffIso(entity)`.

### Key modules

- `lib/crustdata.ts` — typed wrapper around all Crustdata endpoints (`/company/enrich`, `/person/search`, `/person/enrich`, `/web/search/live`, `/web/enrich/live`, `/job/search`)
- `lib/llm.ts` — singleton Anthropic client; model is `claude-sonnet-4-6` (`CLAUDE_MODEL` constant)
- `lib/supabase.ts` — singleton Supabase client; **server-only**, uses service-role key — never import from client components
- `lib/types.ts` — Zod schemas for pipeline outputs (`DecisionMakerSchema`, etc.)
- `lib/demo-companies.ts` — hardcoded MVP watchlist (2 companies); shape matches Crustdata enrich response

### Supabase schema

Four tables: `companies`, `decision_makers`, `candidates`, `briefs`. Full DDL is in `plan/README.md`. Migrations live in `supabase/migrations/`.

### Environment variables

```
CRUSTDATA_API_KEY
ANTHROPIC_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Copy `.env.example` → `.env.local`.

### Crustdata API

Base URL `https://api.crustdata.com`, header `x-api-version: 2025-11-01`. All calls go through the `crustdata` object in `lib/crustdata.ts`.

### Stage status

Stage 1 (decision makers) is implemented. Stages 2–4 are TODO stubs in `route.ts`. Each stage lives as its own file under `pipeline/`.
