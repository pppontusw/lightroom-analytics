import { useState, useEffect, useRef } from "react";
import { ChevronDown, SlidersHorizontal, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFilterContext } from "@/lib/filter-context";
import { useCatalog } from "@/lib/catalog-context";
import { fetchOverview } from "@/lib/api";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect } from "@/components/ui/multi-select";

const PHONE_CAMERA_PATTERNS = ["iphone", "pixel", "samsung", "galaxy"];

const RATING_OPTIONS = [
  { value: 0, label: "All" },
  { value: 1, label: "1+" },
  { value: 2, label: "2+" },
  { value: 3, label: "3+" },
  { value: 4, label: "4+" },
  { value: 5, label: "5" },
];

export function FilterBar() {
  const [collapsed, setCollapsed] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [catalogData, setCatalogData] = useState<{
    cameras: string[];
    lenses: string[];
    earliest: string | null;
    latest: string | null;
  }>({ cameras: [], lenses: [], earliest: null, latest: null });

  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();

  // Fetch catalog metadata (cameras, lenses, date range) for populating controls
  useEffect(() => {
    if (!selectedCatalog) return;
    let cancelled = false;

    fetchOverview({ catalog: selectedCatalog })
      .then((data) => {
        if (cancelled) return;
        setCatalogData({
          cameras: data.cameras,
          lenses: data.lenses,
          earliest: data.date_range.earliest,
          latest: data.date_range.latest,
        });
      })
      .catch(() => {
        // Silently ignore — catalog data will just be empty
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCatalog]);

  return (
    <div className="border-b border-[var(--border)]">
      {/* Collapsed header / toggle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "flex w-full items-center gap-2 px-4 py-2 transition-colors",
          "text-text-secondary hover:text-text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]",
          "active:scale-[0.98]",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
      >
        <SlidersHorizontal size={14} />
        <span className="type-label">Filters</span>

        {collapsed && filters.hasActiveFilters && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-[var(--radius-sm)] bg-accent px-1 text-[10px] font-semibold text-accent-text">
            {filters.activeFilterCount}
          </span>
        )}

        <ChevronDown
          size={14}
          className={cn(
            "ml-auto text-text-tertiary transition-transform",
            !collapsed && "rotate-180",
          )}
          style={{
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out)",
          }}
        />
      </button>

      {/* Expanded filter controls */}
      {!collapsed && (
        <div className="flex flex-wrap items-center gap-3 px-4 pb-3">
          {/* Date Range Picker */}
          <DateRangePicker
            startDate={filters.startDate}
            endDate={filters.endDate}
            onDateRangeChange={filters.setDateRange}
            catalogEarliest={catalogData.earliest}
            catalogLatest={catalogData.latest}
          />

          {/* Camera Exclude */}
          <MultiSelect
            label="Cameras"
            options={catalogData.cameras}
            excludedValues={filters.excludeCameras}
            onExcludedChange={filters.setExcludeCameras}
            shortcut={{
              label: "Exclude phone cameras",
              patterns: PHONE_CAMERA_PATTERNS,
            }}
          />

          {/* Lens Exclude */}
          <MultiSelect
            label="Lenses"
            options={catalogData.lenses}
            excludedValues={filters.excludeLenses}
            onExcludedChange={filters.setExcludeLenses}
          />

          {/* Picks Only Toggle */}
          <button
            type="button"
            onClick={() => filters.setPicksOnly(!filters.picksOnly)}
            className={cn(
              "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
              filters.picksOnly
                ? "border-[var(--accent)] bg-accent-muted text-text-primary"
                : "border-[var(--control-border)] bg-[var(--control-bg)] text-text-tertiary hover:border-[var(--control-hover-border)] hover:text-text-secondary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
              "active:scale-[0.98]",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            <span
              className={cn(
                "flex h-4 w-8 items-center rounded-full border p-0.5 transition-colors",
                filters.picksOnly
                  ? "justify-end border-[var(--accent)] bg-accent"
                  : "justify-start border-[var(--control-border)] bg-[var(--control-bg)]",
              )}
            >
              <span
                className={cn(
                  "h-3 w-3 rounded-full transition-colors",
                  filters.picksOnly ? "bg-accent-text" : "bg-text-muted",
                )}
              />
            </span>
            <span className="type-body">Picks only</span>
          </button>

          {/* Minimum Rating */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRatingOpen(!ratingOpen)}
              className={cn(
                "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
                filters.minRating > 0
                  ? "border-[var(--accent)] bg-accent-muted text-text-primary"
                  : "border-[var(--control-border)] bg-[var(--control-bg)] text-text-tertiary hover:border-[var(--control-hover-border)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
                "active:scale-[0.98]",
                ratingOpen && "ring-2 ring-[var(--control-focus-ring)]",
              )}
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              <Star
                size={14}
                className={cn(
                  filters.minRating > 0 ? "fill-accent text-accent" : "text-text-tertiary",
                )}
              />
              <span className="type-body">
                {filters.minRating > 0
                  ? `${filters.minRating}+ stars`
                  : "Min rating"}
              </span>
              {filters.minRating > 0 && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    filters.setMinRating(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.stopPropagation();
                      filters.setMinRating(0);
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
                  ratingOpen && "rotate-180",
                )}
                style={{
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out)",
                }}
              />
            </button>

            {ratingOpen && (
              <RatingDropdown
                value={filters.minRating}
                onChange={(v) => {
                  filters.setMinRating(v);
                  setRatingOpen(false);
                }}
                onClose={() => setRatingOpen(false)}
              />
            )}
          </div>

          {/* Clear all */}
          {filters.hasActiveFilters && (
            <button
              type="button"
              onClick={filters.clearAll}
              className={cn(
                "type-body inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-text-tertiary transition-colors",
                "hover:bg-[var(--border-subtle)] hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]",
                "active:scale-[0.98]",
              )}
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              <X size={12} />
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RatingDropdown({
  value,
  onChange,
  onClose,
}: {
  value: number;
  onChange: (v: number) => void;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-50 mt-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated p-1"
      style={{ minWidth: "120px" }}
    >
      {RATING_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "type-body flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
            value === option.value
              ? "bg-accent-muted text-text-primary"
              : "text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
          )}
          style={{
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out)",
          }}
        >
          <div className="flex items-center gap-0.5">
            {option.value > 0 ? (
              Array.from({ length: option.value }, (_, i) => (
                <Star
                  key={i}
                  size={12}
                  className="fill-accent text-accent"
                />
              ))
            ) : (
              <span className="text-text-tertiary">All</span>
            )}
          </div>
          <span className="ml-auto type-caption text-text-tertiary">
            {option.label}
          </span>
        </button>
      ))}
    </div>
  );
}
