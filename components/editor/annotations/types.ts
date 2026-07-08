import type { RefObject } from "react";
import type { Annotation } from "@/lib/pdf/types";

/**
 * Props shared by every overlay annotation node (shape / text / image). Only the
 * annotation type `T` varies; the geometry, interaction flags, and callbacks are
 * identical, so each node specializes this rather than re-declaring the shape.
 *
 * `onSelect`/`onErase` take the annotation id so the parent can pass a single
 * stable (useCallback) handler instead of a fresh closure per annotation.
 */
export interface AnnotationNodeProps<T extends Annotation> {
  ann: T;
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
  onChange: (ann: T) => void;
}
