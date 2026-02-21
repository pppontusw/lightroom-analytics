import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { useFilterContext, buildFilterParams } from "@/lib/filter-context";
import {
  fetchHeatmap,
  fetchBreakdown,
  type HeatmapDay,
  type BreakdownTotal,
  type FilterParams,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { ExposureBar } from "@/components/ui/exposure-bar";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

type LoadState = "loading" | "loaded" | "error" | "empty";

// --- Main Page ---

export function ShootingHeatmap() {
  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();
  const params = buildFilterParams(filters, selectedCatalog);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<HeatmapDay[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Derive available years from heatmap data
  const availableYears = useMemo(() => {
    if (data.length === 0) return [];
    const years = new Set<number>();
    for (const d of data) {
      years.add(parseInt(d.date.slice(0, 4), 10));
    }
    return Array.from(years).sort((a, b) => b - a); // newest first
  }, [data]);

  // Default to most recent year when data loads
  useEffect(() => {
    if (availableYears.length > 0 && selectedYear === null) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // Fetch all heatmap data (full catalog range)
  useEffect(() => {
    if (!selectedCatalog) return;
    let cancelled = false;

    setLoadState("loading");
    setSelectedYear(null);

    fetchHeatmap(params)
      .then((res) => {
        if (cancelled) return;
        if (res.data.length === 0) {
          setData([]);
          setLoadState("empty");
        } else {
          setData(res.data);
          setLoadState("loaded");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load heatmap data",
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCatalog,
    filters.startDate,
    filters.endDate,
    filters.picksOnly,
    filters.minRating,
    filters.excludeCameras,
    filters.excludeLenses,
  ]);

  // Filter data for the selected year
  const yearData = useMemo(() => {
    if (!selectedYear || data.length === 0) return [];
    const prefix = String(selectedYear);
    return data.filter((d) => d.date.startsWith(prefix));
  }, [data, selectedYear]);

  if (loadState === "loading") return <HeatmapSkeleton />;
  if (loadState === "error") return <HeatmapError message={errorMessage} />;
  if (loadState === "empty" || data.length === 0) return <HeatmapEmpty />;

  return (
    <div className="space-y-6">
      {/* Header with year selector */}
      <div className="flex items-center justify-between">
        <h1 className="type-h1 text-text-primary">Shooting Heatmap</h1>
        {selectedYear && availableYears.length > 1 && (
          <YearSelector
            years={availableYears}
            selected={selectedYear}
            onChange={setSelectedYear}
          />
        )}
      </div>

      {/* Heatmap */}
      {selectedYear && (
        <Card>
          <CardContent className="mt-0">
            <CalendarHeatmap
              data={yearData}
              year={selectedYear}
              filterParams={params}
              catalog={selectedCatalog}
            />
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {selectedYear && <YearSummary data={yearData} year={selectedYear} />}
    </div>
  );
}

// --- Year Selector ---

function YearSelector({
  years,
  selected,
  onChange,
}: {
  years: number[];
  selected: number;
  onChange: (year: number) => void;
}) {
  const currentIndex = years.indexOf(selected);

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={currentIndex >= years.length - 1}
        onClick={() => onChange(years[currentIndex + 1])}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--control-border)]",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
          "active:scale-[0.98]",
          "disabled:pointer-events-none disabled:opacity-50 disabled:text-text-muted",
          currentIndex < years.length - 1 &&
            "hover:border-[var(--control-hover-border)] hover:bg-surface-raised",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
        aria-label="Previous year"
      >
        <ChevronLeft className="h-4 w-4 text-text-secondary" />
      </button>

      <span className="type-data min-w-[4ch] text-center text-text-primary">
        {selected}
      </span>

      <button
        disabled={currentIndex <= 0}
        onClick={() => onChange(years[currentIndex - 1])}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--control-border)]",
          "transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
          "active:scale-[0.98]",
          "disabled:pointer-events-none disabled:opacity-50 disabled:text-text-muted",
          currentIndex > 0 &&
            "hover:border-[var(--control-hover-border)] hover:bg-surface-raised",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
        aria-label="Next year"
      >
        <ChevronRight className="h-4 w-4 text-text-secondary" />
      </button>
    </div>
  );
}

// --- Calendar Heatmap ---

const CELL_SIZE = 14;
const CELL_GAP = 2;
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

interface WeekColumn {
  days: (HeatmapDay | null)[];
  /** Month index (0-11) of the first real day in this week */
  monthIndex: number;
}

function CalendarHeatmap({
  data,
  year,
  filterParams,
  catalog,
}: {
  data: HeatmapDay[];
  year: number;
  filterParams: FilterParams;
  catalog: string | null;
}) {
  const [tooltip, setTooltip] = useState<{
    day: HeatmapDay;
    x: number;
    y: number;
  } | null>(null);
  const [popover, setPopover] = useState<{
    day: HeatmapDay;
    x: number;
    y: number;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popover) return;
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setPopover(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [popover]);

  // Build full year grid: Jan 1 to Dec 31
  const { weeks, maxCount } = useMemo(() => {
    // Build a lookup from date string to count
    const lookup = new Map<string, number>();
    for (const d of data) {
      lookup.set(d.date, d.count);
    }

    // Generate all days in the year
    const allDays: HeatmapDay[] = [];
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      allDays.push({ date: iso, count: lookup.get(iso) ?? 0 });
    }

    // Find max
    let max = 0;
    for (const d of allDays) {
      if (d.count > max) max = d.count;
    }

    // Group into weeks. Week starts on Monday (ISO).
    // getDay(): 0=Sun, 1=Mon, ..., 6=Sat → ISO day: Mon=0, Tue=1, ..., Sun=6
    const weeksList: WeekColumn[] = [];
    let currentWeek: (HeatmapDay | null)[] = [];

    // Pad start: how many empty cells before Jan 1?
    const firstDow = start.getDay(); // 0=Sun
    const isoFirstDow = firstDow === 0 ? 6 : firstDow - 1; // Mon=0
    for (let i = 0; i < isoFirstDow; i++) {
      currentWeek.push(null);
    }

    for (const day of allDays) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        // Find the first real day's month for month labels
        const firstReal = currentWeek.find((d) => d !== null);
        weeksList.push({
          days: currentWeek,
          monthIndex: firstReal
            ? parseInt(firstReal.date.slice(5, 7), 10) - 1
            : 0,
        });
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      const firstReal = currentWeek.find((d) => d !== null);
      weeksList.push({
        days: currentWeek,
        monthIndex: firstReal
          ? parseInt(firstReal.date.slice(5, 7), 10) - 1
          : 11,
      });
    }

    return { weeks: weeksList, maxCount: max };
  }, [data, year]);

  // Month labels: show at the first week where a new month starts
  const monthLabels = useMemo(() => {
    const labels: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    for (let i = 0; i < weeks.length; i++) {
      const m = weeks[i].monthIndex;
      if (m !== lastMonth) {
        labels.push({ weekIndex: i, label: MONTH_NAMES[m] });
        lastMonth = m;
      }
    }
    return labels;
  }, [weeks]);

  const handleCellHover = useCallback(
    (day: HeatmapDay, e: React.MouseEvent) => {
      if (popover) return; // don't show tooltip when popover is open
      if (day.count === 0) return; // don't show tooltip for empty cells
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({
        day,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [popover],
  );

  const handleCellClick = useCallback(
    (day: HeatmapDay, e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip(null);
      setPopover({
        day,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    },
    [],
  );

  const DAY_LABEL_WIDTH = 32;
  const gridWidth = weeks.length * (CELL_SIZE + CELL_GAP);
  const MONTH_LABEL_HEIGHT = 20;

  return (
    <div className="relative" ref={containerRef}>
      {/* Month labels row */}
      <div className="flex" style={{ paddingLeft: DAY_LABEL_WIDTH }}>
        <div
          className="relative"
          style={{ width: gridWidth, height: MONTH_LABEL_HEIGHT }}
        >
          {monthLabels.map(({ weekIndex, label }) => (
            <span
              key={`${label}-${weekIndex}`}
              className="type-caption text-text-tertiary absolute"
              style={{
                left: weekIndex * (CELL_SIZE + CELL_GAP),
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="flex overflow-x-auto">
        {/* Day-of-week labels */}
        <div
          className="flex shrink-0 flex-col"
          style={{ gap: CELL_GAP, width: DAY_LABEL_WIDTH }}
        >
          {DAY_LABELS.map((label, i) => (
            <div
              key={i}
              className="type-caption flex items-center justify-end pr-1 text-text-tertiary"
              style={{ height: CELL_SIZE }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex" style={{ gap: CELL_GAP }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
              {week.days.map((day, di) => (
                <HeatmapCell
                  key={di}
                  day={day}
                  maxCount={maxCount}
                  onHover={handleCellHover}
                  onLeave={() => setTooltip(null)}
                  onClick={handleCellClick}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        className="mt-3 flex items-center justify-end gap-2"
        style={{ paddingLeft: DAY_LABEL_WIDTH }}
      >
        <span className="type-caption text-text-tertiary">Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((intensity) => (
          <div
            key={intensity}
            className="rounded-[1px]"
            style={{
              width: CELL_SIZE - 2,
              height: CELL_SIZE - 2,
              backgroundColor: cellColor(intensity === 0 ? -1 : intensity),
            }}
          />
        ))}
        <span className="type-caption text-text-tertiary">More</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <HeatmapTooltip day={tooltip.day} x={tooltip.x} y={tooltip.y} />
      )}

      {/* Popover */}
      {popover && (
        <DayPopover
          ref={popoverRef}
          day={popover.day}
          x={popover.x}
          y={popover.y}
          filterParams={filterParams}
          catalog={catalog}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

// --- Cell Color Helper ---

function cellColor(intensity: number): string {
  if (intensity < 0) return "var(--surface-inset)";
  const opacity = 0.3 + intensity * 0.7;
  return `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, var(--surface-inset))`;
}

// --- Heatmap Cell ---

function HeatmapCell({
  day,
  maxCount,
  onHover,
  onLeave,
  onClick,
}: {
  day: HeatmapDay | null;
  maxCount: number;
  onHover: (day: HeatmapDay, e: React.MouseEvent) => void;
  onLeave: () => void;
  onClick: (day: HeatmapDay, e: React.MouseEvent) => void;
}) {
  if (!day) {
    return <div style={{ width: CELL_SIZE, height: CELL_SIZE }} />;
  }

  const intensity = maxCount > 0 && day.count > 0 ? day.count / maxCount : -1;

  return (
    <div
      className="cursor-pointer rounded-[1px] transition-[outline]"
      style={{
        width: CELL_SIZE,
        height: CELL_SIZE,
        backgroundColor: cellColor(intensity),
        transitionDuration: "var(--duration-fast)",
        transitionTimingFunction: "var(--ease-out)",
      }}
      onMouseEnter={(e) => onHover(day, e)}
      onMouseLeave={onLeave}
      onClick={(e) => onClick(day, e)}
    />
  );
}

// --- Tooltip ---

function HeatmapTooltip({
  day,
  x,
  y,
}: {
  day: HeatmapDay;
  x: number;
  y: number;
}) {
  const formatted = formatDateDisplay(day.date);

  return (
    <div
      className="pointer-events-none absolute z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2"
      style={{
        left: x,
        top: y - 8,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="type-label whitespace-nowrap text-text-secondary">
        {formatted}
      </div>
      <div className="type-data text-text-primary">
        {day.count} photo{day.count !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// --- Day Detail Popover ---

interface DayGearData {
  cameras: BreakdownTotal[];
  lenses: BreakdownTotal[];
}

type GearFetchState =
  | { status: "loading" }
  | { status: "loaded"; data: DayGearData }
  | { status: "error" };

const DayPopover = ({
  day,
  x,
  y,
  filterParams,
  catalog,
  onClose,
  ref,
}: {
  day: HeatmapDay;
  x: number;
  y: number;
  filterParams: FilterParams;
  catalog: string | null;
  onClose: () => void;
  ref: React.Ref<HTMLDivElement>;
}) => {
  const [gearState, setGearState] = useState<GearFetchState>({
    status: "loading",
  });

  useEffect(() => {
    let cancelled = false;

    const dayParams = {
      ...filterParams,
      start_date: day.date,
      end_date: day.date,
      catalog: catalog ?? undefined,
      grouping: "year",
      top_n: 5,
    };

    Promise.all([
      fetchBreakdown({ ...dayParams, property: "cameraName" }),
      fetchBreakdown({ ...dayParams, property: "lensName" }),
    ])
      .then(([camerasRes, lensesRes]) => {
        if (cancelled) return;
        setGearState({
          status: "loaded",
          data: {
            cameras: camerasRes.totals.slice(0, 5),
            lenses: lensesRes.totals.slice(0, 5),
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setGearState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [day.date, filterParams, catalog]);

  const formatted = formatDateDisplay(day.date);

  return (
    <div
      ref={ref}
      className="absolute z-50 w-72 rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated p-4"
      style={{
        left: Math.min(x, 0) < 0 ? 8 : x,
        top: y + 24,
        transform: "translateX(-50%)",
      }}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="type-h3 text-text-primary">{formatted}</div>
          <div className="type-data text-accent">
            {day.count} photo{day.count !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-text-tertiary transition-colors hover:bg-surface-raised hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] active:scale-[0.98]"
          style={{
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out)",
          }}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {day.count === 0 ? (
        <p className="type-body text-text-tertiary">No photos on this day</p>
      ) : gearState.status === "loading" ? (
        <div className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded-[var(--radius-sm)] bg-surface-raised" />
          <div className="h-3 w-full animate-pulse rounded-[var(--radius-sm)] bg-surface-raised" />
          <div className="h-3 w-3/4 animate-pulse rounded-[var(--radius-sm)] bg-surface-raised" />
        </div>
      ) : gearState.status === "loaded" ? (
        <div className="space-y-4">
          {gearState.data.cameras.length > 0 && (
            <GearSection title="Cameras" items={gearState.data.cameras} />
          )}
          {gearState.data.lenses.length > 0 && (
            <GearSection title="Lenses" items={gearState.data.lenses} />
          )}
          {gearState.data.cameras.length === 0 &&
            gearState.data.lenses.length === 0 && (
              <p className="type-body text-text-tertiary">
                No gear data available
              </p>
            )}
        </div>
      ) : (
        <p className="type-body text-destructive">Failed to load gear data</p>
      )}
    </div>
  );
};

// --- Gear Section in Popover ---

function GearSection({
  title,
  items,
}: {
  title: string;
  items: BreakdownTotal[];
}) {
  const maxCount = items.length > 0 ? items[0].count : 0;

  return (
    <div>
      <h4 className="type-label mb-2 text-text-secondary">{title}</h4>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.value} className="relative">
            <ExposureBar
              value={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
              className="absolute bottom-0 left-0"
            />
            <div className="flex items-baseline justify-between gap-2">
              <span
                className="type-caption truncate text-text-primary"
                title={item.value}
              >
                {item.value}
              </span>
              <span className="type-data shrink-0 text-text-secondary">
                {item.count}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Year Summary ---

function YearSummary({ data, year }: { data: HeatmapDay[]; year: number }) {
  const stats = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const activeDays = data.filter((d) => d.count > 0).length;
    const maxDay = data.reduce(
      (best, d) => (d.count > best.count ? d : best),
      data[0] ?? { date: "", count: 0 },
    );
    const avgPerActiveDay = activeDays > 0 ? total / activeDays : 0;

    return { total, activeDays, maxDay, avgPerActiveDay };
  }, [data]);

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Card>
        <span className="type-label text-text-secondary">
          Total Photos ({year})
        </span>
        <span className="type-data-lg mt-1 block text-text-primary">
          {stats.total.toLocaleString()}
        </span>
        <ExposureBar value={100} className="mt-2" />
      </Card>
      <Card>
        <span className="type-label text-text-secondary">Active Days</span>
        <span className="type-data-lg mt-1 block text-text-primary">
          {stats.activeDays}
        </span>
        <ExposureBar
          value={data.length > 0 ? (stats.activeDays / data.length) * 100 : 0}
          className="mt-2"
        />
      </Card>
      <Card>
        <span className="type-label text-text-secondary">
          Avg per Active Day
        </span>
        <span className="type-data-lg mt-1 block text-text-primary">
          {stats.avgPerActiveDay.toFixed(1)}
        </span>
        <ExposureBar
          value={
            stats.maxDay.count > 0
              ? (stats.avgPerActiveDay / stats.maxDay.count) * 100
              : 0
          }
          className="mt-2"
        />
      </Card>
      <Card>
        <span className="type-label text-text-secondary">Best Day</span>
        <span className="type-data-lg mt-1 block text-text-primary">
          {stats.maxDay.count}
        </span>
        <span className="type-caption mt-1 block text-text-tertiary">
          {stats.maxDay.date ? formatDateDisplay(stats.maxDay.date) : "—"}
        </span>
        <ExposureBar value={100} className="mt-2" />
      </Card>
    </div>
  );
}

// --- Date Formatting ---

function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// --- Loading Skeleton ---

function HeatmapSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 animate-pulse rounded-[var(--radius-sm)] bg-surface-raised" />
        <div className="h-8 w-28 animate-pulse rounded-[var(--radius-sm)] bg-surface-raised" />
      </div>

      {/* Heatmap skeleton */}
      <SkeletonCard className="h-[160px]" />

      {/* Summary skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-24" />
      </div>
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

function HeatmapEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="type-body text-text-tertiary">
        No shooting activity found for the selected period
      </p>
    </div>
  );
}

// --- Error State ---

function HeatmapError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Card className="max-w-md border-[var(--destructive)]">
        <p className="type-body text-destructive">{message}</p>
      </Card>
    </div>
  );
}
