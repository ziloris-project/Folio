import { test, expect, type Page } from "@playwright/test";
import { perGlyphPdf } from "./fixture";

/** Every hit target the edit layer offers, in page order. */
const rects = (page: Page) => page.locator('svg rect[style*="pointer-events"]');
const inspector = (page: Page) => page.locator("textarea").first();

/**
 * Click each line in turn and read what the inspector shows.
 *
 * Reading this way is deliberate: moving from one line to the next is exactly
 * the blur that once committed a phantom edit, so the act of reading the
 * document is itself the regression test for it.
 */
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

async function openFixture(page: Page) {
  const traps: string[] = [];
  page.on("pageerror", (e) => traps.push(e.message));
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: "per-glyph.pdf", mimeType: "application/pdf", buffer: await perGlyphPdf() });
  await page.waitForTimeout(4000);
  await page.locator('button[aria-label*="Edit" i], button[title*="Edit" i]').first().click();
  await page.waitForTimeout(2000);
  return traps;
}

test("rebuilds per-glyph runs into whole lines", async ({ page }) => {
  await openFixture(page);
  // Roughly 400 glyph runs in the file; anything near that means grouping is off.
  await expect(rects(page)).toHaveCount(9);
  expect(await readLines(page)).toEqual([
    "The quick brown fox jumps over the lazy dog and then",
    "continues running through the quiet field until it",
    "reaches the far side of the meadow near the river.",
    "A second block sits below the first one here,",
    "wrapped across two lines of its own.",
    "Invoice number ",
    "INV-4471",
    "This line is a single text object already.",
    "So is this one, directly beneath it.",
  ]);
});

test("keeps a form label and its value apart across the gutter", async ({ page }) => {
  await openFixture(page);
  const lines = await readLines(page);
  // Joining these would put two unrelated fields into a single edit, and
  // retyping one of them would erase the other.
  expect(lines).toContain("INV-4471");
  expect(lines.some((l) => l.includes("Invoice number") && l.includes("INV-4471"))).toBe(false);
});

test("moving between lines does not alter the document", async ({ page }) => {
  const traps = await openFixture(page);
  const first = await readLines(page);
  const second = await readLines(page);
  // Selecting a line focuses its editor, so navigating fires blur after blur.
  // Committing on those rewrote and re-wrapped paragraphs nobody had touched.
  expect(second).toEqual(first);
  expect(traps).toEqual([]);
});

test("re-wraps the paragraph and moves the block below out of the way", async ({ page }) => {
  const traps = await openFixture(page);
  await rects(page).nth(0).click();
  await page.waitForTimeout(400);
  await inspector(page).click();
  await inspector(page).press("End");
  await inspector(page).type(" plus several extra words added here", { delay: 10 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);

  const lines = await readLines(page);
  // The overflow moves down the paragraph instead of running off the line.
  expect(lines[0]).toBe("The quick brown fox jumps over the lazy dog");
  expect(lines[1]).toBe("and then plus several extra words added here");
  // The next block survives intact rather than being written through.
  expect(lines).toContain("A second block sits below the first one here,");
  expect(lines).toContain("INV-4471");
  // PDFium traps rather than erroring, so a clean run is the real assertion.
  expect(traps).toEqual([]);
});

test("pulls text back up when a line is shortened", async ({ page }) => {
  const traps = await openFixture(page);
  await rects(page).nth(0).click();
  await page.waitForTimeout(400);
  await inspector(page).click();
  await inspector(page).press("Control+a");
  await inspector(page).type("Short first line.", { delay: 10 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2500);

  const lines = await readLines(page);
  expect(lines[0]).toBe("Short first line. continues running through the");
  expect(traps).toEqual([]);
});
