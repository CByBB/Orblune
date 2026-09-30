import { Store } from "@tauri-apps/plugin-store";
import { CITIES, defaultEnabledCityIds, FREE_EXTRA_CITY_LIMIT } from "../data/cities";
import { DEFAULT_MAP_THEME, isMapThemeId, type MapThemeId } from "./mapThemes";

export type TempUnit = "C" | "F";
export type LabelDensity = "low" | "medium" | "high";
export type { MapThemeId };

export type AppSettings = {
  onboardingDone: boolean;
  wallpaperEnabled: boolean;
  homeCityId: string | null;
  homeLat: number | null;
  homeLon: number | null;
  homeName: string | null;
  homeTimezone: string | null;
  enabledCityIds: string[];
  tempUnit: TempUnit;
  hour12: boolean;
  labelDensity: LabelDensity;
  mapTheme: MapThemeId;
  licenseToken: string | null;
  premium: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  onboardingDone: false,
  wallpaperEnabled: true,
  homeCityId: null,
  homeLat: null,
  homeLon: null,
  homeName: null,
  homeTimezone: null,
  enabledCityIds: defaultEnabledCityIds(),
  tempUnit: "C",
  hour12: false,
  labelDensity: "medium",
  mapTheme: DEFAULT_MAP_THEME,
  licenseToken: null,
  premium: false,
};

let storePromise: Promise<Store> | null = null;

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = Store.load("orblune-settings.json");
  }
  return storePromise;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const raw = await store.get<Partial<AppSettings>>("settings");
    const merged = { ...DEFAULT_SETTINGS, ...raw };
    if (!isMapThemeId(merged.mapTheme)) merged.mapTheme = DEFAULT_MAP_THEME;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await store.set("settings", settings);
  await store.save();
}

export function canEnableCity(
  settings: AppSettings,
  cityId: string,
  currentlyEnabled: string[],
): boolean {
  if (settings.premium) return true;
  if (currentlyEnabled.includes(cityId)) return true;
  if (cityId === settings.homeCityId) return true;
  const extras = currentlyEnabled.filter((id) => id !== settings.homeCityId);
  return extras.length < FREE_EXTRA_CITY_LIMIT;
}

export function resolveHome(settings: AppSettings) {
  if (settings.homeLat != null && settings.homeLon != null) {
    return {
      id: settings.homeCityId ?? "home",
      name: settings.homeName ?? "Home",
      lat: settings.homeLat,
      lon: settings.homeLon,
      timezone: settings.homeTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
  const fallback = CITIES.find((c) => c.id === "lon")!;
  return {
    id: fallback.id,
    name: fallback.name,
    lat: fallback.lat,
    lon: fallback.lon,
    timezone: fallback.timezone,
  };
}
