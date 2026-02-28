import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyThemeToDocument,
  applyTokenToDocument,
  THEME_STORAGE_KEY,
} from "./theme-utils";
import {
  getTheme,
  getDefaultThemeId,
  THEMES,
  type ThemeDefinition,
} from "./theme-definitions";

export type ThemeMode = "dark" | "light";

type ThemeOverrides = Record<string, string>;

type StoredTheme = {
  themeId?: string;
  mode?: ThemeMode;
  overrides?: ThemeOverrides;
};

function isLegacyOverridesShape(parsed: unknown): parsed is Record<string, string> {
  if (typeof parsed !== "object" || parsed === null) return false;
  const keys = Object.keys(parsed);
  if (keys.length === 0) return false;
  const sample = keys[0];
  return sample === "surface-base" || sample === "accent" || sample === "text-primary" || sample.startsWith("chart-");
}

function loadFromStorage(): {
  themeId: string;
  mode: ThemeMode;
  overrides: ThemeOverrides;
} {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) {
      return {
        themeId: getDefaultThemeId(),
        mode: "dark",
        overrides: {},
      };
    }
    const parsed = JSON.parse(raw) as StoredTheme | Record<string, string>;
    if (isLegacyOverridesShape(parsed)) {
      return {
        themeId: getDefaultThemeId(),
        mode: "dark",
        overrides: parsed,
      };
    }
    const stored = parsed as StoredTheme;
    const themeId =
      typeof stored.themeId === "string" && getTheme(stored.themeId)
        ? stored.themeId
        : getDefaultThemeId();
    const mode =
      stored.mode === "light" || stored.mode === "dark" ? stored.mode : "dark";
    const overrides =
      typeof stored.overrides === "object" && stored.overrides !== null
        ? (stored.overrides as ThemeOverrides)
        : {};
    return { themeId, mode, overrides };
  } catch {
    return {
      themeId: getDefaultThemeId(),
      mode: "dark",
      overrides: {},
    };
  }
}

function saveToStorage(themeId: string, mode: ThemeMode, overrides: ThemeOverrides): void {
  try {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ themeId, mode, overrides })
    );
  } catch {
    // ignore
  }
}

function applyThemeAndOverrides(
  theme: ThemeDefinition,
  mode: ThemeMode,
  overrides: ThemeOverrides
): void {
  const tokens = mode === "dark" ? theme.tokensDark : theme.tokensLight;
  applyThemeToDocument(tokens);
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (value != null) applyTokenToDocument(key, value);
  }
  document.documentElement.style.colorScheme = mode;
}

type ThemeContextValue = {
  themeId: string;
  mode: ThemeMode;
  themes: ThemeDefinition[];
  setThemeId: (id: string) => void;
  setMode: (mode: ThemeMode) => void;
  overrides: ThemeOverrides;
  setOverride: (key: string, value: string) => void;
  resetTheme: () => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadFromStorage);
  const { themeId, mode, overrides } = state;
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const theme = getTheme(themeId) ?? getTheme(getDefaultThemeId())!;

  useEffect(() => {
    applyThemeAndOverrides(theme, mode, overrides);
    saveToStorage(themeId, mode, overrides);
  }, [theme, themeId, mode, overrides]);

  const setThemeId = useCallback((id: string) => {
    if (getTheme(id)) setState((prev) => ({ ...prev, themeId: id }));
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setState((prev) => ({ ...prev, mode: next }));
  }, []);

  const setOverride = useCallback((key: string, value: string) => {
    setState((prev) => ({
      ...prev,
      overrides: { ...prev.overrides, [key]: value },
    }));
  }, []);

  const resetTheme = useCallback(() => {
    setState((prev) => ({ ...prev, overrides: {} }));
  }, []);

  const openPanel = useCallback(() => setIsPanelOpen(true), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);
  const togglePanel = useCallback(() => setIsPanelOpen((v) => !v), []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId,
      mode,
      themes: THEMES,
      setThemeId,
      setMode,
      overrides,
      setOverride,
      resetTheme,
      isPanelOpen,
      openPanel,
      closePanel,
      togglePanel,
    }),
    [
      themeId,
      mode,
      setThemeId,
      setMode,
      overrides,
      setOverride,
      resetTheme,
      isPanelOpen,
      openPanel,
      closePanel,
      togglePanel,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is the public API for theme context
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
