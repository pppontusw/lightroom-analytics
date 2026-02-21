import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChevronDown, ChevronUp, BarChart3, TrendingUp, PieChart as PieChartIcon } from "lucide-react";
import { useCatalog } from "@/lib/catalog-context";
import { useFilterContext, buildFilterParams } from "@/lib/filter-context";
import {
  fetchBreakdown,
  type Breakdown,
  type BreakdownDataPoint,
  type BreakdownTotal,
} from "@/lib/api";
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

const GROUPINGS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
] as const;

const CHART_TYPES = [
  { value: "bar", label: "Bar", icon: BarChart3 },
  { value: "line", label: "Line", icon: TrendingUp },
  { value: "pie", label: "Pie", icon: PieChartIcon },
] as const;

type ChartType = (typeof CHART_TYPES)[number]["value"];

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

type LoadState = "loading" | "loaded" | "error" | "empty";
type SortField = "value" | "count" | "period";
type SortDir = "asc" | "desc";

/** When true, table shows one row per value (full period totals). When false, one row per period per value. */
const TABLE_GROUP_LABELS = [
  { value: true, label: "Full period" },
  { value: false, label: "By time period" },
] as const;

// --- Main Component ---

export function GearBreakdown() {
  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();
  const params = buildFilterParams(filters, selectedCatalog);

  const [property, setProperty] = useState("cameraName");
  const [grouping, setGrouping] = useState("month");
  const [topN, setTopN] = useState(50);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [tableGroupByFullPeriod, setTableGroupByFullPeriod] = useState(true);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<Breakdown | null>(null);
  const [selectedLegendItem, setSelectedLegendItem] = useState<string | null>(null);

  const handleLegendClick = useCallback((value: string) => {
    setSelectedLegendItem((prev) => (prev === value ? null : value));
  }, []);

  useEffect(() => {
    setSelectedLegendItem(null);
  }, [
    property,
    grouping,
    topN,
    filters.startDate,
    filters.endDate,
    filters.picksOnly,
    filters.minRating,
    filters.excludeCameras,
    filters.excludeLenses,
  ]);

  useEffect(() => {
    if (!selectedCatalog) return;
    let cancelled = false;

    setLoadState("loading");

    fetchBreakdown({ ...params, property, grouping, top_n: topN })
      .then((res) => {
        if (cancelled) return;
        if (res.data.length === 0 && res.totals.length === 0) {
          setLoadState("empty");
        } else {
          setLoadState("loaded");
        }
        setData(res);
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
    property,
    grouping,
    topN,
    filters.startDate,
    filters.endDate,
    filters.picksOnly,
    filters.minRating,
    filters.excludeCameras,
    filters.excludeLenses,
  ]);

  return (
    <div className="space-y-6">
      {/* View Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <PropertySelector value={property} onChange={setProperty} />
        <GroupingSelector value={grouping} onChange={setGrouping} />
        <TopNControl value={topN} onChange={setTopN} />
        <ChartTypeToggle value={chartType} onChange={setChartType} />
      </div>

      {/* Content */}
      {loadState === "loading" && <BreakdownSkeleton />}
      {loadState === "error" && <BreakdownError message={errorMessage} />}
      {loadState === "empty" && <BreakdownEmpty />}
      {loadState === "loaded" && data && (
        <>
          {chartType === "bar" && (
            <StackedBarChart
              data={data}
              selectedLegendItem={selectedLegendItem}
              onLegendClick={handleLegendClick}
            />
          )}
          {chartType === "line" && (
            <MultiLineChart
              data={data}
              selectedLegendItem={selectedLegendItem}
              onLegendClick={handleLegendClick}
            />
          )}
          {chartType === "pie" && (
            <PieDonutChart
              data={data}
              selectedLegendItem={selectedLegendItem}
              onLegendClick={handleLegendClick}
            />
          )}
          <DataTable
            data={data}
            selectedLegendItem={selectedLegendItem}
            groupByFullPeriod={tableGroupByFullPeriod}
            onGroupByFullPeriodChange={setTableGroupByFullPeriod}
          />
        </>
      )}
    </div>
  );
}

// --- Property Selector (custom dropdown) ---

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

// --- Grouping Selector (button group) ---

function GroupingSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)]">
      {GROUPINGS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "type-label px-2.5 py-1.5 transition-colors first:rounded-l-[var(--radius-sm)] last:rounded-r-[var(--radius-sm)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
            "active:scale-[0.98]",
            value === option.value
              ? "bg-accent-muted text-text-primary"
              : "text-text-tertiary hover:text-text-secondary hover:bg-[var(--border-subtle)]",
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
  );
}

