"use client";

import { useLayoutEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import { PageView } from "./PageView";

export function Viewport() {
  const pages = useEditor((s) => s.pages);
  const zoom = useEditor((s) => s.zoom);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevZoom = useRef(zoom);

  // Keep the point under the viewport center fixed while zooming, instead of
  // letting the scroll position anchor to the top-left. Page element sizes react
  // to `zoom` synchronously (via inline width/height), so this runs after the
  // reflow but before paint.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevZoom.current === zoom) return;
    const ratio = zoom / prevZoom.current;
    el.scrollLeft = (el.scrollLeft + el.clientWidth / 2) * ratio - el.clientWidth / 2;
    el.scrollTop = (el.scrollTop + el.clientHeight / 2) * ratio - el.clientHeight / 2;
    prevZoom.current = zoom;
  }, [zoom]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-auto bg-canvas">
      <div className="flex min-h-full flex-col items-center gap-6 py-10 pl-10 pr-6">
        {pages.map((page, i) => (
          <PageView key={page.id} page={page} index={i} />
        ))}
      </div>
    </div>
  );
}
