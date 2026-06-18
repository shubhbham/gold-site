export type GoldKarat = 22 | 24;

export type HistoryRange = "1m" | "3m" | "6m" | "1y" | "2y" | "5y";

export interface GoldPriceEntry {
	city_slug: string;
	city_name: string;
	country_code: string;
	karat: GoldKarat;
	price_local: number;
	benchmark_local?: number;
	retail_local?: number | null;
	retail_adjustment_local?: number | null;
	retail_adjustment_percent?: number | null;
	week_change_amount?: number | null;
	week_change_percent?: number | null;
	currency: string;
	unit: string;
	change_amount: number;
	change_percent: number;
	high_today: number | null;
	low_today: number | null;
	price_date: string;
	fetched_at: string;
	stale: boolean;
	price_usd?: number;
	tax_local?: number;
	tax_rate_percent?: number;
}

export interface CityConfig {
	city_slug: string;
	city_name: string;
	country_code: string;
	currency: string;
	tax_rate: number;
	display_unit: string;
	timezone: string;
	active: boolean;
}

export interface RetailPricingRule {
	premium_percent: number;
	flat_fee_local: number;
}

export interface HistoryPoint {
	price_date: string;
	price_local: number;
	price_usd: number;
	change_percent: number;
}

export type ApiResponse<T> =
	| { data: T; error: null; cached: boolean }
	| { data: null; error: string; cached: false };

export interface FaqItem {
	question: string;
	answer: string;
}

export const HISTORY_RANGE_DAYS: Record<HistoryRange, number> = {
	"1m": 30,
	"3m": 90,
	"6m": 180,
	"1y": 365,
	"2y": 730,
	"5y": 1825,
};

export const CITY_CONFIGS: CityConfig[] = [
	{
		city_slug: "bangalore",
		city_name: "Bangalore",
		country_code: "IN",
		currency: "INR",
		tax_rate: 0.03,
		display_unit: "10g",
		timezone: "Asia/Kolkata",
		active: true,
	},
	{
		city_slug: "mumbai",
		city_name: "Mumbai",
		country_code: "IN",
		currency: "INR",
		tax_rate: 0.03,
		display_unit: "10g",
		timezone: "Asia/Kolkata",
		active: true,
	},
	{
		city_slug: "delhi",
		city_name: "Delhi",
		country_code: "IN",
		currency: "INR",
		tax_rate: 0.03,
		display_unit: "10g",
		timezone: "Asia/Kolkata",
		active: true,
	},
	{
		city_slug: "chennai",
		city_name: "Chennai",
		country_code: "IN",
		currency: "INR",
		tax_rate: 0.03,
		display_unit: "10g",
		timezone: "Asia/Kolkata",
		active: true,
	},
	{
		city_slug: "hyderabad",
		city_name: "Hyderabad",
		country_code: "IN",
		currency: "INR",
		tax_rate: 0.03,
		display_unit: "10g",
		timezone: "Asia/Kolkata",
		active: true,
	},
	{
		city_slug: "kolkata",
		city_name: "Kolkata",
		country_code: "IN",
		currency: "INR",
		tax_rate: 0.03,
		display_unit: "10g",
		timezone: "Asia/Kolkata",
		active: true,
	},
	{
		city_slug: "us-national",
		city_name: "United States",
		country_code: "US",
		currency: "USD",
		tax_rate: 0,
		display_unit: "troy oz",
		timezone: "America/New_York",
		active: true,
	},
	{
		city_slug: "ca-national",
		city_name: "Canada",
		country_code: "CA",
		currency: "CAD",
		tax_rate: 0.05,
		display_unit: "troy oz",
		timezone: "America/Toronto",
		active: true,
	},
	{
		city_slug: "ae-dubai",
		city_name: "Dubai",
		country_code: "AE",
		currency: "AED",
		tax_rate: 0.05,
		display_unit: "gram",
		timezone: "Asia/Dubai",
		active: true,
	},
	{
		city_slug: "uk-london",
		city_name: "London",
		country_code: "GB",
		currency: "GBP",
		tax_rate: 0.20,
		display_unit: "gram",
		timezone: "Europe/London",
		active: true,
	},
];

