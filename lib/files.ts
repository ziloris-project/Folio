/**
 * Client-side file-input validation for every upload surface (open, merge,
 * insert image). Since Folio reads the whole file into memory in the browser,
 * an oversized or wrong-type file can crash the tab - so we gate on type and a
 * size ceiling *before* reading. These are UX/robustness guards, not a security
 * boundary: the real parsers (PDFium, mammoth, pdf-lib) still reject malformed
 * input, and nothing is ever uploaded.
 */

/** Max bytes for an opened/merged document (PDF, DOCX, RTF). */
export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024; // 200 MB
/** Max bytes for an inserted image. */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB

const PDF_EXT = /\.pdf$/i;
const DOCUMENT_EXT = /\.(pdf|docx|rtf)$/i;
const IMAGE_EXT = /\.(png|jpe?g)$/i;
const IMAGE_MIME = new Set(["image/png", "image/jpeg"]);

export interface FileCheck {
  ok: boolean;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024 * 1024))} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function checkSize(file: File, max: number): FileCheck | null {
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > max) {
    return { ok: false, error: `File is too large - ${formatSize(file.size)} exceeds the ${formatSize(max)} limit.` };
  }
  return null;
}

/** A document to open: PDF, DOCX or RTF. */
export function validateDocumentFile(file: File): FileCheck {
  if (!DOCUMENT_EXT.test(file.name)) {
    return { ok: false, error: "Unsupported file type. Open a PDF, DOCX or RTF file." };
  }
  return checkSize(file, MAX_DOCUMENT_BYTES) ?? { ok: true };
}

/** A document to merge into the current one: PDF only. */
export function validatePdfFile(file: File): FileCheck {
  if (!PDF_EXT.test(file.name)) {
    return { ok: false, error: "Only PDF files can be merged." };
  }
  return checkSize(file, MAX_DOCUMENT_BYTES) ?? { ok: true };
}

/** An image to insert: PNG or JPEG. */
export function validateImageFile(file: File): FileCheck {
  if (!IMAGE_EXT.test(file.name) && !IMAGE_MIME.has(file.type)) {
    return { ok: false, error: "Unsupported image. Use a PNG or JPEG." };
  }
  return checkSize(file, MAX_IMAGE_BYTES) ?? { ok: true };
}
