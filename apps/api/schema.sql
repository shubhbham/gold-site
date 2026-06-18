-- Schema for Gold Price Tracker
-- D1 Database Tables for Cloudflare Workers

-- Main prices table - stores historical price data
CREATE TABLE IF NOT EXISTS gold_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_date TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  city_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  karat INTEGER NOT NULL CHECK (karat IN (22, 24)),
  price_local REAL NOT NULL,
  price_usd REAL NOT NULL,
  currency TEXT NOT NULL,
  unit TEXT NOT NULL,
  change_amount REAL NOT NULL DEFAULT 0,
  change_percent REAL NOT NULL DEFAULT 0,
  high_today REAL,
  low_today REAL,
  fetched_at TEXT NOT NULL,
  UNIQUE(price_date, city_slug, karat)
);

CREATE INDEX IF NOT EXISTS idx_gold_prices_city_karat_date
  ON gold_prices (city_slug, karat, price_date DESC);

-- City configuration
CREATE TABLE IF NOT EXISTS city_config (
  city_slug TEXT PRIMARY KEY,
  city_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  tax_rate REAL NOT NULL DEFAULT 0,
  display_unit TEXT NOT NULL,
  timezone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

-- Application configuration
CREATE TABLE IF NOT EXISTS app_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_fetch_date TEXT,
  last_fetch_status TEXT NOT NULL DEFAULT 'never',
  cache_ttl_seconds INTEGER NOT NULL DEFAULT 86400,
  history_cache_ttl_seconds INTEGER NOT NULL DEFAULT 86400,
  metals_api_url TEXT NOT NULL DEFAULT 'https://api.metals.dev/v1/latest',
  goldapi_url TEXT NOT NULL DEFAULT 'https://www.goldapi.io/api/XAU/USD',
  fx_api_url TEXT NOT NULL DEFAULT 'https://api.exchangerate-api.com/v4/latest/USD',
  site_name TEXT NOT NULL DEFAULT 'Gold Price Today',
  embed_monthly_price_inr INTEGER NOT NULL DEFAULT 499
);

-- Initialize app config
INSERT OR IGNORE INTO app_config (
  id,
  last_fetch_date,
  last_fetch_status,
  cache_ttl_seconds,
  history_cache_ttl_seconds,
  metals_api_url,
  goldapi_url,
  fx_api_url,
  site_name,
  embed_monthly_price_inr
) VALUES (
  1,
  NULL,
  'never',
  86400,
  86400,
  'https://api.metals.dev/v1/latest',
  'https://www.goldapi.io/api/XAU/USD',
  'https://api.exchangerate-api.com/v4/latest/USD',
  'Gold Price Today',
  499
);

-- Initialize city configurations
INSERT OR REPLACE INTO city_config (
  city_slug,
  city_name,
  country_code,
  currency,
  tax_rate,
  display_unit,
  timezone,
  active
) VALUES
  ('bangalore', 'Bangalore', 'IN', 'INR', 0.03, '10g', 'Asia/Kolkata', 1),
  ('mumbai', 'Mumbai', 'IN', 'INR', 0.03, '10g', 'Asia/Kolkata', 1),
  ('delhi', 'Delhi', 'IN', 'INR', 0.03, '10g', 'Asia/Kolkata', 1),
  ('chennai', 'Chennai', 'IN', 'INR', 0.03, '10g', 'Asia/Kolkata', 1),
  ('hyderabad', 'Hyderabad', 'IN', 'INR', 0.03, '10g', 'Asia/Kolkata', 1),
  ('kolkata', 'Kolkata', 'IN', 'INR', 0.03, '10g', 'Asia/Kolkata', 1),
  ('us-national', 'United States', 'US', 'USD', 0.00, 'troy oz', 'America/New_York', 1),
  ('ca-national', 'Canada', 'CA', 'CAD', 0.05, 'troy oz', 'America/Toronto', 1),
  ('ae-dubai', 'Dubai', 'AE', 'AED', 0.05, 'gram', 'Asia/Dubai', 1),
  ('uk-london', 'London', 'GB', 'GBP', 0.20, 'gram', 'Europe/London', 1);