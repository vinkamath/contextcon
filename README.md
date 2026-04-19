# Riffle

Agentic recruiting pipeline: identify pre-A startups hiring engineers without designers,
source founding product designers, score portfolios, deliver a ranked brief.

Built for ContextCon hackathon.

## Setup

```bash
cp .env.example .env.local  # fill in keys
npm install
npm run dev
```

Apply the Supabase schema with `supabase db push` (requires [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) linked to your project).

## Docs

See [`plan/README.md`](./plan/README.md) for the full build plan.
