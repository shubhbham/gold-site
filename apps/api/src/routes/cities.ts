import type { ApiResponse, CityConfig } from "@gold-site/shared";
import type { Context } from "hono";
import type { AppEnv } from "../index";
import { getRuntimeConfig, getActiveCityConfigs } from "../services/fetcher";
import { readJsonFromKv, writeJsonToKv } from "../services/cache";

export async function getCitiesHandler(c: Context<AppEnv>) {
  try {
    const config = await getRuntimeConfig(c.env);
    const cached = await readJsonFromKv<CityConfig[]>(c.env.GOLD_CACHE, "cities:all");
    if (cached) {
      const payload: ApiResponse<CityConfig[]> = { data: cached, error: null, cached: true };
      c.header("X-Cache", "HIT");
      return c.json(payload);
    }

    const cities = await getActiveCityConfigs(c.env);
    await writeJsonToKv(c.env.GOLD_CACHE, "cities:all", cities, config.cache_ttl_seconds);
    const payload: ApiResponse<CityConfig[]> = { data: cities, error: null, cached: false };
    c.header("X-Cache", "MISS");
    return c.json(payload);
  } catch (error) {
    const payload: ApiResponse<CityConfig[]> = {
      data: null,
      error: error instanceof Error ? error.message : "cities_unavailable",
      cached: false,
    };
    return c.json(payload, 500);
  }
}