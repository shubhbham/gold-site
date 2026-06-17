Audit and fix this entire Astro + Cloudflare Workers gold price project for production deployment.
The site works in pnpm dev but fails silently on Cloudflare Pages deployment — 
API data does not load, it behaves like a static site.

Fix every issue you find. Do not skip any file. Rewrite files completely where needed.

---

KNOWN ISSUES TO FIX:

1. D1 binding name mismatch
   In apps/api/wrangler.jsonc the D1 binding is named "gold_prices_db"
   Search every file in apps/api/src/ that references DB or database binding
   Standardize to ONE consistent name throughout — use "DB" everywhere
   Update wrangler.jsonc binding name to "DB" to match code, OR update all code 
   references to use "gold_prices_db" — pick one and apply it consistently everywhere.

2. Astro not accessing Cloudflare bindings correctly
   Search all .astro pages and API route files in apps/web/src/
   Find any place that uses process.env.DB or process.env.GOLD_CACHE or 
   import { DB } or any direct env access pattern
   Replace ALL of them with the correct Cloudflare SSR pattern:
     const runtime = Astro.locals.runtime
     const db = runtime.env.DB
     const kv = runtime.env.GOLD_CACHE
   This is the only correct way to access bindings in Astro SSR on Cloudflare.

3. Missing env.d.ts type declarations
   Check if apps/web/src/env.d.ts exists with correct Cloudflare runtime types.
   If missing or incomplete, create it with exactly this content:
     /// <reference types="astro/client" />
     /// <reference types="@cloudflare/workers-types" />
     type Runtime = import("@astrojs/cloudflare").Runtime<Env>
     interface Env {
       DB: D1Database
       GOLD_CACHE: KVNamespace
       METALS_DEV_KEY: string
       GOLDAPI_KEY: string
       CACHE_TTL_SECONDS: string
       HISTORY_CACHE_TTL_SECONDS: string
       METALS_API_URL: string
       GOLDAPI_URL: string
       FX_API_URL: string
     }
     declare namespace App {
       interface Locals extends Runtime {}
     }

4. astro.config.mjs missing mode directory
   Open apps/web/astro.config.mjs
   Change adapter: cloudflare() to:
     adapter: cloudflare({ mode: "directory", functionPerRoute: false })
   Add to vite config:
     ssr: { external: ["node:async_hooks"] }
   Keep everything else as is.

5. apps/web/wrangler.jsonc missing bindings
   Open apps/web/wrangler.jsonc
   Add the same D1 and KV bindings that exist in apps/api/wrangler.jsonc
   Use the same database_id and KV id values — copy them exactly
   The web worker needs its own bindings declared even though it points to same resources
   Also add compatibility_flags: ["nodejs_compat"]

6. Verify prerender settings on every page
   Open every file in apps/web/src/pages/
   index.astro — must have: export const prerender = false
   embed.astro — must have: export const prerender = false
   gold-price-today-[city].astro — must have: export const prerender = true with getStaticPaths
   gold-price-calculator.astro — must have: export const prerender = true
   gold-price-history/[city].astro — must have: export const prerender = true with getStaticPaths
   embed-pricing.astro — must have: export const prerender = true
   Fix any page that has the wrong setting or is missing the declaration.

7. Verify build output after fixes
   Check that after pnpm build the dist/ folder contains _worker.js or _functions/ folder
   If only .html files are present with no worker output, the adapter is not activating —
   report what is wrong with the config causing this.

8. Fetch calls inside Astro SSR pages
   Search all .astro pages for any fetch() call to internal API routes like /api/gold
   In SSR on Cloudflare you cannot fetch your own Worker URL during SSR — it causes 
   a loop or fails with connection errors.
   Replace any internal fetch('/api/gold') in .astro frontmatter with a direct function call.
   Create apps/web/src/lib/goldService.ts that exports functions:
     getGoldPrice(env: Env, city: string, karat: number): Promise<GoldPriceEntry>
     getHistory(env: Env, city: string, karat: number, range: string): Promise<HistoryPoint[]>
     getCities(env: Env): Promise<CityConfig[]>
   These functions query KV and D1 directly using the env bindings — no fetch() needed.
   Import and call these in .astro frontmatter instead of fetch('/api/gold').
   The React island components (PriceWidget, PriceChart) can still use fetch('/api/gold') 
   on the client side — that is fine and correct.

9. CORS and API worker URL
   In PriceWidget.tsx, PriceChart.tsx, GoldCalculator.tsx — check what URL they fetch from.
   If they fetch '/api/gold' (relative URL) that only works if API and web are on the same domain.
   If the API worker is deployed separately at gold-api-worker.workers.dev, the components
   must fetch the full URL.
   Check apps/web/src/lib/site.ts or any config file for the API base URL.
   If not present, create apps/web/src/lib/config.ts:
     export const API_BASE = import.meta.env.PUBLIC_API_URL ?? ''
   Update all client-side fetch calls to use: fetch(`${API_BASE}/api/gold?city=${city}`)
   Add PUBLIC_API_URL to apps/web/.env.example with a comment explaining what to set.

---

AFTER ALL FIXES:

Run pnpm build in apps/web and confirm:
- No TypeScript errors
- dist/_worker.js exists OR dist/_functions/ folder exists
- dist/_routes.json exists and lists dynamic routes

Show me every file you changed with the complete new content.
Do not show diffs — show full file contents.