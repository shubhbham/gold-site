import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import type { CityConfig, GoldKarat, GoldPriceEntry } from "@gold-site/shared";
import {
  API_BASE_URL,
  CITY_CONFIGS,
  currencySymbol,
  formatCurrencyValue,
  formatPriceDate,
} from "../lib/site";

interface PriceWidgetProps {
  initialData: GoldPriceEntry | null;
  defaultCity: string;
  defaultKarat: GoldKarat;
}

function useCityOptions() {
  const [cities, setCities] = useState<CityConfig[]>(CITY_CONFIGS);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/cities`);
        const payload = (await response.json()) as { data: CityConfig[] | null };
        if (!cancelled && payload.data?.length) {
          setCities(payload.data);
        }
      } catch {
        return;
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return cities;
}

export default function PriceWidget({ initialData, defaultCity, defaultKarat }: PriceWidgetProps) {
  const cities = useCityOptions();
  const [city, setCity] = useState(defaultCity);
  const [karat, setKarat] = useState<GoldKarat>(defaultKarat);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<GoldPriceEntry | null>(initialData);

  useEffect(() => {
    let active = true;

    async function refresh() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/gold?city=${city}&karat=${karat}`);
        const payload = (await response.json()) as { data: GoldPriceEntry | null };
        if (active && payload.data) {
          setData(payload.data);
        }
      } catch {
        return;
      }
    }

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 60 * 60 * 1000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [city, karat]);

  const filteredCities = useMemo(() => {
    const lower = query.toLowerCase();
    return cities.filter((item) => item.city_name.toLowerCase().includes(lower));
  }, [cities, query]);

  const changePositive = (data?.change_amount ?? 0) >= 0;
  const weekChangeAmount = data?.week_change_amount ?? null;
  const weekChangePercent = data?.week_change_percent ?? null;
  const weekChangePositive = (weekChangeAmount ?? 0) >= 0;
  const primaryLocalPrice = data?.retail_local ?? data?.price_local ?? 0;
  const benchmarkLocalPrice = data?.benchmark_local ?? data?.price_local ?? 0;
  const showingRetailEstimate = typeof data?.retail_local === "number";

  return (
    <section className="rounded-4xl border border-gray-200 bg-white p-6 shadow-[0_24px_100px_-50px_rgba(17,24,39,0.42)] md:p-8">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-amber-700">{showingRetailEstimate ? "Estimated retail" : "Daily benchmark"}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 md:text-5xl">
            Gold price today for {data?.city_name ?? "your market"}
          </h1>
          <p className="mt-4 text-base leading-8 text-gray-600">
            Compare 22k and 24k live gold rates for major Indian cities plus the USA, Canada, UAE, and the UK. Retail-facing views show an estimated public price alongside the benchmark so you can separate consumer quoting from the underlying metal rate.
          </p>
          {data?.stale ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Yesterday&apos;s rate — today&apos;s rate updating soon
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-xl rounded-[1.75rem] bg-[linear-gradient(180deg,rgba(255,251,235,0.92),#ffffff)] p-5 ring-1 ring-amber-100 md:p-6">
          <div className="flex flex-wrap items-center gap-3">
            {[22, 24].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setKarat(value as GoldKarat)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  karat === value
                    ? "bg-amber-600 text-white"
                    : "bg-white text-gray-600 ring-1 ring-gray-200 hover:text-amber-700"
                }`}
              >
                {value}k
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <label className="flex-1">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Search city</span>
              <input
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-0 transition focus:border-amber-500"
                placeholder="Type Bangalore, Dubai, London..."
              />
            </label>
            <label className="md:min-w-72">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Market</span>
              <select
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-amber-500"
              >
                {filteredCities.map((item) => (
                  <option key={item.city_slug} value={item.city_slug}>
                    {item.city_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 rounded-3xl bg-gray-950 px-5 py-6 text-white">
            <div className="text-sm text-white/70">Rate as of {formatPriceDate(data?.price_date ?? new Date().toISOString().slice(0, 10))}</div>
            <div className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
              {data ? formatCurrencyValue(primaryLocalPrice, data.currency) : "Loading..."}
            </div>
            <div className="mt-2 text-sm text-white/70">
              {data?.unit ?? "unit"} • {currencySymbol(data?.currency ?? "INR")} {showingRetailEstimate ? "estimated retail" : "benchmark"}
            </div>
            {data && showingRetailEstimate ? (
              <div className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/75">
                Benchmark: {formatCurrencyValue(benchmarkLocalPrice, data.currency)}
                {data.retail_adjustment_percent ? ` • Premium ${data.retail_adjustment_percent}%` : ""}
              </div>
            ) : null}
            <div className={`mt-4 inline-flex rounded-full px-3 py-2 text-sm font-semibold ${changePositive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
              {changePositive ? "▲" : "▼"} {data ? formatCurrencyValue(Math.abs(data.change_amount), data.currency) : "0"} ({data?.change_percent ?? 0}%)
            </div>
            {weekChangeAmount !== null && weekChangePercent !== null ? (
              <div className={`mt-3 inline-flex rounded-full px-3 py-2 text-sm font-semibold ${weekChangePositive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                7D {weekChangePositive ? "▲" : "▼"} {data ? formatCurrencyValue(Math.abs(weekChangeAmount), data.currency) : "0"} ({Math.abs(weekChangePercent)}%)
              </div>
            ) : null}
            {showingRetailEstimate ? (
              <p className="mt-4 text-xs leading-6 text-white/55">
                Estimated retail is a configurable consumer-facing premium layered over the stored benchmark. It is not a scraped jeweller quote.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}