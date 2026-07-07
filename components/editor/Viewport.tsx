"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import { PageView } from "./PageView";
import { viewportEl } from "./viewportEl";

export function Viewport() {
  const pages = useEditor((s) => s.pages);
  const zoom = useEditor((s) => s.zoom);
  const pageIds = pages.map((p) => p.id).join(",");
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

  // Two-finger pinch to zoom (touch devices), anchored at the pinch midpoint.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startDist = 0;
    let startZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t: TouchList) => {
      const r = el.getBoundingClientRect();
      return { x: (t[0].clientX + t[1].clientX) / 2 - r.left, y: (t[0].clientY + t[1].clientY) / 2 - r.top };
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startZoom = useEditor.getState().zoom;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      pendingAnchor.current = mid(e.touches);
      useEditor.getState().setZoom(startZoom * (dist(e.touches) / startDist));
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  // Keep the "active page" (thumbnail highlight + action target) in sync with
  // what's actually scrolled into view — the most-visible page wins.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const ratios = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const id = (en.target as HTMLElement).dataset.pageId;
          if (id) ratios.set(id, en.isIntersecting ? en.intersectionRatio : 0);
        }
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, r] of ratios) {
          if (r > bestRatio) {
            bestRatio = r;
            best = id;
          }
        }
        if (best && useEditor.getState().selectedPageId !== best) {
          useEditor.getState().selectPage(best);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    root.querySelectorAll<HTMLElement>("[data-page-id]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pageIds]);

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
