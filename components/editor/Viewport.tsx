"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import { PageView } from "./PageView";
import { viewportEl } from "./viewportEl";

export function Viewport() {
  const pages = useEditor((s) => s.pages);
  const zoom = useEditor((s) => s.zoom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevZoom = useRef(zoom);
  // When set, the next zoom re-anchors the scroll to this viewport-local point
  // (used by Ctrl+wheel so the point under the cursor stays put); otherwise the
  // viewport center is held.
  const pendingAnchor = useRef<{ x: number; y: number } | null>(null);

  // Preserve the anchor point across a zoom change. Page element sizes react to
  // `zoom` synchronously (inline width/height), so this runs after reflow but
  // before paint.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevZoom.current === zoom) return;
    const ratio = zoom / prevZoom.current;
    const a = pendingAnchor.current;
    const ax = a ? a.x : el.clientWidth / 2;
    const ay = a ? a.y : el.clientHeight / 2;
    el.scrollLeft = (el.scrollLeft + ax) * ratio - ax;
    el.scrollTop = (el.scrollTop + ay) * ratio - ay;
    prevZoom.current = zoom;
    pendingAnchor.current = null;
  }, [zoom]);

  // Ctrl/Cmd + wheel zooms at the cursor. Registered natively (non-passive) so
  // we can preventDefault and stop the browser's own page zoom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // plain wheel = normal scroll
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      pendingAnchor.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.exp(-e.deltaY * 0.0015);
      const { zoom: z, setZoom } = useEditor.getState();
      setZoom(z * factor); // store clamps to [0.25, 6]
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={(el) => {
        scrollRef.current = el;
        viewportEl.current = el;
      }}
      className="flex-1 overflow-auto bg-canvas"
    >
      <div className="flex min-h-full flex-col items-center gap-6 py-10 pl-10 pr-6">
        {pages.map((page, i) => (
          <PageView key={page.id} page={page} index={i} />
        ))}
      </div>
    </div>
  );
}
