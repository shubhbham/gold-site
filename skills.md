I have a monorepo at gold-site/ with this structure:
- apps/api/        Cloudflare Worker (Hono + TypeScript)
- apps/web/        Astro frontend (React islands, Tailwind, Cloudflare adapter)
- packages/shared/ shared TypeScript types

Cloudflare resources are already created and wrangler.toml files are set up with
real D1 and KV IDs. schema.sql has already been run. Secrets METALS_DEV_KEY and
GOLDAPI_KEY are set in Workers.

BUILD THIS COMPLETE GOLD PRICE WEBSITE. Write every file. Do not skip any file.

also ensure the api used are only having 100 requests per month what eer you do first have a copy of it to the database so that we can use anything from there. make the things that can be changed in the future as configuration values

---

WHAT THE SITE DOES:
Shows today's gold price (22k and 24k) for Indian cities, US, Canada, UAE, UK.
Fetches price data ONCE per day via cron (03:00 UTC). All user traffic hits KV cache only.
Historical bar charts from 1 month to 5 years. Gold calculator. Embeddable widget for jewellers.

---

API STRATEGY (zero cost):
- metals.dev: primary price source, 1 call/day, free tier = 100/month
- goldapi.io: change/high/low data only, 1 call/day, free tier = 100/month
- exchangerate-api.com/v4/latest/USD: currency rates, no key, free unlimited
- Total: ~30 API calls/month across all sources. Stays free forever.

---

CRON WORKER (apps/api/src/cron.ts):

Runs at 03:00 UTC daily ("0 3 * * *").

Before fetching: read app_config.last_fetch_date from D1.
If it equals today's UTC date string, return early. Idempotent, never double-fetches.

Fetch sequence:
1. GET https://api.metals.dev/v1/latest?api_key={env.METALS_DEV_KEY}&currency=USD&unit=troy_ounce
   Extract metals.gold as usd_per_troy_oz
2. GET https://www.goldapi.io/api/XAU/USD with header x-access-token: {env.GOLDAPI_KEY}
   Extract ch (daily change USD), chp (change percent), high_price, low_price
3. GET https://api.exchangerate-api.com/v4/latest/USD
   Extract rates: INR, CAD, AED, GBP

Price calculation:
  usd_per_gram = usd_per_troy_oz / 31.1035

  India (ALL cities get same national IBJA base — city prices in India differ only by
  jeweller making charges, NOT by city. GST is 3% nationwide uniform central tax):
    inr_per_gram = usd_per_gram * INR_rate
    price_24k = round(inr_per_gram * 10 * 1.03, 0)   -- per 10g with GST
    price_22k = round(price_24k * (22/24), 0)
    change_amount = round(ch * INR_rate / 31.1035 * 10, 0)
    change_percent = chp

  US: price_24k = round(usd_per_troy_oz, 2) in USD per troy oz
  Canada: price_24k = round(usd_per_troy_oz * CAD_rate, 2) in CAD per troy oz
  UAE: price_24k = round(usd_per_gram * AED_rate, 2) in AED per gram
  UK: price_24k = round(usd_per_gram * GBP_rate, 2) in GBP per gram

After computing:
1. INSERT OR IGNORE into D1 gold_prices — one row per city per karat with price_date = today UTC date
2. Write KV keys: gold:{COUNTRY}:{CITY_SLUG}:{KARAT}k = GoldPriceEntry JSON, TTL 86400
3. Write KV key today:summary = JSON array of all cities both karats, TTL 86400
4. Write KV key rates:usd = fx rates JSON, TTL 86400
5. UPDATE app_config set last_fetch_date = today, last_fetch_status = success
6. DELETE FROM gold_prices WHERE price_date < date('now', '-5 years')
On any fetch failure: log error, update last_fetch_status = failed: [reason], do NOT write to D1 or KV.

---

HONO API ROUTES (apps/api/src/index.ts):

Register the cron handler and all routes in one file.
CORS: Access-Control-Allow-Origin: * on all responses.
All inputs validated with Zod.

GET /api/gold
  Params: city? (string slug), karat? (22|24)
  1. Read request.cf?.country + request.cf?.city for geo detection
  2. resolveCity(country, cfCity): normalize to slug, fallback map:
     IN→bangalore, US→us-national, CA→ca-national, AE→ae-dubai, GB→uk-london, else→us-national
     ?city= query param always overrides
  3. KV get: gold:{COUNTRY}:{CITY_SLUG}:{KARAT}k → return with X-Cache: HIT
  4. KV miss: D1 SELECT latest row for city+karat → write to KV TTL 86400 → return X-Cache: MISS
  5. Both fail: 503 {error: price_unavailable, stale: true}

GET /api/history/:city
  Params: karat? (22 default IN, 24 others), range? (1m|3m|6m|1y|2y|5y default 1m)
  Range to days: 1m=30, 3m=90, 6m=180, 1y=365, 2y=730, 5y=1825
  For range <= 1y: return daily rows (price_date, price_local, price_usd, change_percent)
  For range > 1y: GROUP BY strftime('%Y-%m', price_date), return monthly averages
  Cache in KV: history:{city}:{karat}:{range} TTL 86400
  KV hit first, miss → D1 query → write KV → return

