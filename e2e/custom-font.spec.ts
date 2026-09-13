import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { SPACED_LINES, fontBytes, inspectFonts, spacedLinesPdf } from "./fontFixture";

/** Every hit target the edit layer offers, in object order. */
const rects = (page: Page) => page.locator('svg rect[style*="pointer-events"]');
const inspector = (page: Page) => page.locator("textarea").first();
const fontPicker = (page: Page) => page.locator("aside select").first();
const fontInput = (page: Page) => page.locator('input[type="file"][accept=".ttf,.otf"]');

// Typed text that no standard-14 face can encode, so it only survives the round
// trip if the uploaded font really carries it.
const TYPED = "Custom face Привет";

async function open(page: Page, name: string, buffer: Buffer) {
  const traps: string[] = [];
  page.on("pageerror", (e) => traps.push(e.message));
  await page.goto("/");
  await openInto(page, name, buffer);
  return traps;
}

async function openInto(page: Page, name: string, buffer: Buffer) {
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: "application/pdf", buffer });
  await page.waitForTimeout(4000);
  await page.locator('button[aria-label*="Edit" i], button[title*="Edit" i]').first().click();
  await page.waitForTimeout(2000);
}

/**
 * Select the line whose text is `text` and return its hit target's position.
 * Object indices move when a run is recreated (it is appended on top), so
 * lines are found by what they say rather than where they sit in the list.
 */
async function selectLine(page: Page, text: string): Promise<number> {
  const n = await rects(page).count();
  for (let i = 0; i < n; i++) {
    await rects(page).nth(i).click();
    await page.waitForTimeout(300);
    if ((await inspector(page).inputValue()) === text) return i;
  }
  throw new Error(`No line reads ${JSON.stringify(text)}`);
}

/** The label the picker shows for the selected line's current font. */
async function currentFont(page: Page): Promise<string> {
  return (await fontPicker(page).locator("option").first().textContent()) ?? "";
}

/** Labels of the fonts listed under "Uploaded" in the picker. */
async function uploadedChoices(page: Page): Promise<string[]> {
  return fontPicker(page).locator('optgroup[label="Uploaded"] option').allTextContents();
}

async function uploadFont(page: Page, name = "Geist-Regular.ttf", buffer?: Buffer) {
  await fontInput(page).setInputFiles({ name, mimeType: "font/ttf", buffer: buffer ?? (await fontBytes()) });
  await page.waitForTimeout(1500);
}

async function retype(page: Page, text: string) {
  await inspector(page).click();
  await inspector(page).press("Control+a");
  await inspector(page).type(text, { delay: 10 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
}

async function exportBytes(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("button", { hasText: "Export" }).first().click(),
  ]);
  return readFile((await download.path())!);
}

/**
 * Dark pixels on the rendered page under a line's hit target. Empty glyphs
 * would leave the line's box blank, so this is the on-screen half of the
 * "real glyphs" check (the export half reads glyph ids out of the file).
 */
async function inkUnder(page: Page, rectIndex: number): Promise<number> {
  const box = await rects(page).nth(rectIndex).boundingBox();
  if (!box) return 0;
  return page.evaluate((b) => {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const canvas = [...document.querySelectorAll("canvas")].find((c) => {
      const r = c.getBoundingClientRect();
      return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
    });
    if (!canvas) return 0;
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    const x = Math.max(0, Math.floor((b.x - r.left) * k));
    const y = Math.max(0, Math.floor((b.y - r.top) * k));
    const w = Math.max(1, Math.floor(b.width * k));
    const h = Math.max(1, Math.floor(b.height * k));
    const data = canvas.getContext("2d")!.getImageData(x, y, w, h).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 300) dark++;
    return dark;
  }, box);
}

