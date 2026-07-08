"use client";

import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { nanoid } from "nanoid";
import { useEditor } from "@/lib/store";
import type {
  Annotation,
  ImageAnnotation,
  InkAnnotation,
  LineAnnotation,
  PageItem,
  RectLikeAnnotation,
  TextAnnotation,
  VectorAnnotation,
} from "@/lib/pdf/types";
import { toPagePoint } from "@/lib/pdf/coords";
import { ShapeAnnotation } from "./annotations/ShapeAnnotation";
import { TextNode } from "./annotations/TextNode";
import { ImageNode } from "./annotations/ImageNode";
import { EditObjectsLayer } from "./EditObjectsLayer";
import { PageCanvas } from "./PageCanvas";

const DRAW_TOOLS = new Set(["ink", "highlight", "rect", "ellipse", "line", "arrow"]);

interface Draft {
  ann: VectorAnnotation;
  start: { x: number; y: number };
}

export function PageView({ page, index }: { page: PageItem; index: number }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const zoom = useEditor((s) => s.zoom);
  const activeTool = useEditor((s) => s.activeTool);
  const tool = useEditor((s) => s.tool);
  const source = useEditor((s) => (page.sourceId ? s.sources[page.sourceId] : null));
  const selectedAnnotationId = useEditor((s) => s.selectedAnnotationId);
  const addAnnotation = useEditor((s) => s.addAnnotation);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);
  const selectPage = useEditor((s) => s.selectPage);
  const setTool = useEditor((s) => s.setTool);

  // Existing-content editing
  const objects = useEditor((s) => s.pageObjects[page.id]);
  const selectedObject = useEditor((s) => s.selectedObject);
  const refreshObjects = useEditor((s) => s.refreshObjects);
  const selectObjectAction = useEditor((s) => s.selectObject);
  const moveObjectBy = useEditor((s) => s.moveObjectBy);

  // Floating image/signature placement
  const pendingImage = useEditor((s) => s.pendingImage);
  const setPendingImage = useEditor((s) => s.setPendingImage);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [placeAt, setPlaceAt] = useState<{ x: number; y: number } | null>(null);
  const editMode = activeTool === "edit";
  const placing = pendingImage !== null;

  // Size a pending image to at most half the page width, preserving aspect.
  const placeSize = pendingImage
    ? (() => {
        const scale = Math.min(1, (page.width * 0.5) / pendingImage.naturalW);
        return { w: pendingImage.naturalW * scale, h: pendingImage.naturalH * scale };
      })()
    : null;

  const swapped = page.rotation === 90 || page.rotation === 270;
  const dispW = (swapped ? page.height : page.width) * zoom;
  const dispH = (swapped ? page.width : page.height) * zoom;
  const mediaW = page.width;
  const mediaH = page.height;

  // Lazily enumerate page objects when this page first enters edit mode.
  useEffect(() => {
    if (editMode && source && !objects) void refreshObjects(page.id);
  }, [editMode, source, objects, page.id, refreshObjects]);

  const isDrawing = DRAW_TOOLS.has(activeTool);
  const interactive = activeTool === "select" || activeTool === "eraser";

  function onPointerDown(e: RPointerEvent<HTMLDivElement>) {
    selectPage(page.id);
    // In edit mode this fires only for clicks on empty page area (object
    // hit-rects stop propagation), so it deselects the current object.
    if (editMode) {
      selectObjectAction(null);
      return;
    }
    if (!isDrawing) return;
    const el = overlayRef.current!;
    el.setPointerCapture(e.pointerId);
    const p = toPagePoint(e, el, page.rotation, mediaW, mediaH, zoom);
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
      const el = overlayRef.current!;
      setPlaceAt(toPagePoint(e, el, page.rotation, mediaW, mediaH, zoom));
      return;
    }
    if (!draft) return;
    const el = overlayRef.current!;
    const p = toPagePoint(e, el, page.rotation, mediaW, mediaH, zoom);
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
    const el = overlayRef.current!;
    const p = toPagePoint(e, el, page.rotation, mediaW, mediaH, zoom);
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

  // Click on text tool places a text box and switches to editing.
  function onBackgroundClick(e: RPointerEvent<HTMLDivElement>) {
    if (placing) {
      onPlaceClick(e);
      return;
    }
    if (activeTool === "text") {
      const el = overlayRef.current!;
      const p = toPagePoint(e, el, page.rotation, mediaW, mediaH, zoom);
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

  const annotations = draft ? [...page.annotations, draft.ann] : page.annotations;

  return (
    <div
      id={`page-${page.id}`}
      data-page-id={page.id}
      className="relative shrink-0"
      style={{ width: dispW, height: dispH }}
    >
      <div
        className="absolute left-1/2 top-1/2 origin-center bg-white shadow-xl"
        style={{
          width: mediaW * zoom,
          height: mediaH * zoom,
          transform: `translate(-50%, -50%) rotate(${page.rotation}deg)`,
        }}
      >
        {source && (
          <PageCanvas
            source={source}
            pageIndex={page.sourcePageIndex}
            editVersion={page.editVersion}
            zoom={zoom}
            className="block h-full w-full"
          />
        )}

        {/* Annotation render + selection/move/erase layer */}
        <div className="absolute inset-0" style={{ pointerEvents: interactive ? "auto" : "none" }}>
          <svg
            className="absolute inset-0"
            width={mediaW * zoom}
            height={mediaH * zoom}
            viewBox={`0 0 ${mediaW} ${mediaH}`}
            style={{ overflow: "visible" }}
          >
            {annotations
              .filter((a): a is VectorAnnotation => a.type !== "text" && a.type !== "image")
              .map((a) => (
                <ShapeAnnotation
                  key={a.id}
                  ann={a}
                  selected={a.id === selectedAnnotationId}
                  interactive={interactive}
                  eraser={activeTool === "eraser"}
                  zoom={zoom}
                  rotation={page.rotation}
                  mediaW={mediaW}
                  mediaH={mediaH}
                  overlayRef={overlayRef}
                  onSelect={() => selectAnnotation(a.id)}
                  onErase={() => removeAnnotation(page.id, a.id)}
                  onChange={(n) => updateAnnotation(page.id, n)}
                />
              ))}
          </svg>

          {annotations
            .filter((a): a is TextAnnotation => a.type === "text")
            .map((a) => (
              <TextNode
                key={a.id}
                ann={a}
                zoom={zoom}
                selected={a.id === selectedAnnotationId}
                interactive={interactive}
                eraser={activeTool === "eraser"}
                rotation={page.rotation}
                mediaW={mediaW}
                mediaH={mediaH}
                overlayRef={overlayRef}
                onSelect={() => selectAnnotation(a.id)}
                onErase={() => removeAnnotation(page.id, a.id)}
                onChange={(n) => updateAnnotation(page.id, n)}
              />
            ))}

          {annotations
            .filter((a): a is ImageAnnotation => a.type === "image")
            .map((a) => (
              <ImageNode
                key={a.id}
                ann={a}
                zoom={zoom}
                selected={a.id === selectedAnnotationId}
                interactive={interactive}
                eraser={activeTool === "eraser"}
                rotation={page.rotation}
                mediaW={mediaW}
                mediaH={mediaH}
                overlayRef={overlayRef}
                onSelect={() => selectAnnotation(a.id)}
                onErase={() => removeAnnotation(page.id, a.id)}
                onChange={(n) => updateAnnotation(page.id, n)}
              />
            ))}
        </div>

        {/* Floating preview of the image being placed */}
        {placing && placeAt && placeSize && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pendingImage!.dataUrl}
            alt=""
            className="pointer-events-none absolute opacity-60 ring-1 ring-accent"
            style={{
              left: (placeAt.x - placeSize.w / 2) * zoom,
              top: (placeAt.y - placeSize.h / 2) * zoom,
              width: placeSize.w * zoom,
              height: placeSize.h * zoom,
            }}
          />
        )}

        {/* Drawing / placement / empty-click capture layer */}
        <div
          ref={overlayRef}
          className="absolute inset-0"
          style={{
            pointerEvents:
              isDrawing || activeTool === "text" || editMode || placing ? "auto" : "none",
            cursor: placing ? "copy" : isDrawing ? "crosshair" : activeTool === "text" ? "text" : "default",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => placing && setPlaceAt(null)}
          onClick={onBackgroundClick}
        />

        {/* Existing-content object selection/move layer (edit mode, on top) */}
        {editMode && objects && (
          <EditObjectsLayer
            objects={objects}
            selectedIndex={selectedObject?.pageId === page.id ? selectedObject.index : null}
            zoom={zoom}
            rotation={page.rotation}
            mediaW={mediaW}
            mediaH={mediaH}
            overlayRef={overlayRef}
            onSelect={(i) => selectObjectAction({ pageId: page.id, index: i })}
            onMoveCommit={(i, dx, dy) => void moveObjectBy(page.id, i, dx, dy)}
          />
        )}
      </div>

      <span className="absolute -left-7 top-0 text-xs text-muted">{index + 1}</span>
    </div>
  );
}
