/**
 * Geometry shared by everything that reasons about laid-out text: which line a
 * run sits on, how far along that line it reaches, and how wide the gap to its
 * neighbour is.
 *
 * This lives apart from the passes that use it because they have to agree on it
 * exactly. Grouping decides what a line is; paragraph detection decides which
 * lines belong together and re-wraps them. If those two measured lines even
 * slightly differently, text would be reflowed into a shape the grouper would
 * then read back as something else.
 */
import type { TextObject } from "../types";

/** Where a point sits along a run's own writing direction. */
export function along(o: TextObject, x: number, y: number): number {
  return x * o.dir.x + y * o.dir.y;
}

/**
 * Which baseline a run sits on: the signed distance from the page origin to
 * that baseline, measured along the line's normal. For unrotated text this is
 * simply the origin's y, and larger values are higher up the page.
 */
export function baselineOf(o: TextObject): number {
  return o.origin.y * o.dir.x - o.origin.x * o.dir.y;
}

/**
 * A run's extent along its own writing direction. Bounds come back axis-aligned
 * in user space, so a rotated run needs all four corners projected; for the
 * common unrotated case this reduces to { min: left, max: right }.
 */
export function extentOf(o: TextObject): { min: number; max: number } {
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

/** How far a run reaches along its own line, in points. */
export function spanOf(o: TextObject): number {
  const e = extentOf(o);
  return e.max - e.min;
}

/** Distance from the end of one run to the start of the next, along the line. */
export function gapBetween(prev: TextObject, next: TextObject): number {
  return extentOf(next).min - extentOf(prev).max;
}

/** Whether two runs point the same way, so they could share a line at all. */
export function sameDirection(a: TextObject, b: TextObject): boolean {
  return Math.abs(a.dir.x - b.dir.x) < 1e-4 && Math.abs(a.dir.y - b.dir.y) < 1e-4;
}
