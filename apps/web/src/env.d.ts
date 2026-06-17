/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  DB: D1Database;
  GOLD_CACHE: KVNamespace;
  SESSION: KVNamespace;
  METALS_DEV_KEY: string;
  GOLDAPI_KEY: string;
  CACHE_TTL_SECONDS: string;
  HISTORY_CACHE_TTL_SECONDS: string;
  METALS_API_URL: string;
  GOLDAPI_URL: string;
  FX_API_URL: string;
}

declare module "cloudflare:workers" {
  const env: Env;
  export { env };
}