GET /api/cities
  Return all active city_config rows. KV key cities:all TTL 86400.

GET /api/rates
  Return KV key rates:usd. If miss, fetch exchangerate-api and cache TTL 86400.

GET /api/health
  {status, d1: ok|error, kv: ok|error, last_fetch_date, last_fetch_status}

POST /api/admin/fetch
  Manually triggers the cron logic. For seeding initial data during setup.
  Protected by a simple header check: X-Admin-Key must match env.ADMIN_KEY secret.

---

SHARED TYPES (packages/shared/src/index.ts):

interface GoldPriceEntry {
  city_slug: string; city_name: string; country_code: string;
  karat: 22 | 24; price_local: number; currency: string; unit: string;
  change_amount: number; change_percent: number;
  high_today: number | null; low_today: number | null;
  price_date: string; fetched_at: string; stale: boolean;
}
interface CityConfig {
  city_slug: string; city_name: string; country_code: string;
  currency: string; gst_rate: number; display_unit: string;
  timezone: string; active: boolean;
}
interface HistoryPoint {
  price_date: string; price_local: number; price_usd: number; change_percent: number;
}
type ApiResponse<T> = {data: T; error: null; cached: boolean} | {data: null; error: string; cached: false}

---

ASTRO PAGES (apps/web/src/):

Layout: src/layouts/BaseLayout.astro
  Props: title, description, canonical, ogImage?
  <head>: canonical, robots index/follow, OG tags, preconnect to API worker URL,
  JSON-LD WebSite schema on homepage
  Top nav: logo + links (Calculator, History, cities dropdown)
  AdSlot after nav (header-banner)
  AdSlot above footer (footer-banner)
  Footer: links to all city pages, legal disclaimer:
  "Gold prices shown are indicative IBJA standard rates. Not financial advice.
  Verify with your local jeweller before purchase."

src/pages/index.astro
  export const prerender = false (SSR)
  Server side: fetch KV today:summary for all cities (one read)
  Pass initial data as props to PriceWidget
  Sections:
  1. Hero: PriceWidget (client:load) with geo-detected city initial data
  2. City grid: 6 cards (bangalore, mumbai, delhi, chennai, us-national, ae-dubai)
     Each card: city name, 22k price, 24k price, change badge, link to city page
  3. AdSlot in-article
  4. 30-day BarChart for bangalore (PriceChart client:visible)
  5. GoldCalculator (client:visible)
  6. GoldInvestCTA
  7. FAQ section with JSON-LD FAQ schema (5 questions)
  Meta: "Gold Price Today | Live 22k 24k Rates India USA | [SiteName]"

src/pages/gold-price-today-[city].astro
  export const prerender = true
  getStaticPaths(): return all city slugs from city_config seed data (hardcode the list)
  At build time: fetch D1 for latest price for each city, pass as initialData to PriceWidget
  Sections:
  1. PriceWidget (client:load) — renders immediately from initialData, no loading flash
  2. 22k/24k tabs
  3. Range selector (1M 3M 6M 1Y 2Y 5Y) + PriceChart (client:visible, recharts BarChart)
  4. AdSlot in-article
  5. Last 10 days price table (Date | 22k | 24k | Change %)
  6. GoldInvestCTA
  7. Unique city description paragraph (~100 words, write unique content for every city)
  8. FAQ JSON-LD schema + BreadcrumbList schema
  Sidebar layout desktop: 2/3 content + 1/3 AdSlot sidebar (300x250)
  Meta title: "Gold Price Today in [City Name] | 22k & 24k Rate – [Month Year]"
  Canonical URL per page.

src/pages/gold-price-calculator.astro
  export const prerender = true
  GoldCalculator (client:load)
  Inputs: weight (number), unit (gram|tola|sovereign|kg), karat (22|24), city dropdown
  Constants: 1 tola=11.664g, 1 sovereign=8g
  Fetch /api/gold once on city+karat change (debounced 400ms). Pure math for weight change.
  Output: local currency + USD equivalent
  Below: 300 words SEO content about gold weight units in India
  Meta: "Gold Price Calculator | Grams Tola Sovereign to INR & USD"

src/pages/gold-price-history/[city].astro
  export const prerender = true
  getStaticPaths(): all city slugs
  Range selector: 1M 3M 6M 1Y 2Y 5Y
  PriceChart (client:load) — full width, fetches /api/history on range change
  Monthly averages table built from initial API fetch at build time
  Meta: "Gold Price History [City] | 5-Year Chart & Monthly Averages"

src/pages/embed.astro
  export const prerender = false
  No BaseLayout — bare HTML only
  Query params: ?city=bangalore&karat=22&theme=light|dark
  Fetch /api/gold for city+karat
  Shows: city name, price, karat, "Rate for [date]"
  Max page weight 5KB. No Tailwind CDN — inline only the 10 CSS rules needed.

