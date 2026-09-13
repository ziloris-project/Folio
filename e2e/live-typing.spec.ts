import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import { perGlyphPdf } from "./fixture";

/**
 * Typing into the Inspector updates the page while the field still has focus
 * (issue #2). What these guard is everything that fast path skips until later:
 * the save, the undo checkpoint and the content stream rewrite. Each one has a
 * reader that must still see the edit (export, undo), and PDFium traps rather
 * than erroring, so every test also asserts a clean run.
 */

const rects = (page: Page) => page.locator('svg rect[style*="pointer-events"]');
const inspector = (page: Page) => page.locator("textarea").first();
/** The first page's raster, not a thumbnail. */
const pageCanvas = (page: Page) => page.locator('[id^="page-"] canvas').first();

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

async function open(page: Page, buffer: Buffer, name = "per-glyph.pdf") {
  const traps: string[] = [];
  page.on("pageerror", (e) => traps.push(e.message));
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name, mimeType: "application/pdf", buffer });
  await page.waitForTimeout(4000);
  await page.locator('button[aria-label*="Edit" i], button[title*="Edit" i]').first().click();
  await page.waitForTimeout(2000);
  return traps;
}

/** Same reading approach as editing.spec.ts: click each line, read the field. */
async function readLines(page: Page): Promise<string[]> {
  const out: string[] = [];
  const n = await rects(page).count();
  for (let i = 0; i < n; i++) {
    await rects(page).nth(i).click();
    await page.waitForTimeout(300);
    out.push(await inspector(page).inputValue());
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  return out;
}

/** A cheap fingerprint of the page raster, to notice it being redrawn. */
function canvasHash(page: Page): Promise<number> {
  return pageCanvas(page).evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < data.length; i += 7) h = (h * 31 + data[i]) | 0;
    return h;
  });
}

/** Put the caret at the end of line `i`, in the Inspector. */
async function editLine(page: Page, i: number) {
  await rects(page).nth(i).click();
  await page.waitForTimeout(400);
  await inspector(page).click();
  await inspector(page).press("End");
}

test("typed text reaches the page without leaving the field", async ({ page }) => {
  const traps = await open(page, await perGlyphPdf());
  await editLine(page, 7);
  const before = await canvasHash(page);
  const widthBefore = Number(await rects(page).nth(7).getAttribute("width"));

  await inspector(page).press("W");
  const started = Date.now();
  // The old debounce alone held every keystroke back for 400 ms.
  await expect.poll(() => canvasHash(page), { timeout: 350, intervals: [10] }).not.toBe(before);
  const elapsed = Date.now() - started;

  // The line's hit target follows the text as it grows, so the cached object
  // list is being kept current too, not just the bitmap.
  await inspector(page).pressSequentially("ide words", { delay: 20 });
  await expect
    .poll(async () => Number(await rects(page).nth(7).getAttribute("width")))
    .toBeGreaterThan(widthBefore);
  await expect(inspector(page)).toBeFocused();
  console.log(`keystroke to canvas change: ${elapsed} ms`);

  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  // The commit re-wraps the two-line paragraph, so the words may now continue
  // on the next line; what matters is that none were lost on the way.
  expect((await readLines(page)).join(" ")).toContain("already.Wide words");
  expect(traps).toEqual([]);
});

test("a long burst of typing, including clearing the field, runs clean", async ({ page }) => {
  const traps = await open(page, await perGlyphPdf());
  await editLine(page, 0);
  await inspector(page).pressSequentially(" and a good deal more text typed quickly", { delay: 5 });
  for (let i = 0; i < 12; i++) await inspector(page).press("Backspace");
  // Emptying the field is a state a live apply reaches, and PDFium traps on an
  // empty string. Held long enough for any apply schedule to act on it.
  await inspector(page).press("Control+a");
  await inspector(page).press("Backspace");
  await page.waitForTimeout(600);
  await inspector(page).pressSequentially("Retyped from scratch while the page keeps up", {
    delay: 5,
  });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);

  const lines = await readLines(page);
  expect(lines.join(" ")).toContain("Retyped from scratch");
  // The block below the paragraph survives.
  expect(lines).toContain("INV-4471");
  expect(traps).toEqual([]);
});

test("one undo takes back a whole typing session", async ({ page }) => {
  const traps = await open(page, await perGlyphPdf());
  await editLine(page, 0);
  // Slow enough that the text is applied many times over, once per frame.
  await inspector(page).pressSequentially(" plus several extra words", { delay: 60 });
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);
  const edited = await readLines(page);
  expect(edited.join(" ")).toContain("plus several extra words");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(2000);
  expect(await readLines(page)).toEqual(ORIGINAL);

  // And redo brings the whole session back, re-wrap included.
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(2000);
  expect(await readLines(page)).toEqual(edited);
  expect(traps).toEqual([]);
});

test("export includes text typed a moment ago, without leaving the field", async ({ page }) => {
  const traps = await open(page, await perGlyphPdf());
  await editLine(page, 7);
  await inspector(page).pressSequentially(" Exported", { delay: 5 });

  // Dispatching the click, rather than clicking, keeps focus in the field, so
  // no blur commit runs: export alone has to get the last keystrokes onto the
  // document.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download edited PDF" }).dispatchEvent("click");
  const file = await (await download).path();
  await expect(inspector(page)).toBeFocused();
  expect(traps).toEqual([]);

  const reopened = await open(page, await fs.readFile(file), "exported.pdf");
  // Nothing was committed, so nothing re-wrapped: the line just grew.
  expect(await readLines(page)).toContain("This line is a single text object already. Exported");
  expect(reopened).toEqual([]);
});
