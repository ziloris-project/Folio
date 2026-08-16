/**
 * Greedy line breaking for re-wrapping edited text.
 *
 * Greedy rather than optimal (Knuth-Plass) on purpose: this runs while someone
 * is typing, and it has to agree with what they already see. A paragraph
 * optimiser can move a break several lines above the caret when a word is added
 * at the bottom, which reads as the text jumping around. Filling each line as
 * far as it goes only ever changes the line being typed and the ones after it.
 */
import type { Measure } from "./measure";

/**
 * Break `text` into lines that each fit `maxWidth`.
 *
 * Explicit newlines are always honoured: they are the one break the file (or
 * the user) stated outright, so they survive wrapping rather than being
 * reflowed away. Everything else breaks at whitespace, and the whitespace is
 * consumed by the break so no line ends in a dangling space.
 *
 * Returns at least one line, so an empty string round-trips as [""] rather than
 * vanishing.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  return text.split("\n").flatMap((line) => wrapLine(line, maxWidth, measure));
}

function wrapLine(text: string, maxWidth: number, measure: Measure): string[] {
  // Word plus the whitespace that trailed it, so a break can drop the space.
  const chunks = text.match(/\S+\s*/g);
  if (!chunks) return [text];

  const lines: string[] = [];
  let line = "";
  for (const chunk of chunks) {
    const word = chunk.replace(/\s+$/, "");
    if (line && measure(line + word) > maxWidth) {
      lines.push(line.replace(/\s+$/, ""));
      line = "";
    }
    if (!line && measure(word) > maxWidth) {
      // A single word wider than the column. Left alone it would overflow and,
      // because the overflow never gets consumed, every line after it too. Cut
      // it by character instead, which is what a renderer with nowhere to break
      // has to do.
      let rest = word;
      while (measure(rest) > maxWidth) {
        const cut = longestFitting(rest, maxWidth, measure);
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest + chunk.slice(word.length);
      continue;
    }
    line += chunk;
  }
  // Hard-breaking can consume a word exactly, leaving nothing in hand. Only
  // emit the tail if it holds something, or if it is the whole result.
  const tail = line.replace(/\s+$/, "");
  if (tail || lines.length === 0) lines.push(tail);
  return lines;
}

/**
 * How many leading characters of `text` fit in `maxWidth`, at least one.
 *
 * Binary search rather than a scan: a hard-broken run can be long (a URL, a
 * base64 blob pasted into a document), and this is on the typing path.
 */
function longestFitting(text: string, maxWidth: number, measure: Measure): number {
  let lo = 1;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid)) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
