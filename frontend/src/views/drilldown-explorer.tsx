import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  type HTMLAttributes,
} from "react";
import { Treemap, ResponsiveContainer } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import { useFilterContext, buildFilterParams } from "@/lib/filter-context";
import { fetchDrilldown, type Drilldown } from "@/lib/api";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// --- Constants ---

const PROPERTIES = [
  { value: "cameraName", label: "Camera" },
  { value: "lensName", label: "Lens" },
  { value: "focalLength", label: "Focal Length" },
  { value: "aperture", label: "Aperture" },
  { value: "shutterSpeed", label: "Shutter Speed" },
] as const;

const PRESET_HIERARCHIES = [
  {
    label: "Camera \u2192 Lens \u2192 Focal Length",
    value: ["cameraName", "lensName", "focalLength"],
  },
  {
    label: "Camera \u2192 Lens \u2192 Aperture",
    value: ["cameraName", "lensName", "aperture"],
  },
  {
    label: "Lens \u2192 Focal Length \u2192 Aperture",
    value: ["lensName", "focalLength", "aperture"],
  },
] as const;

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
];

/** Chart palette indices with light/mid backgrounds (HSL lightness >= 55%). Use dark text for contrast. */
const LIGHT_BG_CHART_INDICES = new Set([0, 1, 2, 4, 5, 8]); // 55%+ lightness

type LoadState = "loading" | "loaded" | "error" | "empty";

function getPropertyLabel(value: string): string {
  return PROPERTIES.find((p) => p.value === value)?.label ?? value;
}

// --- Main Component ---

export function DrilldownExplorer() {
  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();
  const params = buildFilterParams(filters, selectedCatalog);

  const [hierarchy, setHierarchy] = useState<string[]>([
    "cameraName",
    "lensName",
    "focalLength",
  ]);
  const [filterValues, setFilterValues] = useState<string[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<Drilldown | null>(null);
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    if (!selectedCatalog) return;
    let cancelled = false;

    setLoadState("loading");

    fetchDrilldown({
      ...params,
      hierarchy: hierarchy.join(","),
      filter_values: filterValues.length > 0 ? filterValues.join(",") : undefined,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.data.length === 0) {
          setLoadState("empty");
        } else {
          setLoadState("loaded");
        }
        setData(res);
        setAnimationKey((k) => k + 1);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load data",
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCatalog,
    hierarchy,
    filterValues,
    filters.startDate,
    filters.endDate,
    filters.picksOnly,
    filters.minRating,
    filters.excludeCameras,
    filters.excludeLenses,
  ]);

  const handleDrillIn = useCallback(
    (value: string) => {
      // Can only drill in if there are more levels
      if (filterValues.length < hierarchy.length - 1) {
        setFilterValues([...filterValues, value]);
      }
    },
    [filterValues, hierarchy.length],
  );

  const handleBreadcrumbClick = useCallback((depth: number) => {
    // depth=0 means "All" (reset), depth=1 means keep first filter_value, etc.
    setFilterValues((prev) => prev.slice(0, depth));
  }, []);

  const handleHierarchyChange = useCallback((newHierarchy: string[]) => {
    setHierarchy(newHierarchy);
    setFilterValues([]);
  }, []);

  const canDrillIn = filterValues.length < hierarchy.length - 1;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <HierarchySelector
          hierarchy={hierarchy}
          onChange={handleHierarchyChange}
        />
      </div>

      {/* Breadcrumbs */}
      <Breadcrumbs
        hierarchy={hierarchy}
        filterValues={filterValues}
        onClick={handleBreadcrumbClick}
      />

      {/* Content */}
      {loadState === "loading" && <DrilldownSkeleton />}
      {loadState === "error" && <DrilldownError message={errorMessage} />}
      {loadState === "empty" && <DrilldownEmpty />}
      {loadState === "loaded" && data && (
        <DrilldownTreemap
          data={data}
          onDrillIn={canDrillIn ? handleDrillIn : undefined}
          animationKey={animationKey}
        />
      )}
    </div>
  );
}

// --- Hierarchy Selector ---

