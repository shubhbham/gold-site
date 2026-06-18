import { z } from "zod";
import { enrichRetailEstimate, getCityConfig, type ApiResponse, type GoldKarat, type GoldPriceEntry } from "@gold-site/shared";
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

type GoldPriceResponse = Omit<GoldPriceEntry, "price_local" | "retail_adjustment_local">;

function getRetailOverrideKey(citySlug: string, karat: GoldKarat): string {
  return `retail_override:${citySlug}:${karat}k`;
}

function applyRetailOverride(entry: GoldPriceEntry, adjustmentPercent: number): GoldPriceEntry {
  const benchmarkLocal = entry.benchmark_local ?? entry.price_local;
  const precision = entry.currency === "INR" ? 0 : 2;
  const factor = 10 ** precision;
  const retailAdjustmentLocal = Math.round(benchmarkLocal * (adjustmentPercent / 100) * factor) / factor;
  const retailLocal = Math.round((benchmarkLocal + retailAdjustmentLocal) * factor) / factor;
  return {
    ...entry,
    retail_local: retailLocal,
    retail_adjustment_local: retailAdjustmentLocal,
    retail_adjustment_percent: adjustmentPercent,
  };
}

function stripPriceFields(entry: GoldPriceEntry): GoldPriceResponse {
  const { price_local: _p, retail_adjustment_local: _r, ...rest } = entry;
  return rest;
}

const patchBodySchema = z.object({
  city: z.string().regex(/^[a-z0-9-]+$/),
  karat: z.union([z.literal(22), z.literal(24)]),
  retail_adjustment_percent: z.number().min(0).max(100),
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
  const previous = await c.env.DB
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
      let entry = enrichRetailEstimate(markStale(withWeek));
      const override = await c.env.GOLD_CACHE.get(getRetailOverrideKey(resolvedCity.city_slug, karat), "json") as { retail_adjustment_percent: number } | null;
      if (override) {
        entry = applyRetailOverride(entry, override.retail_adjustment_percent);
      }
      const payload: ApiResponse<GoldPriceResponse> = {
        data: stripPriceFields(entry),
        error: null,
        cached: true,
      };
      c.header("X-Cache", "HIT");
      return c.json(payload);
    }

    const row = await c.env.DB
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
    let entry = enrichRetailEstimate(markStale(entryWithWeek));
    const override = await c.env.GOLD_CACHE.get(getRetailOverrideKey(resolvedCity.city_slug, karat), "json") as { retail_adjustment_percent: number } | null;
    if (override) {
      entry = applyRetailOverride(entry, override.retail_adjustment_percent);
    }
    await writeJsonToKv(c.env.GOLD_CACHE, cacheKey, entry, config.cache_ttl_seconds);
    const payload: ApiResponse<GoldPriceResponse> = { data: stripPriceFields(entry), error: null, cached: false };
    c.header("X-Cache", "MISS");
    return c.json(payload);
  } catch (error) {
    const payload: ApiResponse<GoldPriceResponse> = {
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

export async function patchGoldHandler(c: Context<AppEnv>) {
  try {
    const headerValue = c.req.header("X-Admin-Key");
    if (!headerValue || !(await constantTimeEquals(headerValue, c.env.ADMIN_KEY))) {
      return c.json({ data: null, error: "unauthorized", cached: false } satisfies ApiResponse<null>, 401);
    }

    const body = await c.req.json();
    const parsed = patchBodySchema.parse(body);
    const karat = parsed.karat as GoldKarat;
    const citySlug = parsed.city;

    const cityConfig = getCityConfig(citySlug);
    if (!cityConfig) {
      return c.json({ data: null, error: "unknown_city", cached: false } satisfies ApiResponse<null>, 400);
    }

    const cacheKey = getGoldCacheKey(cityConfig.country_code, citySlug, karat);
    const config = await getRuntimeConfig(c.env);

    let current = await readJsonFromKv<GoldPriceEntry>(c.env.GOLD_CACHE, cacheKey);
    if (!current) {
      const row = await c.env.DB
        .prepare(
          `SELECT city_slug, city_name, country_code, karat, price_local, price_usd, currency, unit,
                  change_amount, change_percent, high_today, low_today, price_date, fetched_at
           FROM gold_prices WHERE city_slug = ? AND karat = ? ORDER BY price_date DESC LIMIT 1`,
        )
        .bind(citySlug, karat)
        .first<Omit<GoldPriceEntry, "stale">>();

      if (!row) {
        return c.json({ data: null, error: "price_unavailable", cached: false } satisfies ApiResponse<null>, 404);
      }
      current = enrichRetailEstimate({ ...row, stale: false });
    }

    const updated = applyRetailOverride(current, parsed.retail_adjustment_percent);

    // Persist override — survives daily cron refresh
    await c.env.GOLD_CACHE.put(
      getRetailOverrideKey(citySlug, karat),
      JSON.stringify({ retail_adjustment_percent: parsed.retail_adjustment_percent }),
    );

    // Update main cache entry immediately
    await writeJsonToKv(c.env.GOLD_CACHE, cacheKey, updated, config.cache_ttl_seconds);

    const payload: ApiResponse<GoldPriceResponse> = { data: stripPriceFields(updated), error: null, cached: false };
    return c.json(payload);
  } catch (error) {
    return c.json(
      {
        data: null,
        error: error instanceof Error ? error.message : "patch_failed",
        cached: false,
      } satisfies ApiResponse<null>,
      500,
    );
  }
}