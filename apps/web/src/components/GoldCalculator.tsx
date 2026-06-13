import { useEffect, useState } from "react";
import type { GoldKarat, GoldPriceEntry } from "@gold-site/shared";
import { API_BASE_URL, CITY_CONFIGS, formatCurrencyValue, getCityConfig } from "../lib/site";

type Unit = "gram" | "tola" | "sovereign" | "kg";

const unitMap: Record<Unit, number> = {
  gram: 1,
  tola: 11.664,
  sovereign: 8,
  kg: 1000,
};

export default function GoldCalculator() {
  const [weight, setWeight] = useState(10);
  const [unit, setUnit] = useState<Unit>("gram");
  const [karat, setKarat] = useState<GoldKarat>(22);
  const [city, setCity] = useState("bangalore");
  const [price, setPrice] = useState<GoldPriceEntry | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/gold?city=${city}&karat=${karat}`);
        const payload = (await response.json()) as { data: GoldPriceEntry | null };
        if (payload.data) {
          setPrice(payload.data);
        }
      } catch {
        return;
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [city, karat]);

  const grams = weight * unitMap[unit];
  const cityConfig = getCityConfig(city);
  const baseUnits = price?.unit === "10g" ? 10 : price?.unit === "gram" ? 1 : 31.1035;
  const benchmarkUnitPrice = price ? ((price.benchmark_local ?? price.price_local) / baseUnits) : 0;
  const retailUnitPrice = price ? ((price.retail_local ?? price.price_local) / baseUnits) : 0;
  const totalBenchmarkLocal = benchmarkUnitPrice * grams;
  const totalRetailLocal = retailUnitPrice * grams;
  const usdEquivalent = price
    ? ((price.price_usd ?? (price.currency === "USD" ? price.price_local : 0)) / baseUnits) * grams
    : 0;

  return (
    <section className="rounded-4xl border border-gray-200 bg-white p-6 shadow-[0_24px_80px_-44px_rgba(17,24,39,0.3)] md:p-8">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-semibold text-gray-700">Weight</span>
            <input type="number" min="0" step="0.1" value={weight} onChange={(event) => setWeight(Number(event.target.value))} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500" />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-gray-700">Unit</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500">
              <option value="gram">Gram</option>
              <option value="tola">Tola</option>
              <option value="sovereign">Sovereign</option>
              <option value="kg">Kilogram</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-gray-700">Karat</span>
            <select value={karat} onChange={(event) => setKarat(Number(event.target.value) as GoldKarat)} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500">
              <option value="22">22k</option>
              <option value="24">24k</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold text-gray-700">City</span>
            <select value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-2xl border border-gray-200 px-4 py-3 outline-none focus:border-amber-500">
              {CITY_CONFIGS.map((item) => (
                <option key={item.city_slug} value={item.city_slug}>
                  {item.city_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-[1.75rem] bg-gray-950 p-6 text-white">
          <p className="text-sm uppercase tracking-[0.24em] text-white/60">Estimated value</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Estimated retail</p>
              <div className="mt-2 text-3xl font-semibold">{formatCurrencyValue(totalRetailLocal, cityConfig?.currency ?? "INR")}</div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">USD equivalent</p>
              <div className="mt-2 text-3xl font-semibold">{formatCurrencyValue(usdEquivalent, "USD")}</div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-white/5 px-4 py-3 text-sm text-white/75">
            Benchmark metal value: {formatCurrencyValue(totalBenchmarkLocal, cityConfig?.currency ?? "INR")}
          </div>
          <p className="mt-4 text-sm leading-7 text-white/70">
            The calculator uses one live gold price fetch when city or karat changes, then performs all unit conversions locally for fast interaction. Retail values are estimated from the benchmark using configurable local premiums.
          </p>
        </div>
      </div>
    </section>
  );
}