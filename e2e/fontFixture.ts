import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFStream,
  StandardFonts,
  decodePDFRawStream,
} from "pdf-lib";

/**
 * The font the upload tests use: Geist Regular, which Next.js ships inside
 * node_modules for its OG-image renderer. It is licensed under the SIL Open
 * Font License 1.1 (see the font's own name table), so it could be copied into
 * the repo, but reading it from node_modules keeps the licence question out of
 * the tree entirely and needs no network. It is a TrueType-outline font with
 * Latin and Cyrillic coverage, which lets the tests type text no standard-14
 * face can encode.
 */
export const FONT_PATH = path.join(
  process.cwd(),
  "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf",
);

export function fontBytes(): Promise<Buffer> {
  return readFile(FONT_PATH);
}

/** What an exported PDF says about the fonts its first page draws with. */
export interface FontReport {
  /** Resource name (e.g. "FXF2") to BaseFont, for every font on the page. */
  baseFonts: Record<string, string>;
  /** Fonts whose embedded file is byte-identical to `expected`, by resource name. */
  embeddedCopies: string[];
  /** Resource names of those copies that are Type0 with a ToUnicode map. */
  withToUnicode: string[];
  /** Every glyph id drawn in each embedded copy, from the page content. */
  glyphs: Record<string, number[]>;
}

/**
 * Inspect an exported PDF with pdf-lib, independently of PDFium, so the check
 * cannot pass just because the same library wrote and read the file.
 *
 * The glyph ids come straight out of the content stream. The uploaded font is
 * embedded with Identity-H encoding, so each 4-hex-digit code in a Tj string
 * is a glyph index; glyph 0 is .notdef, the empty box a font draws for a
 * character it does not have. Non-zero ids for every character therefore
 * means the text is drawn with real outlines from the embedded file.
 */
export async function inspectFonts(pdf: Uint8Array, expected: Uint8Array): Promise<FontReport> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(0);
  const fonts = page.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
  const report: FontReport = { baseFonts: {}, embeddedCopies: [], withToUnicode: [], glyphs: {} };
  if (!fonts) return report;

  for (const [key, ref] of fonts.entries()) {
    const name = key.decodeText();
    const dict = doc.context.lookup(ref, PDFDict);
    report.baseFonts[name] = dict.get(PDFName.of("BaseFont"))?.toString().replace(/^\//, "") ?? "";
    const descendants = dict.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
    const cidFont = descendants?.lookup(0, PDFDict);
    const descriptor = (cidFont ?? dict).lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
    const file = descriptor?.lookupMaybe(PDFName.of("FontFile2"), PDFStream);
    if (!(file instanceof PDFRawStream)) continue;
    const bytes = decodePDFRawStream(file).decode();
    if (Buffer.compare(Buffer.from(bytes), Buffer.from(expected)) !== 0) continue;
    report.embeddedCopies.push(name);
    if (cidFont && dict.get(PDFName.of("ToUnicode"))) report.withToUnicode.push(name);
  }

  const contents = page.node.get(PDFName.of("Contents"));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  let ops = "";
  for (const r of refs) {
    const s = r ? doc.context.lookup(r) : undefined;
    if (s instanceof PDFRawStream) ops += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1") + "\n";
  }
  for (const m of ops.matchAll(/\/(\S+)\s+[\d.]+\s+Tf[^<]*?<([0-9A-Fa-f]*)>\s*Tj/g)) {
    if (!report.embeddedCopies.includes(m[1])) continue;
    const ids = (m[2].match(/.{4}/g) ?? []).map((h) => parseInt(h, 16));
    report.glyphs[m[1]] = [...(report.glyphs[m[1]] ?? []), ...ids];
  }
  return report;
}

/**
 * Three standalone lines, far enough apart that none of them forms a
 * paragraph with another. Re-wrap only runs inside a paragraph, so an edit to
 * any of these lines stays on that line and the assertions can name its text
 * exactly.
 */
export const SPACED_LINES = ["First line in a standard face.", "Second line waits its turn.", "Third line stays untouched."];

export async function spacedLinesPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  SPACED_LINES.forEach((text, i) => page.drawText(text, { x: 60, y: 700 - i * 200, size: 18, font }));
  return Buffer.from(await doc.save());
}
