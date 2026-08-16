import { describe, expect, it } from "vitest";
import { wrapText } from "./wrap";

/** One point per character, so expectations read as character counts. */
const mono = (text: string) => text.length;

describe("wrapText", () => {
  it("leaves text that already fits on one line", () => {
    expect(wrapText("hello world", 20, mono)).toEqual(["hello world"]);
  });

  it("breaks at whitespace and eats the space", () => {
    // No line may end in the space it broke at, or the text creeps right.
    expect(wrapText("aaa bbb ccc", 7, mono)).toEqual(["aaa bbb", "ccc"]);
  });

  it("fills each line as far as it goes", () => {
    expect(wrapText("a b c d e f", 5, mono)).toEqual(["a b c", "d e f"]);
  });

  it("honours explicit newlines instead of reflowing them away", () => {
    // A stated break is the one break we did not have to guess at.
    expect(wrapText("aaa\nbbb", 100, mono)).toEqual(["aaa", "bbb"]);
  });

  it("wraps within each explicit line separately", () => {
    expect(wrapText("aaa bbb\nccc ddd", 7, mono)).toEqual(["aaa bbb", "ccc ddd"]);
  });

  it("hard-breaks a word wider than the column", () => {
    // Left whole it would overflow, and the overflow would never be consumed,
    // so every line after it would inherit the problem.
    expect(wrapText("abcdefghij", 4, mono)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("hard-breaks an over-long word without losing its neighbours", () => {
    expect(wrapText("hi abcdefghij ok", 4, mono)).toEqual(["hi", "abcd", "efgh", "ij", "ok"]);
  });

  it("round-trips an empty string rather than dropping it", () => {
    expect(wrapText("", 10, mono)).toEqual([""]);
  });

  it("keeps a blank line between paragraphs", () => {
    expect(wrapText("aaa\n\nbbb", 10, mono)).toEqual(["aaa", "", "bbb"]);
  });

  it("never loses characters", () => {
    const text = "The quick brown fox jumps over the lazy dog";
    for (const width of [5, 8, 13, 21, 34]) {
      expect(wrapText(text, width, mono).join(" ")).toBe(text);
    }
  });

  it("survives a column too narrow for a single character", () => {
    // Nothing fits, but it must still terminate and still emit every character.
    expect(wrapText("abc", 0, mono)).toEqual(["a", "b", "c"]);
  });
});
