"use client";

import { useEffect, useRef } from "react";
import { openPdfiumDoc } from "@/lib/pdf/pdfium/registry";
import { useEditor } from "@/lib/store";
import type { PageItem } from "@/lib/pdf/types";
import { useInViewport } from "./useInViewport";

const THUMB_W = 150;

export function Thumbnail({ page }: { page: PageItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source = useEditor((s) => (page.sourceId ? s.sources[page.sourceId] : null));
  // Only rasterize thumbnails scrolled (near) into the rail — a long document
  // otherwise renders every page's thumbnail bitmap the moment it opens.
  const inView = useInViewport(canvasRef, { rootMargin: "400px 0px" });
  const rendered = useRef<string | null>(null);

  // Display box accounts for 90/270 rotation swapping width/height.
  const swapped = page.rotation === 90 || page.rotation === 270;
  const dispW = swapped ? page.height : page.width;
  const dispH = swapped ? page.width : page.height;
  const scale = THUMB_W / dispW;
  const boxW = THUMB_W;
  const boxH = Math.round(dispH * scale);

  useEffect(() => {
    if (!inView || !source) return;
    const key = `${source.id}:${page.sourcePageIndex}:${page.editVersion}:${scale.toFixed(4)}`;
    if (rendered.current === key) return; // already drawn at this size/version
    let cancelled = false;
    (async () => {
      const doc = await openPdfiumDoc(source.id, source.bytes);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      doc.renderPageToCanvas(page.sourcePageIndex, canvas, scale);
      rendered.current = key;
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, source, page.sourcePageIndex, scale, page.editVersion]);

  return (
    <div className="relative overflow-hidden rounded bg-white shadow" style={{ width: boxW, height: boxH }}>
      <canvas
        ref={canvasRef}
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(-50%, -50%) rotate(${page.rotation}deg)` }}
      />
    </div>
  );
}
