"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useEditor } from "@/lib/store";
import type {
  Annotation,
  ImageAnnotation,
  PageItem,
  TextAnnotation,
  VectorAnnotation,
} from "@/lib/pdf/types";
import { ShapeAnnotation } from "./annotations/ShapeAnnotation";
import { TextNode } from "./annotations/TextNode";
import { ImageNode } from "./annotations/ImageNode";
import { EditObjectsLayer } from "./EditObjectsLayer";
import { PageCanvas } from "./PageCanvas";
import { DRAW_TOOLS, usePageDraw } from "./usePageDraw";

function PageViewImpl({ page, index }: { page: PageItem; index: number }) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const zoom = useEditor((s) => s.zoom);
  const activeTool = useEditor((s) => s.activeTool);
  const tool = useEditor((s) => s.tool);
  const source = useEditor((s) => (page.sourceId ? s.sources[page.sourceId] : null));
  const selectedAnnotationId = useEditor((s) => s.selectedAnnotationId);
  const updateAnnotation = useEditor((s) => s.updateAnnotation);
  const removeAnnotation = useEditor((s) => s.removeAnnotation);
  const selectAnnotation = useEditor((s) => s.selectAnnotation);

  // Stable per-page handlers so the (memoized) annotation nodes don't re-render
  // on every draft-draw frame just because a fresh inline closure was created.
  const handleSelect = useCallback((id: string) => selectAnnotation(id), [selectAnnotation]);
  const handleErase = useCallback((id: string) => removeAnnotation(page.id, id), [removeAnnotation, page.id]);
  const handleChange = useCallback((n: Annotation) => updateAnnotation(page.id, n), [updateAnnotation, page.id]);

  // Existing-content (edit mode) object layer
  const objects = useEditor((s) => s.pageObjects[page.id]);
  const selectedObject = useEditor((s) => s.selectedObject);
  const refreshObjects = useEditor((s) => s.refreshObjects);
  const selectObjectAction = useEditor((s) => s.selectObject);
  const moveObjectBy = useEditor((s) => s.moveObjectBy);

  // Floating image/signature placement
  const pendingImage = useEditor((s) => s.pendingImage);

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

  // Pointer state machine for free-draw, image placement, and text/deselect.
  const { draft, placeAt, handlers } = usePageDraw({
    page, zoom, activeTool, tool, editMode, pendingImage, placeSize, overlayRef,
  });

  const annotations = draft ? [...page.annotations, draft] : page.annotations;

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
                  onSelect={handleSelect}
                  onErase={handleErase}
                  onChange={handleChange}
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
                onSelect={handleSelect}
                onErase={handleErase}
                onChange={handleChange}
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
                onSelect={handleSelect}
                onErase={handleErase}
                onChange={handleChange}
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
          {...handlers}
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

export const PageView = memo(PageViewImpl);