export const HOME_CARD_CITIES = [
	"bangalore",
	"mumbai",
	"delhi",
	"chennai",
	"us-national",
	"ae-dubai",
] as const;

export const DEFAULT_CITY_BY_COUNTRY: Record<string, string> = {
	IN: "bangalore",
	US: "us-national",
	CA: "ca-national",
	AE: "ae-dubai",
	GB: "uk-london",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
	INR: "₹",
	USD: "$",
	CAD: "C$",
	AED: "AED ",
	GBP: "£",
};

export const RETAIL_PRICING_RULES: Record<string, RetailPricingRule> = {
	IN: { premium_percent: 0.12, flat_fee_local: 0 },
	US: { premium_percent: 0.05, flat_fee_local: 0 },
	CA: { premium_percent: 0.05, flat_fee_local: 0 },
	AE: { premium_percent: 0.04, flat_fee_local: 0 },
	GB: { premium_percent: 0.05, flat_fee_local: 0 },
};

export const FAQS: FaqItem[] = [
	{
		question: "How often are gold prices updated on this site?",
		answer:
			"The site refreshes the underlying market data once per day and serves users from cache for fast page loads.",
	},
	{
		question: "Why do Indian city prices look the same?",
		answer:
			"Indian retail gold rates usually follow a national benchmark, with jeweller making charges changing the final invoice more than the city itself.",
	},
	{
		question: "Does the displayed Indian rate include GST?",
		answer:
			"Yes. The default Indian 24k and 22k rates shown here include 3% GST on the benchmark calculation.",
	},
	{
		question: "Why can this rate differ from GoodReturns or a jeweller website?",
		answer:
			"This site publishes a normalized benchmark from global spot gold plus currency conversion and GST where applicable. Consumer portals and jeweller pages may include local retail premiums, sourcing spreads, or their own quote methodology, so the displayed price can be higher or lower than this benchmark.",
	},
	{
		question: "Can I use these prices for investment decisions?",
		answer:
			"Treat these rates as indicative reference prices only and confirm live execution prices with your jeweller, broker, or bullion desk.",
	},
	{
		question: "What range is available for historical charts?",
		answer:
			"The charts cover 1 month through 5 years, switching to monthly averages on longer ranges to keep the view readable.",
	},
];

export const CITY_DESCRIPTIONS: Record<string, string> = {
	bangalore:
		"Bangalore gold buyers usually track rates closely because the city has an active mix of salaried households, tech professionals, and wedding shoppers. Demand tends to stay steady through festival periods and family purchase cycles, so a clean daily benchmark helps compare jeweller quotes before visiting stores in Jayanagar, Malleshwaram, or commercial shopping districts.",
	mumbai:
		"Mumbai remains one of India’s most watched bullion markets, with retail demand influenced by weddings, wealth preservation, and broader commodity sentiment. Local shoppers often compare the benchmark rate against major jewellery chains and Zaveri Bazaar offers, making a transparent daily 22k and 24k reference useful before negotiating on making charges.",
	delhi:
		"Delhi buyers often monitor gold for festive shopping, bridal jewellery, and portfolio diversification. Because retailers across Karol Bagh, South Delhi, and NCR suburbs can price making charges differently, a consistent benchmark rate helps separate the metal value from design and service costs when comparing offers.",
	chennai:
		"Chennai has a deep culture of gold ownership tied to weddings, savings habits, and temple jewellery traditions. Even when local store demand is strong, the benchmark rate remains a useful starting point for buyers who want to compare purity, wastage, and making charges across popular jewellery districts and branded stores.",
	hyderabad:
		"Hyderabad’s jewellery market combines traditional family purchases with modern investment-led buying. From wedding-season demand to everyday savings plans, shoppers typically benefit from seeing a clear baseline metal price first and then evaluating craftsmanship premiums separately when choosing between local jewellers and national chains.",
	kolkata:
		"Kolkata buyers often watch gold prices during festive periods, family celebrations, and longer-term savings cycles. Since jeweller premiums can differ meaningfully by design and purity assurance, a reliable published benchmark makes it easier to compare stores across the city and understand the metal component of the final quote.",
	"us-national":
		"The United States gold market is commonly discussed in troy ounces, making a national spot-style reference useful for investors, coin buyers, and bullion watchers. Retail pricing for bars and coins still includes dealer premiums, but a daily benchmark gives a clean base for comparing market direction and purchase timing.",
	"ca-national":
		"Canadian gold pricing often follows the global dollar benchmark with currency conversion into CAD. A national reference helps investors compare bullion products, dealer spreads, and market moves without mixing in product-specific premiums, shipping, or storage costs that vary between brokers and precious metals platforms.",
	"ae-dubai":
		"Dubai remains one of the most closely followed gold retail hubs in the Gulf, with shoppers frequently comparing per-gram prices before visiting jewellery stores or souk traders. A daily benchmark helps separate pure metal value from workmanship and brand premiums, especially for buyers tracking both gifting and savings purchases.",
	"uk-london":
		"London is a major global centre for gold pricing and sentiment, but retail shoppers still need a consumer-friendly benchmark when comparing products and dealer quotes. A daily local-currency view helps buyers interpret broader market moves while keeping coin, bar, and jewellery premiums in perspective.",
};

