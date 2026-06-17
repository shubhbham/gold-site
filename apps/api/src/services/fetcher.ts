import {
  CITY_CONFIGS,
  enrichRetailEstimate,
  getCurrentUtcDate,
  type CityConfig,
  type GoldKarat,
  type GoldPriceEntry,
} from "@gold-site/shared";
import { getGoldCacheKey, purgePrefix, writeJsonToKv } from "./cache";

interface AppConfigRow {
  last_fetch_date: string | null;
  last_fetch_status: string;
  cache_ttl_seconds: number;
  history_cache_ttl_seconds: number;
  metals_api_url: string;
  goldapi_url: string;
  fx_api_url: string;
}

interface MetalsResponse {
  status?: string;
  error_code?: number;
  error_message?: string;
  currency?: string;
  unit?: string;
  rates?: Record<string, number>;
  metals?: {
    gold?: number;
    XAU?: number;
  };
}

interface GoldApiResponse {
  price?: number;
  ch?: number;
  chp?: number;
  high_price?: number;
  low_price?: number;
}

interface CityConfigRow {
  city_slug: string;
  city_name: string;
  country_code: string;
  currency: string;
  gst_rate: number;
  display_unit: string;
  timezone: string;
  active: number;
}

interface FxResponse {
  rates?: Record<string, number>;
}

interface UpstreamSnapshot {
  usdPerTroyOunce: number;
  changeUsd: number;
  changePercent: number;
  highUsd: number | null;
  lowUsd: number | null;
  rates: {
    INR: number;
    CAD: number;
    AED: number;
    GBP: number;
  };
}