src/pages/embed-pricing.astro
  export const prerender = true
  Static marketing page for jeweller embed product
  Headline: "Add Live Gold Rates to Your Jewellery Website"
  Price: ₹499/month
  Features list, embed preview iframe pointing to /embed?city=bangalore&karat=22
  Contact form: name, email, website, city — posts to Formspree (leave endpoint as placeholder)

---

REACT COMPONENTS (apps/web/src/components/):

PriceWidget.tsx
  Props: initialData: GoldPriceEntry | null, defaultCity: string, defaultKarat: 22|24
  Render initialData immediately — NO loading spinner on first render.
  useEffect: fetch /api/gold to refresh. Auto-refresh every 60 minutes.
  If stale=true on data: show yellow banner "Yesterday's rate — today's rate updating soon"
  UI: price in text-4xl font-bold, change badge (green ▲ | red ▼), 
  22k/24k tab toggle, city searchable dropdown from /api/cities,
  subtitle "Rate as of [price_date]" — honest daily rate labelling, not "X min ago"

PriceChart.tsx
  Props: city: string, karat: 22|24, initialRange: '1m'
  State: range, data (HistoryPoint[]), loading
  On mount + on range change: fetch /api/history/:city?karat=X&range=Y
  recharts BarChart, ResponsiveContainer width=100%
  Bar fill: #D97706 (amber-600)
  X-axis: for <=1y show DD MMM, for >1y show MMM YY
  Y-axis: formatted with currency symbol, no decimals for INR
  Tooltip: formatted price + date
  Range buttons: 1M 3M 6M 1Y 2Y 5Y — styled pill buttons, active state highlighted
  Loading state: show grey skeleton bars (CSS animation)

GoldCalculator.tsx
  Internal state for weight, unit, karat, city, fetchedPrice, result
  Fetch /api/gold only when city or karat changes (debounced 400ms)
  Recalculate result on every weight or unit change — no API call, just math
  Output box: large price display + USD equivalent side by side
  Unit constants: tola=11.664g, sovereign=8g, kg=1000g

AdSlot.tsx
  Props: slot: 'header-banner'|'in-article'|'sidebar'|'footer-banner'
  Renders <div data-ad-slot={slot}> with appropriate min-height per slot
  Comment: // Replace content with your Google AdSense ad unit script

GoldInvestCTA.tsx
  Props: countryCode: string
  India: 3 cards — Digital Gold (Zerodha/PhonePe placeholder link), 
    Sovereign Gold Bonds (https://www.rbi.org.in), Gold ETFs (NSE placeholder)
  US/CA: Gold ETFs card, Gold Futures card (placeholder links)
  3-column grid desktop, 1-column mobile

---

STYLING:
Tailwind CSS throughout. Color palette:
  Primary: amber-600 (#D97706) for gold theme
  Text: gray-900 / gray-600
  Background: white / gray-50
  Change up: green-600, change down: red-600
  System font stack only: font-family: system-ui, -apple-system, sans-serif (no Google Fonts)

Performance:
  client:load — PriceWidget on hero and calculator page
  client:visible — PriceChart, GoldCalculator on homepage (lazy, below fold)
  All city pages: pre-rendered static HTML with real price in markup

---

ERROR HANDLING:
- Every Hono route: try/catch returning typed ApiResponse
- Zod validate: city slug format /^[a-z0-9-]+$/, karat must be 22|24, range enum
- API fetch failures in cron: log + update status, never crash worker
- KV miss → D1 fallback on every /api/gold call
- D1 no rows: 503 with JSON body, never unhandled rejection

---

DELIVER ALL FILES:
apps/api/src/index.ts
apps/api/src/cron.ts
apps/api/src/routes/gold.ts
apps/api/src/routes/history.ts
apps/api/src/routes/cities.ts
apps/api/src/routes/rates.ts
apps/api/src/routes/health.ts
apps/api/src/services/fetcher.ts
apps/api/src/services/geo.ts
apps/api/src/services/cache.ts
apps/api/schema.sql
packages/shared/src/index.ts
apps/web/astro.config.mjs
apps/web/tailwind.config.mjs
apps/web/src/layouts/BaseLayout.astro
apps/web/src/pages/index.astro
apps/web/src/pages/gold-price-today-[city].astro
apps/web/src/pages/gold-price-calculator.astro
apps/web/src/pages/gold-price-history/[city].astro
apps/web/src/pages/embed.astro
apps/web/src/pages/embed-pricing.astro
apps/web/src/components/PriceWidget.tsx
apps/web/src/components/PriceChart.tsx
apps/web/src/components/GoldCalculator.tsx
apps/web/src/components/AdSlot.tsx
apps/web/src/components/GoldInvestCTA.tsx
README.md

Write every file completely. No TODOs. No placeholder functions. All logic implemented.