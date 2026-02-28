import { NavLink } from "react-router-dom";
import {
  Camera,
  BarChart3,
  CalendarDays,
  Layers,
  GitCompareArrows,
  Star,
  Palette,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme-context";

const NAV_ITEMS = [
  { to: "/overview", label: "Overview", icon: BarChart3 },
  { to: "/gear", label: "Gear Breakdown", icon: Camera },
  { to: "/heatmap", label: "Shooting Heatmap", icon: CalendarDays },
  { to: "/drilldown", label: "Drilldown Explorer", icon: Layers },
  { to: "/comparison", label: "Comparison", icon: GitCompareArrows },
  { to: "/ratings", label: "Rating Analysis", icon: Star },
] as const;

export function Sidebar() {
  const { openPanel: openThemePanel } = useTheme();

  return (
    <aside
      className="flex h-screen w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-surface-base"
    >
      {/* App title */}
      <div className="px-4 pt-6 pb-4">
        <span className="type-label uppercase text-text-tertiary">
          Lightroom Analytics
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]",
                "active:scale-[0.98]",
                isActive
                  ? "border-l-2 border-l-[var(--accent)] bg-accent-muted text-text-primary"
                  : "border-l-2 border-l-transparent text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
              )
            }
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            <Icon size={16} />
            <span className="type-body">{label}</span>
          </NavLink>
        ))}

        {/* Theme customizer */}
        <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
          <button
            type="button"
            onClick={openThemePanel}
            className={cn(
              "flex w-full items-center gap-3 rounded-[var(--radius-sm)] border-l-2 border-l-transparent px-3 py-2 transition-colors",
              "text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]",
              "active:scale-[0.98]"
            )}
            style={{
              transitionDuration: "var(--duration-fast)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          >
            <Palette size={16} />
            <span className="type-body">Theme</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
