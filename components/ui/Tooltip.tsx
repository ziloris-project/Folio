"use client";

import * as RTooltip from "@radix-ui/react-tooltip";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RTooltip.Provider delayDuration={300} skipDelayDuration={150}>
      {children}
    </RTooltip.Provider>
  );
}

export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  // Give icon-only triggers an accessible name from the (string) label so
  // screen readers announce them — the visual tooltip alone isn't enough.
  const trigger =
    typeof label === "string" && isValidElement(children)
      ? cloneElement(children as ReactElement<{ "aria-label"?: string }>, {
          "aria-label": (children.props as { "aria-label"?: string })["aria-label"] ?? label,
        })
      : children;

  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{trigger}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-panel-2 px-2 py-1 text-xs text-foreground shadow-lg ring-1 ring-border select-none"
        >
          {label}
          <RTooltip.Arrow className="fill-panel-2" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}
