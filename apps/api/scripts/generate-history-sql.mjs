#!/usr/bin/env node
/*
Generate SQL backfill inserts for gold_prices.

Modes:
1) Real CSV mode:
   node scripts/generate-history-sql.mjs --csv ./data/xau-history.csv --out ./data/backfill-history.sql

   CSV columns (header names are flexible, case-insensitive):
   date, usd_oz, inr, cad, aed, gbp

   Required columns: date, usd_oz
   Optional FX columns: inr, cad, aed, gbp
   If FX columns are missing, latest FX is fetched once from exchangerate-api.

2) Synthetic mode (for graph bootstrapping only):
   node scripts/generate-history-sql.mjs --synthetic-years 10 --anchor-usd-oz 3300 --out ./data/backfill-history.sql
*/

import fs from "node:fs";
import path from "node:path";

const CITIES = [
  { city_slug: "bangalore", city_name: "Bangalore", country_code: "IN", currency: "INR", tax_rate: 0.03, display_unit: "10g" },
  { city_slug: "mumbai", city_name: "Mumbai", country_code: "IN", currency: "INR", tax_rate: 0.03, display_unit: "10g" },
  { city_slug: "delhi", city_name: "Delhi", country_code: "IN", currency: "INR", tax_rate: 0.03, display_unit: "10g" },
  { city_slug: "chennai", city_name: "Chennai", country_code: "IN", currency: "INR", tax_rate: 0.03, display_unit: "10g" },
  { city_slug: "hyderabad", city_name: "Hyderabad", country_code: "IN", currency: "INR", tax_rate: 0.03, display_unit: "10g" },
  { city_slug: "kolkata", city_name: "Kolkata", country_code: "IN", currency: "INR", tax_rate: 0.03, display_unit: "10g" },
  { city_slug: "us-national", city_name: "United States", country_code: "US", currency: "USD", tax_rate: 0, display_unit: "troy oz" },
  { city_slug: "ca-national", city_name: "Canada", country_code: "CA", currency: "CAD", tax_rate: 0.05, display_unit: "troy oz" },
  { city_slug: "ae-dubai", city_name: "Dubai", country_code: "AE", currency: "AED", tax_rate: 0.05, display_unit: "gram" },
  { city_slug: "uk-london", city_name: "London", country_code: "GB", currency: "GBP", tax_rate: 0.20, display_unit: "gram" },
];

// Approximate annual average FX rates (units of local currency per 1 USD).
// AED is pegged to USD at 3.6725. INR/CAD/GBP are yearly averages.
const HISTORICAL_FX = {
  "2015": { INR: 64.15, CAD: 1.279, AED: 3.673, GBP: 0.655 },
  "2016": { INR: 67.07, CAD: 1.325, AED: 3.673, GBP: 0.740 },
  "2017": { INR: 65.11, CAD: 1.299, AED: 3.673, GBP: 0.777 },
  "2018": { INR: 68.39, CAD: 1.296, AED: 3.673, GBP: 0.751 },
  "2019": { INR: 70.42, CAD: 1.327, AED: 3.673, GBP: 0.784 },
  "2020": { INR: 74.10, CAD: 1.341, AED: 3.673, GBP: 0.778 },
  "2021": { INR: 73.92, CAD: 1.254, AED: 3.673, GBP: 0.728 },
  "2022": { INR: 78.60, CAD: 1.301, AED: 3.673, GBP: 0.813 },
  "2023": { INR: 82.58, CAD: 1.350, AED: 3.673, GBP: 0.806 },
  "2024": { INR: 83.66, CAD: 1.363, AED: 3.673, GBP: 0.784 },
  "2025": { INR: 86.50, CAD: 1.390, AED: 3.673, GBP: 0.790 },
  "2026": { INR: 84.48, CAD: 1.390, AED: 3.673, GBP: 0.785 },
};

function getFxRatesForYear(year) {
  return HISTORICAL_FX[year] ?? HISTORICAL_FX["2026"];
}

function parseChangePercent(value) {
  if (value === undefined || value === null || value === "") return 0;
  const num = Number(String(value).replace(/[%,]/g, "").trim());
  return Number.isFinite(num) ? roundPrice(num, 2) : 0;
}

