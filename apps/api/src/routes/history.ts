import { z } from "zod";
import type { ApiResponse, GoldKarat, HistoryPoint, HistoryRange } from "@gold-site/shared";
import { HISTORY_RANGE_DAYS } from "@gold-site/shared";
import type { Context } from "hono";
import type { AppEnv } from "../index";
import { getHistoryCacheKey, readJsonFromKv, writeJsonToKv } from "../services/cache";
import { getRuntimeConfig } from "../services/fetcher";

const paramsSchema = z.object({
  city: z.string().regex(/^[a-z0-9-]+$/),
  karat: z
    .enum(["22", "24"])
    .optional()
    .transform((value) => (value ? Number(value) : 22))
    .pipe(z.union([z.literal(22), z.literal(24)])),
  range: z.enum(["1m", "3m", "6m", "1y", "2y", "5y"]).optional().default("1m"),
  refresh: z
    .enum(["0", "1", "false", "true"])
    .optional()
    .transform((value) => value === "1" || value === "true"),
});

export async function getHistoryHandler(c: Context<AppEnv>) {
  try {
    const parsed = paramsSchema.parse({
      city: c.req.param("city"),
      karat: c.req.query("karat") ?? "22",
      range: c.req.query("range") ?? "1m",
      refresh: c.req.query("refresh") ?? "0",
    });

    const range = parsed.range as HistoryRange;
    const karat = parsed.karat as GoldKarat;
    const cacheKey = getHistoryCacheKey(parsed.city, karat, range);
    const config = await getRuntimeConfig(c.env);
    const cached = parsed.refresh ? null : await readJsonFromKv<HistoryPoint[]>(c.env.GOLD_CACHE, cacheKey);

    if (cached && !parsed.refresh) {
      const payload: ApiResponse<HistoryPoint[]> = { data: cached, error: null, cached: true };
      c.header("X-Cache", "HIT");
      return c.json(payload);
    }

    const days = HISTORY_RANGE_DAYS[range];
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
    const windowExpr = `-${days} days`;
    const result = await c.env.DB
      .prepare(sql)
      .bind(parsed.city, karat, windowExpr)
      .all<HistoryPoint>();

    await writeJsonToKv(c.env.GOLD_CACHE, cacheKey, result.results, config.history_cache_ttl_seconds);
    const payload: ApiResponse<HistoryPoint[]> = {
      data: result.results,
      error: null,
      cached: false,
    };
    c.header("X-Cache", "MISS");
    return c.json(payload);
  } catch (error) {
    const payload: ApiResponse<HistoryPoint[]> = {
      data: null,
      error: error instanceof Error ? error.message : "history_unavailable",
      cached: false,
    };
    return c.json(payload, 400);
  }
}