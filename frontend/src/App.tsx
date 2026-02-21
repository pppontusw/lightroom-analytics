import { Routes, Route, Navigate } from "react-router-dom";
import { CatalogProvider } from "@/lib/catalog-context";
import { FilterProvider } from "@/lib/filter-context";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { FilterBar } from "@/components/filter-bar";
import { Overview } from "@/views/overview";
import { GearBreakdown } from "@/views/gear-breakdown";
import { ShootingHeatmap } from "@/views/shooting-heatmap";
import { DrilldownExplorer } from "@/views/drilldown-explorer";
import { Comparison } from "@/views/comparison";
import { RatingAnalysis } from "@/views/rating-analysis";

function App() {
  return (
    <CatalogProvider>
      <FilterProvider>
        <div className="flex h-screen bg-surface-base">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <FilterBar />
            <main className="flex-1 overflow-auto p-6">
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<Overview />} />
                <Route path="/gear" element={<GearBreakdown />} />
                <Route path="/heatmap" element={<ShootingHeatmap />} />
                <Route path="/drilldown" element={<DrilldownExplorer />} />
                <Route path="/comparison" element={<Comparison />} />
                <Route path="/ratings" element={<RatingAnalysis />} />
              </Routes>
            </main>
          </div>
        </div>
      </FilterProvider>
    </CatalogProvider>
  );
}

export default App;
