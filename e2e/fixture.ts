import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Build a PDF that stores its text one glyph at a time, which is the shape of
 * file the whole grouping and re-wrap feature exists for. Well-formed PDFs
 * exercise almost none of it, so a fixture with whole-line runs would pass
 * while the interesting paths stayed untested.
 *
 * It also carries the two layouts most easily broken by line-level grouping: a
 * form row whose label and value share a baseline across a gutter, and a second
 * paragraph close enough below the first to be swallowed by it.
 */
export async function perGlyphPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const SIZE = 12;
  const LEADING = 16;

  const draw = (text: string, x: number, y: number) => {
    let cx = x;
    for (const ch of text) {
      if (ch !== " ") page.drawText(ch, { x: cx, y, size: SIZE, font, color: rgb(0, 0, 0) });
      cx += font.widthOfTextAtSize(ch, SIZE);
    }
  };

  [
    "The quick brown fox jumps over the lazy dog and then",
    "continues running through the quiet field until it",
    "reaches the far side of the meadow near the river.",
  ].forEach((t, i) => draw(t, 60, 760 - i * LEADING));

  ["A second block sits below the first one here,", "wrapped across two lines of its own."].forEach(
    (t, i) => draw(t, 60, 690 - i * LEADING),
  );

  draw("Invoice number", 60, 640);
  draw("INV-4471", 260, 640);

  page.drawText("This line is a single text object already.", { x: 60, y: 600, size: SIZE, font });
  page.drawText("So is this one, directly beneath it.", { x: 60, y: 584, size: SIZE, font });

  return Buffer.from(await doc.save());
}
