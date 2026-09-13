"use client";

/**
 * High-level wrapper around a single loaded PDF inside PDFium. Owns the page
 * handles, renders pages to canvas, and saves edited bytes.
 *
 * Rotation: we normalize every page's intrinsic /Rotate to 0 on load and record
 * the original rotation separately. This makes page-object coordinates equal to
 * unrotated media coordinates (matching the annotation overlay's coordinate
 * space), and lets the UI drive display rotation via CSS. The recorded rotation
 * is re-applied at export time by the pdf-lib assembly stage.
 */
import {
  getPdfium,
  heapU8,
  malloc,
  free,
  writeBytes,
  readBytes,
  type Pdfium,
} from "./runtime";

const FPDF_ANNOT = 0x01;
const FPDF_REVERSE_BYTE_ORDER = 0x10;
const FPDF_ERR_PASSWORD = 4;
// Font type for FPDFText_LoadFont (fpdf_edit.h): FPDF_FONT_TYPE1 = 1,
// FPDF_FONT_TRUETYPE = 2. Only TrueType is used, see loadFont.
const FPDF_FONT_TRUETYPE = 2;

// Raster caps. Without them, zoom 6x on a hi-DPI screen asks for a ~72-megapixel
// (~288 MB) bitmap per page, which can exhaust memory and, worse, exceed the
// browser's maximum canvas area (as low as ~16.7 MP on iOS Safari) and silently
// render nothing. We keep the CSS display size and only shrink the backing
// bitmap, so an over-cap page just loses a little sharpness at extreme zoom.
const MAX_CANVAS_DIM = 8192; // max width/height in device pixels
const MAX_CANVAS_PIXELS = 16_777_216; // 4096 * 4096, safe across browsers

/** Thrown when a PDF needs a password (or the supplied one was wrong). */
export class PasswordRequiredError extends Error {
  /** True if a password was supplied and rejected (vs. first prompt). */
  readonly wrongPassword: boolean;
  constructor(wrongPassword: boolean) {
    super(wrongPassword ? "Incorrect password." : "This PDF is password-protected.");
    this.name = "PasswordRequiredError";
    this.wrongPassword = wrongPassword;
  }
}

export interface PageSize {
  width: number;
  height: number;
}

export class PdfiumDoc {
  private pages = new Map<number, number>();
  private textPages = new Map<number, number>();
  /** Pages edited since their content stream was last rewritten. */
  private staleContent = new Set<number>();
  private intrinsicRotation: number[] = [];
  /** Font handles loaded from user-supplied font files, keyed by the caller's id. */
  private fonts = new Map<string, number>();

  private constructor(
    readonly I: Pdfium,
    readonly handle: number,
    private dataPtr: number,
    readonly pageCount: number,
  ) {}

  static async load(bytes: Uint8Array, password = ""): Promise<PdfiumDoc> {
    const I = await getPdfium();
    const dataPtr = writeBytes(I, bytes); // PDFium reads lazily; keep alive until close()
    const handle = I.FPDF_LoadMemDocument(dataPtr, bytes.length, password);
    if (!handle) {
      const err = I.FPDF_GetLastError();
      free(I, dataPtr);
      if (err === FPDF_ERR_PASSWORD) throw new PasswordRequiredError(password.length > 0);
      throw new Error("Could not open PDF - it may be corrupt or an unsupported format.");
    }
    const count = I.FPDF_GetPageCount(handle);
    const doc = new PdfiumDoc(I, handle, dataPtr, count);
    // Normalize rotation up front so object coords == media coords everywhere.
    for (let i = 0; i < count; i++) {
      const page = doc.pageHandle(i);
      doc.intrinsicRotation[i] = (I.FPDFPage_GetRotation(page) % 4) * 90;
      I.FPDFPage_SetRotation(page, 0);
    }
    return doc;
  }

  /** Original /Rotate of a page in degrees, before normalization. */
  intrinsicRotationDeg(i: number): number {
    return this.intrinsicRotation[i] ?? 0;
  }

  pageHandle(i: number): number {
    let p = this.pages.get(i);
    if (!p) {
      p = this.I.FPDF_LoadPage(this.handle, i);
      this.pages.set(i, p);
    }
    return p;
  }

  /** A text page is required to read text-object strings. */
  textPageHandle(i: number): number {
    let tp = this.textPages.get(i);
    if (!tp) {
      tp = this.I.FPDFText_LoadPage(this.pageHandle(i));
      this.textPages.set(i, tp);
    }
    return tp;
  }

  pageSize(i: number): PageSize {
    const page = this.pageHandle(i);
    return { width: this.I.FPDF_GetPageWidthF(page), height: this.I.FPDF_GetPageHeightF(page) };
  }

  /** Persist content-stream changes for a page after editing its objects. */
  regenerate(i: number): void {
    this.I.FPDFPage_GenerateContent(this.pageHandle(i));
    this.staleContent.delete(i);
    this.dropTextPage(i);
  }

  /**
   * Record an edit without rewriting the page's content stream yet.
   *
   * Rendering and object reads work from PDFium's in-memory page objects, so
   * an edit is on screen without the stream. Rewriting it serializes every
   * object on the page, 15-35 ms on a page of 2,700 glyph runs, which is too
   * much to spend per keystroke on bytes only a save reads. save() rewrites
   * any page left stale here before it serializes.
   */
  touch(i: number): void {
    this.staleContent.add(i);
    this.dropTextPage(i);
  }

  private dropTextPage(i: number): void {
    // The cached text page is stale after content changes.
    const tp = this.textPages.get(i);
    if (tp) {
      this.I.FPDFText_ClosePage(tp);
      this.textPages.delete(i);
    }
  }