test("an uploaded font is applied, typed in, embedded in the export, and reopens", async ({ page }) => {
  const traps = await open(page, "spaced.pdf", await spacedLinesPdf());
  await selectLine(page, SPACED_LINES[0]);
  await uploadFont(page);
  expect(await currentFont(page)).toContain("Geist");

  await retype(page, TYPED);
  const at = await selectLine(page, TYPED);
  expect(await currentFont(page)).toContain("Geist");
  expect(await inkUnder(page, at)).toBeGreaterThan(100);

  const font = await fontBytes();
  const exported = await exportBytes(page);
  const report = await inspectFonts(exported, font);
  // Exactly one copy of the uploaded file travels with the export, byte for
  // byte, as a CID font with a ToUnicode map so the text can be read back.
  expect(report.embeddedCopies).toHaveLength(1);
  const [key] = report.embeddedCopies;
  expect(report.baseFonts[key]).toContain("Geist");
  expect(report.withToUnicode).toEqual([key]);
  // One glyph per character typed, and none of them the .notdef box.
  const glyphs = report.glyphs[key] ?? [];
  expect(glyphs).toHaveLength(TYPED.length);
  expect(glyphs.every((g) => g > 0)).toBe(true);

  // Reopen the export in the editor: the line reads back as typed, still in
  // the uploaded font, and the untouched lines are still there.
  await openInto(page, "exported.pdf", exported);
  const again = await selectLine(page, TYPED);
  expect(await currentFont(page)).toContain("Geist");
  expect(await inkUnder(page, again)).toBeGreaterThan(100);
  await selectLine(page, SPACED_LINES[2]);
  expect(traps).toEqual([]);
});

test("an uploaded font is offered for other lines and embedded once", async ({ page }) => {
  const traps = await open(page, "spaced.pdf", await spacedLinesPdf());
  await selectLine(page, SPACED_LINES[0]);
  expect(await uploadedChoices(page)).toEqual([]);
  await uploadFont(page);

  await selectLine(page, SPACED_LINES[1]);
  expect(await uploadedChoices(page)).toEqual(["Geist-Regular"]);
  expect(await currentFont(page)).not.toContain("Geist");
  await fontPicker(page).selectOption({ label: "Geist-Regular" });
  await page.waitForTimeout(1500);
  await selectLine(page, SPACED_LINES[1]);
  expect(await currentFont(page)).toContain("Geist");

  // Uploading the same file again does not add a second entry.
  await uploadFont(page);
  expect(await uploadedChoices(page)).toEqual(["Geist-Regular"]);

  // Both lines share one loaded font, so the file is embedded a single time.
  const report = await inspectFonts(await exportBytes(page), await fontBytes());
  expect(report.embeddedCopies).toHaveLength(1);
  expect(traps).toEqual([]);
});

test("undo and redo keep the uploaded font usable", async ({ page }) => {
  const traps = await open(page, "spaced.pdf", await spacedLinesPdf());
  await selectLine(page, SPACED_LINES[0]);
  await uploadFont(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Undo reloads the document from saved bytes, which replaces every PDFium
  // handle, including the loaded font's.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1500);
  await selectLine(page, SPACED_LINES[0]);
  expect(await currentFont(page)).not.toContain("Geist");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(1500);
  await selectLine(page, SPACED_LINES[0]);
  expect(await currentFont(page)).toContain("Geist");

  // The reloaded document has no handle for the font yet; applying it to
  // another line has to load it again rather than use a stale one.
  await selectLine(page, SPACED_LINES[2]);
  expect(await uploadedChoices(page)).toEqual(["Geist-Regular"]);
  await fontPicker(page).selectOption({ label: "Geist-Regular" });
  await page.waitForTimeout(1500);
  const at = await selectLine(page, SPACED_LINES[2]);
  expect(await currentFont(page)).toContain("Geist");
  expect(await inkUnder(page, at)).toBeGreaterThan(100);
  expect(traps).toEqual([]);
});

test("a file that is not a usable font shows an error and changes nothing", async ({ page }) => {
  const traps = await open(page, "spaced.pdf", await spacedLinesPdf());
  await selectLine(page, SPACED_LINES[0]);
  const before = await currentFont(page);

  // Not a font at all: stopped by the signature check.
  await uploadFont(page, "notes.ttf", Buffer.from("definitely not a font file, just text"));
  await expect(page.getByText("That file is not a TrueType or OpenType font.")).toBeVisible();

  // A TrueType signature on garbage: gets past the signature check and reaches
  // PDFium, which must answer with a null font rather than a trap.
  const corrupt = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(4096, 7)]);
  await uploadFont(page, "broken.ttf", corrupt);
  await expect(page.getByText("That font file is damaged or unsupported.")).toBeVisible();

  // The wrong kind of file by name never gets read.
  await uploadFont(page, "face.woff2", await fontBytes());
  await expect(page.getByText(/Unsupported font/)).toBeVisible();

  expect(await uploadedChoices(page)).toEqual([]);
  await selectLine(page, SPACED_LINES[0]);
  expect(await currentFont(page)).toBe(before);

  // PDFium is still alive: a real font applies cleanly afterwards.
  await uploadFont(page);
  expect(await currentFont(page)).toContain("Geist");
  expect(traps).toEqual([]);
});
