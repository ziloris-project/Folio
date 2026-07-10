/**
 * Group per-glyph PDF text objects into editable words.
 *
 * Many PDFs emit each glyph (or short run) as its own text object, so a naive
 * "click a text object" selects a single letter. This reconstructs words the
 * way pdf.js / pdfminer do - purely geometrically, no ML:
 *
 *   1. Cluster text objects into lines by baseline proximity.
 *   2. Within a line, left-to-right, merge neighbours that share font / size /
 *      colour when the horizontal gap is below a space threshold (~0.28em).
 *
 * Well-formed PDFs are unaffected: their inter-word gaps already exceed the
 * threshold, so each word stays its own group. A tiny model could later refine
 * ambiguous spacing - see the tracking issue - but is not needed here.
 */
import type { PageObject, PdfBBox, RGBA, TextObject } from "../types";

export interface TextGroup {
  /** Member object indices (in page-object order), left-to-right. */
  indices: number[];
  /** Reconstructed word text. */
  text: string;
  /** Union bounding box in PDF user space (bottom-left origin). */
  bbox: PdfBBox;
  fontSize: number;
  fontName: string;
  color: RGBA;
}

/** Fraction of the font size treated as a within-word gap (a space is wider). */
const SPACE_EM = 0.28;
/** Baseline tolerance as a fraction of font size for "same line". */
const LINE_EM = 0.4;
/** Allowed relative font-size difference to still count as the same run. */
const SIZE_TOL = 0.15;

function colorEq(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function makeGroup(word: TextObject[]): TextGroup {
  const first = word[0];
  const bbox: PdfBBox = {
    left: Math.min(...word.map((o) => o.bbox.left)),
    right: Math.max(...word.map((o) => o.bbox.right)),
    bottom: Math.min(...word.map((o) => o.bbox.bottom)),
    top: Math.max(...word.map((o) => o.bbox.top)),
  };
  return {
    indices: word.map((o) => o.index),
    text: word.map((o) => o.text).join(""),
    bbox,
    fontSize: Math.max(...word.map((o) => o.fontSize)),
    fontName: first.fontName,
    color: first.color,
  };
}

/**
 * Reconstruct word-level groups from a page's objects. Non-text objects are
 * ignored. Every returned group has at least one member; single-member groups
 * mean that object was already a standalone word.
 */
export function groupTextObjects(objects: PageObject[]): TextGroup[] {
  const texts = objects.filter((o): o is TextObject => o.type === "text");
  if (texts.length === 0) return [];

  // Order top-to-bottom then left-to-right so same-baseline glyphs are adjacent.
  const sorted = [...texts].sort(
    (a, b) => b.bbox.bottom - a.bbox.bottom || a.bbox.left - b.bbox.left,
  );

  // Greedy line clustering by baseline (bbox.bottom).
  const lines: TextObject[][] = [];
  for (const t of sorted) {
    const line = lines[lines.length - 1];
    const ref = line?.[line.length - 1];
    const tol = LINE_EM * Math.max(t.fontSize, ref?.fontSize ?? t.fontSize, 1);
    if (ref && Math.abs(t.bbox.bottom - ref.bbox.bottom) <= tol) line.push(t);
    else lines.push([t]);
  }

  const groups: TextGroup[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.bbox.left - b.bbox.left);
    let word: TextObject[] = [];
    const flush = () => {
      if (word.length) groups.push(makeGroup(word));
      word = [];
    };
    for (const t of line) {
      const prev = word[word.length - 1];
      if (prev) {
        const gap = t.bbox.left - prev.bbox.right;
        const space = SPACE_EM * Math.max(prev.fontSize, 1);
        const sameStyle =
          prev.fontName === t.fontName &&
          Math.abs(prev.fontSize - t.fontSize) <=
            SIZE_TOL * Math.max(prev.fontSize, t.fontSize, 1) &&
          colorEq(prev.color, t.color);
        if (!sameStyle || gap >= space) flush();
      }
      word.push(t);
    }
    flush();
  }
  return groups;
}
