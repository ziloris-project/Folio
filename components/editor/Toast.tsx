"use client";

import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useEditor } from "@/lib/store";
import { cn } from "@/lib/utils";

const ICON = { success: CheckCircle2, error: AlertCircle, info: Info } as const;
const ACCENT = {
  success: "text-emerald-400",
  error: "text-red-400",
  info: "text-accent",
} as const;

export function Toast() {
  const toast = useEditor((s) => s.toast);
  const dismiss = useEditor((s) => s.dismissToast);

  // Auto-dismiss; keyed on toast.id so a new message restarts the timer.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismiss, toast.kind === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  if (!toast) return null;
  const Icon = ICON[toast.kind];

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-panel-2 px-4 py-3 text-sm shadow-2xl">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ACCENT[toast.kind])} />
        <span className="text-foreground">{toast.message}</span>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="ml-1 shrink-0 text-muted transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
