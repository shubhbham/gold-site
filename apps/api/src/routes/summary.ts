import { z } from "zod";
import { enrichRetailEstimate, type ApiResponse, type GoldPriceEntry } from "@gold-site/shared";
import type { Context } from "hono";
import type { AppEnv } from "../index";
import { readJsonFromKv, writeJsonToKv } from "../services/cache";
import { getRuntimeConfig } from "../services/fetcher";

const querySchema = z.object({
  city: z.string().regex(/^[a-z0-9-]+$/).optional(),
  karat: z
    .enum(["22", "24"])
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .pipe(z.union([z.literal(22), z.literal(24), z.undefined()])),
});

function getSummaryCacheKey(city?: string, karat?: 22 | 24): string {
  if (city && karat) {
    return `today:summary:${city}:${karat}`;
  }

  if (city) {
    return `today:summary:${city}`;
  }

  if (karat) {
    return `today:summary:${karat}`;
  }

  return "today:summary";
}

export async function getSummaryHandler(c: Context<AppEnv>) {
  try {
    const parsed = querySchema.parse({
      city: c.req.query("city"),
      karat: c.req.query("karat"),
    });
    const cacheKey = getSummaryCacheKey(parsed.city, parsed.karat);
    const cached = await readJsonFromKv<GoldPriceEntry[]>(c.env.GOLD_CACHE, cacheKey);
    if (cached) {
      c.header("X-Cache", "HIT");
      const payload: ApiResponse<GoldPriceEntry[]> = { data: cached.map(enrichRetailEstimate), error: null, cached: true };
      return c.json(payload);
    }

    const conditions: string[] = ["price_date = (SELECT MAX(price_date) FROM gold_prices)"];
    const bindings: Array<string | number> = [];

    if (parsed.city) {
      conditions.push("city_slug = ?");
      bindings.push(parsed.city);
    }

    if (parsed.karat) {
      conditions.push("karat = ?");
      bindings.push(parsed.karat);
    }

    const result = await c.env.gold_prices_db
      .prepare(
        `SELECT city_slug, city_name, country_code, karat, price_local, price_usd, currency, unit,
                change_amount, change_percent, high_today, low_today, price_date, fetched_at
         FROM gold_prices
         WHERE ${conditions.join(" AND ")}
         ORDER BY country_code, city_name, karat`,
      )
      .bind(...bindings)
      .all<Omit<GoldPriceEntry, "stale">>();

    const summary = result.results.map((entry) => enrichRetailEstimate({ ...entry, stale: false }));
    const config = await getRuntimeConfig(c.env);
    await writeJsonToKv(c.env.GOLD_CACHE, cacheKey, summary, config.cache_ttl_seconds);
    c.header("X-Cache", "MISS");
    const payload: ApiResponse<GoldPriceEntry[]> = { data: summary, error: null, cached: false };
    return c.json(payload);
  } catch (error) {
    const payload: ApiResponse<GoldPriceEntry[]> = {
      data: null,
      error: error instanceof Error ? error.message : "summary_unavailable",
      cached: false,
    };
    return c.json(payload, 500);
  }
}