"use client";

import { memo, useMemo, useRef } from "react";
import type { VectorAnnotation } from "@/lib/pdf/types";
import { useMoveDrag } from "./useMoveDrag";
import type { AnnotationNodeProps } from "./types";

type Props = AnnotationNodeProps<VectorAnnotation>;

/** Renders ink / highlight / rect / ellipse / line / arrow inside the page SVG. */
function ShapeAnnotationImpl({
  ann, selected, interactive, eraser, rotation, mediaW, mediaH, zoom, overlayRef,
  onSelect, onErase, onChange,
}: Props) {
  const snapshot = useRef<VectorAnnotation>(ann);

  const onMoveDown = useMoveDrag({
    overlayRef, rotation, mediaW, mediaH, zoom,
    onStart: () => {
      snapshot.current = ann;
      onSelect(ann.id);
    },
    onMove: (dx, dy) => onChange(translate(snapshot.current, dx, dy)),
  });

  function handlePointerDown(e: React.PointerEvent) {
    if (!interactive) return;
    if (eraser) {
      e.stopPropagation();
      onErase(ann.id);
      return;
    }
    onMoveDown(e);
  }

  const common = {
    onPointerDown: handlePointerDown,
    style: {
      pointerEvents: interactive ? ("auto" as const) : ("none" as const),
      cursor: interactive && !eraser ? "move" : eraser ? "crosshair" : "default",
    },
  };

  // Geometry only depends on the annotation itself; recompute when it changes,
  // not on every unrelated re-render (and the ink path is used twice).
  const bbox = useMemo(() => boundingBox(ann), [ann]);
  const inkD = useMemo(() => (ann.type === "ink" ? inkPath(ann.strokes) : ""), [ann]);

  return (
    <g>
      {ann.type === "ink" && (
        <>
          {/* fat invisible hit area */}
          <path d={inkD} fill="none" stroke="transparent"
            strokeWidth={ann.width + 8} {...common} />
          <path d={inkD} fill="none" stroke={ann.color}
            strokeWidth={ann.width} strokeLinecap="round" strokeLinejoin="round"
            opacity={ann.opacity} style={{ pointerEvents: "none" }} />
        </>
      )}

      {(ann.type === "rect" || ann.type === "highlight") && (
        <rect x={ann.x} y={ann.y} width={ann.width} height={ann.height}
          fill={ann.fill ? ann.color : "none"} fillOpacity={ann.opacity}
          stroke={ann.fill ? "none" : ann.color} strokeWidth={ann.strokeWidth}
          {...common} />
      )}

      {ann.type === "ellipse" && (
        <ellipse cx={ann.x + ann.width / 2} cy={ann.y + ann.height / 2}
          rx={ann.width / 2} ry={ann.height / 2}
          fill={ann.fill ? ann.color : "none"} fillOpacity={ann.opacity}
          stroke={ann.fill ? "none" : ann.color} strokeWidth={ann.strokeWidth}
          {...common} />
      )}

      {(ann.type === "line" || ann.type === "arrow") && (
        <>
          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2}
            stroke="transparent" strokeWidth={ann.width + 8} {...common} />
          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2}
            stroke={ann.color} strokeWidth={ann.width} strokeLinecap="round"
            markerEnd={ann.type === "arrow" ? `url(#arrow-${ann.id})` : undefined}
            style={{ pointerEvents: "none" }} />
          {ann.type === "arrow" && (
            <defs>
              <marker id={`arrow-${ann.id}`} viewBox="0 0 10 10" refX="8" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={ann.color} />
              </marker>
            </defs>
          )}
        </>
      )}

      {selected && bbox && (
        <rect x={bbox.x - 2} y={bbox.y - 2} width={bbox.width + 4} height={bbox.height + 4}
          fill="none" stroke="#6366f1" strokeWidth={1 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`}
          style={{ pointerEvents: "none" }} />
      )}
    </g>
  );
}

export const ShapeAnnotation = memo(ShapeAnnotationImpl);

function inkPath(strokes: { x: number; y: number }[][]) {
  return strokes
    .map((s) => s.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" "))
    .join(" ");
}

function translate(ann: VectorAnnotation, dx: number, dy: number): VectorAnnotation {
  switch (ann.type) {
    case "ink":
      return { ...ann, strokes: ann.strokes.map((s) => s.map((p) => ({ x: p.x + dx, y: p.y + dy }))) };
    case "line":
    case "arrow":
      return { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy };
    default:
      return { ...ann, x: ann.x + dx, y: ann.y + dy };
  }
}

function boundingBox(ann: VectorAnnotation) {
  switch (ann.type) {
    case "ink": {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let n = 0;
      // Iterate instead of Math.min(...xs): a long stroke has thousands of
      // points, and spreading that many args can overflow the call stack.
      for (const stroke of ann.strokes) {
        for (const p of stroke) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
          n++;
        }
      }
      if (!n) return null;
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    case "line":
    case "arrow": {
      const x = Math.min(ann.x1, ann.x2), y = Math.min(ann.y1, ann.y2);
      return { x, y, width: Math.abs(ann.x2 - ann.x1), height: Math.abs(ann.y2 - ann.y1) };
    }
    default:
      return { x: ann.x, y: ann.y, width: ann.width, height: ann.height };
  }
}
