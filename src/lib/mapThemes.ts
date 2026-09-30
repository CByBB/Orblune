export type MapThemeId =
  | "natural"
  | "aqua"
  | "atlas"
  | "vivid"
  | "noir"
  | "ember"
  | "frost"
  | "verdant"
  | "ink"
  | "sand";

export type MapThemeOption = {
  id: MapThemeId;
  label: string;
  blurb: string;
};

/** Premium map looks — graded in-shader from the Natural Earth base. Order = shader themeIndex. */
export const MAP_THEMES: MapThemeOption[] = [
  { id: "natural", label: "Natural", blurb: "Classic shaded relief" },
  { id: "aqua", label: "Sea glass", blurb: "Soft teal oceans" },
  { id: "atlas", label: "Atlas", blurb: "Warm paper map" },
  { id: "vivid", label: "Vivid", blurb: "Bright satellite color" },
  { id: "noir", label: "Noir", blurb: "Cool monochrome" },
  { id: "ember", label: "Ember", blurb: "Warm dusk glow" },
  { id: "frost", label: "Frost", blurb: "Icy arctic blue" },
  { id: "verdant", label: "Verdant", blurb: "Lush green land" },
  { id: "ink", label: "Ink", blurb: "Deep navy chart" },
  { id: "sand", label: "Sand", blurb: "Desert parchment" },
];

export const DEFAULT_MAP_THEME: MapThemeId = "natural";

export function isMapThemeId(v: string): v is MapThemeId {
  return MAP_THEMES.some((t) => t.id === v);
}

/** Packed as float for the shader (order matches MAP_THEMES). */
export function mapThemeIndex(id: MapThemeId): number {
  const i = MAP_THEMES.findIndex((t) => t.id === id);
  return i < 0 ? 0 : i;
}
