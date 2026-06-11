"use client";

import { useEffect, useRef } from "react";
import { openPdfiumDoc } from "@/lib/pdf/pdfium/registry";
import { useEditor } from "@/lib/store";
import type { PageItem } from "@/lib/pdf/types";

const THUMB_W = 150;

export function Thumbnail({ page }: { page: PageItem }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const source = useEditor((s) => (page.sourceId ? s.sources[page.sourceId] : null));

  // Display box accounts for 90/270 rotation swapping width/height.
  const swapped = page.rotation === 90 || page.rotation === 270;
  const dispW = swapped ? page.height : page.width;
  const dispH = swapped ? page.width : page.height;
  const scale = THUMB_W / dispW;
  const boxW = THUMB_W;
  const boxH = Math.round(dispH * scale);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    (async () => {
      const doc = await openPdfiumDoc(source.id, source.bytes);
      if (cancelled) return;
      doc.renderPageToCanvas(page.sourcePageIndex, canvas, scale);
    })();
    return () => {
      cancelled = true;
    };
  }, [source, page.sourcePageIndex, scale, page.editVersion]);

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
