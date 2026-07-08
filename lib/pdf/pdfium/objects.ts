"use client";

/**
 * Read and edit a page's existing content objects (text / path / image) via
 * PDFium's FPDFPageObj_* API. All geometry here is in PDF user space (points,
 * bottom-left origin); the UI layer converts to/from the top-left overlay space.
 *
 * After any mutation the caller must call `doc.regenerate(pageIndex)` to rewrite
 * the page content stream, then re-render.
 */
import type { PdfiumDoc } from "./doc";
import {
  malloc,
  free,
  getFloat,
  setFloat,
  readWideString,
  readUtf8,
  writeWideString,
  withFloatOut,
  withIntOut,
  type Pdfium,
} from "./runtime";
import type { PageObject, RGBA } from "../types";

const OBJ_TEXT = 1;
const OBJ_PATH = 2;
const OBJ_IMAGE = 3;

function readBounds(I: Pdfium, obj: number) {
  const { values } = withFloatOut(I, 4, (p) =>
    I.FPDFPageObj_GetBounds(obj, p[0], p[1], p[2], p[3]),
  );
  const [left, bottom, right, top] = values;
  return { left, bottom, right, top };
}

function readFill(I: Pdfium, obj: number): RGBA {
  const { values } = withIntOut(I, 4, (p) =>
    I.FPDFPageObj_GetFillColor(obj, p[0], p[1], p[2], p[3]),
  );
  const [r, g, b, a] = values;
  return { r, g, b, a };
}

function readStroke(I: Pdfium, obj: number): RGBA {
  const { values } = withIntOut(I, 4, (p) =>
    I.FPDFPageObj_GetStrokeColor(obj, p[0], p[1], p[2], p[3]),
  );
  const [r, g, b, a] = values;
  return { r, g, b, a };
}

function readStrokeWidth(I: Pdfium, obj: number): number {
  return withFloatOut(I, 1, (p) => I.FPDFPageObj_GetStrokeWidth(obj, p[0])).values[0];
}

/**
 * Effective on-page font size. PDFium reports a *nominal* size that is then
 * scaled by the text object's matrix, so a visually-36pt run can report 24.
 * Effective size = nominal * vertical scale of the matrix (length of the image
 * of the text-space y-axis = hypot(c, d)).
 */
function readFontSize(I: Pdfium, obj: number): number {
  const nominal = withFloatOut(I, 1, (p) => I.FPDFTextObj_GetFontSize(obj, p[0])).values[0];
  const [, , c, d] = getMatrix(I, obj);
  return nominal * Math.hypot(c, d);
}

function readFontName(I: Pdfium, obj: number): string {
  const font = I.FPDFTextObj_GetFont(obj);
  if (!font) return "";
  const len = I.FPDFFont_GetBaseFontName(font, 0, 0); // bytes incl. null (ASCII)
  if (!len) return "";
  const buf = malloc(I, len);
  try {
    I.FPDFFont_GetBaseFontName(font, buf, len);
    return readUtf8(I, buf);
  } finally {
    free(I, buf);
  }
}

function readText(I: Pdfium, obj: number, textPage: number): string {
  const len = I.FPDFTextObj_GetText(obj, textPage, 0, 0); // bytes incl. null (UTF-16)
  if (!len) return "";
  const buf = malloc(I, len);
  try {
    I.FPDFTextObj_GetText(obj, textPage, buf, len);
    return readWideString(I, buf);
  } finally {
    free(I, buf);
  }
}

/** Enumerate every object on a page with its editable properties. */
export function listPageObjects(doc: PdfiumDoc, pageIndex: number): PageObject[] {
  const I = doc.I;
  const page = doc.pageHandle(pageIndex);
  const textPage = doc.textPageHandle(pageIndex);
  const n = I.FPDFPage_CountObjects(page);
  const out: PageObject[] = [];
  for (let i = 0; i < n; i++) {
    const obj = I.FPDFPage_GetObject(page, i);
    const type = I.FPDFPageObj_GetType(obj);
    const bbox = readBounds(I, obj);
    if (type === OBJ_TEXT) {
      out.push({ index: i, type: "text", bbox, text: readText(I, obj, textPage), fontSize: readFontSize(I, obj), color: readFill(I, obj), fontName: readFontName(I, obj) });
    } else if (type === OBJ_PATH) {
      out.push({ index: i, type: "path", bbox, strokeColor: readStroke(I, obj), strokeWidth: readStrokeWidth(I, obj), fillColor: readFill(I, obj) });
    } else if (type === OBJ_IMAGE) {
      out.push({ index: i, type: "image", bbox });
    } else {
      out.push({ index: i, type: "other", bbox });
    }
  }
  return out;
}

const obj = (doc: PdfiumDoc, pageIndex: number, objIndex: number) =>
  doc.I.FPDFPage_GetObject(doc.pageHandle(pageIndex), objIndex);

// --- Matrix helpers (FS_MATRIX = 6 floats a,b,c,d,e,f) --------------------

function getMatrix(I: Pdfium, o: number): [number, number, number, number, number, number] {
  const ptr = malloc(I, 24);
  try {
    I.FPDFPageObj_GetMatrix(o, ptr);
    return [0, 1, 2, 3, 4, 5].map((i) => getFloat(I, ptr + i * 4)) as [number, number, number, number, number, number];
  } finally {
    free(I, ptr);
  }
}

