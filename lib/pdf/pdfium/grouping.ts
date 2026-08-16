/**
 * Group per-glyph PDF text objects into editable words.
 *
 * Many PDFs emit each glyph (or short run) as its own text object, so a naive
 * "click a text object" selects a single letter. This reconstructs words the
 * way pdf.js / pdfminer do - purely geometrically, no ML:
 *
 *   1. Cluster text objects into lines by writing direction and baseline, both
 *      taken from the text matrix rather than guessed from the ink bounds.
 *   2. Within a line, in reading order, merge neighbours that share font / size
 *      / colour when the gap between them is below a space threshold (~0.28em).
 *
 * Well-formed PDFs are unaffected: their inter-word gaps already exceed the
 * threshold, so each word stays its own group. A tiny model could later refine
 * ambiguous spacing - see the tracking issue - but is not needed here.
 *
 * Grouping only ever merges. It never splits a run the file already spelled
 * out, so a text object that arrives holding "hello world" stays one entry with
 * that exact text: nothing here can turn a PDF's own spacing into a worse guess.
 */
import type { PageObject, PdfBBox, RGBA, TextObject } from "../types";

export interface TextGroup {
  /** Member object indices, in reading order along the line. */
  indices: number[];
  /** Reconstructed word text. */
  text: string;
  /** Union bounding box in PDF user space (bottom-left origin). */
  bbox: PdfBBox;
  fontSize: number;
  fontName: string;
  color: RGBA;
  /** Baseline start of the word, i.e. the origin of its first run. */
  origin: { x: number; y: number };
  /** Writing direction shared by every run in the word. */
  dir: { x: number; y: number };
}

/** Fraction of the font size treated as a within-word gap (a space is wider). */
const SPACE_EM = 0.28;
/** Baseline tolerance as a fraction of font size for "same line". */
const LINE_EM = 0.4;
/** Allowed relative font-size difference to still count as the same run. */
const SIZE_TOL = 0.15;
/**
 * How far two neighbours may overlap and still count as kerning rather than one
 * drawn on top of the other. Tight pairs ("AV", "To") overlap by a few
 * hundredths of an em. Faux-bold and drop shadows redraw the same string on
 * itself with a hairline offset, overlapping by whole glyphs; without an upper
 * bound those merge and the word comes back doubled ("HHeelllloo").
 */
const MAX_OVERLAP_EM = 0.2;

function colorEq(a: RGBA, b: RGBA): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

/** Where a point sits along a run's own writing direction. */
function along(o: TextObject, x: number, y: number): number {
  return x * o.dir.x + y * o.dir.y;
}

/**
 * Which baseline a run sits on: the signed distance from the page origin to
 * that baseline, measured along the line's normal. For unrotated text this is
 * simply the origin's y.
 */
function baselineOf(o: TextObject): number {
  return o.origin.y * o.dir.x - o.origin.x * o.dir.y;
}

/**
 * A run's extent along its own writing direction. Bounds come back axis-aligned
 * in user space, so a rotated run needs all four corners projected; for the
 * common unrotated case this reduces to { min: left, max: right }.
 */
function extentOf(o: TextObject): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const x of [o.bbox.left, o.bbox.right]) {
    for (const y of [o.bbox.bottom, o.bbox.top]) {
      const t = along(o, x, y);
      if (t < min) min = t;
      if (t > max) max = t;
    }
  }
  return { min, max };
}

/** Cluster runs into lines: same writing direction, same baseline. */
function clusterLines(texts: TextObject[]): TextObject[][] {
  // Bucket by writing direction first. A rotated caption or watermark can cross
  // body text and project onto the same baseline, but it is never part of it.
  const byDir = new Map<string, TextObject[]>();
  for (const o of texts) {
    const key = `${o.dir.x.toFixed(4)},${o.dir.y.toFixed(4)}`;
    const bucket = byDir.get(key);
    if (bucket) bucket.push(o);
    else byDir.set(key, [o]);
  }

  const lines: TextObject[][] = [];
  for (const bucket of byDir.values()) {
    bucket.sort((a, b) => baselineOf(b) - baselineOf(a)); // top to bottom
    let line: TextObject[] = [bucket[0]];
    for (let i = 1; i < bucket.length; i++) {
      const o = bucket[i];
      // Compare against the line's first member, not its previous one. Chaining
      // off the previous lets a run drift by one tolerance per glyph, which on a
      // long line is enough to walk into the line below and merge the two.
      const head = line[0];
      const tol = LINE_EM * Math.max(o.fontSize, head.fontSize, 1);
      if (Math.abs(baselineOf(o) - baselineOf(head)) <= tol) {
        line.push(o);
      } else {
        lines.push(line);
        line = [o];
      }
    }
    lines.push(line);
  }
  return lines;
}

