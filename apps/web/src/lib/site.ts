import {
  CITY_CONFIGS,
  CITY_DESCRIPTIONS,
  CURRENCY_SYMBOLS,
  FAQS,
  HOME_CARD_CITIES,
  enrichRetailEstimate,
  formatCurrencyValue,
  formatPriceDate,
  getCityConfig,
  getCurrentUtcDate,
  getDefaultKarat,
  type ApiResponse,
  type CityConfig,
  type GoldKarat,
  type GoldPriceEntry,
  type HistoryPoint,
  type HistoryRange,
} from "@gold-site/shared";

export const SITE_NAME = "Gold Price Today";
export const SITE_DESCRIPTION =
  "Daily gold benchmark rates for India, USA, Canada, UAE, and the UK with charts, a calculator, and an embeddable widget.";

export const API_BASE_URL =
  (import.meta.env.PUBLIC_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "https://gold-api-worker.shubhbham6.workers.dev";

export const CITY_PATHS = CITY_CONFIGS.map((city) => city.city_slug);

export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function getCanonicalUrl(pathname: string): string {
  const base = (import.meta.env.PUBLIC_SITE_URL as string | undefined) ?? "http://localhost:4321";
  return new URL(pathname, base).toString();
}

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function cityDescription(citySlug: string): string {
  return CITY_DESCRIPTIONS[citySlug] ?? SITE_DESCRIPTION;
}

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

export function currentMonthYear(): string {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(buildApiUrl(path), init);
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as ApiResponse<T>;
    return payload.data;
  } catch {
    return null;
  }
}

function fallbackPrice(city: CityConfig, karat: GoldKarat): GoldPriceEntry {
  const baseValue =
    city.country_code === "IN"
      ? karat === 22
        ? 71000
        : 77500
      : city.country_code === "US"
        ? karat === 22
          ? 2140
          : 2335
        : city.country_code === "CA"
          ? karat === 22
            ? 2920
            : 3180
          : city.country_code === "AE"
            ? karat === 22
              ? 264
              : 288
            : karat === 22
              ? 56
              : 61;

  return enrichRetailEstimate({
    city_slug: city.city_slug,
    city_name: city.city_name,
    country_code: city.country_code,
    karat,
    price_local: baseValue,
    currency: city.currency,
    unit: city.display_unit,
    change_amount: 0,
    change_percent: 0,
    high_today: null,
    low_today: null,
    price_date: getCurrentUtcDate(),
    fetched_at: new Date().toISOString(),
    stale: true,
    price_usd: city.country_code === "US" ? baseValue : undefined,
  });
}

export async function getSummaryData(): Promise<GoldPriceEntry[]> {
  const summary = await fetchJson<GoldPriceEntry[]>("/api/summary");
  if (summary?.length) {
    return summary;
  }

  return CITY_CONFIGS.flatMap((city) => [fallbackPrice(city, 22), fallbackPrice(city, 24)]);
}

export async function getCityLatestData(citySlug: string): Promise<GoldPriceEntry[]> {
  const city = getCityConfig(citySlug);
  if (!city) {
    return [];
  }

  const [twentyTwo, twentyFour] = await Promise.all([
    fetchJson<GoldPriceEntry>(`/api/gold?city=${citySlug}&karat=22`),
    fetchJson<GoldPriceEntry>(`/api/gold?city=${citySlug}&karat=24`),
  ]);

  return [twentyTwo ?? fallbackPrice(city, 22), twentyFour ?? fallbackPrice(city, 24)];
}

export async function getHistoryData(
  citySlug: string,
  karat: GoldKarat,
  range: HistoryRange,
): Promise<HistoryPoint[]> {
  const data = await fetchJson<HistoryPoint[]>(`/api/history/${citySlug}?karat=${karat}&range=${range}&refresh=1`);
  if (data?.length) {
    return data;
  }

  const city = getCityConfig(citySlug) ?? CITY_CONFIGS[0];
  const unitValue = fallbackPrice(city, karat).price_local;
  const total = range === "1m" ? 30 : range === "3m" ? 90 : range === "6m" ? 180 : range === "1y" ? 365 : range === "2y" ? 24 : 60;
  const now = new Date();
  const points: HistoryPoint[] = [];

  for (let index = total - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    if (range === "2y" || range === "5y") {
      date.setUTCMonth(now.getUTCMonth() - index);
      date.setUTCDate(1);
    } else {
      date.setUTCDate(now.getUTCDate() - index);
    }

    const wobble = ((index % 7) - 3) * (unitValue * 0.0025);
    points.push({
      price_date: date.toISOString().slice(0, 10),
      price_local: Math.round((unitValue + wobble) * 100) / 100,
      price_usd: Math.round((unitValue / 85 + wobble / 90) * 100) / 100,
      change_percent: Math.round((((wobble / unitValue) * 100) + Number.EPSILON) * 100) / 100,
    });
  }

  return points;
}

export function getHomeCards(summary: GoldPriceEntry[]): GoldPriceEntry[] {
  const selected = new Set(HOME_CARD_CITIES);
  return summary.filter((entry) => entry.karat === 24 && selected.has(entry.city_slug as (typeof HOME_CARD_CITIES)[number]));
}

export function entriesForCity(summary: GoldPriceEntry[], citySlug: string): GoldPriceEntry[] {
  return summary.filter((entry) => entry.city_slug === citySlug);
}

export function latestForKarat(entries: GoldPriceEntry[], karat: GoldKarat): GoldPriceEntry | null {
  return entries.find((entry) => entry.karat === karat) ?? null;
}

export {
  CITY_CONFIGS,
  FAQS,
  formatCurrencyValue,
  formatPriceDate,
  getCityConfig,
  getDefaultKarat,
};