function HierarchySelector({
  hierarchy,
  onChange,
}: {
  hierarchy: string[];
  onChange: (h: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [isCustom, setIsCustom] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const currentLabel = useMemo(() => {
    const match = PRESET_HIERARCHIES.find(
      (p) =>
        p.value.length === hierarchy.length &&
        p.value.every((v, i) => v === hierarchy[i]),
    );
    if (match) return match.label;
    return "Custom: " + hierarchy.map(getPropertyLabel).join(" \u2192 ");
  }, [hierarchy]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
          "border-[var(--control-border)] bg-[var(--control-bg)]",
          "hover:border-[var(--control-hover-border)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
          "active:scale-[0.98]",
          open && "ring-2 ring-[var(--control-focus-ring)]",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
      >
        <span className="type-label text-text-tertiary">Hierarchy</span>
        <span className="type-body text-text-primary">{currentLabel}</span>
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
          className="absolute left-0 top-full z-50 mt-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated p-1"
          style={{ minWidth: "320px" }}
        >
          {PRESET_HIERARCHIES.map((preset) => {
            const isActive =
              !isCustom &&
              preset.value.length === hierarchy.length &&
              preset.value.every((v, i) => v === hierarchy[i]);
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  onChange([...preset.value]);
                  setIsCustom(false);
                  setOpen(false);
                }}
                className={cn(
                  "type-body flex w-full items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
                  isActive
                    ? "bg-accent-muted text-text-primary"
                    : "text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
                )}
                style={{
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out)",
                }}
              >
                {preset.label}
              </button>
            );
          })}

          {/* Separator */}
          <div className="mx-1 my-1 border-t border-[var(--border-subtle)]" />

          {/* Custom toggle */}
          <button
            type="button"
            onClick={() => setIsCustom(true)}
            className={cn(
              "type-body flex w-full items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
              isCustom
                ? "bg-accent-muted text-text-primary"
                : "text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            Custom...
          </button>

          {isCustom && (
            <CustomHierarchyBuilder
              hierarchy={hierarchy}
              onChange={(h) => {
                onChange(h);
                setOpen(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- Custom Hierarchy Builder ---

function CustomHierarchyBuilder({
  hierarchy,
  onChange,
}: {
  hierarchy: string[];
  onChange: (h: string[]) => void;
}) {
  const [slots, setSlots] = useState<string[]>(() => {
    // Start from current hierarchy, ensure at least 2 slots
    return hierarchy.length >= 2 ? [...hierarchy] : [...hierarchy, ""];
  });

  const availableForSlot = useCallback(
    (slotIndex: number) => {
      const usedByOthers = new Set(
        slots.filter((s, i) => i !== slotIndex && s !== ""),
      );
      return PROPERTIES.filter((p) => !usedByOthers.has(p.value));
    },
    [slots],
  );

  const handleSlotChange = useCallback(
    (index: number, value: string) => {
      const newSlots = [...slots];
      newSlots[index] = value;
      setSlots(newSlots);
    },
    [slots],
  );

  const addSlot = useCallback(() => {
    if (slots.length < PROPERTIES.length) {
      setSlots([...slots, ""]);
    }
  }, [slots]);

  const removeSlot = useCallback(
    (index: number) => {
      if (slots.length > 2) {
        setSlots(slots.filter((_, i) => i !== index));
      }
    },
    [slots],
  );

  const canApply = slots.length >= 2 && slots.every((s) => s !== "");

  return (
    <div className="space-y-2 px-2 py-2">
      {slots.map((slot, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="type-caption text-text-muted w-4 text-right">
            {i + 1}.
          </span>
          <select
            value={slot}
            onChange={(e) => handleSlotChange(i, e.target.value)}
            className="type-body flex-1 rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)] px-2 py-1 text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]"
          >
            <option value="">Select property...</option>
            {availableForSlot(i).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {slots.length > 2 && (
            <button
              type="button"
              onClick={() => removeSlot(i)}
              className="type-label text-text-tertiary transition-colors hover:text-destructive"
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              &times;
            </button>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-1">
        {slots.length < PROPERTIES.length && (
          <button
            type="button"
            onClick={addSlot}
            className="type-label text-text-tertiary transition-colors hover:text-text-secondary"
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            + Add level
          </button>
        )}
        <button
          type="button"
          onClick={() => canApply && onChange(slots)}
          disabled={!canApply}
          className={cn(
            "type-label ml-auto rounded-[var(--radius-sm)] border px-3 py-1 transition-colors",
            canApply
              ? "border-[var(--accent)] text-accent hover:bg-accent-muted"
              : "cursor-not-allowed border-[var(--border-subtle)] text-text-muted opacity-50",
          )}
          style={{
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out)",
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// --- Breadcrumbs ---

function Breadcrumbs({
  hierarchy,
  filterValues,
  onClick,
}: {
  hierarchy: string[];
  filterValues: string[];
  onClick: (depth: number) => void;
}) {
  const currentProperty = hierarchy[filterValues.length];

  return (
    <nav className="flex items-center gap-1 flex-wrap" aria-label="Drilldown breadcrumbs">
      {/* All (root) */}
      <button
        type="button"
        onClick={() => onClick(0)}
        className={cn(
          "type-label rounded-[var(--radius-sm)] px-1 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
          "active:scale-[0.98]",
          filterValues.length === 0
            ? "text-accent"
            : "text-text-secondary hover:text-text-primary",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
      >
        All
      </button>

      {/* Drilled levels */}
      {filterValues.map((value, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight size={14} className="text-text-muted" />
          <button
            type="button"
            onClick={() => onClick(i + 1)}
            className={cn(
              "type-label rounded-[var(--radius-sm)] px-1 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
              "active:scale-[0.98]",
              i === filterValues.length - 1 && filterValues.length === hierarchy.length - 1
                ? "text-accent"
                : "text-text-secondary hover:text-text-primary",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            {value}
          </button>
        </span>
      ))}

      {/* Current level label */}
      <span className="flex items-center gap-1">
        {filterValues.length > 0 && (
          <ChevronRight size={14} className="text-text-muted" />
        )}
        <span className="type-caption text-text-tertiary">
          {getPropertyLabel(currentProperty)}
        </span>
      </span>
    </nav>
  );
}

// --- Treemap ---

function DrilldownTreemap({
  data,
  onDrillIn,
  animationKey,
}: {
  data: Drilldown;
  onDrillIn?: (value: string) => void;
  animationKey: number;
}) {
  const totalCount = useMemo(
    () => data.data.reduce((sum, d) => sum + d.count, 0),
    [data.data],
  );

  const treemapData = useMemo(
    () =>
      data.data.map((item, i) => {
        const fillIndex = i % CHART_COLORS.length;
        return {
          name: item.value,
          size: item.count,
          fill: CHART_COLORS[fillIndex],
          fillIndex,
          percentage:
            totalCount > 0
              ? ((item.count / totalCount) * 100).toFixed(1)
              : "0.0",
        };
      }),
    [data.data, totalCount],
  );

  return (
    <Card>
      <CardTitle>
        {getPropertyLabel(data.property)} Breakdown
        <span className="type-caption text-text-tertiary ml-2">
          ({totalCount.toLocaleString()} photos)
        </span>
      </CardTitle>
      <CardContent>
        <div
          key={animationKey}
          style={{
            animation: "drilldown-fade 250ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <ResponsiveContainer width="100%" height={480}>
            <Treemap
              data={treemapData}
              dataKey="size"
              nameKey="name"
              aspectRatio={4 / 3}
              stroke="var(--surface-base)"
              animationDuration={250}
              animationEasing="ease-out"
              content={
                <TreemapSegment
                  onDrillIn={onDrillIn}
                  totalCount={totalCount}
                />
              }
            />
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Custom Treemap Segment ---

interface TreemapSegmentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  size?: number;
  fill?: string;
  fillIndex?: number;
  onDrillIn?: (value: string) => void;
  totalCount: number;
}

function TreemapSegment({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name = "",
  size = 0,
  fill = CHART_COLORS[0],
  fillIndex = 0,
  onDrillIn,
  totalCount,
}: TreemapSegmentProps) {
  const [hovered, setHovered] = useState(false);

  const showLabel = width > 56 && height > 32;
  const showCount = width > 72 && height > 48;
  const percentage =
    totalCount > 0 ? ((size / totalCount) * 100).toFixed(1) : "0.0";

  const useDarkText = LIGHT_BG_CHART_INDICES.has(fillIndex);
  const labelClass = useDarkText
    ? "type-h3 text-accent-text truncate leading-tight"
    : "type-h3 text-text-primary truncate leading-tight";
  const countClass = useDarkText
    ? "type-data text-accent-text/90 truncate leading-tight"
    : "type-data text-text-primary truncate leading-tight";

  // Truncate label if segment is small (width/6 allows more chars for readability)
  const maxChars = Math.max(6, Math.floor(width / 6));
  const displayName =
    name.length > maxChars ? name.slice(0, maxChars - 1) + "\u2026" : name;

  return (
    <g
      onClick={() => onDrillIn?.(name)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: onDrillIn ? "pointer" : "default" }}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={4}
        opacity={hovered ? 0.85 : 0.75}
        style={{
          transition: "opacity 150ms ease-out",
        }}
      />

      {showLabel && (
        <>
          <foreignObject
            x={x + 8}
            y={y + 8}
            width={Math.max(0, width - 16)}
            height={24}
            overflow="hidden"
          >
            <div
              className={labelClass}
              {...({ xmlns: "http://www.w3.org/1999/xhtml" } as HTMLAttributes<HTMLDivElement>)}
            >
              {displayName}
            </div>
          </foreignObject>
          {showCount && (
            <foreignObject
              x={x + 8}
              y={y + 32}
              width={Math.max(0, width - 16)}
              height={24}
              overflow="hidden"
            >
              <div
                className={countClass}
                {...({ xmlns: "http://www.w3.org/1999/xhtml" } as HTMLAttributes<HTMLDivElement>)}
              >
                {size.toLocaleString()} ({percentage}%)
              </div>
            </foreignObject>
          )}
        </>
      )}

      {/* Tooltip title for small segments */}
      {!showLabel && size > 0 && (
        <title>
          {name}: {size.toLocaleString()} photos ({percentage}%)
        </title>
      )}
    </g>
  );
}

// --- Loading Skeleton ---

function DrilldownSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-[540px]" />
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-raised",
        className,
      )}
    />
  );
}

// --- Empty State ---

function DrilldownEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="type-body text-text-tertiary">
        No data at this drill level
      </p>
    </div>
  );
}

// --- Error State ---

function DrilldownError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Card className="border-[var(--destructive)] max-w-md">
        <p className="type-body text-destructive">{message}</p>
      </Card>
    </div>
  );
}
