"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as RPointerEvent,
  type RefObject,
} from "react";
import { nanoid } from "nanoid";
import { useEditor, type ToolSettings } from "@/lib/store";
import { toPagePointFromRect, trackRect, type RectTracker } from "@/lib/pdf/coords";
import type {
  Annotation,
  InkAnnotation,
  LineAnnotation,
  PageItem,
  RectLikeAnnotation,
  ToolId,
  VectorAnnotation,
} from "@/lib/pdf/types";

/** Tools that draw a vector shape by pressing and dragging on the page. */
export const DRAW_TOOLS = new Set<ToolId>(["ink", "highlight", "rect", "ellipse", "line", "arrow"]);

/** An image/signature awaiting placement (a subset of the store's pendingImage). */
type PendingImage = { dataUrl: string; naturalW: number; naturalH: number } | null;

interface Draft {
  ann: VectorAnnotation;
  start: { x: number; y: number };
}

interface Args {
  page: PageItem;
  zoom: number;
  activeTool: ToolId;
  tool: ToolSettings;
  editMode: boolean;
  pendingImage: PendingImage;
  /** Placement footprint (page points), null when nothing is being placed. */
  placeSize: { w: number; h: number } | null;
  overlayRef: RefObject<HTMLDivElement | null>;
}

export interface PageDraw {
  /** The in-progress shape, appended to the page's annotations while drawing. */
  draft: VectorAnnotation | null;
  /** Cursor position (page points) while an image/signature is being placed. */
  placeAt: { x: number; y: number } | null;
  handlers: {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onClick: (e: RPointerEvent<HTMLDivElement>) => void;
  };
}

/**
 * The page overlay's pointer state machine: free-draw of vector annotations,
 * click-to-place of images/signatures, click-to-add text, and empty-space
 * deselect. Kept out of PageView so that component is just composition.
 *
 * Overlay rects are measured once per gesture (see trackRect) rather than on
 * every pointermove, so drawing/placement stays off the layout critical path.
 */
