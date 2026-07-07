"use client";

/**
 * Process-wide cache of loaded PdfiumDoc instances, keyed by source id. Kept
 * outside the zustand store so the (non-serializable, mutable) PDFium handles
 * don't trigger React re-renders. Mirrors the pdf.js docCache in engine.ts.
 */
import { PdfiumDoc } from "./doc";

const docs = new Map<string, Promise<PdfiumDoc>>();

export function openPdfiumDoc(
  sourceId: string,
  bytes: Uint8Array,
  password = "",
): Promise<PdfiumDoc> {
  let existing = docs.get(sourceId);
  if (!existing) {
    existing = PdfiumDoc.load(bytes, password);
    // Don't cache a failed load (e.g. wrong password) — allow a clean retry.
    existing.catch(() => {
      if (docs.get(sourceId) === existing) docs.delete(sourceId);
    });
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

/**
 * Replace a source's loaded doc with one parsed from `bytes` (used by undo/redo
 * to restore a previous document state). Closes the previous instance.
 */
export async function reloadPdfiumDoc(sourceId: string, bytes: Uint8Array): Promise<void> {
  const prev = docs.get(sourceId);
  const next = PdfiumDoc.load(bytes);
  docs.set(sourceId, next);
  await next;
  prev?.then((doc) => doc.close()).catch(() => {});
}
