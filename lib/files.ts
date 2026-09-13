/**
 * Client-side file-input validation for every upload surface (open, merge,
 * insert image, font). Since Folio reads the whole file into memory in the browser,
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

/** Max bytes for an uploaded font. Large enough for a broad CJK TrueType face. */
export const MAX_FONT_BYTES = 50 * 1024 * 1024; // 50 MB

const FONT_EXT = /\.(ttf|otf)$/i;

/** A font to draw existing text in: TrueType or OpenType by name. */
export function validateFontFile(file: File): FileCheck {
  // Browsers report font MIME types inconsistently (often empty), so the
  // extension is the gate here and the bytes are checked by sniffFontData.
  if (!FONT_EXT.test(file.name)) {
    return { ok: false, error: "Unsupported font. Use a TrueType (.ttf) or OpenType (.otf) file." };
  }
  return checkSize(file, MAX_FONT_BYTES) ?? { ok: true };
}

/**
 * Check a font file's signature before it reaches PDFium.
 *
 * PDFium embeds every loaded font as a TrueType (FontFile2) stream and has no
 * way to write the CFF flavour of OpenType, so only TrueType outlines are let
 * through. An .otf with TrueType outlines carries the same signature as a .ttf
 * and is accepted. A corrupt file with a valid signature still gets past this,
 * which is fine: PDFium returns no font for it and the caller reports that.
 */
export function sniffFontData(bytes: Uint8Array): FileCheck {
  if (bytes.length < 12) return { ok: false, error: "That file is not a font." };
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === "\x00\x01\x00\x00" || tag === "true") return { ok: true };
  if (tag === "OTTO") {
    return {
      ok: false,
      error: "OpenType fonts with CFF outlines are not supported yet. Use a TrueType-outline font.",
    };
  }
  if (tag === "ttcf") {
    return { ok: false, error: "Font collections (.ttc) are not supported. Use a single font file." };
  }
  if (tag === "wOFF" || tag === "wOF2") {
    return { ok: false, error: "Web fonts (WOFF) are not supported. Use a .ttf file." };
  }
  return { ok: false, error: "That file is not a TrueType or OpenType font." };
}

/** An image to insert: PNG or JPEG. */
export function validateImageFile(file: File): FileCheck {
  if (!IMAGE_EXT.test(file.name) && !IMAGE_MIME.has(file.type)) {
    return { ok: false, error: "Unsupported image. Use a PNG or JPEG." };
  }
  return checkSize(file, MAX_IMAGE_BYTES) ?? { ok: true };
}
