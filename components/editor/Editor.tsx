"use client";

import { useEffect } from "react";
import { useEditor } from "@/lib/store";
import type { ToolId } from "@/lib/pdf/types";
import { TooltipProvider } from "../ui/Tooltip";
import { Toolbar } from "./Toolbar";
import { Thumbnails } from "./Thumbnails";
import { Viewport } from "./Viewport";
import { EmptyState } from "./EmptyState";
import { Inspector } from "./Inspector";

const HOTKEYS: Record<string, ToolId> = {
  v: "select", c: "edit", t: "text", d: "ink", h: "highlight",
  r: "rect", o: "ellipse", l: "line", a: "arrow", e: "eraser",
};

export function Editor() {
  const status = useEditor((s) => s.status);
  const editMode = useEditor((s) => s.activeTool === "edit");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
        return;
      const st = useEditor.getState();
      if (st.status !== "ready") return;

      if (e.key === "Escape") {
        st.setTool("select");
        st.selectAnnotation(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        // Prefer deleting a selected existing-content object (edit mode).
        if (st.selectedObject) {
          e.preventDefault();
          void st.deleteObject(st.selectedObject.pageId, st.selectedObject.index);
          return;
        }
        const id = st.selectedAnnotationId;
        if (!id) return;
        const page = st.pages.find((p) => p.annotations.some((a) => a.id === id));
        if (page) {
          e.preventDefault();
          st.removeAnnotation(page.id, id);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) void st.redo();
        else void st.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void st.redo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "=") {
        e.preventDefault();
        st.zoomBy(0.2);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        st.zoomBy(-0.2);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tool = HOTKEYS[e.key.toLowerCase()];
      if (tool) st.setTool(tool);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        {status === "ready" ? (
          <>
            <Toolbar />
            <div className="flex min-h-0 flex-1">
              <Thumbnails />
              <Viewport />
              {editMode && <Inspector />}
            </div>
          </>
        ) : (
          <EmptyState />
        )}
      </div>
    </TooltipProvider>
  );
}
