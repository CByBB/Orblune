export type WeatherSnapshot = {
  temperatureC: number;
  symbol: string;
  updatedAt: number;
  expiresAt: number;
};

const memoryCache = new Map<string, WeatherSnapshot>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/** Map MET Norway symbol_code prefix to a simple icon id. */
export function symbolToIcon(symbol: string): string {
  const s = symbol.toLowerCase();
  if (s.includes("thunder")) return "thunder";
  if (s.includes("snow") || s.includes("sleet")) return "snow";
  if (s.includes("rain") || s.includes("drizzle")) return "rain";
  if (s.includes("fog") || s.includes("mist")) return "fog";
  if (s.includes("cloud")) return "cloud";
  if (s.includes("fair") || s.includes("clear") || s.includes("sunny")) return "clear";
  if (s.includes("partly")) return "partly";
  return "unknown";
}

async function fetchViaTauri(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<WeatherSnapshot>("fetch_weather", { lat, lon });
  } catch {
    return null;
  }
}

/** Browser fallback — MET Norway may block without a custom User-Agent. */
async function fetchViaHttp(lat: number, lon: number): Promise<WeatherSnapshot | null> {
  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const first = data?.properties?.timeseries?.[0];
    if (!first) return null;
    const now = Date.now();
    return {
      temperatureC: first.data.instant.details.air_temperature,
      symbol:
        first.data.next_1_hours?.summary?.symbol_code ??
        first.data.next_6_hours?.summary?.symbol_code ??
        "clearsky_day",
      updatedAt: now,
      expiresAt: now + 30 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

export async function fetchWeather(
  lat: number,
  lon: number,
): Promise<WeatherSnapshot | null> {
  const key = cacheKey(lat, lon);
  const now = Date.now();
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > now) return mem;

  const fromTauri = await fetchViaTauri(lat, lon);
  if (fromTauri) {
    memoryCache.set(key, fromTauri);
    return fromTauri;
  }

  const fromHttp = await fetchViaHttp(lat, lon);
  if (fromHttp) {
    memoryCache.set(key, fromHttp);
    return fromHttp;
  }

  return mem ?? null;
}

export function formatTemp(celsius: number, unit: "C" | "F"): string {
  if (unit === "F") {
    const f = (celsius * 9) / 5 + 32;
    return `${Math.round(f)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}
