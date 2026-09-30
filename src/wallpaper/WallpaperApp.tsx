import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Globe } from "./Globe";
import { loadSettings, type AppSettings, DEFAULT_SETTINGS } from "../lib/store";
import "../styles/globe.css";

export function WallpaperApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadSettings();
      if (!cancelled) {
        setSettings(s);
        setReady(true);
      }
      try {
        if (s.wallpaperEnabled) {
          await invoke("wallpaper_attach");
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
      const s = await loadSettings();
      setSettings((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(s)) return prev;
        return s;
      });
    }, 500);

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
      clearInterval(id);
    };
  }, []);

  if (!ready || !settings.wallpaperEnabled) {
    return <div className="wallpaper-empty" />;
  }

  return (
    <div className="wallpaper-root">
      <Globe settings={settings} />
    </div>
  );
}
