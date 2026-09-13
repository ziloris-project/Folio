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
  let leading: number | null = tighterStep(candidates, at);

  // Walk down, then up, from the edited line. Holding every step to one leading
  // is what stops a paragraph running on into the next one.
  //
  // That leading is seeded from the closer of the two neighbours rather than
  // from whichever step the walk happens to take first. On the last line of a
  // paragraph the first step down is the gap to the next paragraph, which is
  // still within reach of a line step whenever paragraphs are set only a little
  // apart (every imported .docx and .rtf is: a line and a bit). Taken as the
  // leading, it joined the two paragraphs and rejected the paragraph's own
  // lines above, so editing a closing line re-wrapped it into the paragraph
  // below at that paragraph's width. Space between paragraphs is never tighter
  // than space within one, so the smaller step is the paragraph's own.
  for (let i = at + 1; i < candidates.length; i++) {
    if (!follows(lines[lines.length - 1], candidates[i], leading)) break;
    if (tighterElsewhere(candidates, i, leading)) break;
    leading ??= baselineOf(lines[lines.length - 1]) - baselineOf(candidates[i]);
    lines.push(candidates[i]);
  }
  for (let i = at - 1; i >= 0; i--) {
    if (!follows(candidates[i], lines[0], leading)) break;
    if (tighterElsewhere(candidates, i, leading)) break;
    leading ??= baselineOf(candidates[i]) - baselineOf(lines[0]);
    lines.unshift(candidates[i]);
  }

  if (lines.length < 2 || leading === null) return null;

  const edited = lines.findIndex((o) => o.index === index);
  return { lines, target: edited, leading, columnWidth: columnOf(lines, edited) };
}

/**
 * The baseline step from the line at `at` to whichever adjacent candidate is
 * closer and could plausibly be its next or previous line, or null if neither
 * could.
 */
function tighterStep(candidates: TextObject[], at: number): number | null {
  const steps: number[] = [];
  const below = candidates[at + 1];
  const above = candidates[at - 1];
  if (below && follows(candidates[at], below, null)) {
    steps.push(baselineOf(candidates[at]) - baselineOf(below));
  }
  if (above && follows(above, candidates[at], null)) {
    steps.push(baselineOf(above) - baselineOf(candidates[at]));
  }
  return steps.length ? Math.min(...steps) : null;
}

/**
 * Whether the line at `i` keeps a tighter rhythm with its other neighbour than
 * `leading`, which makes it part of a more closely set block.
 *
 * The mirror image of seeding the leading from the tighter step. A one-line
 * paragraph under a block only sees the gap above it, so that gap became its
 * leading and pulled in the block's last line, whose own lines sit closer.
 */
function tighterElsewhere(candidates: TextObject[], i: number, leading: number | null): boolean {
  if (leading === null) return false;
  const own = tighterStep(candidates, i);
  return own !== null && own < leading - LEADING_TOL * leading;
}

/**
 * How wide the block was set, judged from the lines that still show it.
 *
 * The edited line is normally not counted. By the time a re-wrap is planned it already
 * holds the new text, so a line that was made longer would be the widest in the
 * paragraph and would define the column it just overflowed: the text would be
 * "re-wrapped" to exactly the width it already overran, and nothing would move.
 *
 * The final line is skipped too when there is an interior line to use instead.
 * A paragraph's last line stops wherever the text ran out, so it says nothing
 * about the column, while every interior line was broken against it.
 *
 * That leaves one shape with no real evidence at all: a two-line paragraph whose
 * first line is the one being edited. Its only other line is the closing one,
 * which is a lower bound on the column and usually a poor one. Wrapping to it
 * squeezed a paragraph that had always fit, so typing one word onto "A second
 * block sits below the first one here," broke it across three short lines. There
 * the edited line is counted after all, because it did fit the column before
 * the edit. The cost is that lengthening that line grows it rather than
 * re-wrapping it, which keeps the layout the file had instead of inventing a
 * narrower one.
 */
function columnOf(lines: TextObject[], target: number): number {
  const interior = lines.filter((_, i) => i !== target && i !== lines.length - 1);
  const others = lines.filter((_, i) => i !== target);
  const evidence = interior.length ? interior : others;
  let width = 0;
  for (const line of evidence) width = Math.max(width, spanOf(line));
  if (!interior.length && target !== lines.length - 1) {
    width = Math.max(width, spanOf(lines[target]));
  }
  return width;
}

/**
 * Re-wrap the edited line and everything below it, returning the lines that
 * replace `paragraph.lines` from `paragraph.target` onwards.
 *
 * Only the tail is reflowed, and that is the difference between an edit that
 * feels local and one that feels like the document moved. Text above the edit
 * did not change, so re-breaking it would shuffle lines the user was not
 * touching, for no reason they could see. Editing the third line of a paragraph
 * leaves the first two exactly where they were.
 *
 * Within the tail, lines are joined with a space because a break inside a
 * paragraph is where the text was wrapped, not something the author typed, and
 * it has to come out before the text can be laid out again.
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
  measureLine?: (line: number) => Measure,
): string[] {
  const tail = paragraph.lines.slice(paragraph.target);
  const text = tail
    .map((line, i) => (i === 0 ? replacement : line.text))
    .map((t) => t.replace(/\s+$/, ""))
    .join(" ");
  return wrapText(text, paragraph.columnWidth, measure, measureLine);
}
