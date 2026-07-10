/**
 * Lay a block list out into a real-text PDF with pdf-lib. Every word is drawn
 * as an actual text object (not a rasterized image), so the result opens in
 * Folio as fully editable content. Layout is deliberately simple: US-Letter
 * pages, one column, greedy word-wrap, automatic pagination.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Block, Run } from "./blocks";

const PAGE_W = 612; // US Letter, 72dpi points
const PAGE_H = 792;
const MARGIN = 64;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = rgb(0.11, 0.12, 0.14);

const SIZE: Record<Block["type"], number> = { h1: 22, h2: 17, h3: 13, p: 11, li: 11 };
const GAP_BEFORE: Record<Block["type"], number> = { h1: 16, h2: 13, h3: 11, p: 0, li: 0 };
const GAP_AFTER: Record<Block["type"], number> = { h1: 8, h2: 7, h3: 6, p: 8, li: 3 };

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

function fontFor(f: Fonts, r: { bold: boolean; italic: boolean }): PDFFont {
  if (r.bold && r.italic) return f.boldItalic;
  if (r.bold) return f.bold;
  if (r.italic) return f.italic;
  return f.reg;
}

interface Seg {
  text: string;
  font: PDFFont;
  width: number;
}

/** Break a block's runs into laid-out lines of styled segments (words + spaces),
 *  wrapping at `maxWidth` and honoring explicit "\n" line breaks. */
function layout(runs: Run[], fonts: Fonts, size: number, maxWidth: number): Seg[][] {
  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let lineWidth = 0;
  const flush = () => {
    while (line.length && line[line.length - 1].text === " ") line.pop();
    lines.push(line);
    line = [];
    lineWidth = 0;
  };

  for (const run of runs) {
    const font = fontFor(fonts, run);
    const parts = run.text.split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) flush(); // explicit line break
      for (const token of part.split(/(\s+)/)) {
        if (!token) continue;
        const isSpace = /^\s+$/.test(token);
        if (isSpace && line.length === 0) continue; // drop leading spaces
        const text = isSpace ? " " : token;
        const width = font.widthOfTextAtSize(text, size);
        if (!isSpace && line.length && lineWidth + width > maxWidth) flush();
        line.push({ text, font, width });
        lineWidth += width;
      }
    });
  }
  if (line.length) flush();
  return lines;
}

export async function renderBlocksToPdf(blocks: Block[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  for (const block of blocks) {
    const size = SIZE[block.type];
    const lineHeight = size * 1.42;
    const indent = block.type === "li" ? 22 + (block.level ?? 0) * 18 : 0;
    const startX = MARGIN + indent;

    y -= GAP_BEFORE[block.type];
    const lines = layout(block.runs, fonts, size, CONTENT_W - indent);

    // Blank paragraph: just advance a line.
    if (lines.length === 0 || (lines.length === 1 && lines[0].length === 0)) {
      if (y - lineHeight < MARGIN) newPage();
      y -= lineHeight + GAP_AFTER[block.type];
      continue;
    }

    lines.forEach((segs, li) => {
      if (y - lineHeight < MARGIN) newPage();
      const baseline = y - size;
      if (li === 0 && block.type === "li") {
        const marker = block.ordered ? `${block.index ?? 1}.` : "•";
        page.drawText(marker, {
          x: MARGIN + (block.level ?? 0) * 18,
          y: baseline,
          size,
          font: fonts.reg,
          color: INK,
        });
      }
      let x = startX;
      for (const seg of segs) {
        page.drawText(seg.text, { x, y: baseline, size, font: seg.font, color: INK });
        x += seg.width;
      }
      y -= lineHeight;
    });

    y -= GAP_AFTER[block.type];
  }

  return pdf.save();
}
