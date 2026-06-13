import { z } from "zod";
import { enrichRetailEstimate, type ApiResponse, type GoldKarat, type GoldPriceEntry } from "@gold-site/shared";
import type { Context } from "hono";
import type { AppEnv } from "../index";
import { handleScheduled } from "../cron";
import { getGoldCacheKey, readJsonFromKv, writeJsonToKv } from "../services/cache";
import { getRuntimeConfig } from "../services/fetcher";
import { resolveCity } from "../services/geo";

const querySchema = z.object({
  city: z.string().regex(/^[a-z0-9-]+$/).optional(),
  karat: z
    .enum(["22", "24"])
    .optional()
    .transform((value) => (value ? Number(value) : 22))
    .pipe(z.union([z.literal(22), z.literal(24)])),
});

async function constantTimeEquals(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

function markStale(entry: GoldPriceEntry): GoldPriceEntry {
  return {
    ...entry,
    stale: entry.price_date !== new Date().toISOString().slice(0, 10),
  };
}

async function withWeeklyChange(
  c: Context<AppEnv>,
  entry: GoldPriceEntry,
): Promise<GoldPriceEntry> {
  const previous = await c.env.gold_prices_db
    .prepare(
      `SELECT price_local
       FROM gold_prices
       WHERE city_slug = ? AND karat = ? AND price_date <= date(?, '-7 days')
       ORDER BY price_date DESC
       LIMIT 1`,
    )
    .bind(entry.city_slug, entry.karat, entry.price_date)
    .first<{ price_local: number }>();

  if (!previous) {
    return {
      ...entry,
      week_change_amount: null,
      week_change_percent: null,
    };
  }

  const precision = entry.currency === "INR" ? 0 : 2;
  const factor = 10 ** precision;
  const delta = entry.price_local - previous.price_local;
  const weekAmount = Math.round(delta * factor) / factor;
  const weekPercent = previous.price_local === 0
    ? 0
    : Math.round((((delta / previous.price_local) * 100) + Number.EPSILON) * 100) / 100;

  return {
    ...entry,
    week_change_amount: weekAmount,
    week_change_percent: weekPercent,
  };
}

export async function getGoldHandler(c: Context<AppEnv>) {
  try {
    const parsed = querySchema.parse({
      city: c.req.query("city"),
      karat: c.req.query("karat") ?? "22",
    });

    const cf = c.req.raw.cf as { country?: string; city?: string } | undefined;
    const resolvedCity = resolveCity(cf?.country, cf?.city, parsed.city);
    const karat = parsed.karat as GoldKarat;
    const cacheKey = getGoldCacheKey(resolvedCity.country_code, resolvedCity.city_slug, karat);
    const cached = await readJsonFromKv<GoldPriceEntry>(c.env.GOLD_CACHE, cacheKey);

    if (cached) {
      const withWeek = await withWeeklyChange(c, cached);
      const payload: ApiResponse<GoldPriceEntry> = {
        data: enrichRetailEstimate(markStale(withWeek)),
        error: null,
        cached: true,
      };
      c.header("X-Cache", "HIT");
      return c.json(payload);
    }

    const row = await c.env.gold_prices_db
      .prepare(
        `SELECT city_slug, city_name, country_code, karat, price_local, price_usd, currency, unit,
                change_amount, change_percent, high_today, low_today, price_date, fetched_at
         FROM gold_prices
         WHERE city_slug = ? AND karat = ?
         ORDER BY price_date DESC
         LIMIT 1`,
      )
      .bind(resolvedCity.city_slug, karat)
      .first<Omit<GoldPriceEntry, "stale">>();

    if (!row) {
      const payload: ApiResponse<GoldPriceEntry> = {
        data: null,
        error: "price_unavailable",
        cached: false,
      };
      return c.json(payload, 503);
    }

    const config = await getRuntimeConfig(c.env);
    const entryWithWeek = await withWeeklyChange(c, { ...row, stale: false });
    const entry = enrichRetailEstimate(markStale(entryWithWeek));
    await writeJsonToKv(c.env.GOLD_CACHE, cacheKey, entry, config.cache_ttl_seconds);
    const payload: ApiResponse<GoldPriceEntry> = { data: entry, error: null, cached: false };
    c.header("X-Cache", "MISS");
    return c.json(payload);
  } catch (error) {
    const payload: ApiResponse<GoldPriceEntry> = {
      data: null,
      error: error instanceof Error ? error.message : "invalid_request",
      cached: false,
    };
    return c.json(payload, 400);
  }
}

export async function postAdminFetchHandler(c: Context<AppEnv>) {
  try {
    const headerValue = c.req.header("X-Admin-Key");
    if (!headerValue || !(await constantTimeEquals(headerValue, c.env.ADMIN_KEY))) {
      return c.json({ data: null, error: "unauthorized", cached: false } satisfies ApiResponse<null>, 401);
    }

    await handleScheduled(
      { cron: "manual", scheduledTime: Date.now(), noRetry: () => undefined } as ScheduledController,
      c.env,
      c.executionCtx as unknown,
    );

    return c.json({ data: { status: "queued" }, error: null, cached: false });
  } catch (error) {
    return c.json(
      {
        data: null,
        error: error instanceof Error ? error.message : "fetch_failed",
        cached: false,
      } satisfies ApiResponse<null>,
      500,
    );
  }
}