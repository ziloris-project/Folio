"use client";

import { memo, useEffect, useRef } from "react";
import { openPdfiumDoc } from "@/lib/pdf/pdfium/registry";
import type { PdfSource } from "@/lib/pdf/types";
import { useInViewport } from "./useInViewport";

/** How long to wait after the last zoom change before re-rasterizing crisply. */
const ZOOM_SETTLE_MS = 160;

interface Props {
  source: PdfSource;
  pageIndex: number;
  editVersion: number;
  zoom: number;
  className?: string;
}

/**
 * A single page's rasterized bitmap. Two things keep this cheap on large docs:
 *
 *  1. It only rasterizes while near the viewport, so opening a 200-page PDF does
 *     not run 200 PDFium renders up front - pages paint as you scroll to them.
 *  2. A pure zoom change is *debounced*: the existing bitmap is CSS-scaled to the
 *     new size for instant feedback, then re-rendered at full resolution once the
 *     zoom gesture settles. Content edits (editVersion) and first paint render
 *     immediately.
 *
 * The canvas element stays mounted even when off-screen, so its bitmap persists
 * and scrolling back to a page never re-rasters unless zoom/content changed.
 */
function PageCanvasImpl({ source, pageIndex, editVersion, zoom, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inView = useInViewport(canvasRef, { rootMargin: "800px 0px" });
  // What we last painted, so we can skip redundant rasters and decide whether a
  // change is "content" (paint now) or "zoom only" (debounce).
  const rendered = useRef<{ key: string; zoom: number } | null>(null);

  useEffect(() => {
    if (!inView) return;
    const key = `${source.id}:${pageIndex}:${editVersion}`;
    const prev = rendered.current;
    const contentChanged = !prev || prev.key !== key;
    const zoomChanged = !prev || prev.zoom !== zoom;
    if (!contentChanged && !zoomChanged) return;

    let cancelled = false;
    const paint = async () => {
      const doc = await openPdfiumDoc(source.id, source.bytes);
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      doc.renderPageToCanvas(pageIndex, canvas, zoom);
      rendered.current = { key, zoom };
    };

    if (contentChanged) {
      void paint(); // first paint / edit: no perceptible bitmap to scale, render now
      return () => {
        cancelled = true;
      };
    }
    const timer = setTimeout(() => void paint(), ZOOM_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inView, source, pageIndex, editVersion, zoom]);

  return <canvas ref={canvasRef} className={className} />;
}

export const PageCanvas = memo(PageCanvasImpl);
