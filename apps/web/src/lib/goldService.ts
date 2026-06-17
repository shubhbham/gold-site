import {
  CITY_CONFIGS,
  HISTORY_RANGE_DAYS,
  enrichRetailEstimate,
  type CityConfig,
  type GoldKarat,
  type GoldPriceEntry,
  type HistoryPoint,
  type HistoryRange,
} from "@gold-site/shared";

/**
 * Fetch the full summary (all cities, both karats) from KV cache or D1.
 * Used in SSR pages at request time — no HTTP round-trip needed.
 */
export async function getSummaryData(env: Env): Promise<GoldPriceEntry[]> {
  const cached = (await env.GOLD_CACHE.get("today:summary", "json")) as GoldPriceEntry[] | null;
  if (cached?.length) {
    return cached.map(enrichRetailEstimate);
  }

  const result = await env.DB.prepare(
    `SELECT city_slug, city_name, country_code, karat, price_local, price_usd, currency, unit,
            change_amount, change_percent, high_today, low_today, price_date, fetched_at
     FROM gold_prices
     WHERE price_date = (SELECT MAX(price_date) FROM gold_prices)
     ORDER BY country_code, city_name, karat`,
  ).all<Omit<GoldPriceEntry, "stale">>();

  return result.results.map((row: Omit<GoldPriceEntry, "stale">) => enrichRetailEstimate({ ...row, stale: false }));
}

/**
 * Fetch a single gold price entry for a given city and karat.
 * Tries KV cache first, then D1.
 */
export async function getGoldPrice(
  env: Env,
  citySlug: string,
  karat: GoldKarat,
): Promise<GoldPriceEntry | null> {
  const config = CITY_CONFIGS.find((c) => c.city_slug === citySlug);
  if (!config) return null;

  const cacheKey = `gold:${config.country_code.toUpperCase()}:${citySlug}:${karat}k`;
  const cached = (await env.GOLD_CACHE.get(cacheKey, "json")) as GoldPriceEntry | null;
  if (cached) return enrichRetailEstimate(cached);

  const row = await env.DB.prepare(
    `SELECT city_slug, city_name, country_code, karat, price_local, price_usd, currency, unit,
            change_amount, change_percent, high_today, low_today, price_date, fetched_at
     FROM gold_prices
     WHERE city_slug = ? AND karat = ?
     ORDER BY price_date DESC
     LIMIT 1`,
  )
    .bind(citySlug, karat)
    .first<Omit<GoldPriceEntry, "stale">>();

  return row ? enrichRetailEstimate({ ...row, stale: false }) : null;
}

/**
 * Fetch both karats for a given city.
 */
export async function getCityLatestData(
  env: Env,
  citySlug: string,
): Promise<GoldPriceEntry[]> {
  const [twentyTwo, twentyFour] = await Promise.all([
    getGoldPrice(env, citySlug, 22),
    getGoldPrice(env, citySlug, 24),
  ]);

  const config = CITY_CONFIGS.find((c) => c.city_slug === citySlug);
  if (!config) return [];

  const results: GoldPriceEntry[] = [];
  if (twentyTwo) results.push(twentyTwo);
  if (twentyFour) results.push(twentyFour);
  return results;
}

/**
 * Fetch historical price data for a city/karat/range.
 * Tries KV cache, then D1 with appropriate granularity.
 */
export async function getHistoryData(
  env: Env,
  citySlug: string,
  karat: GoldKarat,
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  const cacheKey = `history:${citySlug}:${karat}:${range}`;
  const cached = (await env.GOLD_CACHE.get(cacheKey, "json")) as HistoryPoint[] | null;
  if (cached?.length) return cached;

  const days = HISTORY_RANGE_DAYS[range];
  const windowExpr = `-${days} days`;

  const dailySql = `SELECT price_date, price_local, price_usd, change_percent
    FROM gold_prices
    WHERE city_slug = ? AND karat = ? AND price_date >= date('now', ?)
    ORDER BY price_date ASC`;

  const weeklySql = `SELECT MIN(price_date) AS price_date,
    ROUND(AVG(price_local), 2) AS price_local,
    ROUND(AVG(price_usd), 2) AS price_usd,
    ROUND(AVG(change_percent), 2) AS change_percent
    FROM gold_prices
    WHERE city_slug = ? AND karat = ? AND price_date >= date('now', ?)
    GROUP BY strftime('%Y', price_date), strftime('%W', price_date)
    ORDER BY price_date ASC`;

  const monthlySql = `SELECT substr(price_date, 1, 7) || '-01' AS price_date,
    ROUND(AVG(price_local), 2) AS price_local,
    ROUND(AVG(price_usd), 2) AS price_usd,
    ROUND(AVG(change_percent), 2) AS change_percent
    FROM gold_prices
    WHERE city_slug = ? AND karat = ? AND price_date >= date('now', ?)
    GROUP BY substr(price_date, 1, 7)
    ORDER BY price_date ASC`;

  const sql = days <= 90 ? dailySql : days <= 365 ? weeklySql : monthlySql;

  const result = await env.DB.prepare(sql)
    .bind(citySlug, karat, windowExpr)
    .all<HistoryPoint>();

  return result.results;
}

/**
 * Fetch active city configs from KV cache or D1.
 */
export async function getCities(env: Env): Promise<CityConfig[]> {
  const cached = (await env.GOLD_CACHE.get("cities:all", "json")) as CityConfig[] | null;
  if (cached?.length) return cached;

  const result = await env.DB.prepare(
    `SELECT city_slug, city_name, country_code, currency, gst_rate, display_unit, timezone, active
     FROM city_config WHERE active = 1 ORDER BY country_code, city_name`,
  ).all<CityConfig & { active: number }>();

  if (!result.results.length) return CITY_CONFIGS;

  type CityRow = Omit<CityConfig, "active"> & { active: number };
  return (result.results as CityRow[]).map((row) => ({
    ...row,
    active: Boolean(row.active),
  }));
}
