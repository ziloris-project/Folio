import { describe, expect, it } from "vitest";
import { paragraphAt, reflowParagraph } from "./paragraphs";
import type { TextObject } from "../types";

const BLACK = { r: 0, g: 0, b: 0, a: 255 };

/** A laid-out line: text at `x` on baseline `y`, `w` points wide. */
function line(
  index: number,
  text: string,
  x: number,
  y: number,
  w: number,
  over: Partial<TextObject> = {},
): TextObject {
  return {
    index,
    parts: [index],
    type: "text",
    text,
    fontSize: 10,
    fontName: "Helvetica",
    color: BLACK,
    origin: { x, y },
    dir: { x: 1, y: 0 },
    bbox: { left: x, right: x + w, bottom: y - 2, top: y + 7 },
    ...over,
  } as TextObject;
}

/** A block of evenly spaced lines starting at baseline `top`. */
function block(texts: string[], opts: { x?: number; top?: number; leading?: number; w?: number; from?: number } = {}) {
  const { x = 0, top = 200, leading = 12, w = 100, from = 0 } = opts;
  return texts.map((t, i) => line(from + i, t, x, top - i * leading, w));
}

/** One point per character. */
const mono = (text: string) => text.length;

describe("paragraphAt", () => {
  it("collects evenly spaced lines into one paragraph", () => {
    const objs = block(["first line", "second line", "third line"]);
    const p = paragraphAt(objs, 1);
    expect(p?.lines.map((l) => l.text)).toEqual(["first line", "second line", "third line"]);
    expect(p?.target).toBe(1);
    expect(p?.leading).toBe(12);
  });

  it("returns nothing for a line standing on its own", () => {
    // Nothing on the page says how wide this line was allowed to be, so there
    // is no column to wrap into and inventing one would invent a layout.
    expect(paragraphAt([line(0, "alone", 0, 200, 100)], 0)).toBeNull();
  });

  it("stops where the leading changes", () => {
    // Two paragraphs, the gap between them only slightly wider than within.
    const objs = [
      ...block(["one a", "one b"], { top: 200, leading: 12 }),
      ...block(["two a", "two b"], { top: 200 - 12 - 20, leading: 12, from: 2 }),
    ];
    expect(paragraphAt(objs, 0)?.lines.map((l) => l.text)).toEqual(["one a", "one b"]);
    expect(paragraphAt(objs, 2)?.lines.map((l) => l.text)).toEqual(["two a", "two b"]);
  });

  it("does not chain two columns into one paragraph", () => {
    // Same baselines, same leading, side by side. Only the lack of horizontal
    // overlap keeps these apart.
    const left = block(["left one", "left two"], { x: 0, w: 100 });
    const right = block(["right one", "right two"], { x: 300, w: 100, from: 2 });
    const p = paragraphAt([...left, ...right], 0);
    expect(p?.lines.map((l) => l.text)).toEqual(["left one", "left two"]);
  });

  it("does not join lines of different sizes", () => {
    const heading = line(0, "Heading", 0, 200, 100, { fontSize: 20 });
    const body = block(["body a", "body b"], { top: 180, from: 1 });
    expect(paragraphAt([heading, ...body], 0)).toBeNull();
    expect(paragraphAt([heading, ...body], 1)?.lines.map((l) => l.text)).toEqual([
      "body a",
      "body b",
    ]);
  });

  it("ignores text running in another direction", () => {
    const rotated = line(2, "watermark", 50, 190, 100, { dir: { x: 0, y: 1 } });
    const objs = [...block(["body a", "body b"]), rotated];
    expect(paragraphAt(objs, 0)?.lines).toHaveLength(2);
  });

  it("takes the column width from the widest line", () => {
    const objs = [line(0, "short", 0, 200, 40), line(1, "much longer line", 0, 188, 90)];
    expect(paragraphAt(objs, 0)?.columnWidth).toBe(90);
  });
});

describe("reflowParagraph", () => {
  it("pours an edited line back through the paragraph", () => {
    const objs = block(["aaa bbb", "ccc ddd"], { w: 7 });
    const p = paragraphAt(objs, 0)!;
    // Replacing line 0 with something longer pushes text down, rather than
    // running it off the end of the line.
    expect(reflowParagraph(p, "aaa bbb eee", mono)).toEqual(["aaa bbb", "eee ccc", "ddd"]);
  });

  it("pulls text back up when a line shrinks", () => {
    const objs = block(["aaa bbb", "ccc ddd"], { w: 7 });
    const p = paragraphAt(objs, 0)!;
    expect(reflowParagraph(p, "a", mono)).toEqual(["a ccc", "ddd"]);
  });

  it("drops the line breaks it did not author", () => {
    // A break inside a paragraph is where the text was wrapped, not something
    // the writer typed, so it must come out before laying out again.
    const objs = block(["hello", "world"], { w: 20 });
    const p = paragraphAt(objs, 0)!;
    expect(reflowParagraph(p, "hello", mono)).toEqual(["hello world"]);
  });

  it("leaves a hyphen at a break alone", () => {
    // "part-" / "time" is a real compound and "environ-" / "ment" is a split
    // word, and nothing here can tell them apart. Joining wrongly corrupts the
    // word silently; leaving the hyphen is wrong where a reader can see it.
    const objs = block(["environ-", "ment"], { w: 20 });
    const p = paragraphAt(objs, 0)!;
    expect(reflowParagraph(p, "environ-", mono)).toEqual(["environ- ment"]);
  });
});
