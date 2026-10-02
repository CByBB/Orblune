import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CITIES, type City } from "../data/cities";
import {
  formatLocalTime,
  formatTimeZoneAbbr,
  latLonToMapUV,
  subsolarPoint,
} from "../lib/sun";
import { formatTemp, fetchWeather, symbolToIcon, type WeatherSnapshot } from "../lib/weather";
import type { AppSettings } from "../lib/store";
import { resolveHome } from "../lib/store";
import { mapThemeIndex } from "../lib/mapThemes";
import {
  createFrameProbe,
  getStoredGraphicsMode,
  GRAPHICS_MODE_EVENT,
  initialGraphicsMode,
  loopConfigFor,
  setStoredGraphicsMode,
  type GraphicsMode,
} from "../lib/graphicsMode";
import { mapFragmentShader, mapVertexShader, MAP_SHADER_REV } from "./shaders";

type MarkerData = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  timezone: string;
  isHome: boolean;
  showWeather: boolean;
};

type GlobeProps = {
  settings: AppSettings;
  preview?: boolean;
  className?: string;
};

function weatherSvg(icon: string): string {
  const stroke = "currentColor";
  switch (icon) {
    case "clear":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
    case "partly":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><circle cx="9" cy="10" r="3"/><path d="M8 17h9a3.5 3.5 0 0 0 .2-7 4.5 4.5 0 0 0-8.4-1.2A3.2 3.2 0 0 0 8 17z"/></svg>`;
    case "cloud":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><path d="M7 18h10a4 4 0 0 0 .3-8 5 5 0 0 0-9.5-1.5A3.5 3.5 0 0 0 7 18z"/></svg>`;
    case "rain":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><path d="M7 15h10a4 4 0 0 0 .3-8 5 5 0 0 0-9.5-1.5A3.5 3.5 0 0 0 7 15z"/><path d="M9 18l-1 2M13 18l-1 2M17 18l-1 2"/></svg>`;
    case "snow":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><path d="M7 14h10a4 4 0 0 0 .3-8 5 5 0 0 0-9.5-1.5A3.5 3.5 0 0 0 7 14z"/><path d="M9 17h.01M13 19h.01M17 17h.01"/></svg>`;
    case "thunder":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><path d="M7 14h10a4 4 0 0 0 .3-8 5 5 0 0 0-9.5-1.5A3.5 3.5 0 0 0 7 14z"/><path d="M12 14l-2 4h3l-1 3"/></svg>`;
    case "fog":
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><path d="M4 10h16M5 14h14M7 18h10"/></svg>`;
    default:
      return `<svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.8"><circle cx="12" cy="12" r="3"/></svg>`;
  }
}

function loadTexture(url: string, anisotropy: number): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(anisotropy, 8);
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      reject,
    );
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/** Equirectangular map aspect (width / height). */
const MAP_ASPECT = 2;

function fitMapRect(
  viewW: number,
  viewH: number,
  mode: "contain" | "cover",
): { x: number; y: number; w: number; h: number } {
  const viewAspect = viewW / Math.max(viewH, 1);
  if (mode === "cover") {
    return { x: 0, y: 0, w: viewW, h: viewH };
  }
  if (viewAspect > MAP_ASPECT) {
    const h = viewH;
    const w = h * MAP_ASPECT;
    return { x: (viewW - w) / 2, y: 0, w, h };
  }
  const w = viewW;
  const h = w / MAP_ASPECT;
  return { x: 0, y: (viewH - h) / 2, w, h };
}

function frustumForView(viewW: number, viewH: number) {
  const viewAspect = viewW / Math.max(viewH, 1);
  if (viewAspect >= MAP_ASPECT) {
    const halfH = 1 / viewAspect;
    return { left: -1, right: 1, top: halfH, bottom: -halfH };
  }
  const halfW = 0.5 * viewAspect;
  return { left: -halfW, right: halfW, top: 0.5, bottom: -0.5 };
}

