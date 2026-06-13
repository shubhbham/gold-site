import type { ApiResponse } from "@gold-site/shared";
import type { Context } from "hono";
import type { AppEnv } from "../index";

interface HealthPayload {
  status: "ok" | "degraded";
  d1: "ok" | "error";
  kv: "ok" | "error";
  last_fetch_date: string | null;
  last_fetch_status: string;
}

export async function getHealthHandler(c: Context<AppEnv>) {
  try {
    let d1: "ok" | "error" = "ok";
    let kv: "ok" | "error" = "ok";

    const configRow = await c.env.gold_prices_db
      .prepare("SELECT last_fetch_date, last_fetch_status FROM app_config WHERE id = 1")
      .first<{ last_fetch_date: string | null; last_fetch_status: string }>();

    try {
      await c.env.gold_prices_db.prepare("SELECT 1 AS ok").first();
    } catch {
      d1 = "error";
    }

    try {
      const tempKey = `health:${crypto.randomUUID()}`;
      await c.env.GOLD_CACHE.put(tempKey, "ok", { expirationTtl: 60 });
      await c.env.GOLD_CACHE.get(tempKey);
      await c.env.GOLD_CACHE.delete(tempKey);
    } catch {
      kv = "error";
    }

    const payload: ApiResponse<HealthPayload> = {
      data: {
        status: d1 === "ok" && kv === "ok" ? "ok" : "degraded",
        d1,
        kv,
        last_fetch_date: configRow?.last_fetch_date ?? null,
        last_fetch_status: configRow?.last_fetch_status ?? "never",
      },
      error: null,
      cached: false,
    };

    return c.json(payload, d1 === "ok" && kv === "ok" ? 200 : 503);
  } catch (error) {
    const payload: ApiResponse<HealthPayload> = {
      data: null,
      error: error instanceof Error ? error.message : "health_unavailable",
      cached: false,
    };
    return c.json(payload, 500);
  }
}