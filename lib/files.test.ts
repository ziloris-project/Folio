import { describe, expect, it } from "vitest";
import { MAX_FONT_BYTES, sniffFontData, validateFontFile } from "./files";

/** A File whose reported size is `size`, without allocating that much. */
function fileNamed(name: string, size = 1024): File {
  const f = new File([new Uint8Array(1)], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}

/** Twelve bytes starting with a four-character sfnt tag. */
function withTag(tag: string): Uint8Array {
  const b = new Uint8Array(12);
  for (let i = 0; i < 4; i++) b[i] = tag.charCodeAt(i);
  return b;
}

describe("validateFontFile", () => {
  it("accepts .ttf and .otf regardless of case", () => {
    expect(validateFontFile(fileNamed("Face.ttf")).ok).toBe(true);
    expect(validateFontFile(fileNamed("FACE.OTF")).ok).toBe(true);
  });

  it("rejects other extensions", () => {
    expect(validateFontFile(fileNamed("face.woff2")).ok).toBe(false);
    expect(validateFontFile(fileNamed("notes.pdf")).ok).toBe(false);
  });

  it("rejects empty and oversized files", () => {
    expect(validateFontFile(fileNamed("face.ttf", 0)).ok).toBe(false);
    expect(validateFontFile(fileNamed("face.ttf", MAX_FONT_BYTES + 1)).ok).toBe(false);
  });
});

describe("sniffFontData", () => {
  it("accepts TrueType-outline signatures", () => {
    expect(sniffFontData(withTag("\x00\x01\x00\x00")).ok).toBe(true);
    expect(sniffFontData(withTag("true")).ok).toBe(true);
  });

  it("rejects formats PDFium cannot embed correctly, with a specific reason", () => {
    for (const tag of ["OTTO", "ttcf", "wOFF", "wOF2"]) {
      const check = sniffFontData(withTag(tag));
      expect(check.ok).toBe(false);
      expect(check.error).not.toMatch(/not a TrueType or OpenType font/);
    }
  });

  it("rejects bytes that are not a font", () => {
    expect(sniffFontData(new TextEncoder().encode("%PDF-1.7 not a font")).ok).toBe(false);
    expect(sniffFontData(new Uint8Array(3)).ok).toBe(false);
  });
});
