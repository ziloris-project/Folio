import { test, expect } from "@playwright/test";
import { perGlyphPdf } from "./fixture";
import { appendText, commit, openFile, readLayout, selectLine, textsOf } from "./helpers";

/**
 * Re-wrap on shapes of paragraph the original suite does not reach. Kept apart
 * from editing.spec.ts so it stays a record of the cases found while chasing
 * issue #7, where a one-word edit visibly broke a paragraph apart.
 */

test("lengthening the first line of a two-line paragraph does not squeeze it", async ({ page }) => {
  const traps = await openFile(page, {
    name: "per-glyph.pdf",
    mimeType: "application/pdf",
    buffer: await perGlyphPdf(),
  });
  await selectLine(page, "A second block sits below the first one here,");
  await appendText(page, " typed");
  await commit(page);

  const texts = textsOf(await readLayout(page));
  // The only other line is the paragraph's last, which stops wherever the text
  // ran out. Wrapping to its width broke a line that had always fit into three.
  expect(texts).toContain("A second block sits below the first one here, typed");
  expect(texts).toContain("wrapped across two lines of its own.");
  expect(texts).toHaveLength(9);
  expect(traps).toEqual([]);
});
