/**
 * Core document model for the editor.
 *
 * Coordinate convention for ALL annotations: page-local points (1 unit = 1/72"),
 * origin at the TOP-LEFT of the *unrotated* page, y growing downward. At zoom 1
 * one point maps to one CSS pixel of the rendered media, which keeps on-screen
 * math trivial. The exporter (pdf-lib) flips y and accounts for rotation when baking.
 */

export type SourceId = string;

/** A loaded source PDF (raw bytes kept for export via pdf-lib). */
export interface PdfSource {
  id: SourceId;
  name: string;
  bytes: Uint8Array;
}

export type Rotation = 0 | 90 | 180 | 270;

/** One page in the working document. Either references a source page or is blank. */
export interface PageItem {
  id: string;
  /** null => a blank inserted page. */
  sourceId: SourceId | null;
  /** Index into the source PDF (0-based). Ignored for blank pages. */
  sourcePageIndex: number;
  /** Extra rotation applied on top of the source page's intrinsic rotation. */
  rotation: Rotation;
  /** Intrinsic (unrotated) page size in points. */
  width: number;
  height: number;
  annotations: Annotation[];
  /** Bumped whenever the underlying PDFium page bitmap changes (content edits),
   *  to force the canvas to re-render. */
  editVersion: number;
}

export type ToolId =
  | "select"
  | "edit"
  | "text"
  | "ink"
  | "highlight"
  | "rect"
  | "ellipse"
  | "line"
  | "arrow"
  | "image"
  | "signature"
  | "eraser";

export interface BaseAnnotation {
  id: string;
  type: string;
}

export interface InkAnnotation extends BaseAnnotation {
  type: "ink";
  /** Flat list of stroke point-arrays: [[{x,y},...], ...] */
  strokes: { x: number; y: number }[][];
  color: string;
  width: number;
  opacity: number;
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  x: number;
  y: number;
  width: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
}

export interface RectLikeAnnotation extends BaseAnnotation {
  type: "highlight" | "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  fill: boolean;
  opacity: number;
}

export interface LineAnnotation extends BaseAnnotation {
  type: "line" | "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface ImageAnnotation extends BaseAnnotation {
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  /** PNG/JPEG data URL. */
  dataUrl: string;
}

export type Annotation =
  | InkAnnotation
  | TextAnnotation
  | RectLikeAnnotation
  | LineAnnotation
  | ImageAnnotation;

/** Annotations rendered inside the page SVG (everything except text/image). */
export type VectorAnnotation = InkAnnotation | RectLikeAnnotation | LineAnnotation;

// ---------------------------------------------------------------------------
// Existing-content object model (PDFium page objects). These describe content
// that is ALREADY in the PDF and editable in place - distinct from Annotations,
// which are new overlay content we add.
// ---------------------------------------------------------------------------

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Object bounds in PDF user space (points), bottom-left origin. */
export interface PdfBBox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export type PageObjectType = "text" | "path" | "image" | "other";

interface PageObjectBase {
  /** Index within the page's object list (valid until the list mutates). */
  index: number;
  type: PageObjectType;
  bbox: PdfBBox;
}

export interface TextObject extends PageObjectBase {
  type: "text";
  text: string;
  fontSize: number;
  color: RGBA;
  /** Base font name of the run (e.g. "ABCDEF+Arial" for an embedded subset). */
  fontName: string;
}

/** The standard-14 fonts we can recreate a run in to guarantee glyph coverage. */
export const STANDARD_FONTS = [
  "Helvetica",
  "Helvetica-Bold",
  "Helvetica-Oblique",
  "Helvetica-BoldOblique",
  "Times-Roman",
  "Times-Bold",
  "Times-Italic",
  "Courier",
  "Courier-Bold",
] as const;
export type StandardFont = (typeof STANDARD_FONTS)[number];

export interface PathObject extends PageObjectBase {
  type: "path";
  strokeColor: RGBA;
  strokeWidth: number;
  fillColor: RGBA;
}

export interface ImageObject extends PageObjectBase {
  type: "image";
}

export interface OtherObject extends PageObjectBase {
  type: "other";
}

export type PageObject = TextObject | PathObject | ImageObject | OtherObject;