export function normalizeCitySlug(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function getCityConfig(citySlug: string): CityConfig | undefined {
	const normalized = normalizeCitySlug(citySlug);
	return CITY_CONFIGS.find((city) => city.city_slug === normalized);
}

export function getDefaultKarat(citySlugOrCountryCode: string): GoldKarat {
	const normalized = citySlugOrCountryCode.toUpperCase();
	const config = getCityConfig(citySlugOrCountryCode);
	if (config?.country_code === "IN" || normalized === "IN") {
		return 22;
	}
	return 24;
}

export function isIndianCity(citySlug: string): boolean {
	return getCityConfig(citySlug)?.country_code === "IN";
}

export function formatCurrencyValue(value: number, currency: string): string {
	return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
		style: "currency",
		currency,
		maximumFractionDigits: currency === "INR" ? 0 : 2,
	}).format(value);
}

export function getRetailPricingRule(countryCode: string): RetailPricingRule {
	return RETAIL_PRICING_RULES[countryCode.toUpperCase()] ?? { premium_percent: 0, flat_fee_local: 0 };
}

export function enrichRetailEstimate(entry: GoldPriceEntry): GoldPriceEntry {
	const benchmarkLocal = entry.benchmark_local ?? entry.price_local;
	const rule = getRetailPricingRule(entry.country_code);
	const cityConfig = getCityConfig(entry.city_slug);
	const taxRate = cityConfig?.tax_rate ?? 0;
	const precision = entry.currency === "INR" ? 0 : 2;
	const factor = 10 ** precision;
	const retailAdjustmentLocal = Math.round((benchmarkLocal * rule.premium_percent + rule.flat_fee_local) * factor) / factor;
	const retailLocal = Math.round((benchmarkLocal + retailAdjustmentLocal) * factor) / factor;
	// For IN: GST is already baked into benchmark_local (inclusive price), so back-calculate the tax portion.
	// For all others: tax_local is the tax amount that would apply on top of the benchmark.
	const taxLocal = entry.country_code === "IN"
		? Math.round((benchmarkLocal * taxRate / (1 + taxRate)) * factor) / factor
		: Math.round(benchmarkLocal * taxRate * factor) / factor;

	return {
		...entry,
		benchmark_local: benchmarkLocal,
		retail_local: retailLocal,
		retail_adjustment_local: retailAdjustmentLocal,
		retail_adjustment_percent: Math.round(rule.premium_percent * 10000) / 100,
		tax_local: taxLocal,
		tax_rate_percent: Math.round(taxRate * 10000) / 100,
	};
}

export function formatPriceDate(priceDate: string): string {
	const date = new Date(`${priceDate}T00:00:00Z`);
	return new Intl.DateTimeFormat("en", {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

export function getCurrentUtcDate(): string {
	return new Date().toISOString().slice(0, 10);
}
