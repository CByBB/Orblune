import { Store } from "@tauri-apps/plugin-store";
import { CITIES, defaultEnabledCityIds, FREE_EXTRA_CITY_LIMIT } from "../data/cities";
import { DEFAULT_MAP_THEME, isMapThemeId, type MapThemeId } from "./mapThemes";

export type TempUnit = "C" | "F";
export type LabelSize = "small" | "medium" | "large";
export type { MapThemeId };

export type DisplayWallpaperSettings = {
  enabled: boolean;
  /** null = inherit global mapTheme */
  mapTheme: MapThemeId | null;
};

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
  showSeconds: boolean;
  labelSize: LabelSize;
  mapTheme: MapThemeId;
  /** Per-monitor overrides keyed by Windows device string (e.g. \\\\.\\DISPLAY1). */
  displaySettings: Record<string, DisplayWallpaperSettings>;
  licenseToken: string | null;
  premium: boolean;
};

export type MonitorInfo = {
  index: number;
  key: string;
  name: string;
  width: number;
  height: number;
};

export const DEFAULT_DISPLAY_SETTINGS: DisplayWallpaperSettings = {
  enabled: true,
  mapTheme: null,
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
  showSeconds: false,
  labelSize: "medium",
  mapTheme: DEFAULT_MAP_THEME,
  displaySettings: {},
  licenseToken: null,
  premium: false,
};

const LABEL_SIZES: LabelSize[] = ["small", "medium", "large"];

export function isLabelSize(v: unknown): v is LabelSize {
  return typeof v === "string" && LABEL_SIZES.includes(v as LabelSize);
}

function migrateLabelSize(raw: Record<string, unknown> | null | undefined): LabelSize {
  if (raw && isLabelSize(raw.labelSize)) return raw.labelSize;
  // Older builds used labelDensity
  const density = raw?.labelDensity;
  if (density === "low") return "small";
  if (density === "high") return "large";
  return "medium";
}

function migrateDisplaySettings(
  raw: Record<string, unknown> | null | undefined,
): Record<string, DisplayWallpaperSettings> {
  const src = raw?.displaySettings;
  if (!src || typeof src !== "object") return {};
  const out: Record<string, DisplayWallpaperSettings> = {};
  for (const [key, value] of Object.entries(src as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const theme = v.mapTheme;
    out[key] = {
      enabled: v.enabled !== false,
      mapTheme: typeof theme === "string" && isMapThemeId(theme) ? theme : null,
    };
  }
  return out;
}

export function getDisplaySettings(
  settings: AppSettings,
  key: string,
): DisplayWallpaperSettings {
  const d = settings.displaySettings?.[key];
  if (!d) return { ...DEFAULT_DISPLAY_SETTINGS };
  return {
    enabled: d.enabled !== false,
    mapTheme: d.mapTheme && isMapThemeId(d.mapTheme) ? d.mapTheme : null,
  };
}

export function enabledMonitorKeys(
  settings: AppSettings,
  monitors: { key: string }[],
): string[] {
  return monitors
    .filter((m) => getDisplaySettings(settings, m.key).enabled)
    .map((m) => m.key);
}

export function resolveMapThemeForDisplay(
  settings: AppSettings,
  key: string | null | undefined,
): MapThemeId {
  if (key) {
    const d = getDisplaySettings(settings, key);
    if (d.mapTheme) return d.mapTheme;
  }
  return settings.mapTheme ?? DEFAULT_MAP_THEME;
}

/** Fired by the settings window after the first store open attempt finishes. */
export const SETTINGS_STORE_READY_EVENT = "settings-store-ready";

const STORE_TIMEOUT_MS = 4000;

let storePromise: Promise<Store> | null = null;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(id);
        reject(error);
      },
    );
  });
}

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = withTimeout(
      Store.load("orblune-settings.json"),
      STORE_TIMEOUT_MS,
      "Store.load",
    ).catch((error) => {
      // Allow a later retry instead of poisoning the shared promise forever.
      storePromise = null;
      throw error;
    });
  }
  return storePromise;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const store = await getStore();
    const raw =
      (await withTimeout(
        store.get<Record<string, unknown>>("settings"),
        STORE_TIMEOUT_MS,
        "Store.get",
      )) ?? {};
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...(raw as Partial<AppSettings>),
      labelSize: migrateLabelSize(raw),
      displaySettings: migrateDisplaySettings(raw),
    };
    if (!isMapThemeId(merged.mapTheme)) merged.mapTheme = DEFAULT_MAP_THEME;
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const store = await getStore();
  await withTimeout(store.set("settings", settings), STORE_TIMEOUT_MS, "Store.set");
  await withTimeout(store.save(), STORE_TIMEOUT_MS, "Store.save");
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
