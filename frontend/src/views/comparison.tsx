import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChevronDown, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import { useFilterContext, buildFilterParams } from "@/lib/filter-context";
import {
  fetchComparison,
  type Comparison as ComparisonData,
  type ComparisonParams,
} from "@/lib/api";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { ExposureBar } from "@/components/ui/exposure-bar";
import { cn } from "@/lib/utils";

// --- Constants ---

const PROPERTIES = [
  { value: "cameraName", label: "Camera" },
  { value: "lensName", label: "Lens" },
  { value: "focalLength", label: "Focal Length" },
  { value: "aperture", label: "Aperture" },
  { value: "shutterSpeed", label: "Shutter Speed" },
] as const;

type LoadState = "loading" | "loaded" | "error" | "empty";

interface DateRange {
  start: string;
  end: string;
}

// --- Quick Presets ---

/** Format Date as YYYY-MM-DD. */
function dateToString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Add days to a date (can be negative). */
function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Relative period presets: "Last N days" vs "Prior N days".
 * Each preset compares the most recent N days to the N days immediately before.
 */
function getPresets(): {
  label: string;
  periodA: DateRange;
  periodB: DateRange;
}[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const presets: { days: number }[] = [
    { days: 30 },
    { days: 90 },
    { days: 180 },
    { days: 365 },
  ];

  return presets.map(({ days }) => {
    // Period A: last N days (today - (N-1) to today, inclusive)
    const endA = today;
    const startA = addDays(today, -(days - 1));
    // Period B: prior N days (today - 2N to today - N, inclusive)
    const endB = addDays(today, -days);
    const startB = addDays(today, -(2 * days - 1));

    return {
      label: `Last ${days} days`,
      periodA: { start: dateToString(startA), end: dateToString(endA) },
      periodB: { start: dateToString(startB), end: dateToString(endB) },
    };
  });
}

// --- Main Component ---

export function Comparison() {
  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();
  const params = buildFilterParams(filters, selectedCatalog);

  const [periodA, setPeriodA] = useState<DateRange>({ start: "", end: "" });
  const [periodB, setPeriodB] = useState<DateRange>({ start: "", end: "" });
  const [property, setProperty] = useState("lensName");

  const [loadState, setLoadState] = useState<LoadState>("empty");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<ComparisonData | null>(null);

  const hasBothPeriods =
    periodA.start && periodA.end && periodB.start && periodB.end;

  useEffect(() => {
    if (!selectedCatalog || !hasBothPeriods) {
      setLoadState("empty");
      return;
    }
    let cancelled = false;

    setLoadState("loading");

    const comparisonParams: ComparisonParams = {
      ...params,
      property,
      period_a_start: periodA.start,
      period_a_end: periodA.end,
      period_b_start: periodB.start,
      period_b_end: periodB.end,
    };

    fetchComparison(comparisonParams)
      .then((res) => {
        if (cancelled) return;
        if (res.period_a.data.length === 0 && res.period_b.data.length === 0) {
          setLoadState("empty");
        } else {
          setLoadState("loaded");
        }
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load comparison data",
        );
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCatalog,
    property,
    periodA.start,
    periodA.end,
    periodB.start,
    periodB.end,
    filters.startDate,
    filters.endDate,
    filters.picksOnly,
    filters.minRating,
    filters.excludeCameras,
    filters.excludeLenses,
  ]);

  const presets = useMemo(() => getPresets(), []);

  const handlePreset = useCallback((preset: (typeof presets)[number]) => {
    setPeriodA(preset.periodA);
    setPeriodB(preset.periodB);
  }, []);

  return (
    <div className="space-y-6">
      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-3">
        <PropertySelector value={property} onChange={setProperty} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => handlePreset(preset)}
              className={cn(
                "type-label rounded-[var(--radius-sm)] border px-2.5 py-1.5 transition-colors",
                "border-[var(--control-border)] bg-[var(--control-bg)]",
                "text-text-tertiary hover:text-text-secondary hover:bg-[var(--border-subtle)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
                "active:scale-[0.98]",
              )}
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Pickers */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateRangeInput
          label="Period A"
          accent="var(--chart-1)"
          value={periodA}
          onChange={setPeriodA}
        />
        <DateRangeInput
          label="Period B"
          accent="var(--chart-2)"
          value={periodB}
          onChange={setPeriodB}
        />
      </div>

      {/* Content */}
      {loadState === "loading" && <ComparisonSkeleton />}
      {loadState === "error" && <ComparisonError message={errorMessage} />}
      {loadState === "empty" && (
        <ComparisonEmpty hasPeriods={!!hasBothPeriods} />
      )}
      {loadState === "loaded" && data && (
        <>
          <TotalComparison data={data} />
          <GroupedBarChartSection data={data} />
          <DeltaCards data={data} />
        </>
      )}
    </div>
  );
}