export function usePageDraw({
  page, zoom, activeTool, tool, editMode, pendingImage, placeSize, overlayRef,
}: Args): PageDraw {
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const setTool = useEditor((s) => s.setTool);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);
  const selectObject = useEditor((s) => s.selectObject);
  const selectPage = useEditor((s) => s.selectPage);
  const setPendingImage = useEditor((s) => s.setPendingImage);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [placeAt, setPlaceAt] = useState<{ x: number; y: number } | null>(null);

  const { rotation, width: mediaW, height: mediaH } = page;
  const placing = pendingImage !== null;
  const isDrawing = DRAW_TOOLS.has(activeTool);

  // One tracker for an active draw gesture, one that lives for the duration of a
  // placement (both refresh the cached rect on scroll/resize - see trackRect).
  const drawTracker = useRef<RectTracker | null>(null);
  const placeTracker = useRef<RectTracker | null>(null);

  useEffect(() => {
    if (!placing) return;
    const el = overlayRef.current;
    if (!el) return;
    const tracker = trackRect(el);
    placeTracker.current = tracker;
    return () => {
      tracker.dispose();
      placeTracker.current = null;
    };
  }, [placing, overlayRef]);

  const rectFor = (tracker: RectTracker | null) =>
    tracker?.get() ?? overlayRef.current!.getBoundingClientRect();

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    selectPage(page.id);
    // In edit mode this fires only for clicks on empty page area (object
    // hit-rects stop propagation), so it deselects the current object.
    if (editMode) {
      selectObject(null);
      return;
    }
    if (!isDrawing) return;
    const el = overlayRef.current!;
    el.setPointerCapture(e.pointerId);
    const tracker = trackRect(el);
    drawTracker.current = tracker;
    const p = toPagePointFromRect(e, tracker.get(), rotation, mediaW, mediaH, zoom);
    const id = nanoid();
    let ann: VectorAnnotation;
    switch (activeTool) {
      case "ink": {
        const a: InkAnnotation = {
          id, type: "ink", strokes: [[p]],
          color: tool.color, width: tool.strokeWidth, opacity: tool.opacity,
        };
        ann = a;
        break;
      }
      case "highlight": {
        const a: RectLikeAnnotation = {
          id, type: "highlight", x: p.x, y: p.y, width: 0, height: 0,
          color: tool.color, strokeWidth: 0, fill: true, opacity: 0.4,
        };
        ann = a;
        break;
      }
      case "rect":
      case "ellipse": {
        const a: RectLikeAnnotation = {
          id, type: activeTool, x: p.x, y: p.y, width: 0, height: 0,
          color: tool.color, strokeWidth: tool.strokeWidth, fill: tool.fill, opacity: tool.opacity,
        };
        ann = a;
        break;
      }
      case "line":
      case "arrow": {
        const a: LineAnnotation = {
          id, type: activeTool, x1: p.x, y1: p.y, x2: p.x, y2: p.y,
          color: tool.color, width: tool.strokeWidth,
        };
        ann = a;
        break;
      }
      default:
        return;
    }
    setDraft({ ann, start: p });
  }

  function onPointerMove(e: RPointerEvent<HTMLDivElement>) {
    if (placing) {
      setPlaceAt(toPagePointFromRect(e, rectFor(placeTracker.current), rotation, mediaW, mediaH, zoom));
      return;
    }
    if (!draft) return;
    const p = toPagePointFromRect(e, rectFor(drawTracker.current), rotation, mediaW, mediaH, zoom);
    const { ann, start } = draft;
    let next: VectorAnnotation;
    switch (ann.type) {
      case "ink": {
        const strokes = ann.strokes.slice();
        strokes[strokes.length - 1] = [...strokes[strokes.length - 1], p];
        next = { ...ann, strokes };
        break;
      }
      case "line":
      case "arrow":
        next = { ...ann, x2: p.x, y2: p.y };
        break;
      default: // highlight | rect | ellipse
        next = {
          ...ann,
          x: Math.min(start.x, p.x),
          y: Math.min(start.y, p.y),
          width: Math.abs(p.x - start.x),
          height: Math.abs(p.y - start.y),
        };
    }
    setDraft({ ann: next, start });
  }

  function onPointerUp() {
    drawTracker.current?.dispose();
    drawTracker.current = null;
    if (!draft) return;
    const { ann } = draft;
    // Discard degenerate (accidental click) shapes.
    const tiny =
      (ann.type === "ink" && ann.strokes[0].length < 2) ||
      ((ann.type === "rect" || ann.type === "ellipse" || ann.type === "highlight") &&
        ann.width < 3 && ann.height < 3);
    if (!tiny) addAnnotation(page.id, ann);
    setDraft(null);
  }

  // Drop the pending image where the user clicks (centered on the cursor).
  function onPlaceClick(e: RPointerEvent<HTMLDivElement>) {
    if (!pendingImage || !placeSize) return;
    const p = toPagePointFromRect(e, rectFor(placeTracker.current), rotation, mediaW, mediaH, zoom);
    const ann: Annotation = {
      id: nanoid(),
      type: "image",
      dataUrl: pendingImage.dataUrl,
      x: p.x - placeSize.w / 2,
      y: p.y - placeSize.h / 2,
      width: placeSize.w,
      height: placeSize.h,
    };
    addAnnotation(page.id, ann);
    setPendingImage(null);
    setPlaceAt(null);
    setTool("select");
  }

  // Click with the text tool places a text box; click on empty space deselects.
  function onClick(e: RPointerEvent<HTMLDivElement>) {
    if (placing) {
      onPlaceClick(e);
      return;
    }
    if (activeTool === "text") {
      const rect = overlayRef.current!.getBoundingClientRect();
      const p = toPagePointFromRect(e, rect, rotation, mediaW, mediaH, zoom);
      const ann: Annotation = {
        id: nanoid(), type: "text", x: p.x, y: p.y - tool.fontSize * 0.6, width: 180,
        // Text reads as near-black by default; only honor an explicitly-picked,
        // non-default color (the shared tool color defaults to red for shapes).
        text: "", fontSize: tool.fontSize,
        color: tool.color === "#ef4444" ? "#111827" : tool.color, bold: false,
      };
      addAnnotation(page.id, ann);
      setTool("select"); // stop placing; let the new box be clicked/edited
    } else if (activeTool === "select") {
      selectAnnotation(null);
    }
  }

  function onPointerLeave() {
    if (placing) setPlaceAt(null);
  }

  return {
    draft: draft?.ann ?? null,
    placeAt,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onClick },
  };
}
