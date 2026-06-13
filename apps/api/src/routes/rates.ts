import type { ApiResponse } from "@gold-site/shared";
import type { Context } from "hono";
import type { AppEnv } from "../index";
import { readJsonFromKv, writeJsonToKv } from "../services/cache";
import { fetchFxRates, getRuntimeConfig } from "../services/fetcher";

type FxRates = { INR: number; CAD: number; AED: number; GBP: number };

export async function getRatesHandler(c: Context<AppEnv>) {
  try {
    const cached = await readJsonFromKv<FxRates>(c.env.GOLD_CACHE, "rates:usd");
    if (cached) {
      const payload: ApiResponse<FxRates> = { data: cached, error: null, cached: true };
      c.header("X-Cache", "HIT");
      return c.json(payload);
    }

    const [config, rates] = await Promise.all([getRuntimeConfig(c.env), fetchFxRates(c.env)]);
    await writeJsonToKv(c.env.GOLD_CACHE, "rates:usd", rates, config.cache_ttl_seconds);
    const payload: ApiResponse<FxRates> = { data: rates, error: null, cached: false };
    c.header("X-Cache", "MISS");
    return c.json(payload);
  } catch (error) {
    const payload: ApiResponse<FxRates> = {
      data: null,
      error: error instanceof Error ? error.message : "rates_unavailable",
      cached: false,
    };
    return c.json(payload, 500);
  }
}