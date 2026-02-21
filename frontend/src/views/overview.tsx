import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { useCatalog } from "@/lib/catalog-context";
import { useFilterContext } from "@/lib/filter-context";
import { buildFilterParams } from "@/lib/filter-context";
import {
  fetchOverview,
  fetchHeatmap,
  fetchBreakdown,
  type Overview as OverviewData,
  type HeatmapDay,
  type BreakdownTotal,
} from "@/lib/api";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { ExposureBar } from "@/components/ui/exposure-bar";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "loaded" | "error" | "empty";

interface TopItem {
  name: string;
  count: number;
}

export function Overview() {
  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();
  const params = buildFilterParams(filters, selectedCatalog);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<OverviewData | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const [topCameras, setTopCameras] = useState<TopItem[]>([]);
  const [topLenses, setTopLenses] = useState<TopItem[]>([]);
  const [topFocalLengths, setTopFocalLengths] = useState<TopItem[]>([]);

  useEffect(() => {
    if (!selectedCatalog) return;
    let cancelled = false;

    setLoadState("loading");

    const overviewPromise = fetchOverview(params);

    // Heatmap: last 3 months
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const heatmapParams = {
      ...params,
      start_date: threeMonthsAgo.toISOString().split("T")[0],
      end_date: now.toISOString().split("T")[0],
    };
    const heatmapPromise = fetchHeatmap(heatmapParams);

    // Breakdown: top cameras, lenses, focal lengths
    const breakdownBase = { ...params, top_n: 5, grouping: "year" };
    const camerasPromise = fetchBreakdown({
      ...breakdownBase,
      property: "cameraName",
    });
    const lensesPromise = fetchBreakdown({
      ...breakdownBase,
      property: "lensName",
    });
    const focalPromise = fetchBreakdown({
      ...breakdownBase,
      property: "focalLength",
    });

    Promise.all([
      overviewPromise,
      heatmapPromise,
      camerasPromise,
      lensesPromise,
      focalPromise,
    ])
      .then(
        ([overviewRes, heatmapRes, camerasRes, lensesRes, focalRes]) => {
          if (cancelled) return;

          setData(overviewRes);
          setHeatmapData(heatmapRes.data);

          const toTopItems = (totals: BreakdownTotal[]): TopItem[] =>
            totals.slice(0, 5).map((t) => ({ name: t.value, count: t.count }));

          setTopCameras(toTopItems(camerasRes.totals));
          setTopLenses(toTopItems(lensesRes.totals));
          setTopFocalLengths(toTopItems(focalRes.totals));

          if (overviewRes.total_photos === 0) {
            setLoadState("empty");
          } else {
            setLoadState("loaded");
          }
        },
      )
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : "Failed to load data");
        setLoadState("error");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatalog, filters.startDate, filters.endDate, filters.picksOnly, filters.minRating, filters.excludeCameras, filters.excludeLenses]);

  if (loadState === "loading") return <OverviewSkeleton />;
  if (loadState === "error") return <OverviewError message={errorMessage} />;
  if (loadState === "empty" || !data) return <OverviewEmpty />;

  return (
    <div className="space-y-6">
      {/* Hero + Supporting Stats */}
      <HeroSection data={data} />

      {/* Shooting Frequency Line Chart */}
      <ShootingFrequencyChart data={data.photos_per_month} />

      {/* Rating Distribution + Mini Heatmap */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RatingDistributionChart data={data.rating_distribution} totalPhotos={data.total_photos} />
        <MiniHeatmap data={heatmapData} />
      </div>

      {/* Top 5 Quick Lists */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <RankedList title="Top Cameras" items={topCameras} />
        <RankedList title="Top Lenses" items={topLenses} />
        <RankedList title="Top Focal Lengths" items={topFocalLengths} />
      </div>
    </div>
  );
}

// --- Hero Section ---

function HeroSection({ data }: { data: OverviewData }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr] xl:grid-cols-[3fr_2fr]">
      {/* Hero Stat Card */}
      <Card className="flex flex-col justify-center">
        <span className="type-label text-text-secondary">Total Photos</span>
        <span className="type-data-lg mt-2 text-text-primary">
          {data.total_photos.toLocaleString()}
        </span>
        <ExposureBar value={100} className="mt-3" />
      </Card>

      {/* Supporting Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Most Used Camera"
          value={data.most_used_camera?.name ?? "—"}
          count={data.most_used_camera?.count}
          proportion={
            data.most_used_camera
              ? (data.most_used_camera.count / data.total_photos) * 100
              : 0
          }
        />
        <StatCard
          label="Most Used Lens"
          value={data.most_used_lens?.name ?? "—"}
          count={data.most_used_lens?.count}
          proportion={
            data.most_used_lens
              ? (data.most_used_lens.count / data.total_photos) * 100
              : 0
          }
        />
        <StatCard
          label="Most Used Focal Length"
          value={data.most_used_focal_length?.name ?? "—"}
          count={data.most_used_focal_length?.count}
          proportion={
            data.most_used_focal_length
              ? (data.most_used_focal_length.count / data.total_photos) * 100
              : 0
          }
        />
        <StatCard
          label="Date Range"
          value={formatDateRange(data.date_range.earliest, data.date_range.latest)}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  count,
  proportion,
}: {
  label: string;
  value: string;
  count?: number;
  proportion?: number;
}) {
  return (
    <Card>
      <span className="type-label text-text-secondary">{label}</span>
      <div className="mt-1 truncate type-data text-text-primary" title={value}>
        {value}
      </div>
      {count !== undefined && (
        <span className="type-caption text-text-tertiary">
          {count.toLocaleString()} photos
        </span>
      )}
      {proportion !== undefined && proportion > 0 && (
        <ExposureBar value={proportion} className="mt-2" />
      )}
    </Card>
  );
}

function formatDateRange(earliest: string | null, latest: string | null): string {
  if (!earliest && !latest) return "—";
  if (!earliest) return `— ${latest}`;
  if (!latest) return `${earliest} —`;
  return `${earliest} – ${latest}`;
}

// --- Shooting Frequency Line Chart ---

function ShootingFrequencyChart({
  data,
}: {
  data: { period: string; count: number }[];
}) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardTitle>Shooting Frequency</CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 12, fill: "var(--text-tertiary)", fontFamily: "var(--font-sans)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              tickFormatter={formatMonthLabel}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12, fill: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <RechartsTooltip
              content={<FrequencyTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--chart-1)",
                stroke: "var(--surface-raised)",
                strokeWidth: 2,
              }}
              animationDuration={250}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function formatMonthLabel(value: string): string {
  // value is "YYYY-MM"
  const parts = value.split("-");
  if (parts.length < 2) return value;
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthIdx = parseInt(parts[1], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  // Show year for Jan or first entry
  if (parts[1] === "01") return `${monthNames[monthIdx]} '${parts[0].slice(2)}`;
  return monthNames[monthIdx];
}

interface TooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function FrequencyTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  if (payload[0].value === 0) return null;
  return (
    <div
      className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2"
    >
      <div className="type-label text-text-secondary">{label}</div>
      <div className="type-data text-text-primary">
        {payload[0].value.toLocaleString()} photos
      </div>
    </div>
  );
}

// --- Rating Distribution Bar Chart ---

function RatingDistributionChart({
  data,
  totalPhotos,
}: {
  data: { rating: number; count: number }[];
  totalPhotos: number;
}) {
  const chartData = data.map((d) => ({
    label: d.rating === 0 ? "Unrated" : `${"★".repeat(d.rating)}`,
    count: d.count,
    rating: d.rating,
    percentage: totalPhotos > 0 ? ((d.count / totalPhotos) * 100).toFixed(1) : "0.0",
  }));

  return (
    <Card>
      <CardTitle>Rating Distribution</CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={{ fontSize: 12, fill: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="label"
              type="category"
              tick={{ fontSize: 12, fill: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <RechartsTooltip
              content={<RatingTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Bar
              dataKey="count"
              fill="var(--chart-1)"
              radius={[0, 2, 2, 0]}
              animationDuration={250}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface RatingTooltipProps {
  active?: boolean;
  payload?: { payload: { label: string; count: number; percentage: string } }[];
}

function RatingTooltip({ active, payload }: RatingTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  if (item.count === 0) return null;
  return (
    <div
      className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2"
    >
      <div className="type-label text-text-secondary">{item.label}</div>
      <div className="type-data text-text-primary">
        {item.count.toLocaleString()} photos ({item.percentage}%)
      </div>
    </div>
  );
}

// --- Mini Heatmap ---

function MiniHeatmap({ data }: { data: HeatmapDay[] }) {
  const { weeks, maxCount } = useMemo(() => {
    if (data.length === 0) return { weeks: [], maxCount: 0 };

    let max = 0;
    for (const d of data) {
      if (d.count > max) max = d.count;
    }

    // Group data into weeks (columns). Each week is an array of 7 days (Sun-Sat).
    const weeksList: (HeatmapDay | null)[][] = [];
    let currentWeek: (HeatmapDay | null)[] = [];

    // Pad start of first week so first day aligns to its day-of-week
    if (data.length > 0) {
      const firstDate = new Date(data[0].date + "T00:00:00");
      const startDow = firstDate.getDay(); // 0=Sun
      for (let i = 0; i < startDow; i++) {
        currentWeek.push(null);
      }
    }

    for (const day of data) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeksList.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      // Pad end of last week
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeksList.push(currentWeek);
    }

    return { weeks: weeksList, maxCount: max };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardTitle>Recent Activity</CardTitle>
        <CardContent>
          <p className="type-body text-text-tertiary text-center py-8">
            No activity data available
          </p>
        </CardContent>
      </Card>
    );
  }

  const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
  const CELL_SIZE = 12;
  const CELL_GAP = 2;

  return (
    <Card>
      <CardTitle>Recent Activity</CardTitle>
      <CardContent>
        <div className="flex gap-1 overflow-x-auto">
          {/* Day labels */}
          <div className="flex flex-col shrink-0" style={{ gap: CELL_GAP }}>
            {DAY_LABELS.map((label, i) => (
              <div
                key={i}
                className="type-caption text-text-tertiary flex items-center justify-end pr-1"
                style={{ height: CELL_SIZE, width: 28 }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Weeks grid */}
          <div className="flex" style={{ gap: CELL_GAP }}>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col" style={{ gap: CELL_GAP }}>
                {week.map((day, di) => (
                  <HeatmapCell
                    key={di}
                    day={day}
                    maxCount={maxCount}
                    size={CELL_SIZE}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HeatmapCell({
  day,
  maxCount,
  size,
}: {
  day: HeatmapDay | null;
  maxCount: number;
  size: number;
}) {
  if (!day) {
    return (
      <div
        style={{ width: size, height: size }}
      />
    );
  }

  const intensity = maxCount > 0 ? day.count / maxCount : 0;

  // Interpolate between --surface-inset (0) and --accent (1)
  // Using opacity-based approach on accent for smooth scaling
  let bg: string;
  if (day.count === 0) {
    bg = "var(--surface-inset)";
  } else {
    // Scale from accent-muted to full accent
    const opacity = 0.3 + intensity * 0.7;
    bg = `color-mix(in srgb, var(--accent) ${Math.round(opacity * 100)}%, var(--surface-inset))`;
  }

  return (
    <div
      className="rounded-[1px]"
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
      }}
      title={`${day.date}: ${day.count} photo${day.count !== 1 ? "s" : ""}`}
    />
  );
}

// --- Top 5 Ranked Lists ---

function RankedList({ title, items }: { title: string; items: TopItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardTitle>{title}</CardTitle>
        <CardContent>
          <p className="type-body text-text-tertiary text-center py-4">No data</p>
        </CardContent>
      </Card>
    );
  }

  const maxCount = items[0].count;

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <CardContent className="space-y-3">
        {items.map((item, i) => (
          <div key={item.name} className="relative">
            {/* Exposure bar background */}
            <ExposureBar
              value={maxCount > 0 ? (item.count / maxCount) * 100 : 0}
              className="absolute bottom-0 left-0"
            />
            <div className="flex items-baseline gap-3">
              <span className="type-caption text-text-muted w-4 shrink-0 text-right">
                {i + 1}
              </span>
              <span className="type-body text-text-primary truncate flex-1" title={item.name}>
                {item.name}
              </span>
              <span className="type-data text-text-secondary shrink-0">
                {item.count.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// --- Loading Skeleton ---

function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr] xl:grid-cols-[3fr_2fr]">
        <SkeletonCard className="h-32" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </div>
      </div>
      {/* Chart skeleton */}
      <SkeletonCard className="h-80" />
      {/* Bottom row skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
      {/* Lists skeleton */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SkeletonCard className="h-52" />
        <SkeletonCard className="h-52" />
        <SkeletonCard className="h-52" />
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

function OverviewEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="type-body text-text-tertiary">
        No photos found matching the current filters
      </p>
    </div>
  );
}

// --- Error State ---

function OverviewError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Card className="border-[var(--destructive)] max-w-md">
        <p className="type-body text-destructive">{message}</p>
      </Card>
    </div>
  );
}
