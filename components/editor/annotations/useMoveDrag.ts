"use client";

import { useCallback, useRef, type PointerEvent as RPointerEvent, type RefObject } from "react";
import { toPagePointFromRect, trackRect } from "@/lib/pdf/coords";
import { useEditor } from "@/lib/store";

interface Options {
  overlayRef: RefObject<HTMLElement | null>;
  rotation: number;
  mediaW: number;
  mediaH: number;
  zoom: number;
  /** Snapshot the annotation's current state at drag start. */
  onStart: () => void;
  /** Apply a delta (in page points) relative to the drag start. */
  onMove: (dx: number, dy: number) => void;
}

/**
 * Returns a pointerdown handler that drags an annotation, reporting deltas in
 * page-point space (rotation-corrected). The caller translates its snapshot by
 * the delta.
 */
export function useMoveDrag({ overlayRef, rotation, mediaW, mediaH, zoom, onStart, onMove }: Options) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return useCallback(
    (e: RPointerEvent<Element>) => {
      const el = overlayRef.current;
      if (!el) return;
      e.stopPropagation();
      onStart();
      // Measure the overlay once for the whole gesture (kept fresh on scroll)
      // so each move doesn't force a layout via getBoundingClientRect().
      const tracker = trackRect(el);
      start.current = toPagePointFromRect(e, tracker.get(), rotation, mediaW, mediaH, zoom);
      (e.target as Element).setPointerCapture?.(e.pointerId);

      // Checkpoint history only once the pointer actually moves, so a plain
      // click-to-select doesn't create a no-op (dead) undo step.
      let checkpointed = false;
      const move = (ev: PointerEvent) => {
        if (!start.current) return;
        if (!checkpointed) {
          useEditor.getState().beginHistory();
          checkpointed = true;
        }
        const p = toPagePointFromRect(ev, tracker.get(), rotation, mediaW, mediaH, zoom);
        onMove(p.x - start.current.x, p.y - start.current.y);
      };
      const up = () => {
        start.current = null;
        tracker.dispose();
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [overlayRef, rotation, mediaW, mediaH, zoom, onStart, onMove],
  );
}
