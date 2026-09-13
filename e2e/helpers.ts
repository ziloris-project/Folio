import { expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

/**
 * Shared driving for the specs that exercise font replacement, undo and
 * imported documents. Kept apart from editing.spec.ts so those specs can grow
 * without every change to them rippling through the original suite.
 */

/** Every hit target the edit layer offers, in page (z) order. */
export const rects = (page: Page) => page.locator('svg rect[style*="pointer-events"]');
/** The inspector's text field. */
export const inspector = (page: Page) => page.locator("textarea").first();
/** The inspector's "Replace font" dropdown. */
export const fontSelect = (page: Page) => page.locator("aside select").first();

/** One line as the edit layer shows it: its text and where it sits, in points. */
export interface Line {
  text: string;
  x: number;
  y: number;
  width: number;
}

/**
 * Open a file through the real file input and switch to the edit tool.
 *
 * Returns the list page errors are collected into. PDFium is wasm and traps on
 * a call it rejects rather than returning an error, so every spec asserts this
 * stays empty: a trap is otherwise invisible until the next edit silently does
 * nothing.
 */
export async function openFile(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<string[]> {
  const traps: string[] = [];
  page.on("pageerror", (e) => traps.push(e.message));
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForTimeout(4000);
  await page.locator('button[aria-label*="Edit" i], button[title*="Edit" i]').first().click();
  await page.waitForTimeout(2000);
  return traps;
}

/**
 * Leave the text field the way a user does, which is what commits an edit.
 *
 * Escape only blurs when the field has focus. Anywhere else the editor treats it
 * as "back to the select tool", which hides the edit layer and would leave the
 * next read finding no lines at all.
 */
export async function leaveField(page: Page) {
  const focused = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
  if (focused) await page.keyboard.press("Escape");
  else await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/**
 * Click every line and read what the inspector shows, top of the page first.
 *
 * Font replacement moves a line to the end of the object list, so page order
 * says nothing about where a line is. Sorting by position gives the order a
 * reader sees, which is what the assertions are about.
 */
export async function readLayout(page: Page): Promise<Line[]> {
  const out: Line[] = [];
  const n = await rects(page).count();
  for (let i = 0; i < n; i++) {
    const r = rects(page).nth(i);
    await r.click();
    await page.waitForTimeout(300);
    out.push({
      text: await inspector(page).inputValue(),
      x: Number(await r.getAttribute("x")),
      y: Number(await r.getAttribute("y")),
      width: Number(await r.getAttribute("width")),
    });
  }
  await leaveField(page);
  await page.waitForTimeout(700);
  // Lines within a couple of points share a baseline (a form label and its value).
  return out.sort((a, b) => (Math.abs(a.y - b.y) > 3 ? a.y - b.y : a.x - b.x));
}

export const textsOf = (lines: Line[]) => lines.map((l) => l.text);

/** Select the line currently showing `text`, wherever it now sits in the list. */
export async function selectLine(page: Page, text: string) {
  const n = await rects(page).count();
  for (let i = 0; i < n; i++) {
    await rects(page).nth(i).click();
    await page.waitForTimeout(250);
    if ((await inspector(page).inputValue()) === text) return;
  }
  throw new Error(`No line reads ${JSON.stringify(text)}`);
}

/** Replace the selected line's font through the inspector, as a user would. */
export async function replaceFont(page: Page, font: string) {
  // Focusing the dropdown first is what a click does, and it blurs the text
  // field, so an edit in progress is committed before the font changes.
  await fontSelect(page).focus();
  await page.waitForTimeout(800);
  await fontSelect(page).selectOption(font);
  await page.waitForTimeout(1500);
}

/** Type at the end of the selected line and wait out the live apply. */
export async function appendText(page: Page, text: string) {
  await inspector(page).focus();
  await inspector(page).press("End");
  await inspector(page).type(text, { delay: 15 });
  await page.waitForTimeout(900);
}

/** Commit whatever is in the field and let the page settle. */
export async function commit(page: Page) {
  await leaveField(page);
  await page.waitForTimeout(2500);
}

/** Export through the toolbar and check pdf-lib can parse what came out. */
export async function expectExportLoads(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download edited PDF" }).click();
  const path = await (await download).path();
  const { readFileSync } = await import("node:fs");
  const doc = await PDFDocument.load(readFileSync(path));
  expect(doc.getPageCount()).toBe(1);
}
