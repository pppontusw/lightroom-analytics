/**
 * Theme playground: default values and helpers for runtime color overrides.
 * Tokens match CSS custom properties in index.css (@theme + :root).
 */

/** All color tokens that vary per theme (surfaces, text, accent, semantic, borders, controls, chart). */
export type ThemeTokenSet = Record<string, string>;

/** Ordered list of every theme token key. Single source of truth for applying a full theme. */
export const THEME_TOKEN_KEYS: readonly string[] = [
  "surface-base",
  "surface-raised",
  "surface-elevated",
  "surface-inset",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-muted",
  "accent",
  "accent-hover",
  "accent-muted",
  "accent-text",
  "success",
  "warning",
  "destructive",
  "border",
  "border-subtle",
  "border-emphasis",
  "border-focus",
  "control-bg",
  "control-border",
  "control-hover-border",
  "control-focus-ring",
  ...Array.from({ length: 10 }, (_, i) => `chart-${i + 1}`),
];

/** Solid color tokens that can be overridden via color picker (no rgba/hsla alpha). */
export const THEME_TOKEN_SECTIONS = [
  {
    label: "Surfaces",
    tokens: [
      { key: "surface-base", label: "Base" },
      { key: "surface-raised", label: "Raised" },
      { key: "surface-elevated", label: "Elevated" },
      { key: "surface-inset", label: "Inset" },
    ],
  },
  {
    label: "Text",
    tokens: [
      { key: "text-primary", label: "Primary" },
      { key: "text-secondary", label: "Secondary" },
      { key: "text-tertiary", label: "Tertiary" },
      { key: "text-muted", label: "Muted" },
    ],
  },
  {
    label: "Accent",
    tokens: [
      { key: "accent", label: "Accent" },
      { key: "accent-hover", label: "Hover" },
      { key: "accent-muted", label: "Muted" },
      { key: "accent-text", label: "Text on accent" },
    ],
  },
  {
    label: "Semantic",
    tokens: [
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "destructive", label: "Destructive" },
    ],
  },
  {
    label: "Charts",
    tokens: Array.from({ length: 10 }, (_, i) => ({
      key: `chart-${i + 1}`,
      label: `Chart ${i + 1}`,
    })),
  },
  {
    label: "Controls",
    tokens: [{ key: "control-bg", label: "Background" }],
  },
] as const;

/** Default (dark) theme values (mirrors index.css). Used for reset and for initial picker display. */
export const DEFAULT_THEME: ThemeTokenSet = {
  "surface-base": "hsl(30, 3%, 8%)",
  "surface-raised": "hsl(30, 3%, 11%)",
  "surface-elevated": "hsl(30, 3%, 14%)",
  "surface-inset": "hsl(30, 3%, 6%)",
  "text-primary": "hsl(35, 15%, 88%)",
  "text-secondary": "hsl(30, 8%, 62%)",
  "text-tertiary": "hsl(30, 5%, 45%)",
  "text-muted": "hsl(30, 3%, 32%)",
  accent: "hsl(35, 85%, 55%)",
  "accent-hover": "hsl(35, 85%, 62%)",
  "accent-muted": "hsl(35, 40%, 20%)",
  "accent-text": "hsl(30, 3%, 8%)",
  success: "hsl(145, 50%, 45%)",
  warning: "hsl(40, 70%, 50%)",
  destructive: "hsl(0, 55%, 50%)",
  border: "rgba(255, 245, 230, 0.08)",
  "border-subtle": "rgba(255, 245, 230, 0.05)",
  "border-emphasis": "rgba(255, 245, 230, 0.14)",
  "border-focus": "hsla(35, 85%, 55%, 0.5)",
  "control-bg": "hsl(30, 3%, 6%)",
  "control-border": "rgba(255, 245, 230, 0.10)",
  "control-hover-border": "rgba(255, 245, 230, 0.18)",
  "control-focus-ring": "hsla(35, 85%, 55%, 0.4)",
  "chart-1": "hsl(35, 85%, 55%)",
  "chart-2": "hsl(210, 20%, 62%)",
  "chart-3": "hsl(35, 30%, 72%)",
  "chart-4": "hsl(160, 35%, 48%)",
  "chart-5": "hsl(350, 35%, 55%)",
  "chart-6": "hsl(270, 25%, 58%)",
  "chart-7": "hsl(55, 50%, 50%)",
  "chart-8": "hsl(190, 30%, 50%)",
  "chart-9": "hsl(15, 50%, 52%)",
  "chart-10": "hsl(100, 25%, 48%)",
};

