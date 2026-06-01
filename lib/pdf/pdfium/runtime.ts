"use client";

/**
 * Lazy singleton init of the PDFium WebAssembly module (@embedpdf/pdfium, BSD).
 *
 * The wrapper exposes every PDFium C function as a directly-callable, cwrapped
 * method on the returned object (e.g. `I.FPDFPage_CountObjects(page)`), plus
 * Emscripten runtime helpers under `I.pdfium` (malloc/free/memory, getValue,
 * setValue, UTF16ToString, stringToUTF16, addFunction).
 *
 * The 4.5MB wasm binary is served from /public and fetched once at runtime.
 */
import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";

export type Pdfium = WrappedPdfiumModule;

let instance: Promise<Pdfium> | null = null;

export function getPdfium(): Promise<Pdfium> {
  if (!instance) {
    instance = (async () => {
      const res = await fetch("/pdfium.wasm");
      if (!res.ok) throw new Error(`Could not load pdfium.wasm (${res.status})`);
      const wasmBinary = await res.arrayBuffer();
      const I = await init({ wasmBinary });
      I.PDFiumExt_Init();
      return I;
    })();
  }
  return instance;
}

// ---------------------------------------------------------------------------
// Low-level memory helpers. The module heap (wasmExports.memory.buffer) can be
// detached when memory grows, so we always build a fresh view on access rather
// than caching a typed array.
// ---------------------------------------------------------------------------

export function heapU8(I: Pdfium): Uint8Array {
  const exports = I.pdfium.wasmExports as unknown as { memory: WebAssembly.Memory };
  return new Uint8Array(exports.memory.buffer);
}

export function malloc(I: Pdfium, size: number): number {
  return I.pdfium.wasmExports.malloc(size);
}

export function free(I: Pdfium, ptr: number): void {
  if (ptr) I.pdfium.wasmExports.free(ptr);
}

/** Copy bytes into the wasm heap and return the pointer (caller frees). */
export function writeBytes(I: Pdfium, bytes: Uint8Array): number {
  const ptr = malloc(I, bytes.length);
  heapU8(I).set(bytes, ptr);
  return ptr;
}

/** Copy `len` bytes out of the wasm heap into a detached Uint8Array. */
export function readBytes(I: Pdfium, ptr: number, len: number): Uint8Array {
  return heapU8(I).slice(ptr, ptr + len);
}

export function getFloat(I: Pdfium, ptr: number): number {
  return I.pdfium.getValue(ptr, "float");
}

export function getInt(I: Pdfium, ptr: number): number {
  return I.pdfium.getValue(ptr, "i32");
}

export function setFloat(I: Pdfium, ptr: number, value: number): void {
  I.pdfium.setValue(ptr, value, "float");
}

/**
 * Allocate space for `count` consecutive out-params (4 bytes each), run `fn`
 * with pointers to each slot, then read them back as floats. Frees on exit.
 */
export function withFloatOut<T>(
  I: Pdfium,
  count: number,
  fn: (ptrs: number[]) => T,
): { result: T; values: number[] } {
  const base = malloc(I, count * 4);
  try {
    const ptrs = Array.from({ length: count }, (_, i) => base + i * 4);
    const result = fn(ptrs);
    return { result, values: ptrs.map((p) => getFloat(I, p)) };
  } finally {
    free(I, base);
  }
}

/** Same as withFloatOut but reads i32 slots. */
export function withIntOut<T>(
  I: Pdfium,
  count: number,
  fn: (ptrs: number[]) => T,
): { result: T; values: number[] } {
  const base = malloc(I, count * 4);
  try {
    const ptrs = Array.from({ length: count }, (_, i) => base + i * 4);
    const result = fn(ptrs);
    return { result, values: ptrs.map((p) => getInt(I, p)) };
  } finally {
    free(I, base);
  }
}

/** Write a JS string as a null-terminated UTF-16LE FPDF_WIDESTRING (caller frees). */
export function writeWideString(I: Pdfium, s: string): number {
  const bytes = (s.length + 1) * 2;
  const ptr = malloc(I, bytes);
  I.pdfium.stringToUTF16(s, ptr, bytes);
  return ptr;
}

export function readWideString(I: Pdfium, ptr: number): string {
  return I.pdfium.UTF16ToString(ptr);
}

export function readUtf8(I: Pdfium, ptr: number): string {
  return I.pdfium.UTF8ToString(ptr);
}
