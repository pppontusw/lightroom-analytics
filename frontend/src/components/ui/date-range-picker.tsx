import { useState, useRef, useEffect, useCallback } from "react";
import {
  format,
  parse,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isAfter,
  isBefore,
  subDays,
  startOfYear,
  isValid,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  startDate: string | null;
  endDate: string | null;
  onDateRangeChange: (start: string | null, end: string | null) => void;
  /** Earliest date in the catalog (YYYY-MM-DD) */
  catalogEarliest: string | null;
  /** Latest date in the catalog (YYYY-MM-DD) */
  catalogLatest: string | null;
  disabled?: boolean;
}

interface QuickPreset {
  label: string;
  getRange: (latestDate: Date) => { start: Date; end: Date };
}

function parseDateStr(str: string | null): Date | null {
  if (!str) return null;
  const d = parse(str, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

function formatDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function getQuickPresets(latestDate: Date): QuickPreset[] {
  return [
    {
      label: "Last 30 days",
      getRange: (latest) => ({
        start: subDays(latest, 30),
        end: latest,
      }),
    },
    {
      label: "Last 90 days",
      getRange: (latest) => ({
        start: subDays(latest, 90),
        end: latest,
      }),
    },
    {
      label: "Last 6 months",
      getRange: (latest) => ({
        start: subDays(latest, 182),
        end: latest,
      }),
    },
    {
      label: "Last year",
      getRange: (latest) => ({
        start: subDays(latest, 365),
        end: latest,
      }),
    },
    {
      label: "This year",
      getRange: (latest) => ({
        start: startOfYear(latestDate),
        end: latest,
      }),
    },
    {
      label: "All time",
      getRange: () => ({
        start: new Date(0),
        end: new Date(9999, 11, 31),
      }),
    },
  ];
}

function CalendarGrid({
  month,
  onSelect,
  rangeStart,
  rangeEnd,
  minDate,
  maxDate,
}: {
  month: Date;
  onSelect: (date: Date) => void;
  rangeStart: Date | null;
  rangeEnd: Date | null;
  minDate: Date | null;
  maxDate: Date | null;
}) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const weekDays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-0">
        {weekDays.map((day) => (
          <div
            key={day}
            className="type-caption py-1 text-center text-text-tertiary"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const isDisabled =
            (minDate && isBefore(day, minDate)) ||
            (maxDate && isAfter(day, maxDate));
          const isStart = rangeStart && isSameDay(day, rangeStart);
          const isEnd = rangeEnd && isSameDay(day, rangeEnd);
          const inRange =
            rangeStart &&
            rangeEnd &&
            isAfter(day, rangeStart) &&
            isBefore(day, rangeEnd);

          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={!inMonth || !!isDisabled}
              onClick={() => onSelect(day)}
              className={cn(
                "type-caption flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
                !inMonth && "invisible",
                inMonth && !isDisabled && "cursor-pointer",
                isDisabled && "pointer-events-none text-text-muted opacity-50",
                !isStart &&
                  !isEnd &&
                  !inRange &&
                  inMonth &&
                  !isDisabled &&
                  "text-text-secondary hover:bg-[var(--border-subtle)] hover:text-text-primary",
                (isStart || isEnd) &&
                  "bg-accent text-accent-text font-medium",
                inRange &&
                  !isStart &&
                  !isEnd &&
                  "bg-accent-muted text-text-primary",
              )}
              style={{
                transitionDuration: "var(--duration-fast)",
                transitionTimingFunction: "var(--ease-out)",
              }}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({
  startDate,
  endDate,
  onDateRangeChange,
  catalogEarliest,
  catalogLatest,
  disabled = false,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const end = parseDateStr(endDate) ?? parseDateStr(catalogLatest);
    return end ? startOfMonth(end) : startOfMonth(new Date());
  });
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const [pendingStart, setPendingStart] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rangeStart = parseDateStr(startDate);
  const rangeEnd = parseDateStr(endDate);
  const minDate = parseDateStr(catalogEarliest);
  const maxDate = parseDateStr(catalogLatest);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setPendingStart(null);
        setSelecting("start");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleDaySelect = useCallback(
    (day: Date) => {
      if (selecting === "start") {
        setPendingStart(day);
        setSelecting("end");
      } else {
        const start = pendingStart!;
        const actualStart = isBefore(day, start) ? day : start;
        const actualEnd = isBefore(day, start) ? start : day;
        onDateRangeChange(formatDateStr(actualStart), formatDateStr(actualEnd));
        setPendingStart(null);
        setSelecting("start");
        setOpen(false);
      }
    },
    [selecting, pendingStart, onDateRangeChange],
  );

  const handlePreset = useCallback(
    (preset: QuickPreset) => {
      const latest = maxDate ?? new Date();
      const { start, end } = preset.getRange(latest);
      const clampedStart = minDate && isBefore(start, minDate) ? minDate : start;
      const clampedEnd = maxDate && isAfter(end, maxDate) ? maxDate : end;
      // "All time" clears the date range
      if (preset.label === "All time") {
        onDateRangeChange(null, null);
      } else {
        onDateRangeChange(formatDateStr(clampedStart), formatDateStr(clampedEnd));
      }
      setOpen(false);
      setPendingStart(null);
      setSelecting("start");
    },
    [minDate, maxDate, onDateRangeChange],
  );

  const displayStart = rangeStart ? format(rangeStart, "MMM d, yyyy") : null;
  const displayEnd = rangeEnd ? format(rangeEnd, "MMM d, yyyy") : null;
  const hasRange = displayStart || displayEnd;

  const displayRangeStart =
    pendingStart ?? rangeStart;
  const displayRangeEnd =
    selecting === "end" ? null : rangeEnd;

  const presets = getQuickPresets(maxDate ?? new Date());

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-1.5 transition-colors",
          "border-[var(--control-border)] bg-[var(--control-bg)]",
          "hover:border-[var(--control-hover-border)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--control-focus-ring)]",
          "disabled:pointer-events-none disabled:opacity-50 disabled:text-text-muted",
          "active:scale-[0.98]",
          open && "ring-2 ring-[var(--control-focus-ring)]",
        )}
        style={{
          transitionDuration: "var(--duration-fast)",
          transitionTimingFunction: "var(--ease-out)",
        }}
      >
        <Calendar size={14} className="text-text-tertiary" />
        <span className={cn("type-body", hasRange ? "text-text-primary" : "text-text-tertiary")}>
          {hasRange
            ? `${displayStart ?? "..."} — ${displayEnd ?? "..."}`
            : "Date range"}
        </span>
        {hasRange && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDateRangeChange(null, null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onDateRangeChange(null, null);
              }
            }}
            className="ml-1 flex items-center rounded-[var(--radius-sm)] p-0.5 text-text-tertiary hover:bg-[var(--border-subtle)] hover:text-text-primary"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 flex rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-elevated"
          style={{ minWidth: "420px" }}
        >
          {/* Quick presets */}
          <div className="flex flex-col gap-0.5 border-r border-[var(--border)] p-2" style={{ minWidth: "130px" }}>
            <span className="type-label mb-1 px-2 text-text-tertiary">
              Presets
            </span>
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handlePreset(preset)}
                className={cn(
                  "type-body rounded-[var(--radius-sm)] px-2 py-1 text-left text-text-secondary transition-colors",
                  "hover:bg-[var(--border-subtle)] hover:text-text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]",
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

          {/* Calendar */}
          <div className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                className="rounded-[var(--radius-sm)] p-1 text-text-secondary transition-colors hover:bg-[var(--border-subtle)] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] active:scale-[0.98]"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="type-body font-medium text-text-primary">
                {format(calendarMonth, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                className="rounded-[var(--radius-sm)] p-1 text-text-secondary transition-colors hover:bg-[var(--border-subtle)] hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] active:scale-[0.98]"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mb-2 text-center">
              <span className="type-caption text-text-tertiary">
                {selecting === "start" ? "Select start date" : "Select end date"}
              </span>
            </div>

            <CalendarGrid
              month={calendarMonth}
              onSelect={handleDaySelect}
              rangeStart={displayRangeStart}
              rangeEnd={displayRangeEnd}
              minDate={minDate}
              maxDate={maxDate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
