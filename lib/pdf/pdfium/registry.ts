"use client";

/**
 * Process-wide cache of loaded PdfiumDoc instances, keyed by source id. Kept
 * outside the zustand store so the (non-serializable, mutable) PDFium handles
 * don't trigger React re-renders. Mirrors the pdf.js docCache in engine.ts.
 */
import { PdfiumDoc } from "./doc";

const docs = new Map<string, Promise<PdfiumDoc>>();

export function openPdfiumDoc(sourceId: string, bytes: Uint8Array): Promise<PdfiumDoc> {
  let existing = docs.get(sourceId);
  if (!existing) {
    existing = PdfiumDoc.load(bytes);
    docs.set(sourceId, existing);
  }
  return existing;
}

export function getPdfiumDoc(sourceId: string): Promise<PdfiumDoc> | undefined {
  return docs.get(sourceId);
}

export function dropPdfiumDoc(sourceId: string): void {
  const d = docs.get(sourceId);
  docs.delete(sourceId);
  d?.then((doc) => doc.close()).catch(() => {});
}
