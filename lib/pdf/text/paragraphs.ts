/**
 * Find the paragraph a line belongs to, and re-wrap it after an edit.
 *
 * A PDF has no paragraph model. Lines are independent positioned runs, and
 * nothing in the file says which of them are one block of prose. So a paragraph
 * has to be inferred from how the lines sit: same direction, same size, evenly
 * spaced baselines, and overlapping horizontally.
 *
 * That inference is what makes re-wrapping possible at all. Editing a line
 * without it can only make the line longer, running it off the page or into the
 * column beside it. With it, the surrounding lines are known, so the text can be
 * poured back through them the way a text editor would.
 *
 * The column width comes from the paragraph itself: the widest line in it is the
 * best evidence available of how much room the block was given. A single line on
 * its own therefore has no paragraph, because nothing on the page says how wide
 * it was allowed to be, and inventing a width would reflow text into a column
 * the document never had.
 */
import type { PageObject, TextObject } from "../types";
import { baselineOf, extentOf, sameDirection, spanOf } from "./geometry";
import { wrapText } from "./wrap";
import type { Measure } from "./measure";

/** Relative font-size difference two lines may have and still be one block. */
const SIZE_TOL = 0.15;
/** Baseline step below which lines are stacked or overlapping, not sequential. */
const MIN_LEADING_EM = 0.7;
/** Baseline step above which the next line is a new block, not the next line. */
const MAX_LEADING_EM = 2.5;
/** How far a step may drift from the paragraph's established leading. */
const LEADING_TOL = 0.3;
/** Fraction of the narrower line that must overlap horizontally. */
const MIN_OVERLAP = 0.5;

export interface Paragraph {
  /** Lines top to bottom. Always contains the line that was asked about. */
  lines: TextObject[];
  /** Index within `lines` of the line that was asked about. */
  target: number;
  /** Baseline-to-baseline step, in points. */
  leading: number;
  /** Room the block has to fill, in points, taken from its widest line. */
  columnWidth: number;
}

/** How much of the narrower of two lines sits within the other's span. */
function overlapFraction(a: TextObject, b: TextObject): number {
  const ea = extentOf(a);
  const eb = extentOf(b);
  const overlap = Math.min(ea.max, eb.max) - Math.max(ea.min, eb.min);
  const narrower = Math.min(spanOf(a), spanOf(b));
  return narrower > 0 ? overlap / narrower : 0;
}

/** Do two vertically adjacent lines read as part of one block? */
function follows(upper: TextObject, lower: TextObject, leading: number | null): boolean {
  const size = Math.max(upper.fontSize, lower.fontSize, 1);
  if (Math.abs(upper.fontSize - lower.fontSize) > SIZE_TOL * size) return false;

  const step = baselineOf(upper) - baselineOf(lower);
  if (step < MIN_LEADING_EM * size || step > MAX_LEADING_EM * size) return false;
  // Once the block has a rhythm, a line that breaks it starts a new block. This
  // is what separates a paragraph from the one under it when the gap between
  // them is only slightly larger than the gap inside them.
  return leading === null || Math.abs(step - leading) <= LEADING_TOL * leading;
}

/**
 * The paragraph containing the text entry at `index`, or null if that line
 * stands alone and so gives no evidence of a column to wrap into.
 */
export function paragraphAt(objects: PageObject[], index: number): Paragraph | null {
  const target = objects.find((o) => o.index === index);
  if (!target || target.type !== "text") return null;

  // Keep only lines that could share a column with this one, before looking at
  // any vertical rhythm. Two columns of body text have identical leading and
  // often identical baselines, so walking down the page without filtering
  // horizontally first lands on the neighbouring column and stops there.
  const candidates = objects
    .filter(
      (o): o is TextObject =>
        o.type === "text" &&
        sameDirection(o, target) &&
        (o.index === index || overlapFraction(o, target) >= MIN_OVERLAP),
    )
    .sort((a, b) => baselineOf(b) - baselineOf(a)); // top to bottom

  const at = candidates.findIndex((o) => o.index === index);
  if (at < 0) return null;

  const lines = [candidates[at]];
  let leading: number | null = null;

  // Walk down, then up, from the edited line. Establishing the leading from the
  // first accepted step and holding later steps to it is what stops a paragraph
  // running on into the next one.
  for (let i = at + 1; i < candidates.length; i++) {
    if (!follows(lines[lines.length - 1], candidates[i], leading)) break;
    leading ??= baselineOf(lines[lines.length - 1]) - baselineOf(candidates[i]);
    lines.push(candidates[i]);
  }
  for (let i = at - 1; i >= 0; i--) {
    if (!follows(candidates[i], lines[0], leading)) break;
    leading ??= baselineOf(candidates[i]) - baselineOf(lines[0]);
    lines.unshift(candidates[i]);
  }

  if (lines.length < 2 || leading === null) return null;

  let columnWidth = 0;
  for (const line of lines) columnWidth = Math.max(columnWidth, spanOf(line));

  return { lines, target: lines.findIndex((o) => o.index === index), leading, columnWidth };
}

/**
 * The paragraph's text after replacing one of its lines, re-wrapped to fit.
 *
 * Lines are joined with a space because a line break inside a paragraph is
 * where the text was wrapped, not something the author wrote, and it has to
 * come out before the text can be laid out again.
 *
 * A hyphen at a line break is left as-is. It is impossible to tell a word split
 * across lines ("environ-" / "ment") from a genuine compound ("part-" / "time")
 * without a dictionary, and joining wrongly silently corrupts a word. Leaving
 * the hyphen visible is wrong in a way the reader can see and fix.
 */
export function reflowParagraph(
  paragraph: Paragraph,
  replacement: string,
  measure: Measure,
): string[] {
  const text = paragraph.lines
    .map((line, i) => (i === paragraph.target ? replacement : line.text))
    .map((t) => t.replace(/\s+$/, ""))
    .join(" ");
  return wrapText(text, paragraph.columnWidth, measure);
}
