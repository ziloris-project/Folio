import { test, expect, type Page } from "@playwright/test";
import { perGlyphPdf } from "./fixture";
import {
  appendText,
  commit,
  expectExportLoads,
  inspector,
  leaveField,
  openFile,
  readLayout,
  replaceFont,
  selectLine,
  textsOf,
} from "./helpers";

/**
 * Replacing a line's font and then editing it, in every order a user can do
 * those two things in. Font replacement deletes the line's runs and appends a
 * new object at the top of the z-order, so every index the editor holds moves
 * underneath it, and editing runs straight into that renumbering.
 */

const ORIGINAL = [
  "The quick brown fox jumps over the lazy dog and then",
  "continues running through the quiet field until it",
  "reaches the far side of the meadow near the river.",
  "A second block sits below the first one here,",
  "wrapped across two lines of its own.",
  "Invoice number ",
  "INV-4471",
  "This line is a single text object already.",
  "So is this one, directly beneath it.",
];

async function openFixture(page: Page) {
  return openFile(page, {
    name: "per-glyph.pdf",
    mimeType: "application/pdf",
    buffer: await perGlyphPdf(),
  });
}

/** Undo until the page reads as `target` again, returning how many steps it took. */
async function undoUntil(page: Page, target: string[]) {
  for (let steps = 1; steps <= 3; steps++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(2000);
    if (JSON.stringify(textsOf(await readLayout(page))) === JSON.stringify(target)) return steps;
  }
  throw new Error("undo never got back to the original text");
}

test("rebuilds a per-glyph line in the new font without leaving its glyphs behind", async ({ page }) => {
  const traps = await openFixture(page);
  await selectLine(page, ORIGINAL[1]);
  await replaceFont(page, "Times-Roman");
  await leaveField(page);

  const lines = await readLayout(page);
  // Same text, same place, and still one entry: a run left behind would show up
  // as a second, overlapping line.
  expect(textsOf(lines)).toEqual(ORIGINAL);
  expect(lines[1].x).toBeCloseTo(60, 0);
  expect(traps).toEqual([]);
});

test("typing into a line after replacing its font edits that line", async ({ page }) => {
  const traps = await openFixture(page);
  await selectLine(page, "INV-4471");
  await replaceFont(page, "Courier");
  // Replacing the font hands focus straight back to the text field.
  await expect(inspector(page)).toBeFocused();
  await appendText(page, "-B");
  // The live apply has already rewritten the page; blur then commits it.
  await expect(inspector(page)).toHaveValue("INV-4471-B");
  await commit(page);

  const texts = textsOf(await readLayout(page));
  expect(texts).toContain("INV-4471-B");
  // The label across the gutter is a different object and must be untouched.
  expect(texts.map((t) => t.trim())).toContain("Invoice number");
  expect(texts).toHaveLength(ORIGINAL.length);
  expect(traps).toEqual([]);
});

test("changing the font right after typing keeps what was typed", async ({ page }) => {
  const traps = await openFixture(page);
  await selectLine(page, "INV-4471");
  await appendText(page, "-C");
  await replaceFont(page, "Courier");
  await leaveField(page);

  const texts = textsOf(await readLayout(page));
  expect(texts).toContain("INV-4471-C");
  expect(texts.map((t) => t.trim())).toContain("Invoice number");
  expect(texts).toHaveLength(ORIGINAL.length);
  expect(traps).toEqual([]);
});

test("undo and redo step back and forth through a text edit", async ({ page }) => {
  const traps = await openFixture(page);
  await selectLine(page, ORIGINAL[0]);
  await appendText(page, " plus several extra words added here");
  await commit(page);
  const edited = textsOf(await readLayout(page));
  expect(edited).not.toEqual(ORIGINAL);

  const steps = await undoUntil(page, ORIGINAL);
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Control+y");
    await page.waitForTimeout(2000);
  }
  expect(textsOf(await readLayout(page))).toEqual(edited);

  // A restored document is a freshly loaded PDFium instance; editing it must
  // still reach the right object.
  await selectLine(page, "INV-4471");
  await appendText(page, "-D");
  await commit(page);
  expect(textsOf(await readLayout(page))).toContain("INV-4471-D");
  expect(traps).toEqual([]);
});

test("undo and redo a font replacement, then edit the line", async ({ page }) => {
  const traps = await openFixture(page);
  await selectLine(page, ORIGINAL[0]);
  await replaceFont(page, "Times-Roman");
  await leaveField(page);
  const replaced = await readLayout(page);
  // Times is narrower than the Helvetica the fixture was set in.
  expect(replaced[0].width).toBeLessThan(280);

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(2000);
  const undone = await readLayout(page);
  expect(textsOf(undone)).toEqual(ORIGINAL);
  expect(undone[0].width).toBeGreaterThan(280);

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(2000);
  const redone = await readLayout(page);
  expect(textsOf(redone)).toEqual(ORIGINAL);
  expect(redone[0].width).toBeLessThan(280);

  await selectLine(page, ORIGINAL[0]);
  await appendText(page, "!");
  await commit(page);
  const lines = textsOf(await readLayout(page));
  expect(lines.join(" ")).toContain("lazy dog and then!");
  await expectExportLoads(page);
  expect(traps).toEqual([]);
});

test("re-wraps a font-replaced line without overrunning the column", async ({ page }) => {
  const traps = await openFixture(page);
  const before = await readLayout(page);
  const column = Math.max(...before.slice(0, 3).map((l) => l.width));

  await selectLine(page, ORIGINAL[1]);
  await replaceFont(page, "Times-Roman");
  await appendText(page, " and a lot of extra words to overflow the column");
  await commit(page);

  const lines = await readLayout(page);
  const paragraph = lines.slice(0, 4);
  expect(textsOf(paragraph).join(" ")).toBe(
    `${ORIGINAL[0]} ${ORIGINAL[1]} and a lot of extra words to overflow the column ${ORIGINAL[2]}`,
  );
  // Words pushed onto a line still set in the original font have to be measured
  // in that font. Measured in the replacement instead, they overran the column.
  for (const l of paragraph) expect(l.width).toBeLessThanOrEqual(column + 2);
  expect(textsOf(lines)).toContain(ORIGINAL[3]);
  await expectExportLoads(page);
  expect(traps).toEqual([]);
});
