import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-sm)] font-medium transition-all",
        "px-4 py-2 type-body",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-base)]",
        "active:scale-[0.98]",
        "disabled:pointer-events-none disabled:opacity-50 disabled:text-text-muted",
        variant === "primary" && [
          "bg-accent text-accent-text",
          "hover:bg-accent-hover",
        ],
        variant === "ghost" && [
          "bg-transparent text-text-secondary",
          "hover:bg-[var(--border-subtle)] hover:text-text-primary",
        ],
        className,
      )}
      style={{
        transitionDuration: "var(--duration-fast)",
        transitionTimingFunction: "var(--ease-out)",
      }}
      {...props}
    >
      {children}
    </button>
  );
}
