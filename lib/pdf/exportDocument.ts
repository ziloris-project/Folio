"use client";

import { useEditor } from "@/lib/store";
import { downloadBlob } from "@/lib/utils";

/**
 * Build a PDF from the current document and download it. Pass `pageIds` to
 * export only a subset (in the current page order) - this powers page
 * split/extract; omit it to export the whole document.
 *
 * Two-stage assembly (same as a full export): PDFium bakes any existing-content
 * edits into each source's bytes, then pdf-lib rebuilds the chosen page order,
 * applies rotation and paints overlay annotations.
 *
 * Returns the downloaded file name.
 */
export async function exportPdf(opts?: {
  pageIds?: string[];
  suffix?: string;
}): Promise<string> {
  const { buildPdf } = await import("@/lib/pdf/save");
  const { getPdfiumDoc } = await import("@/lib/pdf/pdfium/registry");
  const { pages, sources, fileName } = useEditor.getState();

  const selected = opts?.pageIds
    ? pages.filter((p) => opts.pageIds!.includes(p.id))
    : pages;
  if (selected.length === 0) throw new Error("No pages to export.");

  const sourceBytes: Record<string, Uint8Array> = {};
  for (const id of Object.keys(sources)) {
    const docP = getPdfiumDoc(id);
    sourceBytes[id] = docP ? (await docP).save() : sources[id].bytes;
  }

  const bytes = await buildPdf({ pages: selected, sourceBytes });
  // Copy into a plain ArrayBuffer so the Blob is backed by exactly these bytes.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);

  const base = fileName.replace(/\.pdf$/i, "") || "document";
  const name = `${base}${opts?.suffix ?? "-edited"}.pdf`;
  downloadBlob(new Blob([ab], { type: "application/pdf" }), name);
  return name;
}
