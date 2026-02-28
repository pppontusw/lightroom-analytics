import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme-context";
import { getTheme } from "@/lib/theme-definitions";
import {
  THEME_TOKEN_SECTIONS,
  DEFAULT_THEME,
  cssColorToHex,
  normalizeHexInput,
} from "@/lib/theme-utils";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 320;

export function ThemePanel() {
  const {
    themeId,
    mode,
    themes,
    setThemeId,
    setMode,
    overrides,
    setOverride,
    resetTheme,
    isPanelOpen,
    closePanel,
  } = useTheme();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const baseTokens = useMemo(() => {
    const theme = getTheme(themeId);
    if (!theme) return DEFAULT_THEME;
    return mode === "dark" ? theme.tokensDark : theme.tokensLight;
  }, [themeId, mode]);

  const effectiveValue = useCallback(
    (key: string) => overrides[key] ?? baseTokens[key] ?? DEFAULT_THEME[key] ?? "#000000",
    [overrides, baseTokens]
  );

  const displayHex = useCallback(
    (key: string) => drafts[key] ?? cssColorToHex(effectiveValue(key)),
    [drafts, effectiveValue]
  );

  const handleHexBlur = useCallback(
    (key: string, inputValue: string) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const hex = normalizeHexInput(inputValue);
      if (hex) setOverride(key, hex);
    },
    [setOverride]
  );

  const handleHexKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
    },
    []
  );

  useEffect(() => {
    if (!isPanelOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPanelOpen, closePanel]);

  const handleReset = useCallback(() => {
    resetTheme();
    setDrafts({});
  }, [resetTheme]);

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        style={{
          transitionDuration: "var(--duration-normal)",
          transitionTimingFunction: "var(--ease-out)",
        }}
        aria-hidden
        onClick={closePanel}
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 z-50 flex h-full flex-col border-l border-[var(--border)] bg-surface-elevated"
        style={{
          width: PANEL_WIDTH,
          transitionDuration: "var(--duration-normal)",
          transitionTimingFunction: "var(--ease-out)",
          boxShadow: "none",
        }}
        role="dialog"
        aria-label="Theme customizer"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <span className="type-h3 text-text-primary">Theme</span>
          <button
            type="button"
            onClick={closePanel}
            className="rounded-[var(--radius-sm)] p-1 text-text-tertiary transition-colors hover:bg-[var(--border-subtle)] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
            aria-label="Close theme panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-6">
            {/* Theme + mode */}
            <section>
              <h4 className="type-label mb-2 uppercase tracking-wider text-text-tertiary">
                Appearance
              </h4>
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="theme-select"
                    className="type-label mb-1 block text-text-tertiary"
                  >
                    Theme
                  </label>
                  <select
                    id="theme-select"
                    value={themeId}
                    onChange={(e) => setThemeId(e.target.value)}
                    className={cn(
                      "type-body w-full rounded-[var(--radius-sm)] border px-3 py-2",
                      "border-[var(--control-border)] bg-[var(--control-bg)] text-text-primary",
                      "hover:border-[var(--control-hover-border)]",
                      "focus:outline-none focus:ring-2 focus:ring-[var(--control-focus-ring)]"
                    )}
                    style={{
                      transitionDuration: "var(--duration-fast)",
                      transitionTimingFunction: "var(--ease-out)",
                    }}
                  >
                    {themes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="type-label mb-1 block text-text-tertiary">
                    Mode
                  </span>
                  <div
                    className="inline-flex rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)] p-0.5"
                    role="group"
                    aria-label="Light or dark mode"
                  >
                    <button
                      type="button"
                      onClick={() => setMode("dark")}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5",
                        "type-label transition-colors",
                        mode === "dark"
                          ? "bg-accent-muted text-text-primary"
                          : "text-text-tertiary hover:bg-[var(--border-subtle)] hover:text-text-primary"
                      )}
                      style={{
                        transitionDuration: "var(--duration-fast)",
                        transitionTimingFunction: "var(--ease-out)",
                      }}
                      aria-pressed={mode === "dark"}
                    >
                      <Moon size={14} aria-hidden />
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("light")}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5",
                        "type-label transition-colors",
                        mode === "light"
                          ? "bg-accent-muted text-text-primary"
                          : "text-text-tertiary hover:bg-[var(--border-subtle)] hover:text-text-primary"
                      )}
                      style={{
                        transitionDuration: "var(--duration-fast)",
                        transitionTimingFunction: "var(--ease-out)",
                      }}
                      aria-pressed={mode === "light"}
                    >
                      <Sun size={14} aria-hidden />
                      Light
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {THEME_TOKEN_SECTIONS.map((section) => (
              <section key={section.label}>
                <h4 className="type-label mb-2 uppercase tracking-wider text-text-tertiary">
                  {section.label}
                </h4>
                <div className="flex flex-col gap-2">
                  {section.tokens.map(({ key, label }) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-surface-raised px-2 py-1.5"
                    >
                      <div
                        className="h-8 w-10 shrink-0 rounded border border-[var(--control-border)]"
                        style={{
                          backgroundColor: effectiveValue(key),
                        }}
                        aria-hidden
                      />
                      <span className="type-body w-16 shrink-0 truncate text-text-secondary">
                        {label}
                      </span>
                      <input
                        type="text"
                        value={displayHex(key)}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        onBlur={(e) => handleHexBlur(key, e.target.value)}
                        onKeyDown={handleHexKeyDown}
                        className={cn(
                          "type-data min-w-0 flex-1 rounded border bg-[var(--control-bg)] px-2 py-1",
                          "border-[var(--control-border)] text-text-primary placeholder:text-text-muted",
                          "focus:outline-none focus:ring-2 focus:ring-[var(--control-focus-ring)]"
                        )}
                        placeholder="#000000"
                        aria-label={`${label} hex`}
                        spellCheck={false}
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border)] p-4">
          <button
            type="button"
            onClick={handleReset}
            className={cn(
              "type-label w-full rounded-[var(--radius-sm)] border px-3 py-2 transition-colors",
              "border-[var(--control-border)] bg-[var(--control-bg)] text-text-secondary",
              "hover:border-[var(--control-hover-border)] hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]"
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            Reset to default
          </button>
        </div>
      </aside>
    </>
  );
}
