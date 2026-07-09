"use client";

import { useState, type RefObject } from "react";
import type { PageObject } from "@/lib/pdf/types";
import { toPagePointFromRect, trackRect } from "@/lib/pdf/coords";

interface Props {
  objects: PageObject[];
  selectedIndex: number | null;
  zoom: number;
  rotation: number;
  mediaW: number;
  mediaH: number;
  overlayRef: RefObject<HTMLElement | null>;
  onSelect: (index: number) => void;
  /** Commit a move (overlay-space deltas in page points) on pointer release. */
  onMoveCommit: (index: number, dxOverlay: number, dyOverlay: number) => void;
}

/** Convert a PDF (bottom-left) bbox to an overlay (top-left) rect in points. */
function toRect(o: PageObject, mediaH: number) {
  return {
    x: o.bbox.left,
    y: mediaH - o.bbox.top,
    w: Math.max(o.bbox.right - o.bbox.left, 1),
    h: Math.max(o.bbox.top - o.bbox.bottom, 1),
  };
}

/**
 * Overlay shown in "edit" mode: a clickable hit-rect per existing page object,
 * plus a selection outline that can be dragged to move the object. The move is
 * applied (and the page re-rendered) only on release, to avoid regenerating the
 * content stream on every pointer move.
 */
export function EditObjectsLayer({
  objects, selectedIndex, zoom, rotation, mediaW, mediaH, overlayRef, onSelect, onMoveCommit,
}: Props) {
  const [drag, setDrag] = useState<{ index: number; dx: number; dy: number } | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  function startDrag(e: React.PointerEvent, index: number) {
    e.stopPropagation();
    onSelect(index);
    const el = overlayRef.current;
    if (!el) return;
    // Measure once per gesture (see trackRect) to keep moves off the layout path.
    const tracker = trackRect(el);
    const start = toPagePointFromRect(e, tracker.get(), rotation, mediaW, mediaH, zoom);
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      tracker.dispose();
    };
    const move = (ev: PointerEvent) => {
      const p = toPagePointFromRect(ev, tracker.get(), rotation, mediaW, mediaH, zoom);
      setDrag({ index, dx: p.x - start.x, dy: p.y - start.y });
    };
    const up = (ev: PointerEvent) => {
      const p = toPagePointFromRect(ev, tracker.get(), rotation, mediaW, mediaH, zoom);
      cleanup();
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      setDrag(null);
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) onMoveCommit(index, dx, dy);
    };
    // pointercancel (browser took over the gesture, common on touch): abort the
    // move - drop the visual offset and commit nothing.
    const cancel = () => {
      cleanup();
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  return (
    <svg
      className="absolute inset-0"
      width={mediaW * zoom}
      height={mediaH * zoom}
      viewBox={`0 0 ${mediaW} ${mediaH}`}
      style={{ overflow: "visible" }}
    >
      {objects.map((o) => {
        const r = toRect(o, mediaH);
        const selected = o.index === selectedIndex;
        const isHovered = o.index === hovered;
        const off = drag && drag.index === o.index ? drag : { dx: 0, dy: 0 };
        return (
          <g key={o.index} transform={`translate(${off.dx} ${off.dy})`}>
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill="transparent"
              stroke={selected ? "#6366f1" : isHovered ? "#6366f199" : "transparent"}
              strokeWidth={(selected ? 1.5 : 1) / zoom}
              style={{ cursor: "move", pointerEvents: "all" }}
              onPointerEnter={() => setHovered(o.index)}
              onPointerLeave={() => setHovered((h) => (h === o.index ? null : h))}
              onPointerDown={(e) => startDrag(e, o.index)}
            />
          </g>
        );
      })}
    </svg>
  );
}
