import { useEffect, useState } from "react";
import type { GoldKarat, HistoryPoint, HistoryRange } from "@gold-site/shared";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { API_BASE_URL, currencySymbol, getCityConfig } from "../lib/site";

interface PriceChartProps {
  city: string;
  karat: GoldKarat;
  initialRange: HistoryRange;
  initialData?: HistoryPoint[];
}

const ranges: HistoryRange[] = ["1m", "3m", "6m", "1y", "2y", "5y"];

function formatAxisDate(raw: string, range: HistoryRange) {
  const date = new Date(`${raw}T00:00:00Z`);
  return new Intl.DateTimeFormat("en", {
    day: range === "2y" || range === "5y" ? undefined : "2-digit",
    month: "short",
    year: range === "2y" || range === "5y" ? "2-digit" : undefined,
    timeZone: "UTC",
  }).format(date);
}

export default function PriceChart({ city, karat, initialRange, initialData = [] }: PriceChartProps) {
  const [range, setRange] = useState<HistoryRange>(initialRange);
  const [data, setData] = useState<HistoryPoint[]>(initialData);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [hydrated, setHydrated] = useState(false);
  const cityConfig = getCityConfig(city);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/history/${city}?karat=${karat}&range=${range}&refresh=1`);
        const payload = (await response.json()) as { data: HistoryPoint[] | null };
        if (active && payload.data) {
          setData(payload.data);
        }
      } catch {
        return;
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [city, karat, range]);

  if (loading || !hydrated) {
    return (
      <div className="grid h-80 grid-cols-12 items-end gap-3 rounded-[1.75rem] border border-gray-200 bg-white p-6">
        {Array.from({ length: 12 }).map((_, index) => (
          <div key={index} className="skeleton-bar rounded-t-xl" style={{ height: `${30 + ((index % 6) + 1) * 24}px` }} />
        ))}
      </div>
    );
  }

  return (
    <section className="rounded-4xl border border-gray-200 bg-white p-6 shadow-[0_24px_80px_-44px_rgba(17,24,39,0.3)]">
      <div className="flex flex-wrap gap-2">
        {ranges.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRange(value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${value === range ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-600 hover:text-amber-700"}`}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="mt-6 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis dataKey="price_date" tickFormatter={(value) => formatAxisDate(value, range)} tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fill: "#6b7280", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(value) => {
                const currency = cityConfig?.currency ?? "USD";
                if (currency === "INR") {
                  return `${currencySymbol(currency)}${Math.round(value)}`;
                }
                return `${currencySymbol(currency)}${Number(value).toFixed(0)}`;
              }}
            />
            <Tooltip
              formatter={(value) => {
                const numericValue = typeof value === "number" ? value : Number(value ?? 0);
                const currency = cityConfig?.currency ?? "USD";
                return [`${currencySymbol(currency)}${currency === "INR" ? Math.round(numericValue) : numericValue.toFixed(2)}`, "Price"];
              }}
              labelFormatter={(label) => formatAxisDate(String(label), range)}
              contentStyle={{ borderRadius: 16, borderColor: "#fde68a", boxShadow: "0 14px 40px -20px rgba(17,24,39,0.4)" }}
            />
            <Bar dataKey="price_local" fill="#D97706" radius={[10, 10, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}