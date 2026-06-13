import {
  CITY_CONFIGS,
  DEFAULT_CITY_BY_COUNTRY,
  getCityConfig,
  normalizeCitySlug,
  type CityConfig,
} from "@gold-site/shared";

const CITY_ALIASES: Record<string, string> = {
  bengaluru: "bangalore",
  bangalore: "bangalore",
  bombay: "mumbai",
  newdelhi: "delhi",
  "new-delhi": "delhi",
  madras: "chennai",
  calcutta: "kolkata",
  dubai: "ae-dubai",
  london: "uk-london",
  toronto: "ca-national",
  montreal: "ca-national",
  vancouver: "ca-national",
  "new-york": "us-national",
  chicago: "us-national",
  dallas: "us-national",
};

function resolveByCityName(cityName?: string): CityConfig | undefined {
  if (!cityName) {
    return undefined;
  }

  const normalized = normalizeCitySlug(cityName);
  const alias = CITY_ALIASES[normalized] ?? normalized.replace(/-/g, "");
  const aliasedSlug = CITY_ALIASES[alias] ?? CITY_ALIASES[normalized] ?? normalized;
  return getCityConfig(aliasedSlug);
}

export function resolveCity(
  countryCode?: string,
  cfCity?: string,
  overrideCity?: string,
): CityConfig {
  const override = overrideCity ? getCityConfig(overrideCity) : undefined;
  if (override?.active) {
    return override;
  }

  const resolvedByName = resolveByCityName(cfCity);
  if (resolvedByName?.active) {
    return resolvedByName;
  }

  const fallbackSlug = DEFAULT_CITY_BY_COUNTRY[countryCode?.toUpperCase() ?? ""] ?? "us-national";
  return getCityConfig(fallbackSlug) ?? CITY_CONFIGS[0];
}