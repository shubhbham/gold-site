# Gold Price Website

Monorepo for a Cloudflare-backed gold benchmark site with:

- `apps/api`: Hono Worker using D1, KV, and a scheduled daily refresh
- `apps/web`: Astro frontend with React charts, calculator, and embed pages
- `packages/shared`: shared types and seeded city metadata

## Local Run

1. Install dependencies:
   - `pnpm install`
2. In `apps/api`, create `.dev.vars` with:
   - `METALS_DEV_KEY=...`
   - `GOLDAPI_KEY=...`
   - `ADMIN_KEY=...`
3. Apply schema to local D1 once:
   - `pnpm --dir apps/api wrangler d1 execute gold-prices-db --local --file schema.sql`

## Run Commands

- Start API (Hono + Wrangler):
  - `pnpm dev:api`
- Start frontend (Astro):
  - `pnpm dev:web`

Or run from each app folder:

- API:
  - `cd apps/api`
  - `pnpm dev`
- Web:
  - `cd apps/web`
  - `pnpm dev`

## Notes

- The cron job updates D1 and KV once per day at `03:00 UTC`.
- User-facing reads prefer KV and fall back to D1 on cache miss.
- Pages can still build before the first successful live fetch because the frontend includes fallback benchmark values.

## Historical Backfill (5-10 Years)

For long-range charts, backfill D1 history locally first, then apply to remote when you are satisfied.

Real-data import (recommended):

- Prepare a CSV with headers: `date,usd_oz,inr,cad,aed,gbp`
- Required columns: `date`, `usd_oz`
- Optional FX columns: `inr,cad,aed,gbp` (if missing, script uses latest FX once)

Generate SQL from CSV:

- `pnpm --dir apps/api history:sql -- --csv ./data/xau-history.csv --out ./data/backfill-history.sql`

Apply SQL to local D1:

- `pnpm --dir apps/api wrangler d1 execute gold-prices-db --local --file ./data/backfill-history.sql`

Apply SQL to remote D1 (only when ready):

- `pnpm --dir apps/api wrangler d1 execute gold-prices-db --remote --file ./data/backfill-history.sql`

Synthetic bootstrap mode (for graph bootstrapping only):

- `pnpm --dir apps/api history:sql:synthetic -- --out ./data/backfill-history.sql`

This mode creates simulated history for charts and should not be presented as exchange-verified historical data.