function latLonToNormal(lat: number, lon: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  const x = -Math.sin(phi) * Math.cos(theta);
  const z = Math.sin(phi) * Math.sin(theta);
  const y = Math.cos(phi);
  return [x, y, z];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** CPU day/night composite at modest resolution (compatibility mode). */
function compositeDayNight(
  day: HTMLImageElement,
  night: HTMLImageElement,
  sun: { lat: number; lon: number },
  target: HTMLCanvasElement,
  twilight = 0.22,
): void {
  const w = target.width;
  const h = target.height;
  const ctx = target.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const wctx = work.getContext("2d", { willReadFrequently: true });
  if (!wctx) return;

  wctx.drawImage(day, 0, 0, w, h);
  const dayData = wctx.getImageData(0, 0, w, h);
  wctx.drawImage(night, 0, 0, w, h);
  const nightData = wctx.getImageData(0, 0, w, h);

  const out = ctx.createImageData(w, h);
  const d = dayData.data;
  const n = nightData.data;
  const o = out.data;
  const sunN = latLonToNormal(sun.lat, sun.lon);
  const twHi = twilight * 1.35;

  for (let y = 0; y < h; y++) {
    const lat = 90 - (y / (h - 1)) * 180;
    for (let x = 0; x < w; x++) {
      const lon = (x / (w - 1)) * 360 - 180;
      const p = latLonToNormal(lat, lon);
      const ndotl = p[0] * sunN[0] + p[1] * sunN[1] + p[2] * sunN[2];
      const f = smoothstep(-twilight, twHi, ndotl);
      const i = (y * w + x) * 4;
      // Night texture is city lights; blend a darkened day with lights.
      const nr = Math.min(255, d[i]! * 0.18 + n[i]! * 1.55);
      const ng = Math.min(255, d[i + 1]! * 0.2 + n[i + 1]! * 1.55);
      const nb = Math.min(255, d[i + 2]! * 0.28 + n[i + 2]! * 1.55);
      o[i] = d[i]! * f + nr * (1 - f);
      o[i + 1] = d[i + 1]! * f + ng * (1 - f);
      o[i + 2] = d[i + 2]! * f + nb * (1 - f);
      o[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
}

export function Globe({ settings, preview = false, className }: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const mapMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const [mode, setMode] = useState<GraphicsMode>(() => initialGraphicsMode());
  settingsRef.current = settings;

  useEffect(() => {
    const apply = (next: GraphicsMode) => {
      setMode((prev) => (prev === next ? prev : next));
    };
    const onMode = (e: Event) => {
      const detail = (e as CustomEvent<GraphicsMode>).detail;
      if (detail) apply(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== "orblune.graphicsMode") return;
      const stored = getStoredGraphicsMode();
      if (stored) apply(stored);
    };
    window.addEventListener(GRAPHICS_MODE_EVENT, onMode);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(GRAPHICS_MODE_EVENT, onMode);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Apply theme immediately when settings change (GPU paths only)
  useEffect(() => {
    const mat = mapMatRef.current;
    if (!mat?.uniforms?.themeIndex) return;
    const theme = settings.premium ? mapThemeIndex(settings.mapTheme ?? "natural") : 0;
    mat.uniforms.themeIndex.value = theme;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (renderer && scene && camera) renderer.render(scene, camera);
  }, [settings.premium, settings.mapTheme]);

  useEffect(() => {
    const rootEl = mountRef.current;
    const labelLayerEl = labelsRef.current;
    if (!rootEl || !labelLayerEl) return;
    const root: HTMLDivElement = rootEl;
    const labelLayer: HTMLDivElement = labelLayerEl;

    let disposed = false;
    const weatherCache = new Map<string, WeatherSnapshot>();
    const weatherInflight = new Set<string>();
    let raf = 0;
    let poll = 0;
    let weatherPoll = 0;
    let ro: ResizeObserver | null = null;
    let mapRect = { x: 0, y: 0, w: 1, h: 1 };
    let viewBox = { w: 1, h: 1 };
    const cfg = loopConfigFor(mode, preview);

    function degradeTo(next: GraphicsMode) {
      if (disposed || next === mode) return;
      setStoredGraphicsMode(next, { manual: false });
      setMode(next);
    }

    function buildMarkers(s: AppSettings): MarkerData[] {
      const home = resolveHome(s);
      const markers: MarkerData[] = [
        {
          id: `home:${home.id}`,
          name: home.name,
          lat: home.lat,
          lon: home.lon,
          timezone: home.timezone,
          isHome: true,
          showWeather: true,
        },
      ];
      for (const id of s.enabledCityIds) {
        if (id === home.id) continue;
        const city = CITIES.find((c: City) => c.id === id);
        if (!city) continue;
        markers.push({
          id: city.id,
          name: city.name,
          lat: city.lat,
          lon: city.lon,
          timezone: city.timezone,
          isHome: false,
          showWeather: true,
        });
      }
      if (preview) {
        const extras = markers.filter((m) => !m.isHome);
        return [markers[0]!, ...extras.slice(0, 6)];
      }
      return markers;
    }

    function updateLabelContent(el: HTMLElement, m: MarkerData, s: AppSettings, now: Date) {
      const showSeconds = Boolean(s.premium && s.showSeconds);
      const timeEl = el.querySelector(".city-time");
      if (timeEl) timeEl.textContent = formatLocalTime(now, m.timezone, s.hour12, showSeconds);
      const nameEl = el.querySelector(".city-name");
      if (nameEl) nameEl.textContent = m.name;
      const tzEl = el.querySelector(".city-tz");
      if (tzEl) tzEl.textContent = formatTimeZoneAbbr(now, m.timezone);
      const weatherEl = el.querySelector(".city-weather");
      if (!(weatherEl instanceof HTMLElement)) return;
      const w = weatherCache.get(m.id);
      if (!w) {
        weatherEl.innerHTML = `<span class="city-weather-slot" aria-hidden="true">&nbsp;</span>`;
        weatherEl.dataset.empty = "1";
        return;
      }
      weatherEl.dataset.empty = "0";
      weatherEl.innerHTML = `${weatherSvg(symbolToIcon(w.symbol))}<span>${formatTemp(w.temperatureC, s.tempUnit)}</span>`;
    }

    function placeLabel(el: HTMLElement, lat: number, lon: number) {
      el.dataset.lat = String(lat);
      el.dataset.lon = String(lon);
      const { u, v } = latLonToMapUV(lat, lon);
      const x = u * 2 - 1;
      const y = 0.5 - v;
      const fr = frustumForView(viewBox.w, viewBox.h);
      const spanX = fr.right - fr.left;
      const spanY = fr.top - fr.bottom;
      if (spanX === 0 || spanY === 0) return;

      const nx = (x - fr.left) / spanX;
      const ny = (fr.top - y) / spanY;
      const left = nx * 100;
      const top = ny * 100;
      const onScreen = nx >= -0.02 && nx <= 1.02 && ny >= -0.05 && ny <= 1.05;

      el.dataset.baseLeft = String(left);
      el.dataset.baseTop = String(top);
      el.style.left = `${left}%`;
      el.style.top = `${top}%`;
      el.style.transform = "translate(-50%, calc(-100% - 14px))";
      el.style.opacity = onScreen ? "1" : "0";
      el.style.visibility = onScreen ? "visible" : "hidden";
    }

    function layoutLabelsExact() {
      const markers = buildMarkers(settingsRef.current);
      for (const node of Array.from(labelLayer.querySelectorAll(".city-label"))) {
        if (!(node instanceof HTMLElement)) continue;
        const id = node.dataset.id;
        const m = id ? markers.find((x) => x.id === id) : undefined;
        const lat = m?.lat ?? Number(node.dataset.lat);
        const lon = m?.lon ?? Number(node.dataset.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        placeLabel(node, lat, lon);
      }
    }

    function requestWeather(m: MarkerData) {
      if (!m.showWeather) return;
      const cached = weatherCache.get(m.id);
      if (cached && cached.expiresAt > Date.now()) return;
      if (weatherInflight.has(m.id)) return;
      weatherInflight.add(m.id);
      fetchWeather(m.lat, m.lon).then((w) => {
        weatherInflight.delete(m.id);
        if (disposed) return;
        if (w) weatherCache.set(m.id, w);
        const node = labelLayer.querySelector(`[data-id="${m.id.replace(/"/g, "")}"]`);
        if (node instanceof HTMLElement) {
          updateLabelContent(node, m, settingsRef.current, new Date());
        }
      });
    }

    function rebuildLabels(s: AppSettings) {
      labelLayer.replaceChildren();
      const now = new Date();
      for (const m of buildMarkers(s)) {
        const el = document.createElement("div");
        el.className = `city-label${m.isHome ? " home" : ""}`;
        el.dataset.id = m.id;
        el.innerHTML =
          `<div class="city-label-inner"><span class="city-time"></span><div class="city-meta"><span class="city-name"></span><span class="city-tz"></span></div><span class="city-weather"></span></div>`;
        updateLabelContent(el, m, s, now);
        labelLayer.appendChild(el);
        placeLabel(el, m.lat, m.lon);
        requestWeather(m);
      }
      requestAnimationFrame(() => layoutLabelsExact());
    }

    function syncLabelLayer() {
      const viewW = Math.max(1, root.clientWidth);
      const viewH = Math.max(1, root.clientHeight);
      viewBox = { w: viewW, h: viewH };
      mapRect = fitMapRect(viewW, viewH, "cover");
      labelLayer.style.left = `${mapRect.x}px`;
      labelLayer.style.top = `${mapRect.y}px`;
      labelLayer.style.width = `${mapRect.w}px`;
      labelLayer.style.height = `${mapRect.h}px`;
      layoutLabelsExact();
    }

    // ——— Compatibility path (Canvas 2D) ———
    if (mode === "compat") {
      const canvas = document.createElement("canvas");
      canvas.className = "map-stage";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      root.appendChild(canvas);
      const mapCanvas = document.createElement("canvas");
      // Modest bake size keeps CPU cost low on weak machines.
      mapCanvas.width = preview ? 1024 : 1280;
      mapCanvas.height = preview ? 512 : 640;

      let dayImg: HTMLImageElement | null = null;
      let nightImg: HTMLImageElement | null = null;
      let lastSunKey = "";
      let timeAcc = 0;
      let lastLabelCheckMs = 0;
      let lastClockBucket = -1;
      let lastTs = performance.now();

      function paint() {
        const viewW = Math.max(1, root.clientWidth);
        const viewH = Math.max(1, root.clientHeight);
        const dpr = Math.min(window.devicePixelRatio || 1, cfg.maxDpr);
        canvas.width = Math.round(viewW * dpr);
        canvas.height = Math.round(viewH * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#03060c";
        ctx.fillRect(0, 0, viewW, viewH);
        if (!dayImg || !nightImg) return;

        const fr = frustumForView(viewW, viewH);
        // Same crop as WebGL orthographic cover of the 2×1 plane.
        const srcW = mapCanvas.width;
        const srcH = mapCanvas.height;
        const u0 = (fr.left + 1) / 2;
        const u1 = (fr.right + 1) / 2;
        const v0 = (0.5 - fr.top) / 1;
        const v1 = (0.5 - fr.bottom) / 1;
        const sx = u0 * srcW;
        const sy = v0 * srcH;
        const sw = Math.max(1, (u1 - u0) * srcW);
        const sh = Math.max(1, (v1 - v0) * srcH);
        ctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, viewW, viewH);
      }

      function bakeIfNeeded(force = false) {
        if (!dayImg || !nightImg) return;
        const sun = subsolarPoint();
        const key = `${sun.lat.toFixed(2)},${sun.lon.toFixed(2)}`;
        if (!force && key === lastSunKey) return;
        lastSunKey = key;
        compositeDayNight(dayImg, nightImg, sun, mapCanvas);
        paint();
      }

      const animate = (ts: number) => {
        raf = requestAnimationFrame(animate);
        if (disposed) return;
        const dt = (ts - lastTs) / 1000;
        lastTs = ts;
        timeAcc += dt;
        if (timeAcc < 1 / cfg.renderFps) return;
        timeAcc %= 1 / cfg.renderFps;

        bakeIfNeeded(false);

        const s = settingsRef.current;
        const showSeconds = Boolean(s.premium && s.showSeconds);
        labelLayer.dataset.labelSize = s.labelSize ?? "medium";
        labelLayer.dataset.showSeconds = showSeconds ? "true" : "false";

        const now = new Date();
        const checkMs = showSeconds ? 250 : cfg.labelCheckMs;
        if (now.getTime() - lastLabelCheckMs > checkMs) {
          lastLabelCheckMs = now.getTime();
          const clockBucket = showSeconds
            ? Math.floor(now.getTime() / 1000)
            : Math.floor(now.getTime() / 60_000);
          if (clockBucket !== lastClockBucket) {
            lastClockBucket = clockBucket;
            const markers = buildMarkers(s);
            for (const node of Array.from(labelLayer.querySelectorAll(".city-label"))) {
              if (!(node instanceof HTMLElement)) continue;
              const id = node.dataset.id;
              if (!id) continue;
              const m = markers.find((x) => x.id === id);
              if (!m) continue;
              updateLabelContent(node, m, s, now);
            }
            if (!showSeconds || clockBucket % 60 === 0) layoutLabelsExact();
          }
        }
      };

      syncLabelLayer();
      ro = new ResizeObserver(() => {
        syncLabelLayer();
        paint();
      });
      ro.observe(root);
      rebuildLabels(settingsRef.current);
      labelLayer.dataset.labelSize = settingsRef.current.labelSize ?? "medium";
      animate(performance.now());

      let lastJson = JSON.stringify(settingsRef.current);
      poll = window.setInterval(() => {
        const json = JSON.stringify(settingsRef.current);
        if (json !== lastJson) {
          lastJson = json;
          rebuildLabels(settingsRef.current);
        }
      }, cfg.settingsPollMs);

      weatherPoll = window.setInterval(() => {
        for (const m of buildMarkers(settingsRef.current)) requestWeather(m);
      }, cfg.weatherRefreshMs);

      void (async () => {
        try {
          const [day, night] = await Promise.all([
            loadImage("/textures/earth-day.jpg"),
            loadImage("/textures/earth-night.jpg"),
          ]);
          if (disposed) return;
          dayImg = day;
          nightImg = night;
          bakeIfNeeded(true);
        } catch (err) {
          console.error("Earth texture load failed (compat)", err);
        }
      })();

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        if (poll) clearInterval(poll);
        if (weatherPoll) clearInterval(weatherPoll);
        ro?.disconnect();
        labelLayer.replaceChildren();
        if (canvas.parentElement === root) root.removeChild(canvas);
      };
    }

    // ——— WebGL path (gpu / gpu-lite) ———
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03060c);

    const camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.1, 10);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: cfg.antialias,
        alpha: false,
        powerPreference: preview ? "default" : "low-power",
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      console.warn("WebGL unavailable, switching to compatibility mode", err);
      degradeTo("compat");
      return () => {
        disposed = true;
      };
    }

    renderer.setClearColor(0x03060c, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.maxDpr));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "map-stage";
    root.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const sunUniform = { value: new THREE.Vector2(0, 0) };
    const themeIndexUniform = { value: 0 };
    const placeholder = new THREE.MeshBasicMaterial({ color: 0x0d2848 });
    const mapMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1, 1, 1),
      placeholder as THREE.Material,
    );
    scene.add(mapMesh);

    if (cfg.starCount > 0) {
      const count = cfg.starCount;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 8;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 5;
        positions[i * 3 + 2] = -1;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      scene.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({ color: 0xffffff, size: 0.02, sizeAttenuation: true }),
        ),
      );
    }

    let dayTex: THREE.Texture | null = null;
    let nightTex: THREE.Texture | null = null;
    let cloudTex: THREE.Texture | null = null;
    let mapMat: THREE.ShaderMaterial | null = null;
    const probe = createFrameProbe(mode);
    let probing = false;

    function syncCameraToViewport() {
      const viewW = Math.max(1, root.clientWidth);
      const viewH = Math.max(1, root.clientHeight);
      viewBox = { w: viewW, h: viewH };
      mapRect = fitMapRect(viewW, viewH, "cover");
      renderer.setSize(viewW, viewH, false);

      const fr = frustumForView(viewW, viewH);
      camera.left = fr.left;
      camera.right = fr.right;
      camera.top = fr.top;
      camera.bottom = fr.bottom;
      camera.updateProjectionMatrix();

      labelLayer.style.left = `${mapRect.x}px`;
      labelLayer.style.top = `${mapRect.y}px`;
      labelLayer.style.width = `${mapRect.w}px`;
      labelLayer.style.height = `${mapRect.h}px`;
      layoutLabelsExact();
    }

    const clock = new THREE.Clock();
    let timeAcc = 0;
    let lastLabelCheckMs = 0;
    let lastClockBucket = -1;
    const frameDt = 1 / cfg.renderFps;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (disposed) return;
      const dt = clock.getDelta();
      timeAcc += dt;
      if (timeAcc < frameDt) return;
      timeAcc %= frameDt;

      const s = settingsRef.current;
      const sun = subsolarPoint();
      const showSeconds = Boolean(s.premium && s.showSeconds);

      labelLayer.dataset.labelSize = s.labelSize ?? "medium";
      labelLayer.dataset.showSeconds = showSeconds ? "true" : "false";

      if (mapMat) {
        if (mapMat.userData.shaderRev !== MAP_SHADER_REV && dayTex && nightTex && cloudTex) {
          const prev = mapMat;
          mapMat = new THREE.ShaderMaterial({
            uniforms: {
              dayMap: { value: dayTex },
              nightMap: { value: nightTex },
              cloudMap: { value: cloudTex },
              sunLatLon: sunUniform,
              twilightWidth: { value: 0.22 },
              cloudOpacity: { value: 0.15 },
              themeIndex: { value: s.premium ? mapThemeIndex(s.mapTheme ?? "natural") : 0 },
            },
            vertexShader: mapVertexShader,
            fragmentShader: mapFragmentShader,
          });
          mapMat.userData.shaderRev = MAP_SHADER_REV;
          mapMatRef.current = mapMat;
          mapMesh.material = mapMat;
          prev.dispose();
        }
        mapMat.uniforms.sunLatLon.value.set(sun.lat, sun.lon);
        mapMat.uniforms.themeIndex.value = s.premium ? mapThemeIndex(s.mapTheme ?? "natural") : 0;
      }

      const now = new Date();
      const checkMs = showSeconds ? 250 : cfg.labelCheckMs;
      if (now.getTime() - lastLabelCheckMs > checkMs) {
        lastLabelCheckMs = now.getTime();
        const clockBucket = showSeconds
          ? Math.floor(now.getTime() / 1000)
          : Math.floor(now.getTime() / 60_000);
        if (clockBucket !== lastClockBucket) {
          lastClockBucket = clockBucket;
          const markers = buildMarkers(s);
          for (const node of Array.from(labelLayer.querySelectorAll(".city-label"))) {
            if (!(node instanceof HTMLElement)) continue;
            const id = node.dataset.id;
            if (!id) continue;
            const m = markers.find((x) => x.id === id);
            if (!m) continue;
            updateLabelContent(node, m, s, now);
          }
          if (!showSeconds || clockBucket % 60 === 0) {
            layoutLabelsExact();
          }
        }
      }

      const t0 = performance.now();
      renderer.render(scene, camera);
      if (probing) {
        const next = probe.sample(performance.now() - t0);
        if (next) {
          probing = false;
          console.info(`[Orblune] Graphics auto-adjusted to ${next}`);
          degradeTo(next);
        }
      }
    };

    syncCameraToViewport();
    ro = new ResizeObserver(() => {
      syncCameraToViewport();
    });
    ro.observe(root);

    rebuildLabels(settingsRef.current);
    labelLayer.dataset.labelSize = settingsRef.current.labelSize ?? "medium";
    animate();

    let lastJson = JSON.stringify(settingsRef.current);
    poll = window.setInterval(() => {
      const json = JSON.stringify(settingsRef.current);
      if (json !== lastJson) {
        lastJson = json;
        rebuildLabels(settingsRef.current);
      }
    }, cfg.settingsPollMs);

    weatherPoll = window.setInterval(() => {
      for (const m of buildMarkers(settingsRef.current)) {
        requestWeather(m);
      }
    }, cfg.weatherRefreshMs);

    void (async () => {
      try {
        const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), cfg.anisotropy);
        const [day, night, clouds] = await Promise.all([
          loadTexture("/textures/earth-day.jpg", aniso),
          loadTexture("/textures/earth-night.jpg", aniso),
          loadTexture("/textures/earth-clouds.jpg", aniso),
        ]);
        if (disposed) {
          day.dispose();
          night.dispose();
          clouds.dispose();
          return;
        }
        day.wrapS = THREE.RepeatWrapping;
        day.wrapT = THREE.ClampToEdgeWrapping;
        night.wrapS = THREE.RepeatWrapping;
        night.wrapT = THREE.ClampToEdgeWrapping;
        clouds.wrapS = THREE.RepeatWrapping;
        clouds.wrapT = THREE.ClampToEdgeWrapping;
        dayTex = day;
        nightTex = night;
        cloudTex = clouds;
        mapMat = new THREE.ShaderMaterial({
          uniforms: {
            dayMap: { value: day },
            nightMap: { value: night },
            cloudMap: { value: clouds },
            sunLatLon: sunUniform,
            twilightWidth: { value: 0.22 },
            cloudOpacity: { value: 0.15 },
            themeIndex: themeIndexUniform,
          },
          vertexShader: mapVertexShader,
          fragmentShader: mapFragmentShader,
        });
        mapMat.userData.shaderRev = MAP_SHADER_REV;
        const s0 = settingsRef.current;
        mapMat.uniforms.themeIndex.value = s0.premium ? mapThemeIndex(s0.mapTheme ?? "natural") : 0;
        mapMatRef.current = mapMat;
        mapMesh.material = mapMat;
        placeholder.dispose();
        renderer.render(scene, camera);
        probing = true;
      } catch (err) {
        console.error("Earth texture load failed", err);
        degradeTo("compat");
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (poll) clearInterval(poll);
      if (weatherPoll) clearInterval(weatherPoll);
      ro?.disconnect();
      mapMatRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      dayTex?.dispose();
      nightTex?.dispose();
      cloudTex?.dispose();
      mapMesh.geometry.dispose();
      mapMat?.dispose();
      placeholder.dispose();
      labelLayer.replaceChildren();
      renderer.dispose();
      if (renderer.domElement.parentElement === root) {
        root.removeChild(renderer.domElement);
      }
    };
  }, [preview, mode]);

  return (
    <div
      ref={mountRef}
      className={className ?? "globe-root"}
      data-graphics={mode}
    >
      <div ref={labelsRef} className="map-labels" />
    </div>
  );
}
