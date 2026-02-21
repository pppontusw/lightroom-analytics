import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface ExposureBarProps extends HTMLAttributes<HTMLDivElement> {
  /** Width as a percentage (0-100) */
  value: number;
}

export function ExposureBar({ value, className, ...props }: ExposureBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div
      className={cn("h-[2px] rounded-[1px]", className)}
      style={{
        width: `${clampedValue}%`,
        background: "linear-gradient(90deg, var(--accent), transparent)",
      }}
      {...props}
    />
  );
}
