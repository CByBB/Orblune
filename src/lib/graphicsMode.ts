/** Graphics quality tiers for the Earth map. */
export type GraphicsMode = "gpu" | "gpu-lite" | "compat";

const STORAGE_KEY = "orblune.graphicsMode";
const MANUAL_KEY = "orblune.graphicsModeManual";
export const GRAPHICS_MODE_EVENT = "orblune:graphics-mode";

export const GRAPHICS_MODE_OPTIONS: { value: GraphicsMode; label: string; hint: string }[] = [
  {
    value: "gpu",
    label: "High (GPU)",
    hint: "Richest themes and lighting. Uses more GPU.",
  },
  {
    value: "gpu-lite",
    label: "Balanced",
    hint: "Still GPU, lower load for everyday use.",
  },
  {
    value: "compat",
    label: "Compatibility",
    hint: "Safest on weak PCs. Simpler map, lowest load.",
  },
];

export function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false }) ||
      canvas.getContext("webgl", { failIfMajorPerformanceCaveat: false });
    if (!gl) return false;
    const lose = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    lose?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function getStoredGraphicsMode(): GraphicsMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "gpu" || v === "gpu-lite" || v === "compat") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function isGraphicsModeManual(): boolean {
  try {
    return localStorage.getItem(MANUAL_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoredGraphicsMode(
  mode: GraphicsMode,
  opts: { manual?: boolean } = {},
): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    if (opts.manual) localStorage.setItem(MANUAL_KEY, "1");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(GRAPHICS_MODE_EVENT, { detail: mode }));
}

/** First paint choice: stored preference, else WebGL probe. */
export function initialGraphicsMode(): GraphicsMode {
  if (!detectWebGL()) return "compat";
  return getStoredGraphicsMode() ?? "gpu";
}

export function graphicsModeLabel(mode: GraphicsMode): string {
  switch (mode) {
    case "gpu":
      return "High (GPU)";
    case "gpu-lite":
      return "Balanced";
    case "compat":
      return "Compatibility";
  }
}

export type LoopConfig = {
  renderFps: number;
  labelCheckMs: number;
  settingsPollMs: number;
  maxDpr: number;
  antialias: boolean;
  starCount: number;
  weatherRefreshMs: number;
  anisotropy: number;
};

export function loopConfigFor(mode: GraphicsMode, preview: boolean): LoopConfig {
  const weatherRefreshMs = 15 * 60 * 1000;
  if (mode === "compat") {
    return {
      renderFps: preview ? 4 : 2,
      labelCheckMs: preview ? 1000 : 2000,
      settingsPollMs: preview ? 800 : 1200,
      maxDpr: 1,
      antialias: false,
      starCount: 0,
      weatherRefreshMs,
      anisotropy: 1,
    };
  }
  if (mode === "gpu-lite") {
    return {
      renderFps: preview ? 20 : 8,
      labelCheckMs: preview ? 1000 : 2000,
      settingsPollMs: preview ? 700 : 1200,
      maxDpr: 1,
      antialias: false,
      starCount: preview ? 40 : 0,
      weatherRefreshMs,
      anisotropy: 1,
    };
  }
  return {
    renderFps: preview ? 30 : 12,
    labelCheckMs: preview ? 1000 : 2000,
    settingsPollMs: preview ? 600 : 1000,
    maxDpr: preview ? 2 : 1.5,
    antialias: preview,
    starCount: preview ? 200 : 400,
    weatherRefreshMs,
    anisotropy: preview ? 8 : 4,
  };
}

/** After textures are up, sample render cost and suggest a lower tier. */
export function createFrameProbe(mode: GraphicsMode) {
  const samples: number[] = [];
  const maxSamples = 24;
  let decided = false;

  return {
    /** Pass milliseconds spent in renderer.render (or full frame work). */
    sample(ms: number) {
      // Respect an explicit user choice from Settings.
      if (isGraphicsModeManual() || decided || mode === "compat") return null;
      if (!Number.isFinite(ms) || ms < 0) return null;
      samples.push(ms);
      if (samples.length < maxSamples) return null;
      decided = true;
      const sorted = samples.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      if (mode === "gpu" && median > 42) return "gpu-lite" as const;
      if (mode === "gpu-lite" && median > 70) return "compat" as const;
      return null;
    },
  };
}

export function nextHeavierMode(mode: GraphicsMode): GraphicsMode | null {
  if (mode === "compat") return "gpu-lite";
  if (mode === "gpu-lite") return "gpu";
  return null;
}
