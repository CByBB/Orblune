import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Globe } from "./Globe";
import {
  DEFAULT_SETTINGS,
  enabledMonitorKeys,
  getDisplaySettings,
  loadSettings,
  resolveMapThemeForDisplay,
  SETTINGS_STORE_READY_EVENT,
  type AppSettings,
  type MonitorInfo,
} from "../lib/store";
import "../styles/globe.css";

function wallpaperIndexFromLabel(label: string): number {
  if (label === "wallpaper") return 0;
  const m = /^wallpaper-(\d+)$/.exec(label);
  return m ? Number(m[1]) : 0;
}

/** Let the settings window open the store first; fall back if it never signals. */
function waitForSettingsStore(timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    let unlisten: (() => void) | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      unlisten?.();
      resolve();
    };

    const timer = window.setTimeout(finish, timeoutMs);
    void listen(SETTINGS_STORE_READY_EVENT, finish).then((fn) => {
      unlisten = fn;
      if (settled) fn();
    });
  });
}

export function WallpaperApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [ready, setReady] = useState(false);
  const label = getCurrentWindow().label;
  const index = wallpaperIndexFromLabel(label);

  useEffect(() => {
    let cancelled = false;
    let pollId = 0;

    (async () => {
      // Primary wallpaper yields so settings can open the store without racing.
      if (label === "wallpaper") {
        await waitForSettingsStore(5000);
      } else {
        // Secondary windows are created after attach; a short yield is enough.
        await new Promise((r) => window.setTimeout(r, 100));
      }
      if (cancelled) return;

      const [s, list] = await Promise.all([
        loadSettings(),
        invoke<MonitorInfo[]>("wallpaper_list_monitors").catch(() => [] as MonitorInfo[]),
      ]);
      if (cancelled) return;
      setSettings(s);
      setMonitors(list);
      setReady(true);

      // Only the primary wallpaper window drives attach; others are spawned by it.
      try {
        if (s.wallpaperEnabled && label === "wallpaper") {
          const keys = enabledMonitorKeys(s, list);
          if (keys.length === 0) await invoke("wallpaper_detach");
          else await invoke("wallpaper_attach", { enabledKeys: keys });
        }
      } catch (e) {
        console.warn("wallpaper attach", e);
      }

      pollId = window.setInterval(async () => {
        const [next, nextList] = await Promise.all([
          loadSettings(),
          invoke<MonitorInfo[]>("wallpaper_list_monitors").catch(() => null),
        ]);
        setSettings((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
        if (nextList) {
          setMonitors((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(nextList)) return prev;
            return nextList;
          });
        }
      }, 2000);
    })();

    const unlisten = listen<AppSettings>("settings-updated", (event) => {
      setSettings(event.payload);
    });

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
      if (pollId) clearInterval(pollId);
    };
  }, [label]);

  const monitorKey = monitors[index]?.key ?? null;
  const displayEnabled = monitorKey
    ? getDisplaySettings(settings, monitorKey).enabled
    : true;
  const effectiveSettings: AppSettings = {
    ...settings,
    mapTheme: resolveMapThemeForDisplay(settings, monitorKey),
  };

  if (!ready || !settings.wallpaperEnabled || !displayEnabled) {
    return <div className="wallpaper-empty" />;
  }

  return (
    <div className="wallpaper-root">
      <Globe settings={effectiveSettings} />
    </div>
  );
}