// --- Property Selector (reuses pattern from gear-breakdown) ---

function PropertySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
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

  const currentLabel =
    PROPERTIES.find((p) => p.value === value)?.label ?? value;

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
        <span className="type-label text-text-tertiary">Property</span>
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
          style={{ minWidth: "180px" }}
        >
          {PROPERTIES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={cn(
                "type-body flex w-full items-center rounded-[var(--radius-sm)] px-2 py-1.5 text-left transition-colors",
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
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Date Range Input ---

function DateRangeInput({
  label,
  accent,
  value,
  onChange,
}: {
  label: string;
  accent: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ backgroundColor: accent }}
        />
        <span className="type-label text-text-secondary">{label}</span>
      </div>
      <CardContent>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
            className={cn(
              "type-data flex-1 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
              "border-[var(--control-border)] bg-[var(--surface-inset)]",
              "hover:border-[var(--control-hover-border)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
              "text-text-primary",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
              colorScheme: "dark",
            }}
          />
          <span className="type-label text-text-muted">to</span>
          <input
            type="date"
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
            className={cn(
              "type-data flex-1 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
              "border-[var(--control-border)] bg-[var(--surface-inset)]",
              "hover:border-[var(--control-hover-border)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
              "text-text-primary",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
              colorScheme: "dark",
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// --- Total Comparison (Hero) ---

function TotalComparison({ data }: { data: ComparisonData }) {
  const totalA = data.period_a.total;
  const totalB = data.period_b.total;
  const delta = totalA - totalB;
  const deltaPercent =
    totalB > 0
      ? ((delta / totalB) * 100).toFixed(1)
      : totalA > 0
        ? "100.0"
        : "0.0";
  const isPositive = delta > 0;
  const isNegative = delta < 0;

  return (
    <Card>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {/* Period A */}
        <div className="flex flex-col items-center">
          <span className="type-label text-text-secondary">
            {data.period_a.label}
          </span>
          <span
            className="type-data-lg mt-1"
            style={{ color: "var(--chart-1)" }}
          >
            {totalA.toLocaleString()}
          </span>
          <span className="type-caption text-text-tertiary">photos</span>
          <ExposureBar
            value={
              Math.max(totalA, totalB) > 0
                ? (totalA / Math.max(totalA, totalB)) * 100
                : 0
            }
            className="mt-2 w-full"
          />
        </div>

        {/* Delta */}
        <div className="flex flex-col items-center justify-center">
          <div
            className={cn(
              "inline-flex items-center gap-1 type-data-lg",
              isPositive && "text-success",
              isNegative && "text-destructive",
              !isPositive && !isNegative && "text-text-tertiary",
            )}
          >
            {isPositive && <ArrowUp size={20} />}
            {isNegative && <ArrowDown size={20} />}
            {!isPositive && !isNegative && <Minus size={20} />}
            <span>
              {isNegative ? "" : "+"}
              {deltaPercent}%
            </span>
          </div>
          <span className="type-caption text-text-muted mt-1">
            {isPositive ? "+" : ""}
            {delta.toLocaleString()} photos
          </span>
        </div>

        {/* Period B */}
        <div className="flex flex-col items-center">
          <span className="type-label text-text-secondary">
            {data.period_b.label}
          </span>
          <span
            className="type-data-lg mt-1"
            style={{ color: "var(--chart-2)" }}
          >
            {totalB.toLocaleString()}
          </span>
          <span className="type-caption text-text-tertiary">photos</span>
          <ExposureBar
            value={
              Math.max(totalA, totalB) > 0
                ? (totalB / Math.max(totalA, totalB)) * 100
                : 0
            }
            className="mt-2 w-full"
          />
        </div>
      </div>
    </Card>
  );
}

// --- Grouped Bar Chart ---

interface GroupedChartRow {
  value: string;
  periodA: number;
  periodB: number;
}

function GroupedBarChartSection({ data }: { data: ComparisonData }) {
  const chartData = useMemo(() => {
    // Aggregate by value (ignore period/grouping for the comparison chart)
    const mapA = new Map<string, number>();
    const mapB = new Map<string, number>();

    for (const d of data.period_a.data) {
      mapA.set(d.value, (mapA.get(d.value) ?? 0) + d.count);
    }
    for (const d of data.period_b.data) {
      mapB.set(d.value, (mapB.get(d.value) ?? 0) + d.count);
    }

    // Union of all values
    const allValues = new Set([...mapA.keys(), ...mapB.keys()]);
    const rows: GroupedChartRow[] = [];

    for (const value of allValues) {
      rows.push({
        value,
        periodA: mapA.get(value) ?? 0,
        periodB: mapB.get(value) ?? 0,
      });
    }

    // Sort by total count descending
    rows.sort((a, b) => b.periodA + b.periodB - (a.periodA + a.periodB));

    return rows;
  }, [data]);

  const propertyLabel =
    PROPERTIES.find((p) => p.value === data.property)?.label ?? data.property;

  return (
    <Card>
      <CardTitle>{propertyLabel} Comparison</CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="value"
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              interval={0}
              angle={chartData.length > 8 ? -45 : 0}
              textAnchor={chartData.length > 8 ? "end" : "middle"}
              height={chartData.length > 8 ? 80 : 30}
            />
            <YAxis
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <RechartsTooltip
              content={<ComparisonTooltip data={data} />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 12 }}
              formatter={(value: string) => (
                <span className="type-label text-text-secondary">{value}</span>
              )}
            />
            <Bar
              dataKey="periodA"
              name={data.period_a.label}
              fill="var(--chart-1)"
              radius={[2, 2, 0, 0]}
              animationDuration={250}
              animationEasing="ease-out"
            />
            <Bar
              dataKey="periodB"
              name={data.period_b.label}
              fill="var(--chart-2)"
              radius={[2, 2, 0, 0]}
              animationDuration={250}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Comparison Tooltip ---

interface ComparisonTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string; dataKey: string }[];
  label?: string;
  data: ComparisonData;
}

function ComparisonTooltip({ active, payload, label }: ComparisonTooltipProps) {
  if (!active || !payload?.length) return null;

  const filtered = payload
    .filter((p) => p.value !== 0)
    .sort((a, b) => b.value - a.value);
  if (filtered.length === 0) return null;

  return (
    <div className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2">
      <div className="type-label text-text-secondary mb-1">{label}</div>
      {filtered.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-[1px]"
            style={{ backgroundColor: entry.color }}
          />
          <span className="type-body text-text-secondary flex-1 truncate">
            {entry.name}
          </span>
          <span className="type-data text-text-primary">
            {entry.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Delta Cards ---

interface DeltaItem {
  value: string;
  countA: number;
  countB: number;
  delta: number;
  deltaPercent: number;
}

function DeltaCards({ data }: { data: ComparisonData }) {
  const deltas = useMemo(() => {
    const mapA = new Map<string, number>();
    const mapB = new Map<string, number>();

    for (const d of data.period_a.data) {
      mapA.set(d.value, (mapA.get(d.value) ?? 0) + d.count);
    }
    for (const d of data.period_b.data) {
      mapB.set(d.value, (mapB.get(d.value) ?? 0) + d.count);
    }

    const allValues = new Set([...mapA.keys(), ...mapB.keys()]);
    const items: DeltaItem[] = [];

    for (const value of allValues) {
      const countA = mapA.get(value) ?? 0;
      const countB = mapB.get(value) ?? 0;
      const delta = countA - countB;
      const deltaPercent =
        countB > 0 ? (delta / countB) * 100 : countA > 0 ? 100 : 0;

      items.push({ value, countA, countB, delta, deltaPercent });
    }

    // Sort by absolute delta descending
    items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return items;
  }, [data]);

  const propertyLabel =
    PROPERTIES.find((p) => p.value === data.property)?.label ?? data.property;

  if (deltas.length === 0) return null;

  const maxCount = Math.max(...deltas.map((d) => Math.max(d.countA, d.countB)));

  return (
    <Card>
      <CardTitle>{propertyLabel} Changes</CardTitle>
      <CardContent>
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center border-b border-[var(--border-subtle)] pb-2">
            <span className="type-label flex-1 uppercase tracking-wider text-text-tertiary">
              {propertyLabel}
            </span>
            <span className="type-label w-20 text-right uppercase tracking-wider text-text-tertiary">
              {data.period_a.label.length > 10
                ? "Period A"
                : data.period_a.label}
            </span>
            <span className="type-label w-20 text-right uppercase tracking-wider text-text-tertiary">
              {data.period_b.label.length > 10
                ? "Period B"
                : data.period_b.label}
            </span>
            <span className="type-label w-24 text-right uppercase tracking-wider text-text-tertiary">
              Change
            </span>
          </div>

          {deltas.map((item) => {
            const isPositive = item.delta > 0;
            const isNegative = item.delta < 0;

            return (
              <div
                key={item.value}
                className="relative flex items-center border-b border-[var(--border-subtle)] py-2 transition-colors hover:bg-[hsla(35,40%,20%,0.15)]"
                style={{
                  transitionDuration: "var(--duration-fast)",
                  transitionTimingFunction: "var(--ease-out)",
                }}
              >
                <ExposureBar
                  value={
                    maxCount > 0
                      ? (Math.max(item.countA, item.countB) / maxCount) * 100
                      : 0
                  }
                  className="absolute bottom-0 left-0"
                />
                <span
                  className="type-body flex-1 truncate text-text-primary"
                  title={item.value}
                >
                  {item.value}
                </span>
                <span className="type-data w-20 text-right text-text-secondary">
                  {item.countA.toLocaleString()}
                </span>
                <span className="type-data w-20 text-right text-text-secondary">
                  {item.countB.toLocaleString()}
                </span>
                <span
                  className={cn(
                    "type-data inline-flex w-24 items-center justify-end gap-1",
                    isPositive && "text-success",
                    isNegative && "text-destructive",
                    !isPositive && !isNegative && "text-text-muted",
                  )}
                >
                  {isPositive && <ArrowUp size={12} />}
                  {isNegative && <ArrowDown size={12} />}
                  {isPositive ? "+" : ""}
                  {item.deltaPercent.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Loading Skeleton ---

function ComparisonSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-32" />
      <SkeletonCard className="h-[420px]" />
      <SkeletonCard className="h-64" />
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

function ComparisonEmpty({ hasPeriods }: { hasPeriods: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="type-body text-text-tertiary">
        {hasPeriods
          ? "No data for the selected periods and filters"
          : "Select two periods to compare"}
      </p>
    </div>
  );
}

// --- Error State ---

function ComparisonError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Card className="border-[var(--destructive)] max-w-md">
        <p className="type-body text-destructive">{message}</p>
      </Card>
    </div>
  );
}
