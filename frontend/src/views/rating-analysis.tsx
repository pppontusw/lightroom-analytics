import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useCatalog } from "@/lib/catalog-context";
import { useFilterContext, buildFilterParams } from "@/lib/filter-context";
import {
  fetchRatingDistribution,
  type RatingDistribution,
  type RatingParams,
} from "@/lib/api";
import { Card, CardTitle, CardContent } from "@/components/ui/card";
import { ExposureBar } from "@/components/ui/exposure-bar";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "loaded" | "error" | "empty";

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

export function RatingAnalysis() {
  const { selectedCatalog } = useCatalog();
  const filters = useFilterContext();
  const baseParams = buildFilterParams(filters, selectedCatalog);

  // For rating analysis, exclude min_rating so we see all ratings
  const params: RatingParams = {
    catalog: baseParams.catalog,
    start_date: baseParams.start_date,
    end_date: baseParams.end_date,
    picks_only: baseParams.picks_only,
    exclude_cameras: baseParams.exclude_cameras,
  };

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<RatingDistribution | null>(null);

  useEffect(() => {
    if (!selectedCatalog) return;
    let cancelled = false;

    setLoadState("loading");

    fetchRatingDistribution(params)
      .then((res) => {
        if (cancelled) return;
        const totalPhotos = res.overall.reduce((sum, e) => sum + e.count, 0);
        if (totalPhotos === 0) {
          setLoadState("empty");
        } else {
          setLoadState("loaded");
        }
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load rating data",
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
    filters.excludeCameras,
    filters.excludeLenses,
  ]);

  if (loadState === "loading") return <RatingSkeleton />;
  if (loadState === "error") return <RatingError message={errorMessage} />;
  if (loadState === "empty" || !data) return <RatingEmpty />;

  return (
    <div className="space-y-6">
      {/* Rating Distribution Bar Chart */}
      <RatingDistributionChart data={data.overall} />

      {/* Average Rating Over Time + Pick Rate */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AverageRatingOverTime data={data.over_time} />
        <PickRateCard pickStats={data.pick_stats} />
      </div>

      {/* Rating By Camera */}
      <RatingByCameraChart data={data.by_camera} />

      {/* Pick Rate By Camera */}
      {data.pick_stats.by_camera.length > 0 && (
        <PickRateByCamera data={data.pick_stats.by_camera} />
      )}
    </div>
  );
}

// --- Rating Distribution Bar Chart ---

function RatingDistributionChart({
  data,
}: {
  data: RatingDistribution["overall"];
}) {
  const totalPhotos = data.reduce((sum, e) => sum + e.count, 0);

  const chartData = data.map((d) => ({
    label: d.rating === 0 ? "Unrated" : `${d.rating} ★`,
    count: d.count,
    percentage: d.percentage,
    rating: d.rating,
  }));

  return (
    <Card>
      <CardTitle>Rating Distribution</CardTitle>
      <CardContent>
        <div className="mb-3 flex items-baseline gap-2">
          <span className="type-data-lg text-text-primary">
            {totalPhotos.toLocaleString()}
          </span>
          <span className="type-label text-text-secondary">total photos</span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={chartData}
            margin={{ top: 16, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{
                fontSize: 12,
                fill: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
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
              content={<DistributionTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Bar
              dataKey="count"
              fill="var(--chart-1)"
              radius={[2, 2, 0, 0]}
              animationDuration={250}
              animationEasing="ease-out"
              label={<PercentageLabel chartData={chartData} />}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PercentageLabel({
  x = 0,
  y = 0,
  width = 0,
  value = 0,
  index = 0,
  chartData,
}: {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
  index?: number;
  chartData: { percentage: number }[];
}) {
  if (value === 0) return null;
  const pct = chartData[index]?.percentage ?? 0;
  return (
    <text
      x={x + width / 2}
      y={y - 6}
      textAnchor="middle"
      fill="var(--text-tertiary)"
      fontSize={11}
      fontFamily="var(--font-mono)"
    >
      {pct}%
    </text>
  );
}

interface DistributionTooltipProps {
  active?: boolean;
  payload?: {
    payload: { label: string; count: number; percentage: number };
  }[];
}

function DistributionTooltip({ active, payload }: DistributionTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  if (item.count === 0) return null;
  return (
    <div className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2">
      <div className="type-label text-text-secondary">{item.label}</div>
      <div className="type-data text-text-primary">
        {item.count.toLocaleString()} photos ({item.percentage}%)
      </div>
    </div>
  );
}

// --- Average Rating Over Time ---

function AverageRatingOverTime({
  data,
}: {
  data: RatingDistribution["over_time"];
}) {
  if (data.length === 0) {
    return (
      <Card>
        <CardTitle>Average Rating Over Time</CardTitle>
        <CardContent>
          <p className="type-body text-text-tertiary py-8 text-center">
            No rated photos to show trends
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Average Rating Over Time</CardTitle>
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
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border-subtle)" }}
              tickFormatter={formatMonthLabel}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 5]}
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={false}
              width={32}
              ticks={[0, 1, 2, 3, 4, 5]}
            />
            <RechartsTooltip
              content={<OverTimeTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Line
              type="monotone"
              dataKey="avg_rating"
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
  const parts = value.split("-");
  if (parts.length < 2) return value;
  const monthNames = [
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
  const monthIdx = parseInt(parts[1], 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  if (parts[1] === "01")
    return `${monthNames[monthIdx]} '${parts[0].slice(2)}`;
  return monthNames[monthIdx];
}

interface OverTimeTooltipProps {
  active?: boolean;
  payload?: {
    payload: { period: string; avg_rating: number; rated_count: number };
  }[];
}

function OverTimeTooltip({ active, payload }: OverTimeTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  if (item.rated_count === 0) return null;
  return (
    <div className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2">
      <div className="type-label text-text-secondary">{item.period}</div>
      <div className="type-data text-text-primary">
        Avg: {item.avg_rating.toFixed(1)} ★
      </div>
      <div className="type-caption text-text-tertiary">
        {item.rated_count.toLocaleString()} rated photos
      </div>
    </div>
  );
}

// --- Pick Rate Card ---

function PickRateCard({
  pickStats,
}: {
  pickStats: RatingDistribution["pick_stats"];
}) {
  return (
    <Card className="flex flex-col">
      <CardTitle>Pick Rate</CardTitle>
      <CardContent className="flex flex-1 flex-col justify-center">
        <div className="flex flex-col items-center py-4">
          <span className="type-data-lg text-text-primary">
            {pickStats.pick_rate.toFixed(1)}%
          </span>
          <ExposureBar value={pickStats.pick_rate} className="mt-3 w-full" />
          <div className="mt-3 flex gap-6">
            <div className="text-center">
              <span className="type-data text-text-primary">
                {pickStats.picked.toLocaleString()}
              </span>
              <span className="type-caption block text-text-tertiary">
                picked
              </span>
            </div>
            <div className="text-center">
              <span className="type-data text-text-primary">
                {pickStats.total.toLocaleString()}
              </span>
              <span className="type-caption block text-text-tertiary">
                total
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Rating By Camera Chart ---

function RatingByCameraChart({
  data,
}: {
  data: RatingDistribution["by_camera"];
}) {
  const chartData = useMemo(
    () =>
      data.map((d, i) => ({
        camera: d.camera,
        avg_rating: d.avg_rating,
        rated_count: d.rated_count,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [data],
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardTitle>Rating By Camera</CardTitle>
        <CardContent>
          <p className="type-body text-text-tertiary py-8 text-center">
            No rated photos by camera
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Rating By Camera</CardTitle>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(280, data.length * 48)}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--border-subtle)"
              strokeDasharray="3 3"
              horizontal={false}
            />
            <XAxis
              type="number"
              domain={[0, 5]}
              ticks={[0, 1, 2, 3, 4, 5]}
              tick={{
                fontSize: 12,
                fill: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              dataKey="camera"
              type="category"
              tick={{
                fontSize: 12,
                fill: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
              }}
              tickLine={false}
              axisLine={false}
              width={140}
            />
            <RechartsTooltip
              content={<ByCameraTooltip />}
              wrapperStyle={{ zIndex: 9999 }}
            />
            <Bar
              dataKey="avg_rating"
              radius={[0, 2, 2, 0]}
              animationDuration={250}
              animationEasing="ease-out"
            >
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface ByCameraTooltipProps {
  active?: boolean;
  payload?: {
    payload: {
      camera: string;
      avg_rating: number;
      rated_count: number;
      fill: string;
    };
  }[];
}

function ByCameraTooltip({ active, payload }: ByCameraTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  if (item.rated_count === 0) return null;
  return (
    <div className="z-[9999] rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated px-3 py-2">
      <div className="type-label text-text-secondary">{item.camera}</div>
      <div className="type-data text-text-primary">
        Avg: {item.avg_rating.toFixed(1)} ★
      </div>
      <div className="type-caption text-text-tertiary">
        {item.rated_count.toLocaleString()} rated photos
      </div>
    </div>
  );
}

// --- Pick Rate By Camera ---

function PickRateByCamera({
  data,
}: {
  data: RatingDistribution["pick_stats"]["by_camera"];
}) {
  const maxRate = Math.max(...data.map((d) => d.pick_rate));

  return (
    <Card>
      <CardTitle>Pick Rate By Camera</CardTitle>
      <CardContent>
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center border-b border-[var(--border-subtle)] pb-2">
            <span className="type-label flex-1 uppercase tracking-wider text-text-tertiary">
              Camera
            </span>
            <span className="type-label w-20 text-right uppercase tracking-wider text-text-tertiary">
              Picked
            </span>
            <span className="type-label w-20 text-right uppercase tracking-wider text-text-tertiary">
              Total
            </span>
            <span className="type-label w-20 text-right uppercase tracking-wider text-text-tertiary">
              Rate
            </span>
          </div>

          {data.map((item) => (
            <div
              key={item.camera}
              className="relative flex items-center border-b border-[var(--border-subtle)] py-2 transition-colors hover:bg-[hsla(35,40%,20%,0.15)]"
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              <ExposureBar
                value={maxRate > 0 ? (item.pick_rate / maxRate) * 100 : 0}
                className="absolute bottom-0 left-0"
              />
              <span
                className="type-body flex-1 truncate text-text-primary"
                title={item.camera}
              >
                {item.camera}
              </span>
              <span className="type-data w-20 text-right text-text-secondary">
                {item.picked.toLocaleString()}
              </span>
              <span className="type-data w-20 text-right text-text-secondary">
                {item.total.toLocaleString()}
              </span>
              <span className="type-data w-20 text-right text-text-primary">
                {item.pick_rate.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Loading Skeleton ---

function RatingSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonCard className="h-[380px]" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SkeletonCard className="h-[340px]" />
        <SkeletonCard className="h-[340px]" />
      </div>
      <SkeletonCard className="h-[360px]" />
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

function RatingEmpty() {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <p className="type-body text-text-tertiary">
        No rating data available for the selected filters
      </p>
    </div>
  );
}

// --- Error State ---

function RatingError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-32">
      <Card className="max-w-md border-[var(--destructive)]">
        <p className="type-body text-destructive">{message}</p>
      </Card>
    </div>
  );
}