// --- Top N Control ---

function TopNControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)] px-3 py-1.5">
      <span className="type-label text-text-tertiary">Top</span>
      <input
        type="range"
        min={1}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 cursor-pointer appearance-none rounded-full bg-[var(--border-emphasis)] accent-[var(--accent)]"
      />
      <span className="type-data w-6 text-center text-text-primary">
        {value}
      </span>
    </div>
  );
}

// --- Chart Type Toggle ---

function ChartTypeToggle({
  value,
  onChange,
}: {
  value: ChartType;
  onChange: (v: ChartType) => void;
}) {
  return (
    <div className="ml-auto inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)]">
      {CHART_TYPES.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1.5 transition-colors first:rounded-l-[var(--radius-sm)] last:rounded-r-[var(--radius-sm)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
              "active:scale-[0.98]",
              value === option.value
                ? "bg-accent-muted text-text-primary"
                : "text-text-tertiary hover:text-text-secondary hover:bg-[var(--border-subtle)]",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
            title={option.label}
          >
            <Icon size={14} />
            <span className="type-label hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// --- Chart helpers ---

/** Pivot flat data into Recharts-friendly rows keyed by period */
function pivotData(data: BreakdownDataPoint[], uniqueValues: string[]) {
  const periodMap = new Map<string, Record<string, number>>();

  for (const point of data) {
    if (!periodMap.has(point.period)) {
      periodMap.set(point.period, { period_label: 0 });
    }
    const row = periodMap.get(point.period)!;
    row[String(point.value)] = point.count;
  }

  // Build sorted array
  const periods = Array.from(periodMap.keys()).sort();
  return periods.map((period) => {
    const row: Record<string, string | number> = { period };
    const values = periodMap.get(period)!;
    for (const v of uniqueValues) {
      row[v] = values[v] ?? 0;
    }
    return row;
  });
}

function getUniqueValues(totals: BreakdownTotal[]): string[] {
  return totals.map((t) => String(t.value));
}

function getColorForIndex(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

// --- Clickable Legend (filter by clicking an item) ---

interface ClickableLegendProps {
  items: string[];
  selectedItem: string | null;
  onItemClick: (value: string) => void;
}

function ClickableLegend({ items, selectedItem, onItemClick }: ClickableLegendProps) {
  return (
    <div
      className="flex flex-wrap justify-center gap-x-4 gap-y-1"
      style={{ paddingTop: 12 }}
    >
      {items.map((value, i) => (
        <button
          key={value}
          type="button"
          onClick={() => onItemClick(value)}
          className={cn(
            "type-label inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
            "active:scale-[0.98]",
            selectedItem === value
              ? "bg-accent-muted text-text-primary"
              : "text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
          )}
          style={{
            transitionDuration: "var(--duration-fast)",
            transitionTimingFunction: "var(--ease-out)",
          }}
        >
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-[1px]"
            style={{ backgroundColor: getColorForIndex(i) }}
          />
          <span className="truncate">{value}</span>
        </button>
      ))}
    </div>
  );
}

// --- Custom Tooltip ---

interface ChartTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const filtered = payload
    .filter((p) => p.value !== 0)
    .sort((a, b) => b.value - a.value);
  if (filtered.length === 0) return null;

  const total = filtered.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2">
      <div className="type-label text-text-secondary mb-1">{label}</div>
      {filtered.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
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
      {filtered.length > 1 && (
        <div className="mt-1 border-t border-[var(--border-subtle)] pt-1">
          <div className="flex items-center justify-between">
            <span className="type-label text-text-tertiary">Total</span>
            <span className="type-data text-text-primary">
              {total.toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Stacked Bar Chart ---

function StackedBarChart({
  data,
  selectedLegendItem,
  onLegendClick,
}: {
  data: Breakdown;
  selectedLegendItem: string | null;
  onLegendClick: (value: string) => void;
}) {
  const uniqueValues = useMemo(
    () => getUniqueValues(data.totals),
    [data.totals],
  );
  const displayedValues = useMemo(
    () =>
      selectedLegendItem
        ? uniqueValues.filter((v) => v === selectedLegendItem)
        : uniqueValues,
    [uniqueValues, selectedLegendItem],
  );
  const pivoted = useMemo(
    () => pivotData(data.data, uniqueValues),
    [data.data, uniqueValues],
  );

  return (
    <Card>
      <CardTitle>
        {PROPERTIES.find((p) => p.value === data.property)?.label ?? data.property} over Time
      </CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={pivoted}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              interval="preserveStartEnd"
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
              content={<ChartTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Legend
              content={
                <ClickableLegend
                  items={uniqueValues}
                  selectedItem={selectedLegendItem}
                  onItemClick={onLegendClick}
                />
              }
            />
            {displayedValues.map((value, i) => (
              <Bar
                key={value}
                dataKey={value}
                stackId="stack"
                fill={getColorForIndex(uniqueValues.indexOf(value))}
                radius={
                  i === displayedValues.length - 1 ? [2, 2, 0, 0] : undefined
                }
                animationDuration={250}
                animationEasing="ease-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Multi-Line Chart ---

function MultiLineChart({
  data,
  selectedLegendItem,
  onLegendClick,
}: {
  data: Breakdown;
  selectedLegendItem: string | null;
  onLegendClick: (value: string) => void;
}) {
  const uniqueValues = useMemo(
    () => getUniqueValues(data.totals),
    [data.totals],
  );
  const displayedValues = useMemo(
    () =>
      selectedLegendItem
        ? uniqueValues.filter((v) => v === selectedLegendItem)
        : uniqueValues,
    [uniqueValues, selectedLegendItem],
  );
  const pivoted = useMemo(
    () => pivotData(data.data, uniqueValues),
    [data.data, uniqueValues],
  );

  return (
    <Card>
      <CardTitle>
        {PROPERTIES.find((p) => p.value === data.property)?.label ?? data.property} over Time
      </CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <LineChart
            data={pivoted}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              interval="preserveStartEnd"
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
              content={<ChartTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Legend
              content={
                <ClickableLegend
                  items={uniqueValues}
                  selectedItem={selectedLegendItem}
                  onItemClick={onLegendClick}
                />
              }
            />
            {displayedValues.map((value) => {
              const colorIndex = uniqueValues.indexOf(value);
              return (
                <Line
                  key={value}
                  type="monotone"
                  dataKey={value}
                  stroke={getColorForIndex(colorIndex)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: getColorForIndex(colorIndex),
                    stroke: "var(--surface-raised)",
                    strokeWidth: 2,
                  }}
                  animationDuration={250}
                  animationEasing="ease-out"
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Pie/Donut Chart ---

interface PieTooltipProps {
  active?: boolean;
  payload?: {
    name: string;
    value: number;
    payload: { value: string; count: number; percentage: string; fill: string };
  }[];
}

function PieTooltip({ active, payload }: PieTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  if (item.count === 0) return null;
  return (
    <div className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-[1px]"
          style={{ backgroundColor: item.fill }}
        />
        <span className="type-body text-text-secondary">{item.value}</span>
      </div>
      <div className="type-data text-text-primary">
        {item.count.toLocaleString()} photos ({item.percentage}%)
      </div>
    </div>
  );
}

function PieDonutChart({
  data,
  selectedLegendItem,
  onLegendClick,
}: {
  data: Breakdown;
  selectedLegendItem: string | null;
  onLegendClick: (value: string) => void;
}) {
  const totalCount = useMemo(
    () => data.totals.reduce((sum, t) => sum + t.count, 0),
    [data.totals],
  );

  const allPieData = useMemo(
    () =>
      data.totals.map((t, i) => ({
        value: String(t.value),
        count: t.count,
        percentage: totalCount > 0 ? ((t.count / totalCount) * 100).toFixed(1) : "0.0",
        fill: getColorForIndex(i),
      })),
    [data.totals, totalCount],
  );

  const pieData = useMemo(
    () =>
      selectedLegendItem
        ? allPieData.filter((d) => d.value === selectedLegendItem)
        : allPieData,
    [allPieData, selectedLegendItem],
  );

  const displayTotalCount = useMemo(
    () => pieData.reduce((sum, d) => sum + d.count, 0),
    [pieData],
  );

  const uniqueValues = useMemo(
    () => data.totals.map((t) => String(t.value)),
    [data.totals],
  );

  return (
    <Card>
      <CardTitle>
        {PROPERTIES.find((p) => p.value === data.property)?.label ?? data.property} Distribution
      </CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={360}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="count"
              nameKey="value"
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="80%"
              paddingAngle={1}
              animationDuration={250}
              animationEasing="ease-out"
            >
              {pieData.map((entry) => (
                <Cell key={entry.value} fill={entry.fill} stroke="var(--surface-raised)" strokeWidth={1} />
              ))}
            </Pie>
            <RechartsTooltip
              content={<PieTooltip />}
              isAnimationActive={false}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Legend
              content={
                <ClickableLegend
                  items={uniqueValues}
                  selectedItem={selectedLegendItem}
                  onItemClick={onLegendClick}
                />
              }
            />
            {/* Center label */}
            <text
              x="50%"
              y="48%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="type-data-lg"
              fill="var(--text-primary)"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 28,
                fontWeight: 600,
              }}
            >
              {displayTotalCount.toLocaleString()}
            </text>
            <text
              x="50%"
              y="56%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text-tertiary)"
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              photos
            </text>
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// --- Data Table ---

function DataTable({
  data,
  selectedLegendItem,
  groupByFullPeriod,
  onGroupByFullPeriodChange,
}: {
  data: Breakdown;
  selectedLegendItem: string | null;
  groupByFullPeriod: boolean;
  onGroupByFullPeriodChange: (v: boolean) => void;
}) {
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir(field === "count" ? "desc" : "asc");
      }
    },
    [sortField],
  );

  const propertyLabel =
    PROPERTIES.find((p) => p.value === data.property)?.label ?? data.property;

  const filteredData = useMemo(() => {
    if (groupByFullPeriod) {
      const source = data.totals;
      return selectedLegendItem
        ? source.filter((row) => String(row.value) === selectedLegendItem)
        : source;
    }
    const source = data.data;
    return selectedLegendItem
      ? source.filter((row) => String(row.value) === selectedLegendItem)
      : source;
  }, [data.totals, data.data, selectedLegendItem, groupByFullPeriod]);

  const sortedData = useMemo(() => {
    const rows = [...filteredData];
    if (groupByFullPeriod) {
      const byField = sortField === "period" ? "value" : sortField;
      rows.sort((a, b) => {
        const ra = a as BreakdownTotal;
        const rb = b as BreakdownTotal;
        let cmp = 0;
        if (byField === "value") {
          cmp = String(ra.value).localeCompare(String(rb.value));
        } else {
          cmp = ra.count - rb.count;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    } else {
      rows.sort((a, b) => {
        const ra = a as BreakdownDataPoint;
        const rb = b as BreakdownDataPoint;
        let cmp = 0;
        if (sortField === "period") {
          cmp = ra.period.localeCompare(rb.period);
        } else if (sortField === "value") {
          cmp = String(ra.value).localeCompare(String(rb.value));
        } else {
          cmp = ra.count - rb.count;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [filteredData, sortField, sortDir, groupByFullPeriod]);

  const effectiveSortField: SortField = groupByFullPeriod
    ? sortField === "period"
      ? "value"
      : sortField
    : sortField;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <CardTitle className="border-0 p-0">Data</CardTitle>
        <div className="inline-flex items-center rounded-[var(--radius-sm)] border border-[var(--control-border)] bg-[var(--control-bg)]">
          {TABLE_GROUP_LABELS.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => onGroupByFullPeriodChange(option.value)}
              className={cn(
                "type-label px-2.5 py-1.5 transition-colors first:rounded-l-[var(--radius-sm)] last:rounded-r-[var(--radius-sm)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
                "active:scale-[0.98]",
                groupByFullPeriod === option.value
                  ? "bg-accent-muted text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-[var(--border-subtle)]",
              )}
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
              title={
                option.value
                  ? "One row per item with totals for the full date range"
                  : "One row per time period per item"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border-subtle)]">
                {!groupByFullPeriod && (
                  <SortableHeader
                    label="Period"
                    field="period"
                    currentField={effectiveSortField}
                    currentDir={sortDir}
                    onClick={handleSort}
                  />
                )}
                <SortableHeader
                  label={propertyLabel}
                  field="value"
                  currentField={effectiveSortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                />
                <SortableHeader
                  label="Count"
                  field="count"
                  currentField={effectiveSortField}
                  currentDir={sortDir}
                  onClick={handleSort}
                  align="right"
                />
              </tr>
            </thead>
            <tbody>
              {groupByFullPeriod
                ? (sortedData as BreakdownTotal[]).map((row, i) => (
                    <tr
                      key={`${row.value}-${i}`}
                      className="border-b border-[var(--border-subtle)] transition-colors hover:bg-[hsla(35,40%,20%,0.15)]"
                      style={{
                        transitionDuration: "var(--duration-fast)",
                        transitionTimingFunction: "var(--ease-out)",
                      }}
                    >
                      <td className="type-body py-2 pr-4 text-text-primary">
                        {String(row.value)}
                      </td>
                      <td className="type-data py-2 text-right text-text-primary">
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  ))
                : (sortedData as BreakdownDataPoint[]).map((row, i) => (
                    <tr
                      key={`${row.period}-${row.value}-${i}`}
                      className="border-b border-[var(--border-subtle)] transition-colors hover:bg-[hsla(35,40%,20%,0.15)]"
                      style={{
                        transitionDuration: "var(--duration-fast)",
                        transitionTimingFunction: "var(--ease-out)",
                      }}
                    >
                      <td className="type-body py-2 pr-4 text-text-tertiary">
                        {row.period}
                      </td>
                      <td className="type-body py-2 pr-4 text-text-primary">
                        {String(row.value)}
                      </td>
                      <td className="type-data py-2 text-right text-text-primary">
                        {row.count.toLocaleString()}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableHeader({
  label,
  field,
  currentField,
  currentDir,
  onClick,
  align,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onClick: (field: SortField) => void;
  align?: "right";
}) {
  const isActive = currentField === field;

  return (
    <th
      className={cn(
        "type-label cursor-pointer select-none pb-2 pr-4 uppercase tracking-wider text-text-tertiary transition-colors hover:text-text-secondary",
        align === "right" && "pr-0 text-right",
      )}
      style={{
        transitionDuration: "var(--duration-fast)",
        transitionTimingFunction: "var(--ease-out)",
      }}
      onClick={() => onClick(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive &&
          (currentDir === "asc" ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          ))}
      </span>
    </th>
  );
}

// --- Loading Skeleton ---

function BreakdownSkeleton() {
  return (
    <div className="space-y-6">
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

function BreakdownEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="type-body text-text-tertiary">
        No data for the selected filters and property
      </p>
    </div>
  );
}

// --- Error State ---

function BreakdownError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Card className="border-[var(--destructive)] max-w-md">
        <p className="type-body text-destructive">{message}</p>
      </Card>
    </div>
  );
}
