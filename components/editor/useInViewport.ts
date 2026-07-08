"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

interface Options {
  /** Scroll root to observe against (defaults to the browser viewport). */
  root?: Element | null;
  /** Expand the trigger box so work starts just before content scrolls in. */
  rootMargin?: string;
}

/**
 * Report whether `ref`'s element is (near) the viewport. Used to defer the
 * expensive per-page PDFium rasterization until a page is actually on-screen, so
 * opening a large document doesn't rasterize every page at once - and a zoom
 * change only re-rasters the pages you're currently looking at.
 *
 * Falls back to always-visible where IntersectionObserver is unavailable.
 */
export function useInViewport(
  ref: RefObject<Element | null>,
  { root, rootMargin = "0px" }: Options = {},
): boolean {
  // Where IntersectionObserver is unavailable (very old browsers), render eagerly.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  // Keep the boolean referentially stable: only call setState on real changes.
  const seen = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting !== seen.current) {
          seen.current = entry.isIntersecting;
          setInView(entry.isIntersecting);
        }
      },
      { root: root ?? null, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, root, rootMargin]);

  return inView;
}