function setMatrix(I: Pdfium, o: number, m: [number, number, number, number, number, number]) {
  const ptr = malloc(I, 24);
  try {
    m.forEach((v, i) => setFloat(I, ptr + i * 4, v));
    I.FPDFPageObj_SetMatrix(o, ptr);
  } finally {
    free(I, ptr);
  }
}

// --- Edit operations -------------------------------------------------------

/** Replace a text object's string. Returns false if the font rejected it. */
export function setObjectText(doc: PdfiumDoc, pageIndex: number, objIndex: number, text: string): boolean {
  const I = doc.I;
  const w = writeWideString(I, text);
  try {
    return I.FPDFText_SetText(obj(doc, pageIndex, objIndex), w);
  } finally {
    free(I, w);
  }
}

export function setObjectFill(doc: PdfiumDoc, pageIndex: number, objIndex: number, c: RGBA) {
  doc.I.FPDFPageObj_SetFillColor(obj(doc, pageIndex, objIndex), c.r, c.g, c.b, c.a);
}

export function setObjectStrokeColor(doc: PdfiumDoc, pageIndex: number, objIndex: number, c: RGBA) {
  doc.I.FPDFPageObj_SetStrokeColor(obj(doc, pageIndex, objIndex), c.r, c.g, c.b, c.a);
}

export function setObjectStrokeWidth(doc: PdfiumDoc, pageIndex: number, objIndex: number, w: number) {
  doc.I.FPDFPageObj_SetStrokeWidth(obj(doc, pageIndex, objIndex), w);
}

/** Scale a text object's glyph size about its origin (no direct size setter). */
export function setObjectFontSize(doc: PdfiumDoc, pageIndex: number, objIndex: number, current: number, next: number) {
  if (current <= 0) return;
  const I = doc.I;
  const o = obj(doc, pageIndex, objIndex);
  const k = next / current;
  const [a, b, c, d, e, f] = getMatrix(I, o);
  setMatrix(I, o, [a * k, b * k, c * k, d * k, e, f]); // keep translation anchored
}

/** Translate an object by (dx, dy) in PDF points (bottom-left origin). */
export function moveObject(doc: PdfiumDoc, pageIndex: number, objIndex: number, dxPdf: number, dyPdf: number) {
  doc.I.FPDFPageObj_Transform(obj(doc, pageIndex, objIndex), 1, 0, 0, 1, dxPdf, dyPdf);
}

export function deleteObject(doc: PdfiumDoc, pageIndex: number, objIndex: number) {
  const I = doc.I;
  const page = doc.pageHandle(pageIndex);
  const o = I.FPDFPage_GetObject(page, objIndex);
  I.FPDFPage_RemoveObject(page, o);
  I.FPDFPageObj_Destroy(o);
}

/**
 * Replace a text run with new text drawn in a standard-14 font at an exact
 * on-page size, preserving position, rotation and color. This is the reliable
 * path when the original (often subset) font can't render newly-typed glyphs,
 * and it sets font size exactly (no matrix-scale approximation).
 *
 * Multi-line support: the text may contain newlines; each line becomes its own
 * text object stacked downward by 1.2x the font size, in the run's own rotation
 * frame. (Full reflow of surrounding existing content is not possible - PDFs
 * have no paragraph model - but explicit line breaks are honored.)
 *
 * Returns the index of the last created object (appended on top), or -1.
 */
export function recreateTextObject(
  doc: PdfiumDoc,
  pageIndex: number,
  objIndex: number,
  opts: { fontName: string; text: string; fontSize: number; color: RGBA },
): number {
  const I = doc.I;
  const page = doc.pageHandle(pageIndex);
  const old = I.FPDFPage_GetObject(page, objIndex);

  // Decompose the old matrix into rotation (unit scale) + translation so new
  // objects keep orientation/position but take their size from CreateTextObj.
  const [a, b, c, d, e, f] = getMatrix(I, old);
  const scale = Math.hypot(c, d) || 1;
  const [ua, ub, uc, ud] = [a / scale, b / scale, c / scale, d / scale];

  const font = I.FPDFText_LoadStandardFont(doc.handle, opts.fontName);
  if (!font) return -1;

  I.FPDFPage_RemoveObject(page, old);
  I.FPDFPageObj_Destroy(old);

  const lines = opts.text.split("\n");
  const lineHeight = opts.fontSize * 1.2;
  let created = 0;
  lines.forEach((line, i) => {
    if (line.length === 0) return; // blank line: advance spacing only
    const obj = I.FPDFPageObj_CreateTextObj(doc.handle, font, opts.fontSize);
    if (!obj) return;
    const w = writeWideString(I, line);
    try {
      I.FPDFText_SetText(obj, w);
    } finally {
      free(I, w);
    }
    I.FPDFPageObj_SetFillColor(obj, opts.color.r, opts.color.g, opts.color.b, opts.color.a);
    // Offset line i downward along the run's local "down" axis = -(uc, ud).
    const ex = e - i * lineHeight * uc;
    const fy = f - i * lineHeight * ud;
    setMatrix(I, obj, [ua, ub, uc, ud, ex, fy]);
    I.FPDFPage_InsertObject(page, obj);
    created++;
  });

  return created > 0 ? I.FPDFPage_CountObjects(page) - 1 : -1;
}
