import { describe, expect, it } from "vitest";
import { applyTextGrouping, groupTextObjects } from "./grouping";
import type { PageObject, TextObject } from "../types";

const BLACK = { r: 0, g: 0, b: 0, a: 255 };

/**
 * A glyph run drawn at `x` on baseline `y`, with `w` points of ink.
 *
 * The ink box deliberately disagrees with the baseline the way a real one does:
 * descenders hang below it and everything rises above it. Several of the cases
 * below only mean anything because of that gap between ink and baseline.
 */
function glyph(
  text: string,
  x: number,
  y: number,
  w: number,
  over: Partial<TextObject> = {},
): TextObject {
  return {
    index: 0,
    parts: [],
    type: "text",
    text,
    fontSize: 10,
    fontName: "ABCDEF+Arial",
    color: BLACK,
    origin: { x, y },
    dir: { x: 1, y: 0 },
    bbox: { left: x, right: x + w, bottom: y - (/[gjpqy]/.test(text) ? 2 : 0), top: y + 7 },
    ...over,
  } as TextObject;
}

/** One run per character, `advance` apart, as a per-glyph PDF would emit it. */
function perGlyph(text: string, startX: number, y: number, advance = 2): TextObject[] {
  return [...text].map((ch, i) => glyph(ch, startX + i * advance, y, advance * 0.9));
}

/** Number the runs the way listPageObjects would, then group and read back. */
function linesOf(objs: PageObject[]): string[] {
  const numbered = objs.map((o, i) => ({ ...o, index: i }));
  return applyTextGrouping(numbered)
    .filter((o): o is TextObject => o.type === "text")
    .map((o) => o.text);
}

describe("groupTextObjects", () => {
  it("rebuilds a per-glyph line into one entry, spaces and all", () => {
    // "hello" then a 3.5pt gap (0.35em, above the 0.28em space threshold) so a
    // space has to be invented, since the file never stored one.
    const objs = [...perGlyph("hello", 0, 100), ...perGlyph("world", 13.5, 100)];
    expect(linesOf(objs)).toEqual(["hello world"]);
  });

  it("does not invent a space inside a word", () => {
    expect(linesOf(perGlyph("hello", 0, 100))).toEqual(["hello"]);
  });

  it("keeps descenders on their own line", () => {
    // "p" and "g" hang 2pt below the baseline. Keyed on the ink box they would
    // read as a separate line from "a" and "e"; keyed on the matrix they do not.
    expect(linesOf(perGlyph("page", 0, 100))).toEqual(["page"]);
  });

  it("does not merge lines that are only one leading apart", () => {
    const objs = [...perGlyph("top", 0, 112), ...perGlyph("bot", 0, 100)];
    expect(linesOf(objs)).toEqual(["top", "bot"]);
  });

  it("ends the line at a gutter rather than spanning it", () => {
    // A form label and its value, or two columns: one baseline, 40pt apart.
    // Joining them would put unrelated text into a single edit.
    const objs = [...perGlyph("Name", 0, 100), ...perGlyph("Ada", 48, 100)];
    expect(linesOf(objs)).toEqual(["Name", "Ada"]);
  });

  it("still spaces a wide but sub-gutter gap", () => {
    // 1.2em, the widest a justified line realistically stretches a space to.
    const objs = [...perGlyph("a", 0, 100), ...perGlyph("b", 13.8, 100)];
    expect(linesOf(objs)).toEqual(["a b"]);
  });

  it("does not weave a stamped duplicate through the original", () => {
    // Faux bold: the same word redrawn 0.15pt to the right. Sorted by position
    // the two copies interleave, so this must come back as two whole entries
    // and not as "bboolldd" or a zigzag of half-words.
    const objs = [...perGlyph("bold", 0, 100), ...perGlyph("bold", 0.15, 100)];
    expect(linesOf(objs)).toEqual(["bold", "bold"]);
  });

  it("uses a space the file spelled out instead of adding a second", () => {
    const objs = [glyph("hello ", 0, 100, 9), glyph("world", 12, 100, 9)];
    expect(linesOf(objs)).toEqual(["hello world"]);
  });

  it("joins a line that changes style partway", () => {
    // Line is the unit now, so emphasis inside it does not split the entry.
    const objs = [
      glyph("Total: ", 0, 100, 12),
      glyph("$4,471", 12.5, 100, 10, { color: { r: 255, g: 0, b: 0, a: 255 } }),
    ];
    expect(linesOf(objs)).toEqual(["Total: $4,471"]);
  });

  it("leaves a well-formed line alone", () => {
    expect(linesOf([glyph("Invoice total", 0, 100, 50)])).toEqual(["Invoice total"]);
  });

  it("never merges across writing directions", () => {
    // A rotated watermark crossing body text projects onto the same baseline.
    const rotated = glyph("W", 20, 100, 2, { dir: { x: 0, y: 1 } });
    const objs = [...perGlyph("ab", 18, 100), rotated];
    expect(linesOf(objs)).toEqual(["ab", "W"]);
  });

  it("ignores pages with no text", () => {
    const image: PageObject = {
      index: 0,
      parts: [0],
      type: "image",
      bbox: { left: 0, right: 10, bottom: 0, top: 10 },
    };
    expect(groupTextObjects([image])).toEqual([]);
  });
});

describe("applyTextGrouping", () => {
  it("records every run a line covers, so edits can fan out", () => {
    const grouped = applyTextGrouping(perGlyph("cat", 0, 100).map((o, i) => ({ ...o, index: i })));
    expect(grouped).toHaveLength(1);
    expect(grouped[0].parts).toEqual([0, 1, 2]);
    // The line anchors on its first run: that run's matrix places it on the page.
    expect(grouped[0].index).toBe(0);
  });

  it("passes non-text objects through untouched", () => {
    const image: PageObject = {
      index: 2,
      parts: [2],
      type: "image",
      bbox: { left: 0, right: 10, bottom: 0, top: 10 },
    };
    const objs = [...perGlyph("ab", 0, 100).map((o, i) => ({ ...o, index: i })), image];
    const out = applyTextGrouping(objs);
    expect(out.map((o) => o.type)).toEqual(["text", "image"]);
    expect(out[1]).toEqual(image);
  });
});