/** Tokens that have a Tailwind @theme twin (--color-*). We set both when applying. */
const TAILWIND_COLOR_KEYS = new Set([
  "surface-base",
  "surface-raised",
  "surface-elevated",
  "surface-inset",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-muted",
  "accent",
  "accent-hover",
  "accent-muted",
  "accent-text",
  "success",
  "warning",
  "destructive",
  ...Array.from({ length: 10 }, (_, i) => `chart-${i + 1}`),
]);

/**
 * Parse user input to a valid #rrggbb hex, or null if invalid.
 * Accepts #rgb, #rrggbb, rgb, rrggbb (3 or 6 hex digits).
 */
export function normalizeHexInput(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[0] + s[0];
    const g = s[1] + s[1];
    const b = s[2] + s[2];
    return `#${r}${g}${b}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return `#${s}`;
  }
  return null;
}

/**
 * Convert a CSS color string (hsl(...) or #rrggbb) to #rrggbb for display.
 */
export function cssColorToHex(css: string): string {
  const t = css.trim();
  if (!t) return "#000000";

  const hexMatch = t.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    if (h.length === 3) {
      return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    }
    return `#${h}`;
  }

  const hslMatch = t.match(
    /^hsl\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/
  );
  if (hslMatch) {
    const h = Number(hslMatch[1]) / 360;
    const s = Number(hslMatch[2]) / 100;
    const l = Number(hslMatch[3]) / 100;
    const { r, g, b } = hslToRgb(h, s, l);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  return "#000000";
}

function hslToRgb(
  h: number,
  s: number,
  l: number
): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = Math.round(l * 255);
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = Math.round(hueToChannel(p, q, h + 1 / 3) * 255);
    g = Math.round(hueToChannel(p, q, h) * 255);
    b = Math.round(hueToChannel(p, q, h - 1 / 3) * 255);
  }
  return { r, g, b };
}

function hueToChannel(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

/**
 * Apply a single token value to the document. Sets both --token and --color-token when applicable.
 */
export function applyTokenToDocument(key: string, value: string): void {
  const root = document.documentElement;
  root.style.setProperty(`--${key}`, value);
  if (TAILWIND_COLOR_KEYS.has(key)) {
    root.style.setProperty(`--color-${key}`, value);
  }
}

/**
 * Remove a single token override from the document (revert to stylesheet).
 */
export function removeTokenFromDocument(key: string): void {
  const root = document.documentElement;
  root.style.removeProperty(`--${key}`);
  if (TAILWIND_COLOR_KEYS.has(key)) {
    root.style.removeProperty(`--color-${key}`);
  }
}

/**
 * Apply a full theme token set to the document. Sets every key in THEME_TOKEN_KEYS.
 * Use this when switching theme or mode; then apply overrides on top if any.
 */
export function applyThemeToDocument(theme: ThemeTokenSet): void {
  const root = document.documentElement;
  for (const key of THEME_TOKEN_KEYS) {
    const value = theme[key];
    if (value != null) {
      root.style.setProperty(`--${key}`, value);
      if (TAILWIND_COLOR_KEYS.has(key)) {
        root.style.setProperty(`--color-${key}`, value);
      }
    }
  }
}

export const THEME_STORAGE_KEY = "lightroom-analytics-theme";
