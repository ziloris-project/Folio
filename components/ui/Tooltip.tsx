"use client";

import * as RTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

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
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
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