function getArg(flag, fallback = undefined) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function roundPrice(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  function parseCsvLine(line) {
    const cells = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];

      if (ch === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        cells.push(current);
        current = "";
        continue;
      }

      current += ch;
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      row[headers[c]] = cols[c] ?? "";
    }
    rows.push(row);
  }

  return rows;
}

function normalizeDate(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const usFormat = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (usFormat) {
    const [, mm, dd, yyyy] = usFormat;
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getNumber(row, keys) {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(String(value).replace(/,/g, ""));
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function computeLocalPrice(city, karat, usdPerTroyOunce, rates) {
  const usdPerGram = usdPerTroyOunce / 31.1035;
  const purityFactor = karat / 24;

  if (city.country_code === "IN") {
    const base = usdPerGram * rates.INR * 10 * (1 + city.tax_rate) * purityFactor;
    return {
      priceLocal: roundPrice(base, 0),
      priceUsd: roundPrice((usdPerGram * 10) * purityFactor, 2),
      unit: "10g",
    };
  }

  if (city.country_code === "US") {
    const usd = usdPerTroyOunce * purityFactor;
    return {
      priceLocal: roundPrice(usd, 2),
      priceUsd: roundPrice(usd, 2),
      unit: "troy oz",
    };
  }

  if (city.country_code === "CA") {
    const local = usdPerTroyOunce * rates.CAD * purityFactor;
    return {
      priceLocal: roundPrice(local, 2),
      priceUsd: roundPrice(usdPerTroyOunce * purityFactor, 2),
      unit: "troy oz",
    };
  }

  if (city.country_code === "AE") {
    const local = usdPerGram * rates.AED * purityFactor;
    return {
      priceLocal: roundPrice(local, 2),
      priceUsd: roundPrice(usdPerGram * purityFactor, 2),
      unit: "gram",
    };
  }

  const local = usdPerGram * rates.GBP * purityFactor;
  return {
    priceLocal: roundPrice(local, 2),
    priceUsd: roundPrice(usdPerGram * purityFactor, 2),
    unit: "gram",
  };
}

async function fetchLatestFx() {
  const response = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
  if (!response.ok) {
    throw new Error(`failed to fetch FX fallback: ${response.status}`);
  }
  const payload = await response.json();
  const rates = payload?.rates ?? {};
  return {
    INR: Number(rates.INR),
    CAD: Number(rates.CAD),
    AED: Number(rates.AED),
    GBP: Number(rates.GBP),
  };
}

function seededNoise(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function buildSyntheticRows(years, anchorUsdOz) {
  const totalDays = Math.max(365, Math.floor(years * 365));
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - totalDays);

  let usd = anchorUsdOz;
  const rows = [];

  for (let i = 0; i <= totalDays; i += 1) {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + i);

    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    const trend = 0.00008;
    const vol = (seededNoise(i + 17) - 0.5) * 0.02;
    usd = usd * (1 + trend + vol);

    rows.push({
      date: day.toISOString().slice(0, 10),
      usd_oz: roundPrice(usd, 2),
      inr: null,
      cad: null,
      aed: null,
      gbp: null,
    });
  }

  return rows;
}

function esc(value) {
  return String(value).replace(/'/g, "''");
}

async function main() {
  const csvPath = getArg("--csv", null);
  const outPath = path.resolve(process.cwd(), getArg("--out", "./data/backfill-history.sql"));
  const syntheticYears = Number(getArg("--synthetic-years", "0"));
  const anchorUsdOz = Number(getArg("--anchor-usd-oz", "3300"));
  const truncateBefore = getArg("--truncate-before", null);

  let sourceRows = [];

  if (csvPath) {
    const inputPath = path.resolve(process.cwd(), csvPath);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`csv not found: ${inputPath}`);
    }

    const text = fs.readFileSync(inputPath, "utf8");
    const parsed = parseCsv(text);

    sourceRows = parsed
      .map((row) => {
        const date = normalizeDate(row.date ?? row.price_date ?? row.day);
        const usdOz = getNumber(row, ["usd_oz", "usdpertroyoz", "xauusd", "gold_usd_oz", "price"]);
        const inr = getNumber(row, ["inr", "usd_inr", "inr_rate"]);
        const cad = getNumber(row, ["cad", "usd_cad", "cad_rate"]);
        const aed = getNumber(row, ["aed", "usd_aed", "aed_rate"]);
        const gbp = getNumber(row, ["gbp", "usd_gbp", "gbp_rate"]);
        const highUsd = getNumber(row, ["high"]);
        const lowUsd = getNumber(row, ["low"]);
        const changePct = parseChangePercent(row["change %"] ?? row["change_percent"] ?? row["change%"]);

        if (!date || usdOz === null) return null;

        return {
          date,
          usd_oz: usdOz,
          inr,
          cad,
          aed,
          gbp,
          high_usd: highUsd,
          low_usd: lowUsd,
          change_pct: changePct,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.date.localeCompare(b.date));
  } else if (syntheticYears > 0) {
    sourceRows = buildSyntheticRows(syntheticYears, anchorUsdOz);
  } else {
    throw new Error("provide either --csv <path> or --synthetic-years <n>");
  }

  if (sourceRows.length === 0) {
    throw new Error("no usable rows found");
  }

  const statements = [];
  statements.push("BEGIN TRANSACTION;");

  if (truncateBefore) {
    statements.push(`DELETE FROM gold_prices WHERE price_date < '${esc(truncateBefore)}';`);
  }

  for (const row of sourceRows) {
    const yearRates = getFxRatesForYear(row.date.slice(0, 4));
    const rates = {
      INR: row.inr ?? yearRates.INR,
      CAD: row.cad ?? yearRates.CAD,
      AED: row.aed ?? yearRates.AED,
      GBP: row.gbp ?? yearRates.GBP,
    };

    for (const city of CITIES) {
      for (const karat of [22, 24]) {
        const computed = computeLocalPrice(city, karat, row.usd_oz, rates);
        const precision = city.currency === "INR" ? 0 : 2;
        const changePercent = row.change_pct ?? 0;
        const changeAmount = roundPrice(computed.priceLocal * (changePercent / 100), precision);

        const highLocal = row.high_usd != null
          ? computeLocalPrice(city, karat, row.high_usd, rates).priceLocal
          : null;
        const lowLocal = row.low_usd != null
          ? computeLocalPrice(city, karat, row.low_usd, rates).priceLocal
          : null;

        const fetchedAt = `${row.date}T03:00:00.000Z`;

        statements.push(
          "INSERT OR IGNORE INTO gold_prices (price_date, city_slug, city_name, country_code, karat, price_local, price_usd, currency, unit, change_amount, change_percent, high_today, low_today, fetched_at) VALUES (" +
            `'${esc(row.date)}',` +
            `'${esc(city.city_slug)}',` +
            `'${esc(city.city_name)}',` +
            `'${esc(city.country_code)}',` +
            `${karat},` +
            `${computed.priceLocal},` +
            `${computed.priceUsd},` +
            `'${esc(city.currency)}',` +
            `'${esc(computed.unit)}',` +
            `${changeAmount},` +
            `${changePercent},` +
            `${highLocal !== null ? highLocal : "NULL"},` +
            `${lowLocal !== null ? lowLocal : "NULL"},` +
            `'${esc(fetchedAt)}'` +
          ");"
        );
      }
    }
  }

  const latestDate = sourceRows[sourceRows.length - 1].date;
  const mode = csvPath ? "history_backfill_csv" : "history_backfill_synthetic";
  statements.push(
    `UPDATE app_config SET last_fetch_date = '${esc(latestDate)}', last_fetch_status = '${esc(mode)}' WHERE id = 1;`
  );
  statements.push("COMMIT;");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${statements.join("\n")}\n`, "utf8");

  const yearsApprox = ((sourceRows.length / 365) * 1).toFixed(1);
  console.log(`SQL written: ${outPath}`);
  console.log(`Rows parsed: ${sourceRows.length} daily points (~${yearsApprox} years)`);
  console.log(`Insert statements: ${sourceRows.length * CITIES.length * 2}`);
  if (truncateBefore) {
    console.log(`History cleanup: DELETE rows with price_date < ${truncateBefore}`);
  }
  console.log("Next step (local):");
  console.log(`  pnpm --dir apps/api wrangler d1 execute gold-prices-db --local --file ${outPath}`);
  console.log("Next step (remote):");
  console.log(`  pnpm --dir apps/api wrangler d1 execute gold-prices-db --remote --file ${outPath}`);

  if (!csvPath) {
    console.log("WARNING: synthetic mode used. Generated prices are simulated for chart bootstrapping only.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
