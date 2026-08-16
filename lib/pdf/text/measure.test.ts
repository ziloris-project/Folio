import { beforeAll, describe, expect, it } from "vitest";
import { calibratedMeasure, loadMetrics, standInFor, widthOf, type FontMetrics } from "./measure";

let fonts: FontMetrics;
beforeAll(async () => {
  fonts = await loadMetrics();
});

describe("standInFor", () => {
  it("strips the subset tag a PDF prefixes onto embedded fonts", () => {
    expect(standInFor("ABCDEF+Arial")).toBe(standInFor("Arial"));
  });

  it("reads weight and slant out of the name", () => {
    expect(standInFor("Arial-BoldMT")).toBe("Helvetica-Bold");
    expect(standInFor("Arial-ItalicMT")).toBe("Helvetica-Oblique");
    expect(standInFor("Arial-BoldItalicMT")).toBe("Helvetica-BoldOblique");
  });

  it("routes serif names to Times", () => {
    expect(standInFor("TimesNewRomanPSMT")).toBe("Times-Roman");
    expect(standInFor("Georgia-Bold")).toBe("Times-Bold");
  });

  it("does not read 'sans' as a serif face", () => {
    // "PT Sans Serif" contains "serif" but is a sans face; getting the broad
    // class wrong is the one error calibration cannot absorb.
    expect(standInFor("PTSansSerif")).toBe("Helvetica");
    expect(standInFor("OpenSans-Bold")).toBe("Helvetica-Bold");
  });

  it("routes monospace names to Courier", () => {
    expect(standInFor("Consolas")).toBe("Courier");
    expect(standInFor("MenloMono-Bold")).toBe("Courier-Bold");
  });

  it("falls back to Helvetica for names it cannot classify", () => {
    expect(standInFor("Wingdings3")).toBe("Helvetica");
  });
});

describe("widthOf", () => {
  it("measures proportionally, not by character count", () => {
    const thin = widthOf(fonts, "iiiii", "Helvetica", 10);
    const wide = widthOf(fonts, "MMMMM", "Helvetica", 10);
    expect(wide).toBeGreaterThan(thin * 2);
  });

  it("scales linearly with font size", () => {
    const at10 = widthOf(fonts, "Hello", "Helvetica", 10);
    const at20 = widthOf(fonts, "Hello", "Helvetica", 20);
    expect(at20).toBeCloseTo(at10 * 2, 5);
  });

  it("measures a fixed-pitch face as fixed pitch", () => {
    const thin = widthOf(fonts, "iiiii", "Courier", 10);
    const wide = widthOf(fonts, "MMMMM", "Courier", 10);
    expect(wide).toBeCloseTo(thin, 5);
  });

  it("does not throw on characters outside the encoding", () => {
    // Non-Latin text has no metric to look up. Wrapping it will be wrong, but
    // it must not take the editor down mid-keystroke.
    expect(() => widthOf(fonts, "日本語テキスト", "Helvetica", 10)).not.toThrow();
    expect(widthOf(fonts, "日本語テキスト", "Helvetica", 10)).toBeGreaterThan(0);
  });
});

describe("calibratedMeasure", () => {
  it("corrects the stand-in towards the font actually on the page", () => {
    // Pretend the real font runs 25% wider than Helvetica predicts.
    const predicted = widthOf(fonts, "Sample text", "Arial", 10);
    const measure = calibratedMeasure(fonts, {
      fontName: "Arial",
      fontSize: 10,
      sampleText: "Sample text",
      sampleWidth: predicted * 1.25,
    });
    expect(measure("Sample text")).toBeCloseTo(predicted * 1.25, 5);
  });

  it("is a no-op when the stand-in already agrees with the page", () => {
    const predicted = widthOf(fonts, "Hello world", "Helvetica", 12);
    const measure = calibratedMeasure(fonts, {
      fontName: "Helvetica",
      fontSize: 12,
      sampleText: "Hello world",
      sampleWidth: predicted,
    });
    expect(measure("Hello world")).toBeCloseTo(predicted, 5);
  });

  it("ignores a correction too extreme to be a font mismatch", () => {
    // A 10x sample is letter-spacing or horizontal scaling in the content
    // stream, not a different face, and scaling by it would wreck wrapping.
    const predicted = widthOf(fonts, "Hello", "Helvetica", 10);
    const measure = calibratedMeasure(fonts, {
      fontName: "Helvetica",
      fontSize: 10,
      sampleText: "Hello",
      sampleWidth: predicted * 10,
    });
    expect(measure("Hello")).toBeCloseTo(predicted, 5);
  });

  it("survives a sample with no width to learn from", () => {
    const measure = calibratedMeasure(fonts, {
      fontName: "Helvetica",
      fontSize: 10,
      sampleText: "",
      sampleWidth: 0,
    });
    expect(measure("Hello")).toBeCloseTo(widthOf(fonts, "Hello", "Helvetica", 10), 5);
  });
});
