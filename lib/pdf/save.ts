"use client";

/**
 * Export the working document to a real PDF using pdf-lib, entirely in the
 * browser. We rebuild the page order from scratch (so reorder / delete / insert
 * / merge all "just work"), then bake every annotation onto its page.
 *
 * Coordinate bridge: annotations are stored in top-left origin page points
 * (see types.ts). pdf-lib uses bottom-left origin, so y_pdf = pageHeight - y.
 * We draw onto the *unrotated* page and then set the page rotation, so all
 * annotation math stays in unrotated page space regardless of view rotation.
 */
import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type {
  Annotation,
  ImageAnnotation,
  InkAnnotation,
  LineAnnotation,
  PageItem,
  RectLikeAnnotation,
  TextAnnotation,
} from "./types";

function hexToRgb(hex: string) {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = parseInt(full, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export interface SaveInput {
  pages: PageItem[];
  /**
   * Per-source PDF bytes to assemble from. These are the PDFium-saved bytes,
   * which already contain any existing-content edits AND have intrinsic page
   * rotation normalized to 0 (so the per-page rotation set below is absolute).
   */
  sourceBytes: Record<string, Uint8Array>;
}

export async function buildPdf({ pages, sourceBytes }: SaveInput): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);

  // Cache loaded source docs so we copy each only once.
  const loaded = new Map<string, PDFDocument>();
  async function srcDoc(sourceId: string) {
    let d = loaded.get(sourceId);
    if (!d) {
      d = await PDFDocument.load(sourceBytes[sourceId]);
      loaded.set(sourceId, d);
    }
    return d;
  }

  for (const item of pages) {
    let page: PDFPage;
    if (item.sourceId) {
      const [copied] = await out.copyPages(await srcDoc(item.sourceId), [
        item.sourcePageIndex,
      ]);
      out.addPage(copied);
      page = copied;
    } else {
      page = out.addPage([item.width, item.height]);
    }
    // Our model owns rotation entirely (intrinsic rotation was folded in on load).
    page.setRotation(degrees(item.rotation));

    // Use the *unrotated* media size for annotation math.
    const { width: w, height: h } = page.getSize();
    for (const ann of item.annotations) {
      await drawAnnotation(out, page, ann, h, w, font, fontBold);
    }
  }

  return out.save();
}

async function drawAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  ann: Annotation,
  H: number,
  _W: number,
  font: PDFFont,
  fontBold: PDFFont,
) {
  // y flip helper: our y is from top, pdf-lib's from bottom.
  const Y = (y: number) => H - y;

  switch (ann.type) {
    case "ink":
      return drawInk(page, ann, Y);
    case "highlight":
    case "rect":
    case "ellipse":
      return drawRectLike(page, ann, Y);
    case "line":
    case "arrow":
      return drawLine(page, ann, Y);
    case "text":
      return drawText(page, ann, Y, font, fontBold);
    case "image":
      return drawImage(doc, page, ann, Y);
  }
}

function drawInk(page: PDFPage, ann: InkAnnotation, Y: (y: number) => number) {
  const color = hexToRgb(ann.color);
  for (const stroke of ann.strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1];
      const b = stroke[i];
      page.drawLine({
        start: { x: a.x, y: Y(a.y) },
        end: { x: b.x, y: Y(b.y) },
        thickness: ann.width,
        color,
        opacity: ann.opacity,
        lineCap: 1, // round
      });
    }
  }
}

function drawRectLike(page: PDFPage, ann: RectLikeAnnotation, Y: (y: number) => number) {
  const color = hexToRgb(ann.color);
  const isHighlight = ann.type === "highlight";
  const filled = ann.fill || isHighlight;
  const common = {
    x: ann.x,
    y: Y(ann.y + ann.height),
    width: ann.width,
    height: ann.height,
    opacity: isHighlight ? ann.opacity : filled ? ann.opacity : 1,
    borderOpacity: ann.opacity,
  };
  if (ann.type === "ellipse") {
    page.drawEllipse({
      x: ann.x + ann.width / 2,
      y: Y(ann.y + ann.height / 2),
      xScale: ann.width / 2,
      yScale: ann.height / 2,
      color: filled ? color : undefined,
      borderColor: filled ? undefined : color,
      borderWidth: filled ? 0 : ann.strokeWidth,
      opacity: filled ? ann.opacity : 1,
      borderOpacity: ann.opacity,
    });
    return;
  }
  page.drawRectangle({
    ...common,
    color: filled ? color : undefined,
    borderColor: filled ? undefined : color,
    borderWidth: filled ? 0 : ann.strokeWidth,
  });
}

function drawLine(page: PDFPage, ann: LineAnnotation, Y: (y: number) => number) {
  const color = hexToRgb(ann.color);
  const start = { x: ann.x1, y: Y(ann.y1) };
  const end = { x: ann.x2, y: Y(ann.y2) };
  page.drawLine({ start, end, thickness: ann.width, color, lineCap: 1 });
  if (ann.type === "arrow") {
    // Draw a simple arrowhead at the end point.
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const len = 6 + ann.width * 2;
    for (const off of [Math.PI - 0.4, Math.PI + 0.4]) {
      page.drawLine({
        start: end,
        end: {
          x: end.x + len * Math.cos(angle + off),
          y: end.y + len * Math.sin(angle + off),
        },
        thickness: ann.width,
        color,
        lineCap: 1,
      });
    }
  }
}

function drawText(
  page: PDFPage,
  ann: TextAnnotation,
  Y: (y: number) => number,
  font: PDFFont,
  fontBold: PDFFont,
) {
  const f = ann.bold ? fontBold : font;
  const lineHeight = ann.fontSize * 1.2;
  const lines = ann.text.split("\n");
  lines.forEach((line, i) => {
    page.drawText(line, {
      x: ann.x,
      // text baseline sits below the top edge by ~one ascent
      y: Y(ann.y + ann.fontSize + i * lineHeight),
      size: ann.fontSize,
      font: f,
      color: hexToRgb(ann.color),
    });
  });
}

async function drawImage(
  doc: PDFDocument,
  page: PDFPage,
  ann: ImageAnnotation,
  Y: (y: number) => number,
) {
  const isPng = ann.dataUrl.startsWith("data:image/png");
  const base64 = ann.dataUrl.split(",")[1] ?? "";
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  page.drawImage(img, {
    x: ann.x,
    y: Y(ann.y + ann.height),
    width: ann.width,
    height: ann.height,
  });
}
