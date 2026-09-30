export type City = {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  timezone: string;
  defaultOn?: boolean;
};

/** Curated world cities with IANA time zones. Coordinates WGS84. */
export const CITIES: City[] = [
  { id: "nyc", name: "New York", country: "US", lat: 40.7128, lon: -74.006, timezone: "America/New_York", defaultOn: true },
  { id: "lax", name: "Los Angeles", country: "US", lat: 34.0522, lon: -118.2437, timezone: "America/Los_Angeles" },
  { id: "chi", name: "Chicago", country: "US", lat: 41.8781, lon: -87.6298, timezone: "America/Chicago" },
  { id: "tor", name: "Toronto", country: "CA", lat: 43.6532, lon: -79.3832, timezone: "America/Toronto" },
  { id: "mex", name: "Mexico City", country: "MX", lat: 19.4326, lon: -99.1332, timezone: "America/Mexico_City" },
  { id: "sao", name: "São Paulo", country: "BR", lat: -23.5505, lon: -46.6333, timezone: "America/Sao_Paulo" },
  { id: "rio", name: "Rio de Janeiro", country: "BR", lat: -22.9068, lon: -43.1729, timezone: "America/Sao_Paulo" },
  { id: "bue", name: "Buenos Aires", country: "AR", lat: -34.6037, lon: -58.3816, timezone: "America/Argentina/Buenos_Aires" },
  { id: "lon", name: "London", country: "GB", lat: 51.5074, lon: -0.1278, timezone: "Europe/London", defaultOn: true },
  { id: "par", name: "Paris", country: "FR", lat: 48.8566, lon: 2.3522, timezone: "Europe/Paris" },
  { id: "ber", name: "Berlin", country: "DE", lat: 52.52, lon: 13.405, timezone: "Europe/Berlin" },
  { id: "ams", name: "Amsterdam", country: "NL", lat: 52.3676, lon: 4.9041, timezone: "Europe/Amsterdam" },
  { id: "mad", name: "Madrid", country: "ES", lat: 40.4168, lon: -3.7038, timezone: "Europe/Madrid" },
  { id: "rom", name: "Rome", country: "IT", lat: 41.9028, lon: 12.4964, timezone: "Europe/Rome" },
  { id: "ist", name: "Istanbul", country: "TR", lat: 41.0082, lon: 28.9784, timezone: "Europe/Istanbul" },
  { id: "mos", name: "Moscow", country: "RU", lat: 55.7558, lon: 37.6173, timezone: "Europe/Moscow" },
  { id: "cai", name: "Cairo", country: "EG", lat: 30.0444, lon: 31.2357, timezone: "Africa/Cairo" },
  { id: "lag", name: "Lagos", country: "NG", lat: 6.5244, lon: 3.3792, timezone: "Africa/Lagos" },
  { id: "jnb", name: "Johannesburg", country: "ZA", lat: -26.2041, lon: 28.0473, timezone: "Africa/Johannesburg" },
  { id: "dxb", name: "Dubai", country: "AE", lat: 25.2048, lon: 55.2708, timezone: "Asia/Dubai" },
  { id: "riy", name: "Riyadh", country: "SA", lat: 24.7136, lon: 46.6753, timezone: "Asia/Riyadh" },
  { id: "teh", name: "Tehran", country: "IR", lat: 35.6892, lon: 51.389, timezone: "Asia/Tehran" },
  { id: "del", name: "New Delhi", country: "IN", lat: 28.6139, lon: 77.209, timezone: "Asia/Kolkata" },
  { id: "mum", name: "Mumbai", country: "IN", lat: 19.076, lon: 72.8777, timezone: "Asia/Kolkata" },
  { id: "bkk", name: "Bangkok", country: "TH", lat: 13.7563, lon: 100.5018, timezone: "Asia/Bangkok" },
  { id: "sin", name: "Singapore", country: "SG", lat: 1.3521, lon: 103.8198, timezone: "Asia/Singapore" },
  { id: "hkg", name: "Hong Kong", country: "HK", lat: 22.3193, lon: 114.1694, timezone: "Asia/Hong_Kong" },
  { id: "sha", name: "Shanghai", country: "CN", lat: 31.2304, lon: 121.4737, timezone: "Asia/Shanghai" },
  { id: "bej", name: "Beijing", country: "CN", lat: 39.9042, lon: 116.4074, timezone: "Asia/Shanghai" },
  { id: "seo", name: "Seoul", country: "KR", lat: 37.5665, lon: 126.978, timezone: "Asia/Seoul" },
  { id: "tyo", name: "Tokyo", country: "JP", lat: 35.6762, lon: 139.6503, timezone: "Asia/Tokyo", defaultOn: true },
  { id: "syd", name: "Sydney", country: "AU", lat: -33.8688, lon: 151.2093, timezone: "Australia/Sydney" },
  { id: "mel", name: "Melbourne", country: "AU", lat: -37.8136, lon: 144.9631, timezone: "Australia/Melbourne" },
  { id: "akl", name: "Auckland", country: "NZ", lat: -36.8509, lon: 174.7645, timezone: "Pacific/Auckland" },
  { id: "hon", name: "Honolulu", country: "US", lat: 21.3069, lon: -157.8583, timezone: "Pacific/Honolulu" },
  { id: "anc", name: "Anchorage", country: "US", lat: 61.2181, lon: -149.9003, timezone: "America/Anchorage" },
  { id: "van", name: "Vancouver", country: "CA", lat: 49.2827, lon: -123.1207, timezone: "America/Vancouver" },
  { id: "sto", name: "Stockholm", country: "SE", lat: 59.3293, lon: 18.0686, timezone: "Europe/Stockholm" },
  { id: "hel", name: "Helsinki", country: "FI", lat: 60.1699, lon: 24.9384, timezone: "Europe/Helsinki" },
  { id: "waw", name: "Warsaw", country: "PL", lat: 52.2297, lon: 21.0122, timezone: "Europe/Warsaw" },
  { id: "ath", name: "Athens", country: "GR", lat: 37.9838, lon: 23.7275, timezone: "Europe/Athens" },
  { id: "nbo", name: "Nairobi", country: "KE", lat: -1.2921, lon: 36.8219, timezone: "Africa/Nairobi" },
];

export const FREE_EXTRA_CITY_LIMIT = 3;

export function defaultEnabledCityIds(): string[] {
  return CITIES.filter((c) => c.defaultOn).map((c) => c.id);
}

export function findCity(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

export function searchCities(query: string): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return CITIES;
  return CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q) ||
      c.id.includes(q),
  );
}
