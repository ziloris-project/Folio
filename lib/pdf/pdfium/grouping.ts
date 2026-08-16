/**
 * Rebuild a page's text objects into editable lines.
 *
 * PDFs store text as positioned runs, often one per glyph, so clicking a text
 * object selects a letter rather than anything you would want to edit. This
 * reconstructs whole lines the way pdf.js / pdfminer do, purely geometrically,
 * no ML:
 *
 *   1. Cluster runs into lines by writing direction and baseline, both taken
 *      from the text matrix rather than guessed from the ink bounds.
 *   2. Split each line into draw layers, so text stamped on top of other text
 *      does not weave through it.
 *   3. Walk each layer in reading order, ending the entry where a gap is wide
 *      enough to be a column gutter rather than a space.
 *   4. Join the surviving runs into one string, inserting the spaces that the
 *      file only ever expressed as geometry.
 *
 * Step 4 is the load-bearing one, and it is why issue #1 matters more now than
 * it did for word grouping. A PDF has no space character between runs that were
 * positioned instead of spaced, so the gap is the only evidence there is. That
 * threshold used to decide where to cut one selectable word from the next,
 * which was cosmetic. It now decides whether a space exists in the text you
 * edit and export, which is not.
 *
 * The one guarantee held onto throughout: a run's own characters are never
 * altered or dropped. Text the file spelled out survives verbatim, spaces
 * included, and this only ever adds separators between runs. A file whose
 * spacing is already explicit cannot be made worse.
 */
import type { PageObject, PdfBBox, RGBA, TextObject } from "../types";

export interface TextGroup {
  /** Member object indices, in reading order along the line. */
  indices: number[];
  /** Reconstructed line text, with inter-run spaces restored. */
  text: string;
  /** Union bounding box in PDF user space (bottom-left origin). */
  bbox: PdfBBox;
  fontSize: number;
  fontName: string;
  color: RGBA;
  /** Baseline start of the line, i.e. the origin of its first run. */
  origin: { x: number; y: number };
  /** Writing direction shared by every run in the line. */
  dir: { x: number; y: number };
}

/**
 * Gap below which two runs are one word, as a fraction of the font size. A
 * space costs roughly 0.25-0.33em in most faces, while the ink gap inside a
 * word is well under 0.1em; 0.28 sits in that valley. Same constant family as
 * pdf.js and pdfminer, which have no better answer either, because the PDF
 * spec defines no word separator.
 */
const SPACE_EM = 0.28;
/**
 * Gap at which the line ends instead of taking a space. Two columns, or a form
 * label and the value across from it, sit on one baseline without being one
 * line of prose, and joining them would put unrelated text in a single edit.
 * Justified setting can stretch a space to about 1.2em, so 2em clears real
 * spacing while still catching a gutter.
 */
const BLOCK_EM = 2;
/** Baseline tolerance as a fraction of font size for "same line". */
const LINE_EM = 0.4;
/**
 * How much of the narrower neighbour may be overlapped before the pair reads as
 * one run stamped on the other rather than kerned against it. Faux-bold and
 * drop shadows redraw a string on itself a hairline apart, so each glyph is
 * almost entirely covered; genuine kerning ("AV", "To") eats well under a fifth
 * of a glyph.
 *
 * Measured against glyph width, not em: a lowercase glyph is only about half an
 * em wide, so a full overlay of one is still a small fraction of an em and any
 * em-based bound lets it through.
 */
const MAX_OVERLAP_FRACTION = 0.35;

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

/** Distance from the end of one run to the start of the next, along the line. */
function gapBetween(prev: TextObject, next: TextObject): number {
  return extentOf(next).min - extentOf(prev).max;
}

/**
 * Split a line into draw layers.
 *
 * Text stamped on top of other text (faux bold and drop shadows both redraw a
 * string on itself a hairline apart) interleaves with the original once the line
 * is in positional order, so grouping the line as one sequence produces a zigzag
 * of half-words: "bold" drawn twice comes out as b / bo / ol / ld / d.
 *
 * Assign each run to the first layer whose last member it does not heavily
 * overlap. Each layer is then a clean left-to-right sequence that groups on its
 * own terms, and the stamped copy stays a separate entry instead of being woven
 * through the original. Text that does not overlap all lands in one layer, so
 * for ordinary pages this does nothing.
 */
