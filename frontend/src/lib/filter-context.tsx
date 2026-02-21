import { createContext, useContext, type ReactNode } from "react";
import {
  useFilters,
  type FilterState,
  type FilterActions,
} from "@/hooks/use-filters";
import type { FilterParams } from "@/lib/api";

type FilterContextValue = FilterState & FilterActions;

const FilterContext = createContext<FilterContextValue | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) {
    throw new Error("useFilterContext must be used within a FilterProvider");
  }
  return ctx;
}

/**
 * Build API-compatible filter params from the filter context.
 * Accepts the catalog path separately since it comes from CatalogContext.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildFilterParams(
  filters: FilterState,
  catalog?: string | null,
): FilterParams {
  const params: FilterParams = {};
  if (catalog) params.catalog = catalog;
  if (filters.startDate) params.start_date = filters.startDate;
  if (filters.endDate) params.end_date = filters.endDate;
  if (filters.picksOnly) params.picks_only = true;
  if (filters.minRating > 0) params.min_rating = filters.minRating;
  if (filters.excludeCameras.length > 0)
    params.exclude_cameras = filters.excludeCameras.join(",");
  if (filters.excludeLenses.length > 0)
    params.exclude_lenses = filters.excludeLenses.join(",");
  return params;
}

export function FilterProvider({ children }: { children: ReactNode }) {
  const filters = useFilters();

  return (
    <FilterContext.Provider value={filters}>{children}</FilterContext.Provider>
  );
}
