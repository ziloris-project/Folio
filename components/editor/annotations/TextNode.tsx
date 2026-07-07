"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { TextAnnotation } from "@/lib/pdf/types";
import { useEditor } from "@/lib/store";
import { useMoveDrag } from "./useMoveDrag";

interface Props {
  ann: TextAnnotation;
  zoom: number;
  selected: boolean;
  interactive: boolean;
  eraser: boolean;
  rotation: number;
  mediaW: number;
  mediaH: number;
  overlayRef: RefObject<HTMLElement | null>;
  onSelect: () => void;
  onErase: () => void;
  onChange: (ann: TextAnnotation) => void;
}

export function TextNode({
  ann, zoom, selected, interactive, eraser, rotation, mediaW, mediaH, overlayRef,
  onSelect, onErase, onChange,
}: Props) {
  const [editing, setEditing] = useState(ann.text === "");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const snapshot = useRef<TextAnnotation>(ann);

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  const onMoveDown = useMoveDrag({
    overlayRef, rotation, mediaW, mediaH, zoom,
    onStart: () => {
      snapshot.current = ann;
      onSelect();
    },
    onMove: (dx, dy) => onChange({ ...snapshot.current, x: snapshot.current.x + dx, y: snapshot.current.y + dy }),
  });

  const style: React.CSSProperties = {
    position: "absolute",
    left: ann.x * zoom,
    top: ann.y * zoom,
    width: ann.width * zoom,
    fontSize: ann.fontSize * zoom,
    lineHeight: 1.2,
    color: ann.color,
    fontWeight: ann.bold ? 700 : 400,
    pointerEvents: interactive ? "auto" : "none",
    fontFamily: "Helvetica, Arial, sans-serif",
  };

  if (editing) {
    return (
      <textarea
        ref={taRef}
        value={ann.text}
        onChange={(e) => onChange({ ...ann, text: e.target.value })}
        onBlur={() => setEditing(false)}
        style={{ ...style, pointerEvents: "auto", resize: "none", background: "rgba(99,102,241,0.06)", outline: "1px solid #6366f1", padding: 0, overflow: "hidden" }}
        rows={Math.max(1, ann.text.split("\n").length)}
        className="rounded-sm"
      />
    );
  }

  return (
    <div
      style={{ ...style, cursor: eraser ? "crosshair" : "move", whiteSpace: "pre-wrap", outline: selected ? "1px dashed #6366f1" : "none" }}
      onPointerDown={(e) => {
        if (!interactive) return;
        if (eraser) { e.stopPropagation(); onErase(); return; }
        onMoveDown(e);
      }}
      onDoubleClick={() => {
        if (eraser) return;
        useEditor.getState().beginHistory(); // checkpoint before inline editing
        setEditing(true);
      }}
    >
      {ann.text || <span style={{ opacity: 0.4 }}>Text</span>}
    </div>
  );
}
