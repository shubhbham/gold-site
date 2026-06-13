import type { GoldKarat, HistoryRange } from "@gold-site/shared";

export function getGoldCacheKey(
  countryCode: string,
  citySlug: string,
  karat: GoldKarat,
): string {
  return `gold:${countryCode.toUpperCase()}:${citySlug}:${karat}k`;
}

export function getHistoryCacheKey(
  citySlug: string,
  karat: GoldKarat,
  range: HistoryRange,
): string {
  return `history:${citySlug}:${karat}:${range}`;
}

export async function readJsonFromKv<T>(
  kv: KVNamespace,
  key: string,
): Promise<T | null> {
  const raw = await kv.get(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonToKv(
  kv: KVNamespace,
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await kv.put(key, JSON.stringify(value), {
    expirationTtl: ttlSeconds,
  });
}

export async function purgePrefix(
  kv: KVNamespace,
  prefix: string,
): Promise<void> {
  let cursor: string | undefined;

  do {
    const listing = await kv.list({ prefix, cursor });
    await Promise.all(listing.keys.map((entry) => kv.delete(entry.name)));
    cursor = listing.list_complete ? undefined : listing.cursor;
  } while (cursor);
}