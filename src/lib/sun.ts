import SunCalc from "suncalc";
import * as THREE from "three";

/** Unit sun direction in Three.js Y-up coords. */
export function sunDirection(date = new Date()): THREE.Vector3 {
  const { lat, lon } = subsolarPoint(date);
  return latLonToVector3(lat, lon);
}

export function subsolarPoint(date = new Date()): { lat: number; lon: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360) * Math.PI) / 180;
  const lambda =
    ((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const eps = ((23.439 - 0.0000004 * n) * Math.PI) / 180;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst / 24) * 2 * Math.PI;
  const lon = ((((ra - lst) * 180) / Math.PI + 180) % 360) - 180;
  const lat = (decl * 180) / Math.PI;
  return { lat, lon };
}

/** Convert lat/lon (degrees) to unit vector on a sphere. */
export function latLonToVector3(lat: number, lon: number, radius = 1): THREE.Vector3 {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

/** Equirectangular map: lon/lat → normalized 0–1 UV (origin top-left). */
export function latLonToMapUV(lat: number, lon: number): { u: number; v: number } {
  return {
    u: (lon + 180) / 360,
    v: (90 - lat) / 180,
  };
}

export function formatLocalTime(
  date: Date,
  timeZone: string,
  hour12: boolean,
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12,
      hourCycle: hour12 ? "h12" : "h23",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? "";
    const time = `${get("hour")}:${get("minute")}`;
    const dayPeriod = get("dayPeriod");
    return dayPeriod ? `${time} ${dayPeriod.toUpperCase()}` : time;
  } catch {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

export function formatTimeZoneAbbr(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function isDaylight(lat: number, lon: number, date = new Date()): boolean {
  const pos = SunCalc.getPosition(date, lat, lon);
  return pos.altitude > 0;
}
