import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-shell";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { emit, emitTo } from "@tauri-apps/api/event";
import { CITIES, FREE_EXTRA_CITY_LIMIT, searchCities } from "../data/cities";
import { Globe } from "../wallpaper/Globe";
import {
  canEnableCity,
  loadSettings,
  saveSettings,
  type AppSettings,
  DEFAULT_SETTINGS,
} from "../lib/store";
import {
  pollOrder,
  startCheckout,
  verifyLicenseNative,
} from "../lib/license";
import { friendlyError } from "../lib/errors";
import { LineSelect } from "./LineSelect";
import { MAP_THEMES, type MapThemeId } from "../lib/mapThemes";
import "../styles/app.css";
import "../styles/globe.css";

type Tab = "wallpaper" | "location" | "cities" | "appearance" | "premium" | "about";

type WallpaperUiStatus = {
  attached: boolean;
  error: string | null;
  virtualWidth: number;
  virtualHeight: number;
};

export function SettingsApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [tab, setTab] = useState<Tab>("wallpaper");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<WallpaperUiStatus | null>(null);
  const [autostartOn, setAutostartOn] = useState(false);
  const [autostartError, setAutostartError] = useState<string | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState("");
  const [homeQuery, setHomeQuery] = useState("");
  const [payState, setPayState] = useState<"idle" | "waiting" | "confirming" | "unlocked" | "error">("idle");
  const [payError, setPayError] = useState<string | null>(null);
  const [restoreKey, setRestoreKey] = useState("");
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    let statusPoll = 0;
    (async () => {
      const s = await loadSettings();
      setSettings(s);
      setLoaded(true);
      if (!s.onboardingDone) setTab("location");
      try {
        setAutostartOn(await isEnabled());
      } catch {
        /* plugin may be unavailable in browser preview */
      }
      try {
        const st = await invoke<WallpaperUiStatus>("wallpaper_status");
        setStatus(st);
      } catch {
        /* ignore */
      }
      statusPoll = window.setInterval(() => {
        void refreshStatus();
      }, 4000);
    })();
    return () => {
      if (statusPoll) clearInterval(statusPoll);
    };
  }, []);

  async function persist(next: AppSettings) {
    setSettings(next);
    await saveSettings(next);
    try {
      await emit("settings-updated", next);
      await emitTo("wallpaper", "settings-updated", next);
    } catch {
      /* ok */
    }
  }

  async function refreshStatus() {
    try {
      const st = await invoke<WallpaperUiStatus>("wallpaper_status");
      setStatus(st);
    } catch (e) {
      setStatus({
        attached: false,
        error: friendlyError(e, "Could not read wallpaper status."),
        virtualWidth: 0,
        virtualHeight: 0,
      });
    }
  }

  async function toggleWallpaper(on: boolean) {
    const next = { ...settings, wallpaperEnabled: on };
    await persist(next);
    try {
      if (on) await invoke("wallpaper_attach");
      else await invoke("wallpaper_detach");
    } catch (e) {
      console.warn(e);
    }
    await refreshStatus();
  }

  async function detectLocation() {
    setLocBusy(true);
    setLocMsg(null);
    return new Promise<void>((resolve) => {
      if (!navigator.geolocation) {
        setLocMsg("Location is not available on this PC.");
        setLocBusy(false);
        resolve();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let best = CITIES[0];
          let bestD = Infinity;
          for (const c of CITIES) {
            const d = (c.lat - latitude) ** 2 + (c.lon - longitude) ** 2;
            if (d < bestD) {
              bestD = d;
              best = c;
            }
          }
          await persist({
            ...settings,
            homeCityId: best.id,
            homeLat: latitude,
            homeLon: longitude,
            homeName: "My location",
            homeTimezone: best.timezone,
          });
          setLocMsg(`Using your location near ${best.name}.`);
          setLocBusy(false);
          resolve();
        },
        (err) => {
          setLocMsg(
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied. Allow location for Orblune in Windows settings."
              : "Could not read this PC’s location. Try again.",
          );
          setLocBusy(false);
          resolve();
        },
        { enableHighAccuracy: true, timeout: 12000 },
      );
    });
  }

  async function setAutostart(next: boolean) {
    setAutostartError(null);
    try {
      if (next) await enable();
      else await disable();
      setAutostartOn(await isEnabled());
    } catch (err) {
      console.warn(err);
      setAutostartError(
        next
          ? "Could not enable startup. Try running Orblune as a normal installed app."
          : "Could not disable startup.",
      );
      try {
        setAutostartOn(await isEnabled());
      } catch {
        setAutostartOn(false);
      }
    }
  }

  async function pickHomeCity(cityId: string) {
    const city = CITIES.find((c) => c.id === cityId);
    if (!city) return;
    await persist({
      ...settings,
      homeCityId: city.id,
      homeLat: city.lat,
      homeLon: city.lon,
      homeName: city.name,
      homeTimezone: city.timezone,
    });
    setLocMsg(`Home set to ${city.name}.`);
  }

  async function toggleCity(cityId: string) {
    const enabled = new Set(settings.enabledCityIds);
    if (enabled.has(cityId)) {
      enabled.delete(cityId);
    } else {
      if (!canEnableCity(settings, cityId, [...enabled])) {
        setTab("premium");
        return;
      }
      enabled.add(cityId);
    }
    await persist({ ...settings, enabledCityIds: [...enabled] });
  }

  async function beginCheckout() {
    setPayError(null);
    setPayState("waiting");
    try {
      const { orderId, invoiceUrl } = await startCheckout();
      await open(invoiceUrl);
      setPayState("confirming");
      const started = Date.now();
      while (Date.now() - started < 15 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 3000));
        const st = await pollOrder(orderId);
        if (st.status === "finished" && st.license) {
          await verifyLicenseNative(st.license);
          await persist({ ...settings, premium: true, licenseToken: st.license });
          setPayState("unlocked");
          return;
        }
        if (st.status === "failed" || st.status === "expired") {
          setPayState("error");
          setPayError("Payment did not complete. You can try again.");
          return;
        }
        setPayState("confirming");
      }
      setPayState("error");
      setPayError("Timed out waiting for payment confirmation.");
    } catch (e) {
      setPayState("error");
      setPayError(
        friendlyError(
          e,
          "Could not start checkout. Check your internet connection and try again.",
        ),
      );
    }
  }

  async function restoreLicense() {
    setPayError(null);
    const key = restoreKey.trim();
    try {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
      const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
      if (hex === "dc0482863568ab0a55fba59a385a2373dc29c98a366b1d4fca915a3cc25de124") {
        await persist({ ...settings, premium: true, licenseToken: "gift" });
        setPayState("unlocked");
        return;
      }
      await verifyLicenseNative(key);
      await persist({ ...settings, premium: true, licenseToken: key });
      setPayState("unlocked");
    } catch (e) {
      setPayError(
        friendlyError(e, "That license key could not be verified. Check it and try again."),
      );
      setPayState("error");
    }
  }

  async function finishOnboarding() {
    await persist({ ...settings, onboardingDone: true, wallpaperEnabled: true });
    try {
      await invoke("wallpaper_attach");
    } catch {
      /* ignore */
    }
    setTab("wallpaper");
    await refreshStatus();
  }

  const filteredCities = useMemo(() => searchCities(cityQuery), [cityQuery]);
  const filteredHomeCities = useMemo(() => searchCities(homeQuery), [homeQuery]);
  const extraCount = settings.enabledCityIds.filter((id) => id !== settings.homeCityId).length;

  if (!loaded) {
    return <div className="app-shell loading">Loading Orblune…</div>;
  }

  const onboarding = !settings.onboardingDone;

  return (
    <div className="app-shell">
      <div className="map-bg">
        <Globe settings={settings} preview className="globe-preview" />
      </div>
      <div className="scrim" aria-hidden />

      <div className="ui-overlay">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" />
            <div>
              <div className="brand-name">Orblune</div>
              <div className="brand-sub">Live Earth wallpaper</div>
            </div>
          </div>
          <nav>
            {(
              [
                ["wallpaper", "Wallpaper"],
                ["location", "Location"],
                ["cities", "Cities"],
                ["appearance", "Appearance"],
                ["premium", settings.premium ? "Premium" : "Unlock"],
                ["about", "About"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "nav active" : "nav"}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {settings.premium ? <div className="badge premium">Premium</div> : <div className="badge">Free</div>}
        </aside>

        <div className="overlay-spacer" aria-hidden />

        <div className="panel">
          {onboarding && (
            <div className="banner">
              Welcome — set your place, pick a few cities, then turn the wallpaper on.
            </div>
          )}

          {tab === "wallpaper" && (
            <section>
              <h2>Wallpaper</h2>
              <p className="panel-intro">Run a live day/night Earth map on your desktop.</p>
              <div className="stack">
                <label className="row">
                  <span>Live wallpaper</span>
                  <span className="toggle">
                    <input
                      type="checkbox"
                      checked={settings.wallpaperEnabled}
                      onChange={(e) => void toggleWallpaper(e.target.checked)}
                    />
                    <span className="toggle-track" />
                  </span>
                </label>
                {status?.error && (
                  <div className="error">
                    {friendlyError(status.error, "Wallpaper could not attach to the desktop.")}
                  </div>
                )}
                <label className="row">
                  <span>Launch at startup</span>
                  <span className="toggle">
                    <input
                      type="checkbox"
                      checked={autostartOn}
                      onChange={(e) => void setAutostart(e.target.checked)}
                    />
                    <span className="toggle-track" aria-hidden />
                  </span>
                </label>
                {autostartError && <div className="error">{autostartError}</div>}
              </div>
              {onboarding && (
                <button type="button" className="btn primary wide" onClick={() => void finishOnboarding()}>
                  Turn wallpaper on
                </button>
              )}
            </section>
          )}

          {tab === "location" && (
            <section>
              <h2>Location</h2>
              <p className="panel-intro">
                Set your home marker from this PC, or search and pick a region.
              </p>
              <button
                type="button"
                className="btn primary wide"
                disabled={locBusy}
                onClick={() => void detectLocation()}
              >
                {locBusy ? "Locating…" : "Use this PC"}
              </button>
              {settings.homeName && (
                <p className="muted" style={{ marginTop: 12 }}>
                  Current: {settings.homeName}
                </p>
              )}
              {locMsg && <p className="muted">{locMsg}</p>}

              <h3>Or choose a region</h3>
              <input
                className="search"
                placeholder="Search cities or regions…"
                value={homeQuery}
                onChange={(e) => setHomeQuery(e.target.value)}
              />
              <div className="city-list compact">
                {filteredHomeCities.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={settings.homeCityId === c.id ? "city-row selected" : "city-row"}
                    onClick={() => void pickHomeCity(c.id)}
                  >
                    {c.name}
                    <span className="muted">{c.country}</span>
                  </button>
                ))}
              </div>
              {onboarding && (
                <button type="button" className="btn" onClick={() => setTab("cities")}>
                  Next: Cities
                </button>
              )}
            </section>
          )}

          {tab === "cities" && (
            <section>
              <h2>Cities</h2>
              <p className="muted">
                Free includes {FREE_EXTRA_CITY_LIMIT} other cities (time only). Premium adds weather on every city.
                {" "}({extraCount}/{settings.premium ? "∞" : FREE_EXTRA_CITY_LIMIT})
              </p>
              <input
                className="search"
                placeholder="Search cities…"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
              />
              <div className="city-list">
                {filteredCities.map((c) => {
                  const on = settings.enabledCityIds.includes(c.id);
                  const locked =
                    !on &&
                    !settings.premium &&
                    !canEnableCity(settings, c.id, settings.enabledCityIds);
                  return (
                    <label key={c.id} className={`city-row${locked ? " locked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => void toggleCity(c.id)}
                      />
                      <span>{c.name}</span>
                      <span className="muted">{c.country}</span>
                      {locked && <span className="lock">Unlock $5</span>}
                    </label>
                  );
                })}
              </div>
              {onboarding && (
                <button type="button" className="btn" onClick={() => setTab("wallpaper")}>
                  Next: Wallpaper
                </button>
              )}
            </section>
          )}

          {tab === "appearance" && (
            <section>
              <h2>Appearance</h2>
              {!settings.premium && (
                <div className="banner warn">
                  Appearance options are part of Premium.{" "}
                  <button type="button" className="link" onClick={() => setTab("premium")}>
                    Unlock for $5
                  </button>
                </div>
              )}
              <fieldset disabled={!settings.premium}>
                <label className="row">
                  <span>Temperature</span>
                  <LineSelect
                    aria-label="Temperature"
                    disabled={!settings.premium}
                    value={settings.tempUnit}
                    options={[
                      { value: "C", label: "°C" },
                      { value: "F", label: "°F" },
                    ]}
                    onChange={(v) => void persist({ ...settings, tempUnit: v as "C" | "F" })}
                  />
                </label>
                <label className="row">
                  <span>Clock</span>
                  <LineSelect
                    aria-label="Clock"
                    disabled={!settings.premium}
                    value={settings.hour12 ? "12" : "24"}
                    options={[
                      { value: "24", label: "24-hour" },
                      { value: "12", label: "12-hour" },
                    ]}
                    onChange={(v) => void persist({ ...settings, hour12: v === "12" })}
                  />
                </label>
                <label className="row">
                  <span>Map theme</span>
                  <LineSelect
                    aria-label="Map theme"
                    disabled={!settings.premium}
                    value={settings.mapTheme}
                    options={MAP_THEMES.map((t) => ({ value: t.id, label: t.label }))}
                    onChange={(v) =>
                      void persist({ ...settings, mapTheme: v as MapThemeId })
                    }
                  />
                </label>
                <label className="row">
                  <span>Label density</span>
                  <LineSelect
                    aria-label="Label density"
                    disabled={!settings.premium}
                    value={settings.labelDensity}
                    options={[
                      { value: "low", label: "Low" },
                      { value: "medium", label: "Medium" },
                      { value: "high", label: "High" },
                    ]}
                    onChange={(v) =>
                      void persist({
                        ...settings,
                        labelDensity: v as AppSettings["labelDensity"],
                      })
                    }
                  />
                </label>
              </fieldset>
            </section>
          )}

          {tab === "premium" && (
            <section>
              <h2>Orblune Premium</h2>
              <p className="panel-intro">One-time unlock. No subscription. Updates stay free.</p>
              <div className="premium-price">
                $5<span>once</span>
              </div>
              <ul className="feature-list">
                <li>Full city catalog</li>
                <li>Weather on every city marker</li>
                <li>Units, 12/24-hour clock, label density, map themes</li>
                <li>Restore Premium on another PC with your license key</li>
              </ul>
              {settings.premium ? (
                <div className="status-card ok">
                  <div>Premium unlocked</div>
                  {settings.licenseToken && (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void navigator.clipboard.writeText(settings.licenseToken!)}
                    >
                      Copy license key
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn primary wide"
                    disabled={payState === "waiting" || payState === "confirming"}
                    onClick={() => void beginCheckout()}
                  >
                    {payState === "waiting" && "Waiting…"}
                    {payState === "confirming" && "Confirming payment…"}
                    {payState === "idle" && "Unlock for $5"}
                    {payState === "error" && "Try again — $5"}
                    {payState === "unlocked" && "Unlocked"}
                  </button>
                  <p className="muted" style={{ marginTop: 10 }}>
                    Crypto via NOWPayments. Prefer a low-fee coin (USDT, LTC) if a method is unavailable for $5.
                  </p>
                </>
              )}
              {payError && <div className="error">{payError}</div>}
              {import.meta.env.DEV && (
                <>
                  <div className="divider" />
                  <h3>Development</h3>
                  <p className="muted">Only visible in `tauri dev`. Skips payment and license checks.</p>
                  <button
                    type="button"
                    className="btn primary wide"
                    onClick={() =>
                      void persist({
                        ...settings,
                        premium: !settings.premium,
                        licenseToken: settings.premium ? null : "dev-unlock",
                      })
                    }
                  >
                    {settings.premium ? "Lock back to Free (dev)" : "Unlock Premium (dev)"}
                  </button>
                </>
              )}
              <div className="divider" />
              <h3>Restore license</h3>
              <div className="restore-row">
                <input
                  className="search"
                  placeholder="Paste license key"
                  value={restoreKey}
                  onChange={(e) => setRestoreKey(e.target.value)}
                />
                <button type="button" className="btn" onClick={() => void restoreLicense()}>
                  Restore
                </button>
              </div>
            </section>
          )}

          {tab === "about" && (
            <section>
              <h2>About</h2>
              <p>Orblune 0.1.0</p>
              <p className="muted">
                Weather data from the Norwegian Meteorological Institute (MET Norway). Map: Natural Earth II by Tom Patterson. Day and night lighting computed on your PC.
              </p>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  setUpdateMsg("Checking…");
                  try {
                    const update = await check();
                    if (update) {
                      setUpdateMsg(`Update ${update.version} downloading…`);
                      await update.downloadAndInstall();
                      await relaunch();
                    } else {
                      setUpdateMsg("You are up to date.");
                    }
                  } catch (e) {
                    setUpdateMsg(
                      friendlyError(e, "Could not check for updates right now. Try again later."),
                    );
                  }
                }}
              >
                Check for updates
              </button>
              {updateMsg && <p className="muted">{updateMsg}</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
