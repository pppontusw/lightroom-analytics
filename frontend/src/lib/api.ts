const API_BASE = "/api";

// --- Types matching backend snake_case responses ---

export interface Catalog {
  path: string;
  name: string;
  size_mb: number;
}

export interface DateRange {
  earliest: string | null;
  latest: string | null;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface Overview {
  total_photos: number;
  date_range: DateRange;
  most_used_camera: NameCount | null;
  most_used_lens: NameCount | null;
  most_used_focal_length: NameCount | null;
  photos_per_month: { period: string; count: number }[];
  rating_distribution: { rating: number; count: number }[];
  cameras: string[];
  lenses: string[];
}

export interface BreakdownDataPoint {
  period: string;
  value: string;
  count: number;
}

export interface BreakdownTotal {
  value: string;
  count: number;
}

export interface Breakdown {
  property: string;
  grouping: string;
  data: BreakdownDataPoint[];
  totals: BreakdownTotal[];
}

export interface DrilldownItem {
  value: string;
  count: number;
}

export interface Drilldown {
  level: number;
  property: string;
  data: DrilldownItem[];
  parent_filters?: Record<string, string>;
}

export interface ComparisonPeriod {
  label: string;
  data: BreakdownDataPoint[];
  total: number;
}

export interface Comparison {
  property: string;
  period_a: ComparisonPeriod;
  period_b: ComparisonPeriod;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface Heatmap {
  data: HeatmapDay[];
}

export interface RatingEntry {
  rating: number;
  count: number;
  percentage: number;
}

export interface RatingByCamera {
  camera: string;
  avg_rating: number;
  rated_count: number;
}

export interface RatingOverTime {
  period: string;
  avg_rating: number;
  rated_count: number;
}

export interface PickByCamera {
  camera: string;
  total: number;
  picked: number;
  pick_rate: number;
}

export interface PickStats {
  total: number;
  picked: number;
  pick_rate: number;
  by_camera: PickByCamera[];
}

export interface RatingDistribution {
  overall: RatingEntry[];
  by_camera: RatingByCamera[];
  over_time: RatingOverTime[];
  pick_stats: PickStats;
}

// --- Common filter params ---

export interface FilterParams {
  catalog?: string;
  start_date?: string;
  end_date?: string;
  picks_only?: boolean;
  min_rating?: number;
  exclude_cameras?: string;
  exclude_lenses?: string;
}

export interface BreakdownParams extends FilterParams {
  property?: string;
  grouping?: string;
  top_n?: number;
}

export interface DrilldownParams extends FilterParams {
  hierarchy?: string;
  filter_values?: string;
}

export interface ComparisonParams extends FilterParams {
  property?: string;
  grouping?: string;
  period_a_start: string;
  period_a_end: string;
  period_b_start: string;
  period_b_end: string;
}

export type HeatmapParams = FilterParams;

export interface RatingParams {
  catalog?: string;
  start_date?: string;
  end_date?: string;
  picks_only?: boolean;
  exclude_cameras?: string;
}

// --- Helpers ---

function buildQuery(params: object): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string | number | boolean] => {
      const v = entry[1];
      return v !== undefined && v !== null && v !== "" && v !== false;
    },
  );
  if (entries.length === 0) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) {
    sp.set(k, String(v));
  }
  return `?${sp.toString()}`;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- API functions ---

export async function fetchCatalogs(): Promise<Catalog[]> {
  return fetchJSON<Catalog[]>(`${API_BASE}/catalogs`);
}

export async function refreshCatalogs(): Promise<void> {
  const res = await fetch(`${API_BASE}/refresh`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Refresh failed: ${res.status}`);
  }
}

export async function fetchOverview(
  params: FilterParams = {},
): Promise<Overview> {
  return fetchJSON<Overview>(`${API_BASE}/overview${buildQuery(params)}`);
}

export async function fetchBreakdown(
  params: BreakdownParams = {},
): Promise<Breakdown> {
  return fetchJSON<Breakdown>(`${API_BASE}/breakdown${buildQuery(params)}`);
}

export async function fetchDrilldown(
  params: DrilldownParams = {},
): Promise<Drilldown> {
  return fetchJSON<Drilldown>(`${API_BASE}/drilldown${buildQuery(params)}`);
}

export async function fetchComparison(
  params: ComparisonParams,
): Promise<Comparison> {
  return fetchJSON<Comparison>(`${API_BASE}/comparison${buildQuery(params)}`);
}

export async function fetchHeatmap(
  params: HeatmapParams = {},
): Promise<Heatmap> {
  return fetchJSON<Heatmap>(`${API_BASE}/heatmap${buildQuery(params)}`);
}

export async function fetchRatingDistribution(
  params: RatingParams = {},
): Promise<RatingDistribution> {
  return fetchJSON<RatingDistribution>(
    `${API_BASE}/rating-distribution${buildQuery(params)}`,
  );
}
