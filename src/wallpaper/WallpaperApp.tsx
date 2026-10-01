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
  type AppSettings,
  type MonitorInfo,
} from "../lib/store";
import "../styles/globe.css";

function wallpaperIndexFromLabel(label: string): number {
  if (label === "wallpaper") return 0;
  const m = /^wallpaper-(\d+)$/.exec(label);
  return m ? Number(m[1]) : 0;
}

export function WallpaperApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [ready, setReady] = useState(false);
  const label = getCurrentWindow().label;
  const index = wallpaperIndexFromLabel(label);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    })();

    const unlisten = listen<AppSettings>("settings-updated", (event) => {
      setSettings(event.payload);
    });

    // Poll settings as fallback when events are unavailable
    const id = window.setInterval(async () => {
      const [s, list] = await Promise.all([
        loadSettings(),
        invoke<MonitorInfo[]>("wallpaper_list_monitors").catch(() => null),
      ]);
      setSettings((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(s)) return prev;
        return s;
      });
      if (list) {
        setMonitors((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(list)) return prev;
          return list;
        });
      }
    }, 500);

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
      clearInterval(id);
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
