import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/lib/catalog-context";
import { refreshCatalogs } from "@/lib/api";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { catalogs, selectedCatalog, setSelectedCatalog, loading, reload } =
    useCatalog();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCatalogs();
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const selectedName =
    catalogs.find((c) => c.path === selectedCatalog)?.name ?? "No catalog";

  return (
    <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
      <div className="flex items-center gap-3">
        {loading ? (
          <span className="type-body text-text-tertiary">
            Loading catalogs...
          </span>
        ) : catalogs.length <= 1 ? (
          <span className="type-body text-text-secondary">{selectedName}</span>
        ) : (
          <select
            value={selectedCatalog ?? ""}
            onChange={(e) => setSelectedCatalog(e.target.value)}
            className={cn(
              "type-body rounded-[var(--radius-sm)] border px-3 py-1.5 text-text-primary",
              "border-[var(--control-border)] bg-[var(--control-bg)]",
              "hover:border-[var(--control-hover-border)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            {catalogs.map((c) => (
              <option key={c.path} value={c.path}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Button
        variant="ghost"
        onClick={() => void handleRefresh()}
        disabled={refreshing}
        className="gap-2"
      >
        <RefreshCw
          size={14}
          className={cn(refreshing && "animate-spin")}
        />
        <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
      </Button>
    </header>
  );
}