  /**
   * Render a page (unrotated media) into a canvas at the given CSS scale.
   * Returns the CSS pixel size so the caller can size the overlay.
   */
  renderPageToCanvas(i: number, canvas: HTMLCanvasElement, scale: number): PageSize {
    const I = this.I;
    const page = this.pageHandle(i);
    const w = I.FPDF_GetPageWidthF(page);
    const h = I.FPDF_GetPageHeightF(page);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    // Desired device-pixel size, then a single downscale factor that satisfies
    // every canvas limit at once (per-dimension and total area).
    const wantW = w * scale * dpr;
    const wantH = h * scale * dpr;
    const fit = Math.min(
      1,
      MAX_CANVAS_DIM / wantW,
      MAX_CANVAS_DIM / wantH,
      Math.sqrt(MAX_CANVAS_PIXELS / (wantW * wantH)),
    );
    const pw = Math.max(1, Math.round(wantW * fit));
    const ph = Math.max(1, Math.round(wantH * fit));

    const bmp = I.FPDFBitmap_Create(pw, ph, 1); // alpha => BGRA
    I.FPDFBitmap_FillRect(bmp, 0, 0, pw, ph, 0xffffffff); // white page
    // REVERSE_BYTE_ORDER makes the output RGBA so it drops straight into ImageData.
    I.FPDF_RenderPageBitmap(bmp, page, 0, 0, pw, ph, 0, FPDF_ANNOT | FPDF_REVERSE_BYTE_ORDER);

    const buf = I.FPDFBitmap_GetBuffer(bmp);
    const stride = I.FPDFBitmap_GetStride(bmp);
    const raw = readBytes(I, buf, stride * ph);
    I.FPDFBitmap_Destroy(bmp);

    const img = new ImageData(pw, ph);
    if (stride === pw * 4) {
      img.data.set(raw);
    } else {
      for (let y = 0; y < ph; y++) {
        img.data.set(raw.subarray(y * stride, y * stride + pw * 4), y * pw * 4);
      }
    }
    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = `${Math.round(w * scale)}px`;
    canvas.style.height = `${Math.round(h * scale)}px`;
    canvas.getContext("2d")!.putImageData(img, 0, 0);
    return { width: w, height: h };
  }

  /** Save the (possibly edited) document to a fresh byte array. */
  save(): Uint8Array {
    const I = this.I;
    for (const i of [...this.staleContent]) this.regenerate(i);
    const writer = I.PDFiumExt_OpenFileWriter();
    try {
      I.PDFiumExt_SaveAsCopy(this.handle, writer);
      const size = I.PDFiumExt_GetFileWriterSize(writer);
      const buf = malloc(I, size);
      try {
        I.PDFiumExt_GetFileWriterData(writer, buf, size);
        return heapU8(I).slice(buf, buf + size);
      } finally {
        free(I, buf);
      }
    } finally {
      I.PDFiumExt_CloseFileWriter(writer);
    }
  }

  /**
   * Load a TrueType font file into this document and return its FPDF_FONT
   * handle, or 0 if PDFium could not parse it. Cached per `key`, so applying the
   * same upload to a second line reuses one embedded copy instead of adding
   * another.
   *
   * Parameters, per fpdf_edit.h: FPDFText_LoadFont(document, data, size,
   * font_type, cid).
   *
   * - font_type is always FPDF_FONT_TRUETYPE. PDFium writes the file as a
   *   FontFile2 stream; it has no FontFile3 path, so a CFF-flavoured OpenType
   *   file would be embedded under the wrong type and other viewers could
   *   refuse it. The upload check rejects those before they get here.
   * - cid is true. That makes a Type0 font with a CIDFontType2 descendant,
   *   Identity-H encoding and a ToUnicode map covering the whole cmap. The
   *   simple-font alternative is WinAnsi only: PDFium still accepts non-Latin
   *   text into it and even draws it, but the saved file carries no encoding
   *   for those characters, so reopening it reads back as garbage.
   *
   * Memory: the header documents that the data "will be copied by the font
   * object", so the heap buffer is freed straight away. This was checked
   * rather than trusted: overwriting and freeing the buffer immediately after
   * the call, then churning the heap, still rendered the text, and the font
   * stream in the saved file was byte-identical to the uploaded file. The
   * whole file is embedded (PDFium does not subset), Flate-compressed.
   *
   * The returned handle holds a reference that FPDFFont_Close releases. Text
   * objects keep their own reference, so it is only closed in close(), and
   * before the document: a font releasing its file stream reaches back into
   * the document that owns it.
   */
  loadFont(key: string, bytes: Uint8Array): number {
    const cached = this.fonts.get(key);
    if (cached) return cached;
    const I = this.I;
    const ptr = writeBytes(I, bytes);
    let font = 0;
    try {
      font = I.FPDFText_LoadFont(this.handle, ptr, bytes.length, FPDF_FONT_TRUETYPE, true);
    } finally {
      free(I, ptr);
    }
    if (font) this.fonts.set(key, font);
    return font;
  }

  close(): void {
    for (const font of this.fonts.values()) this.I.FPDFFont_Close(font);
    this.fonts.clear();
    for (const tp of this.textPages.values()) this.I.FPDFText_ClosePage(tp);
    for (const p of this.pages.values()) this.I.FPDF_ClosePage(p);
    this.textPages.clear();
    this.pages.clear();
    this.I.FPDF_CloseDocument(this.handle);
    free(this.I, this.dataPtr);
  }
}
