import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface FilterState {
  startDate: string | null;
  endDate: string | null;
  picksOnly: boolean;
  minRating: number;
  excludeCameras: string[];
  excludeLenses: string[];
}

export interface FilterActions {
  setStartDate: (date: string | null) => void;
  setEndDate: (date: string | null) => void;
  setDateRange: (start: string | null, end: string | null) => void;
  setPicksOnly: (value: boolean) => void;
  setMinRating: (value: number) => void;
  setExcludeCameras: (cameras: string[]) => void;
  setExcludeLenses: (lenses: string[]) => void;
  clearAll: () => void;
  hasActiveFilters: boolean;
  activeFilterCount: number;
}

const FILTER_KEYS = [
  "start_date",
  "end_date",
  "picks_only",
  "min_rating",
  "exclude_cameras",
  "exclude_lenses",
] as const;

function parseCommaSeparated(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function useFilters(): FilterState & FilterActions {
  const [searchParams, setSearchParams] = useSearchParams();

  const startDate = searchParams.get("start_date");
  const endDate = searchParams.get("end_date");
  const picksOnly = searchParams.get("picks_only") === "true";
  const minRating = Number(searchParams.get("min_rating") ?? "0");
  const excludeCameras = useMemo(
    () => parseCommaSeparated(searchParams.get("exclude_cameras")),
    [searchParams],
  );
  const excludeLenses = useMemo(
    () => parseCommaSeparated(searchParams.get("exclude_lenses")),
    [searchParams],
  );

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === "" || value === "false" || value === "0") {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setStartDate = useCallback(
    (date: string | null) => updateParams({ start_date: date }),
    [updateParams],
  );

  const setEndDate = useCallback(
    (date: string | null) => updateParams({ end_date: date }),
    [updateParams],
  );

  const setDateRange = useCallback(
    (start: string | null, end: string | null) =>
      updateParams({ start_date: start, end_date: end }),
    [updateParams],
  );

  const setPicksOnly = useCallback(
    (value: boolean) => updateParams({ picks_only: value ? "true" : null }),
    [updateParams],
  );

  const setMinRating = useCallback(
    (value: number) =>
      updateParams({ min_rating: value > 0 ? String(value) : null }),
    [updateParams],
  );

  const setExcludeCameras = useCallback(
    (cameras: string[]) =>
      updateParams({
        exclude_cameras: cameras.length > 0 ? cameras.join(",") : null,
      }),
    [updateParams],
  );

  const setExcludeLenses = useCallback(
    (lenses: string[]) =>
      updateParams({
        exclude_lenses: lenses.length > 0 ? lenses.join(",") : null,
      }),
    [updateParams],
  );

  const clearAll = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const key of FILTER_KEYS) {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const hasActiveFilters =
    startDate !== null ||
    endDate !== null ||
    picksOnly ||
    minRating > 0 ||
    excludeCameras.length > 0 ||
    excludeLenses.length > 0;

  let activeFilterCount = 0;
  if (startDate !== null || endDate !== null) activeFilterCount++;
  if (picksOnly) activeFilterCount++;
  if (minRating > 0) activeFilterCount++;
  if (excludeCameras.length > 0) activeFilterCount++;
  if (excludeLenses.length > 0) activeFilterCount++;

  return {
    startDate,
    endDate,
    picksOnly,
    minRating,
    excludeCameras,
    excludeLenses,
    setStartDate,
    setEndDate,
    setDateRange,
    setPicksOnly,
    setMinRating,
    setExcludeCameras,
    setExcludeLenses,
    clearAll,
    hasActiveFilters,
    activeFilterCount,
  };
}