function makeGroup(word: TextObject[]): TextGroup {
  const first = word[0];
  // Accumulate rather than spreading into Math.min/max: a run of glyphs is
  // short, but this is the same argument-list hazard the ink bounding box hit.
  const bbox: PdfBBox = { ...first.bbox };
  let fontSize = first.fontSize;
  for (const o of word) {
    if (o.bbox.left < bbox.left) bbox.left = o.bbox.left;
    if (o.bbox.right > bbox.right) bbox.right = o.bbox.right;
    if (o.bbox.bottom < bbox.bottom) bbox.bottom = o.bbox.bottom;
    if (o.bbox.top > bbox.top) bbox.top = o.bbox.top;
    if (o.fontSize > fontSize) fontSize = o.fontSize;
  }
  return {
    indices: word.map((o) => o.index),
    text: word.map((o) => o.text).join(""),
    bbox,
    fontSize,
    fontName: first.fontName,
    color: first.color,
    // The word starts where its first run starts, which is what anything
    // rebuilding or rescaling the word has to anchor on.
    origin: first.origin,
    dir: first.dir,
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

  const groups: TextGroup[] = [];
  for (const line of clusterLines(texts)) {
    line.sort((a, b) => extentOf(a).min - extentOf(b).min); // reading order
    let word: TextObject[] = [];
    const flush = () => {
      if (word.length) groups.push(makeGroup(word));
      word = [];
    };
    for (const t of line) {
      const prev = word[word.length - 1];
      if (prev) {
        const em = Math.max(prev.fontSize, 1);
        const gap = extentOf(t).min - extentOf(prev).max;
        const sameStyle =
          prev.fontName === t.fontName &&
          Math.abs(prev.fontSize - t.fontSize) <=
            SIZE_TOL * Math.max(prev.fontSize, t.fontSize, 1) &&
          colorEq(prev.color, t.color);
        // Gap has to be small in both directions: too wide is a word break, too
        // negative is one run stamped over another rather than kerned into it.
        const adjacent = gap < SPACE_EM * em && gap > -MAX_OVERLAP_EM * em;
        // A space the PDF already spelled out is the word break, whatever the
        // geometry says. Grouping only ever merges runs, so it must not paper
        // over a boundary the file was explicit about.
        const spelled = /\s$/.test(prev.text) || /^\s/.test(t.text);
        if (!sameStyle || !adjacent || spelled) flush();
      }
      word.push(t);
    }
    flush();
  }
  return groups;
}

/**
 * Rewrite a page's object list so each text entry is the whole word rather than
 * one glyph run of it. Non-text objects pass through untouched.
 *
 * A word takes the index of its first run and names all of them in `parts`, so
 * it stays a valid PDFium index for operations that need one while every edit
 * still knows the full set to apply itself to. Anchoring on the first run
 * matters beyond convention: it is the one whose matrix places the word, so
 * font replacement and rescaling rebuild from the right point.
 */
export function applyTextGrouping(objects: PageObject[]): PageObject[] {
  const groups = groupTextObjects(objects);
  if (!groups.length) return objects;

  const merged: PageObject[] = objects.filter((o) => o.type !== "text");
  for (const g of groups) {
    merged.push({
      type: "text",
      index: g.indices[0],
      parts: g.indices,
      bbox: g.bbox,
      text: g.text,
      fontSize: g.fontSize,
      fontName: g.fontName,
      color: g.color,
      origin: g.origin,
      dir: g.dir,
    });
  }
  // Back into page order, so the list still reads as z-order like the raw one.
  return merged.sort((a, b) => a.index - b.index);
}
