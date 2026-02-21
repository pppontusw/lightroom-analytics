import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  label: string;
  options: string[];
  /** Items that are currently EXCLUDED (checked = excluded) */
  excludedValues: string[];
  onExcludedChange: (excluded: string[]) => void;
  /** Optional shortcut button */
  shortcut?: {
    label: string;
    /** Patterns to match against options (case-insensitive substring) */
    patterns: string[];
  };
  disabled?: boolean;
}

export function MultiSelect({
  label,
  options,
  excludedValues,
  onExcludedChange,
  shortcut,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggleItem = (item: string) => {
    if (excludedValues.includes(item)) {
      onExcludedChange(excludedValues.filter((v) => v !== item));
    } else {
      onExcludedChange([...excludedValues, item]);
    }
  };

  const handleShortcut = () => {
    if (!shortcut) return;
    const matching = options.filter((opt) =>
      shortcut.patterns.some((p) =>
        opt.toLowerCase().includes(p.toLowerCase()),
      ),
    );
    // Add matching items to excluded list (deduplicated)
    const newExcluded = [...new Set([...excludedValues, ...matching])];
    onExcludedChange(newExcluded);
  };

  const clearExclusions = () => {
    onExcludedChange([]);
  };

  const excludedCount = excludedValues.length;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
          "border-[var(--control-border)] bg-[var(--control-bg)]",
          "hover:border-[var(--control-hover-border)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
          "disabled:pointer-events-none disabled:opacity-50 disabled:text-text-muted",
          "active:scale-[0.98]",
          open && "ring-2 ring-[var(--control-focus-ring)]",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
      >
        <span
          className={cn(
            "type-body",
            excludedCount > 0 ? "text-text-primary" : "text-text-tertiary",
          )}
        >
          {excludedCount > 0
            ? `${label} (${excludedCount} excluded)`
            : label}
        </span>
        {excludedCount > 0 && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearExclusions();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                clearExclusions();
              }
            }}
            className="flex items-center rounded-[var(--radius-sm)] p-0.5 text-text-tertiary hover:bg-[var(--border-subtle)] hover:text-text-primary"
          >
            <X size={12} />
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            "text-text-tertiary transition-transform",
            open && "rotate-180",
          )}
          style={{
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out)",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 max-h-[280px] overflow-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated p-1"
          style={{ minWidth: "220px" }}
        >
          {shortcut && (
            <>
              <button
                type="button"
                onClick={handleShortcut}
                className={cn(
                  "type-body mb-0.5 flex w-full items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
                  "text-accent hover:bg-accent-muted",
                )}
                style={{
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out)",
                }}
              >
                {shortcut.label}
              </button>
              <div className="mx-1 my-0.5 border-t border-[var(--border-subtle)]" />
            </>
          )}
          {options.map((option) => {
            const isExcluded = excludedValues.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleItem(option)}
                className={cn(
                  "type-body flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
                  isExcluded
                    ? "text-text-muted line-through"
                    : "text-text-secondary",
                  "hover:bg-[var(--border-subtle)] hover:text-text-primary",
                )}
                style={{
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out)",
                }}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors",
                    isExcluded
                      ? "border-[var(--accent)] bg-accent"
                      : "border-[var(--control-border)] bg-[var(--control-bg)]",
                  )}
                >
                  {isExcluded && (
                    <Check size={10} className="text-accent-text" />
                  )}
                </span>
                <span className="truncate">{option}</span>
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="type-body px-2 py-3 text-center text-text-tertiary">
              No items available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
