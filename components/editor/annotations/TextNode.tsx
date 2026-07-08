"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { TextAnnotation } from "@/lib/pdf/types";
import { useEditor } from "@/lib/store";
import { useMoveDrag } from "./useMoveDrag";
import type { AnnotationNodeProps } from "./types";

type Props = AnnotationNodeProps<TextAnnotation>;

function TextNodeImpl({
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
      onSelect(ann.id);
    },
    onMove: (dx, dy) => onChange({ ...snapshot.current, x: snapshot.current.x + dx, y: snapshot.current.y + dy }),
  });

  // Grow the box to fit its content rather than a fixed width, capped at the
  // page's right edge so it never spills off the page. `fieldSizing: content`
  // makes the textarea auto-size to the typed text in supporting browsers.
  const maxWidth = (mediaW - ann.x) * zoom;
  const style: React.CSSProperties = {
    position: "absolute",
    left: ann.x * zoom,
    top: ann.y * zoom,
    maxWidth,
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
        onKeyDown={(e) => {
          // Esc commits and exits editing (Enter still inserts a newline).
          if (e.key === "Escape") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        onBlur={() => {
          setEditing(false);
          if (ann.text.trim() === "") onErase(ann.id); // drop boxes left empty
        }}
        style={{ ...style, pointerEvents: "auto", resize: "none", background: "rgba(99,102,241,0.06)", outline: "1px solid #6366f1", padding: 0, overflow: "hidden", fieldSizing: "content", minWidth: 2 * ann.fontSize * zoom } as React.CSSProperties}
        rows={Math.max(1, ann.text.split("\n").length)}
        className="rounded-sm"
      />
    );
  }

  return (
    <div
      style={{ ...style, width: "max-content", cursor: eraser ? "crosshair" : "move", whiteSpace: "pre-wrap", outline: selected ? "1px dashed #6366f1" : "none" }}
      onPointerDown={(e) => {
        if (!interactive) return;
        if (eraser) { e.stopPropagation(); onErase(ann.id); return; }
        // Start a potential move; if the pointer doesn't really move and the box
        // was already selected, treat it as a click-to-edit (so a second click
        // enters editing without needing a double-click).
        const startX = e.clientX;
        const startY = e.clientY;
        const wasSelected = selected;
        onMoveDown(e);
        const up = (ev: PointerEvent) => {
          window.removeEventListener("pointerup", up);
          const moved = Math.hypot(ev.clientX - startX, ev.clientY - startY) > 3;
          if (!moved && wasSelected) {
            useEditor.getState().beginHistory();
            setEditing(true);
          }
        };
        window.addEventListener("pointerup", up);
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

export const TextNode = memo(TextNodeImpl);
