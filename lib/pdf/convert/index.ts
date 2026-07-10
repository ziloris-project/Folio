"use client";

/**
 * Entry point for importing word-processor documents. Everything runs in the
 * browser (nothing is uploaded): the source is parsed to our block model and
 * rendered to an editable-text PDF, which the editor then opens like any PDF.
 *
 * Fidelity note: this preserves content and basic structure (headings,
 * paragraphs, lists, bold/italic), not exact page layout.
 */
import type { Block } from "./blocks";

export interface ConvertedDoc {
  bytes: Uint8Array;
  /** Suggested file name, with a .pdf extension. */
  name: string;
}

/** Extensions we can convert in-browser. */
const CONVERTIBLE = /\.(docx)$/i;

/** Whether `openDocument` can handle this file (vs. a plain PDF). */
export function isConvertibleDoc(fileName: string): boolean {
  return CONVERTIBLE.test(fileName);
}

export async function convertToPdf(file: File): Promise<ConvertedDoc> {
  const ext = file.name.toLowerCase().match(CONVERTIBLE)?.[1];
  let blocks: Block[];
  if (ext === "docx") {
    const { docxToBlocks } = await import("./docx");
    blocks = await docxToBlocks(await file.arrayBuffer());
  } else {
    throw new Error("Unsupported document type.");
  }
  if (blocks.length === 0) throw new Error("The document appears to be empty.");
  const { renderBlocksToPdf } = await import("./renderPdf");
  const bytes = await renderBlocksToPdf(blocks);
  const base = file.name.replace(CONVERTIBLE, "");
  return { bytes, name: `${base}.pdf` };
}