function splitLayers(line: TextObject[]): TextObject[][] {
  const layers: TextObject[][] = [];
  for (const o of line) {
    const b = extentOf(o);
    const layer = layers.find((runs) => {
      const a = extentOf(runs[runs.length - 1]);
      const narrower = Math.min(a.max - a.min, b.max - b.min);
      return b.min - a.max > -MAX_OVERLAP_FRACTION * narrower;
    });
    if (layer) layer.push(o);
    else layers.push([o]);
  }
  return layers;
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

/**
 * Join a line's runs into one string, restoring the spaces the file expressed
 * only as geometry.
 *
 * Each run's own text is copied verbatim; the only thing added is a separator
 * between runs whose gap is too wide to be kerning. Where either side already
 * ends or starts with whitespace the file has said what it means, so that is
 * used as-is rather than doubled.
 */
function joinRuns(runs: TextObject[]): string {
  let out = runs[0].text;
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const next = runs[i];
    const wide = gapBetween(prev, next) >= SPACE_EM * Math.max(prev.fontSize, 1);
    const spelled = /\s$/.test(prev.text) || /^\s/.test(next.text);
    out += wide && !spelled ? ` ${next.text}` : next.text;
  }
  return out;
}

function makeGroup(runs: TextObject[]): TextGroup {
  const first = runs[0];
  // Accumulate rather than spreading into Math.min/max: a line is short, but it
  // is the same argument-list hazard the ink bounding box was already fixed for.
  const bbox: PdfBBox = { ...first.bbox };
  for (const o of runs) {
    if (o.bbox.left < bbox.left) bbox.left = o.bbox.left;
    if (o.bbox.right > bbox.right) bbox.right = o.bbox.right;
    if (o.bbox.bottom < bbox.bottom) bbox.bottom = o.bbox.bottom;
    if (o.bbox.top > bbox.top) bbox.top = o.bbox.top;
  }
  return {
    indices: runs.map((o) => o.index),
    text: joinRuns(runs),
    bbox,
    // The first run's style, not the most common one, because the first run is
    // the anchor an edit rewrites through: reporting any other style would show
    // one thing in the inspector and render another. On a line of mixed styling
    // this means retyping adopts the style the line opens with.
    fontSize: first.fontSize,
    fontName: first.fontName,
    color: first.color,
    // The line starts where its first run starts, which is what anything
    // rebuilding or rescaling it has to anchor on.
    origin: first.origin,
    dir: first.dir,
  };
}

/**
 * Reconstruct line-level groups from a page's objects. Non-text objects are
 * ignored. Every returned group has at least one member; a single-member group
 * means that object already stood alone on its line.
 */
export function groupTextObjects(objects: PageObject[]): TextGroup[] {
  const texts = objects.filter((o): o is TextObject => o.type === "text");
  if (texts.length === 0) return [];

  const groups: TextGroup[] = [];
  for (const line of clusterLines(texts)) {
    line.sort((a, b) => extentOf(a).min - extentOf(b).min); // reading order
    for (const layer of splitLayers(line)) {
      let block: TextObject[] = [];
      const flush = () => {
        if (block.length) groups.push(makeGroup(block));
        block = [];
      };
      for (const t of layer) {
        const prev = block[block.length - 1];
        // A gap this wide is a gutter, not a space. Everything narrower stays on
        // the line and becomes either a space or nothing when the text is joined.
        if (prev && gapBetween(prev, t) >= BLOCK_EM * Math.max(prev.fontSize, 1)) {
          flush();
        }
        block.push(t);
      }
      flush();
    }
  }
  return groups;
}

/**
 * Rewrite a page's object list so each text entry is a whole line rather than
 * one run of it. Non-text objects pass through untouched.
 *
 * A line takes the index of its first run and names all of them in `parts`, so
 * it stays a valid PDFium index for operations that need one while every edit
 * still knows the full set to apply itself to. Anchoring on the first run
 * matters beyond convention: it is the one whose matrix places the line, so
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
