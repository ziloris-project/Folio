"use client";

import { memo, useRef, type RefObject } from "react";
import type { ImageAnnotation } from "@/lib/pdf/types";
import { useMoveDrag } from "./useMoveDrag";

interface Props {
  ann: ImageAnnotation;
  zoom: number;
  selected: boolean;
  interactive: boolean;
  eraser: boolean;
  rotation: number;
  mediaW: number;
  mediaH: number;
  overlayRef: RefObject<HTMLElement | null>;
  onSelect: (id: string) => void;
  onErase: (id: string) => void;
  onChange: (ann: ImageAnnotation) => void;
}

function ImageNodeImpl({
  ann, zoom, selected, interactive, eraser, rotation, mediaW, mediaH, overlayRef,
  onSelect, onErase, onChange,
}: Props) {
  const snapshot = useRef<ImageAnnotation>(ann);

  const onMoveDown = useMoveDrag({
    overlayRef, rotation, mediaW, mediaH, zoom,
    onStart: () => {
      snapshot.current = ann;
      onSelect(ann.id);
    },
    onMove: (dx, dy) => onChange({ ...snapshot.current, x: snapshot.current.x + dx, y: snapshot.current.y + dy }),
  });

  // Corner resize handle (keeps aspect ratio).
  const resizeSnap = useRef<ImageAnnotation>(ann);
  const onResizeDown = useMoveDrag({
    overlayRef, rotation, mediaW, mediaH, zoom,
    onStart: () => { resizeSnap.current = ann; onSelect(ann.id); },
    onMove: (dx) => {
      const s = resizeSnap.current;
      const ratio = s.height / s.width;
      const width = Math.max(20, s.width + dx);
      onChange({ ...s, width, height: width * ratio });
    },
  });

  return (
    <div
      style={{
        position: "absolute",
        left: ann.x * zoom,
        top: ann.y * zoom,
        width: ann.width * zoom,
        height: ann.height * zoom,
        pointerEvents: interactive ? "auto" : "none",
        cursor: eraser ? "crosshair" : "move",
        outline: selected ? "1px dashed #6366f1" : "none",
      }}
      onPointerDown={(e) => {
        if (!interactive) return;
        if (eraser) { e.stopPropagation(); onErase(ann.id); return; }
        onMoveDown(e);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ann.dataUrl} alt="" draggable={false} className="h-full w-full select-none" />
      {selected && !eraser && (
        <div
          onPointerDown={onResizeDown}
          className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-accent"
        />
      )}
    </div>
  );
}

export const ImageNode = memo(ImageNodeImpl);
