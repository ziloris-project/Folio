import { test, expect, type Page } from "@playwright/test";
import {
  commit,
  expectExportLoads,
  inspector,
  openFile,
  readLayout,
  selectLine,
  textsOf,
} from "./helpers";

/**
 * Editing a document that came in through the .rtf importer. The converter
 * draws every word and every space as its own text object, which is a very
 * different file from the per-glyph fixture, and it is the shape every
 * imported .docx or .rtf has.
 */

const RTF = [
  "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs22 ",
  "An imported paragraph that is long enough to wrap onto a second line when the ",
  "converter lays it out on a US Letter page, and then carries on for long enough that ",
  "the converter has to give it a third line as well.\\par ",
  "Second paragraph here.\\par }",
].join("");

async function openImported(page: Page) {
  const traps = await openFile(page, {
    name: "imported.rtf",
    mimeType: "application/rtf",
    buffer: Buffer.from(RTF),
  });
  // The importer's space runs have no ink, so a stray one can surface as an
  // empty entry; it has nothing to edit and no bearing on these checks.
  const lines = (await readLayout(page)).filter((l) => l.text.trim());
  return { traps, lines };
}

test("edits a line of an imported document without doubling its spaces", async ({ page }) => {
  const { traps, lines: before } = await openImported(page);
  // The text field is what gets written back on the first keystroke, so a
  // doubled space shown here is a doubled space on the page a moment later.
  for (const l of before) expect(l.text).not.toContain("  ");
  const [first, second, third] = before;

  const paragraph = [first, second, third].map((l) => l.text).join(" ");
  const widest = Math.max(first.width, second.width, third.width);

  // Take a character off the middle line, which puts the edit through both the
  // live apply and the re-wrap on commit.
  await selectLine(page, second.text);
  await inspector(page).press("End");
  await inspector(page).press("Backspace");
  await page.waitForTimeout(900);
  await commit(page);

  const after = (await readLayout(page)).filter((l) => l.text.trim());
  const rewrapped = after.filter((l) => l.text !== "Second paragraph here.");
  const edited = second.text.slice(0, -1);
  expect(textsOf(rewrapped).join(" ")).toBe(paragraph.replace(second.text, edited));
  for (const l of rewrapped) {
    expect(l.text).not.toContain("  ");
    expect(l.width).toBeLessThanOrEqual(widest + 2);
  }
  expect(textsOf(after)).toContain("Second paragraph here.");
  await expectExportLoads(page);
  expect(traps).toEqual([]);
});