export interface DailyFetchResult {
  skipped: boolean;
  summary: GoldPriceEntry[];
  fxRates: UpstreamSnapshot["rates"];
  today: string;
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getRuntimeConfig(env: Env): Promise<AppConfigRow> {
  const row = await env.DB
    .prepare(
      `SELECT last_fetch_date, last_fetch_status, cache_ttl_seconds, history_cache_ttl_seconds,
              metals_api_url, goldapi_url, fx_api_url
       FROM app_config WHERE id = 1`,
    )
    .first<AppConfigRow>();

  return {
    last_fetch_date: row?.last_fetch_date ?? null,
    last_fetch_status: row?.last_fetch_status ?? "never",
    cache_ttl_seconds: row?.cache_ttl_seconds ?? parseNumber(env.CACHE_TTL_SECONDS, 86400),
    history_cache_ttl_seconds:
      row?.history_cache_ttl_seconds ?? parseNumber(env.HISTORY_CACHE_TTL_SECONDS, 86400),
    metals_api_url: row?.metals_api_url ?? env.METALS_API_URL,
    goldapi_url: row?.goldapi_url ?? env.GOLDAPI_URL,
    fx_api_url: row?.fx_api_url ?? env.FX_API_URL,
  };
}

export async function getActiveCityConfigs(env: Env): Promise<CityConfig[]> {
  const result = await env.DB
    .prepare(
      `SELECT city_slug, city_name, country_code, currency, gst_rate, display_unit, timezone, active
       FROM city_config WHERE active = 1 ORDER BY country_code, city_name`,
    )
    .all<CityConfigRow>();

  if (!result.results.length) {
    return CITY_CONFIGS;
  }

  return result.results.map((row) => ({
    city_slug: row.city_slug,
    city_name: row.city_name,
    country_code: row.country_code,
    currency: row.currency,
    gst_rate: row.gst_rate,
    display_unit: row.display_unit,
    timezone: row.timezone,
    active: Boolean(row.active),
  }));
}

export async function fetchFxRates(env: Env): Promise<UpstreamSnapshot["rates"]> {
  const config = await getRuntimeConfig(env);
  const response = await fetch(config.fx_api_url);
  if (!response.ok) {
    throw new Error(`fx_api_${response.status}`);
  }

  const payload = (await response.json()) as FxResponse;
  const rates = payload.rates;
  if (!rates?.INR || !rates.CAD || !rates.AED || !rates.GBP) {
    throw new Error("fx_rate_missing");
  }

  return {
    INR: rates.INR,
    CAD: rates.CAD,
    AED: rates.AED,
    GBP: rates.GBP,
  };
}

async function fetchUpstreamSnapshot(env: Env): Promise<UpstreamSnapshot> {
  const config = await getRuntimeConfig(env);
  const [metalsResponse, goldApiResponse, fxRates] = await Promise.all([
    fetch(
      `${config.metals_api_url}?api_key=${encodeURIComponent(env.METALS_DEV_KEY)}&currency=USD&unit=toz`,
    ),
    fetch(config.goldapi_url, {
      headers: {
        "x-access-token": env.GOLDAPI_KEY,
      },
    }),
    fetch(config.fx_api_url),
  ]);

  if (!fxRates.ok) {
    throw new Error(`fx_api_${fxRates.status}`);
  }

  const metalsPayload = metalsResponse.ok ? ((await metalsResponse.json()) as MetalsResponse) : null;
  const goldApiPayload = goldApiResponse.ok ? ((await goldApiResponse.json()) as GoldApiResponse) : null;
  const fxPayload = (await fxRates.json()) as FxResponse;

  const usdPerTroyOunce =
    metalsPayload?.metals?.gold ??
    metalsPayload?.metals?.XAU ??
    metalsPayload?.rates?.XAU ??
    goldApiPayload?.price;

  if (!usdPerTroyOunce) {
    const metalsError = metalsResponse.ok ? "metals_gold_missing" : `metals_dev_${metalsResponse.status}`;
    const goldError = goldApiResponse.ok ? "goldapi_price_missing" : `goldapi_${goldApiResponse.status}`;
    throw new Error(`${metalsError};${goldError}`);
  }

  const rates = fxPayload.rates;
  if (!rates?.INR || !rates.CAD || !rates.AED || !rates.GBP) {
    throw new Error("fx_rate_missing");
  }

  return {
    usdPerTroyOunce,
    changeUsd: goldApiPayload?.ch ?? 0,
    changePercent: goldApiPayload?.chp ?? 0,
    highUsd: goldApiPayload?.high_price ?? null,
    lowUsd: goldApiPayload?.low_price ?? null,
    rates: {
      INR: rates.INR,
      CAD: rates.CAD,
      AED: rates.AED,
      GBP: rates.GBP,
    },
  };
}

function precisionForCurrency(currency: string): number {
  return currency === "INR" ? 0 : 2;
}

function roundPrice(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function getPurityFactor(karat: GoldKarat): number {
  return karat / 24;
}

function convertUsdTroyOunceToLocalUnit(
  city: CityConfig,
  usdPerTroyOunce: number,
  karat: GoldKarat,
  snapshot: UpstreamSnapshot,
): number {
  const purityFactor = getPurityFactor(karat);
  const usdPerGram = usdPerTroyOunce / 31.1035;

  if (city.country_code === "IN") {
    return roundPrice(
      usdPerGram * snapshot.rates.INR * 10 * (1 + city.gst_rate) * purityFactor,
      0,
    );
  }

  if (city.country_code === "US") {
    return roundPrice(usdPerTroyOunce * purityFactor, 2);
  }

  if (city.country_code === "CA") {
    return roundPrice(usdPerTroyOunce * snapshot.rates.CAD * purityFactor, 2);
  }

  if (city.country_code === "AE") {
    return roundPrice(usdPerGram * snapshot.rates.AED * purityFactor, 2);
  }

  return roundPrice(usdPerGram * snapshot.rates.GBP * purityFactor, 2);
}

function convertUsdTroyOunceToUsdDisplayUnit(
  city: CityConfig,
  usdPerTroyOunce: number,
  karat: GoldKarat,
): number {
  const purityFactor = getPurityFactor(karat);

  if (city.country_code === "IN") {
    return roundPrice((usdPerTroyOunce / 31.1035) * 10 * purityFactor, 2);
  }

  if (city.country_code === "US" || city.country_code === "CA") {
    return roundPrice(usdPerTroyOunce * purityFactor, 2);
  }

  return roundPrice((usdPerTroyOunce / 31.1035) * purityFactor, 2);
}

function computeLocalPrice(
  city: CityConfig,
  karat: GoldKarat,
  snapshot: UpstreamSnapshot,
): { priceLocal: number; priceUsd: number; unit: string; changeAmount: number } {
  if (city.country_code === "IN") {
    const priceLocal = convertUsdTroyOunceToLocalUnit(city, snapshot.usdPerTroyOunce, karat, snapshot);
    return {
      priceLocal,
      priceUsd: convertUsdTroyOunceToUsdDisplayUnit(city, snapshot.usdPerTroyOunce, karat),
      unit: "10g",
      changeAmount: roundPrice((snapshot.changeUsd * snapshot.rates.INR * 10 * getPurityFactor(karat)) / 31.1035, 0),
    };
  }

  if (city.country_code === "US") {
    const priceLocal = convertUsdTroyOunceToLocalUnit(city, snapshot.usdPerTroyOunce, karat, snapshot);
    return {
      priceLocal,
      priceUsd: priceLocal,
      unit: "troy oz",
      changeAmount: roundPrice(snapshot.changeUsd * getPurityFactor(karat), 2),
    };
  }

  if (city.country_code === "CA") {
    const priceLocal = convertUsdTroyOunceToLocalUnit(city, snapshot.usdPerTroyOunce, karat, snapshot);
    return {
      priceLocal,
      priceUsd: convertUsdTroyOunceToUsdDisplayUnit(city, snapshot.usdPerTroyOunce, karat),
      unit: "troy oz",
      changeAmount: roundPrice(snapshot.changeUsd * snapshot.rates.CAD * getPurityFactor(karat), 2),
    };
  }

  if (city.country_code === "AE") {
    const priceLocal = convertUsdTroyOunceToLocalUnit(city, snapshot.usdPerTroyOunce, karat, snapshot);
    return {
      priceLocal,
      priceUsd: convertUsdTroyOunceToUsdDisplayUnit(city, snapshot.usdPerTroyOunce, karat),
      unit: "gram",
      changeAmount: roundPrice((snapshot.changeUsd / 31.1035) * snapshot.rates.AED * getPurityFactor(karat), 2),
    };
  }

  const priceLocal = convertUsdTroyOunceToLocalUnit(city, snapshot.usdPerTroyOunce, karat, snapshot);
  return {
    priceLocal,
    priceUsd: convertUsdTroyOunceToUsdDisplayUnit(city, snapshot.usdPerTroyOunce, karat),
    unit: "gram",
    changeAmount: roundPrice((snapshot.changeUsd / 31.1035) * snapshot.rates.GBP * getPurityFactor(karat), 2),
  };
}

function buildEntries(
  cities: CityConfig[],
  snapshot: UpstreamSnapshot,
  today: string,
  fetchedAt: string,
): GoldPriceEntry[] {
  const entries: GoldPriceEntry[] = [];

  for (const city of cities) {
    for (const karat of [22, 24] as const) {
      const computed = computeLocalPrice(city, karat, snapshot);
      entries.push(enrichRetailEstimate({
        city_slug: city.city_slug,
        city_name: city.city_name,
        country_code: city.country_code,
        karat,
        price_local: computed.priceLocal,
        currency: city.currency,
        unit: computed.unit,
        change_amount: computed.changeAmount,
        change_percent: snapshot.changePercent,
        high_today:
          snapshot.highUsd === null
            ? null
            : convertUsdTroyOunceToLocalUnit(city, snapshot.highUsd, karat, snapshot),
        low_today:
          snapshot.lowUsd === null
            ? null
            : convertUsdTroyOunceToLocalUnit(city, snapshot.lowUsd, karat, snapshot),
        price_date: today,
        fetched_at: fetchedAt,
        stale: false,
        price_usd: computed.priceUsd,
      }));
    }
  }

  return entries;
}

async function updateFetchStatus(env: Env, today: string | null, status: string): Promise<void> {
  await env.DB
    .prepare(`UPDATE app_config SET last_fetch_date = ?, last_fetch_status = ? WHERE id = 1`)
    .bind(today, status)
    .run();
}

async function persistEntries(
  env: Env,
  entries: GoldPriceEntry[],
  rates: UpstreamSnapshot["rates"],
  config: AppConfigRow,
): Promise<void> {
  const statements = entries.map((entry) =>
    env.DB
      .prepare(
        `INSERT OR IGNORE INTO gold_prices (
          price_date, city_slug, city_name, country_code, karat, price_local, price_usd,
          currency, unit, change_amount, change_percent, high_today, low_today, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.price_date,
        entry.city_slug,
        entry.city_name,
        entry.country_code,
        entry.karat,
        entry.price_local,
        entry.price_usd ?? 0,
        entry.currency,
        entry.unit,
        entry.change_amount,
        entry.change_percent,
        entry.high_today,
        entry.low_today,
        entry.fetched_at,
      ),
  );

  await env.DB.batch(statements);

  await Promise.all(
    entries.map((entry) =>
      writeJsonToKv(
        env.GOLD_CACHE,
        getGoldCacheKey(entry.country_code, entry.city_slug, entry.karat),
        entry,
        config.cache_ttl_seconds,
      ),
    ),
  );

  await Promise.all([
    writeJsonToKv(env.GOLD_CACHE, "today:summary", entries, config.cache_ttl_seconds),
    writeJsonToKv(env.GOLD_CACHE, "rates:usd", rates, config.cache_ttl_seconds),
    purgePrefix(env.GOLD_CACHE, "history:"),
    env.DB.prepare(`DELETE FROM gold_prices WHERE price_date < date('now', '-5 years')`).run(),
  ]);
}

export async function runDailyFetch(
  env: Env,
  scheduledTime = Date.now(),
): Promise<DailyFetchResult> {
  const today = new Date(scheduledTime).toISOString().slice(0, 10);
  const config = await getRuntimeConfig(env);

  if (config.last_fetch_date === today && config.last_fetch_status === "success") {
    const cachedSummary = await env.GOLD_CACHE.get("today:summary", "json");
    const cachedRates = await env.GOLD_CACHE.get("rates:usd", "json");
    return {
      skipped: true,
      summary: (cachedSummary as GoldPriceEntry[] | null) ?? [],
      fxRates:
        (cachedRates as UpstreamSnapshot["rates"] | null) ?? {
          INR: 0,
          CAD: 0,
          AED: 0,
          GBP: 0,
        },
      today,
    };
  }

  try {
    const [cities, snapshot] = await Promise.all([
      getActiveCityConfigs(env),
      fetchUpstreamSnapshot(env),
    ]);
    const fetchedAt = new Date().toISOString();
    const entries = buildEntries(cities, snapshot, today, fetchedAt);

    await persistEntries(env, entries, snapshot.rates, config);
    await updateFetchStatus(env, today, "success");

    return {
      skipped: false,
      summary: entries,
      fxRates: snapshot.rates,
      today,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateFetchStatus(env, config.last_fetch_date, `failed: ${message}`);
    console.error(JSON.stringify({ message: "daily fetch failed", error: message }));
    throw error;
  }
}