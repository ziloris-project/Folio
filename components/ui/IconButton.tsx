"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "ghost" | "active" | "accent";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  ghost: "text-muted hover:text-foreground hover:bg-panel-2",
  active: "text-foreground bg-panel-2 ring-1 ring-border",
  accent: "text-accent-fg bg-accent hover:brightness-110",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ className, variant = "ghost", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none",
          variants[variant],
          className,
        )}
        {...props}
      />
    );
  },
);
