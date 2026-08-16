"use client";

/**
 * Measure how wide a string will be before it is drawn.
 *
 * Re-wrapping an edited line needs the width of text that does not exist on the
 * page yet, and the font that will draw it is usually an embedded subset we
 * have no metrics for. Two facts make that tractable:
 *
 *   1. pdf-lib ships exact AFM metrics for the standard 14 faces and is already
 *      a dependency (the exporter embeds fonts with it), so a close stand-in is
 *      always available at no extra bundle cost.
 *   2. Any line we might re-wrap is already on the page, so we know both its
 *      text and the width that text actually took up.
 *
 * Point 2 is what makes this honest for embedded fonts. Helvetica is not
 * Arial-BoldMT, but across a line of prose the ratio between them is close to
 * constant, so dividing the real measured width by the stand-in's prediction
 * gives a correction factor that lands far nearer than picking a substitute and
 * hoping. `calibratedMeasure` is the entry point that does this; `widthOf` is
 * the raw stand-in and is only right when the text really is standard-14.
 */
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

/** Every face we can measure against, which is wider than the set we can draw in. */
const MEASURABLE = [
  StandardFonts.Helvetica,
  StandardFonts.HelveticaBold,
  StandardFonts.HelveticaOblique,
  StandardFonts.HelveticaBoldOblique,
  StandardFonts.TimesRoman,
  StandardFonts.TimesRomanBold,
  StandardFonts.TimesRomanItalic,
  StandardFonts.TimesRomanBoldItalic,
  StandardFonts.Courier,
  StandardFonts.CourierBold,
  StandardFonts.CourierOblique,
  StandardFonts.CourierBoldOblique,
] as const;

type Measurable = (typeof MEASURABLE)[number];

/** Loaded standard-14 metrics, as returned by `loadMetrics`. */
export type FontMetrics = Map<Measurable, PDFFont>;

let metrics: Promise<FontMetrics> | null = null;

/**
 * Load the standard-14 metrics. Cheap and cached, but asynchronous, so callers
 * that measure during typing should await it once up front rather than per
 * keystroke.
 */
export function loadMetrics(): Promise<FontMetrics> {
  if (!metrics) {
    metrics = (async () => {
      // An empty document purely as a host for the font objects; nothing is
      // ever written to it. pdf-lib has no way to read metrics without one.
      const doc = await PDFDocument.create();
      const loaded: FontMetrics = new Map();
      for (const name of MEASURABLE) loaded.set(name, await doc.embedFont(name));
      return loaded;
    })();
  }
  return metrics;
}

/**
 * Pick the standard-14 face that best stands in for an arbitrary PDF font name.
 *
 * Font names in a PDF are whatever the producer wrote, prefixed with a subset
 * tag when embedded ("ABCDEF+Arial-BoldMT"), so this is pattern matching on a
 * human-authored string and cannot be exact. It only has to be close, because
 * the caller scales the result to a real measurement afterwards. What it must
 * get right is the broad class: a monospace line measured as proportional (or
 * the reverse) is wrong by far more than calibration can absorb.
 */
export function standInFor(fontName: string): Measurable {
  const name = fontName.replace(/^[A-Z]{6}\+/, "").toLowerCase();
  const bold = /bold|black|heavy|semibold|demi|[-_]bd\b/.test(name);
  const italic = /italic|oblique|[-_]it\b/.test(name);

  if (/mono|courier|consol|menlo/.test(name)) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  // "sans" wins over "serif" because it contains it as a substring, and because
  // names like "PT Sans Serif" are sans faces.
  const serif = !/sans/.test(name) && /times|serif|roman|georgia|garamond|book|minion|cambria/.test(name);
  if (serif) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

/**
 * Width of `text` at `size` in the stand-in for `fontName`, in points.
 *
 * Characters outside the face's encoding (anything beyond WinAnsi, so most
 * non-Latin scripts) have no metric to look up. Rather than let that throw
 * mid-keystroke, they fall back to the width of an "n", which keeps wrapping
 * approximately sane on text this measurer was never going to be right about.
 */
export function widthOf(
  fonts: FontMetrics,
  text: string,
  fontName: string,
  size: number,
): number {
  const font = fonts.get(standInFor(fontName));
  if (!font) return 0;
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    let total = 0;
    for (const ch of text) {
      try {
        total += font.widthOfTextAtSize(ch, size);
      } catch {
        total += font.widthOfTextAtSize("n", size);
      }
    }
    return total;
  }
}

/** Measures a string's width in points. */
export type Measure = (text: string) => number;

/**
 * A measurer corrected against text that is already on the page.
 *
 * `sampleText` and `sampleWidth` describe a run whose real width we can see, so
 * their ratio against the stand-in's prediction is the error introduced by not
 * having the real font. Applying it to later measurements cancels most of that
 * error out.
 *
 * The correction is only trusted within a factor of two. Outside that the
 * sample is telling us something other than a font mismatch, most likely
 * letter-spacing or horizontal scaling set in the content stream, and scaling
 * by it would make wrapping worse rather than better.
 */
export function calibratedMeasure(
  fonts: FontMetrics,
  opts: { fontName: string; fontSize: number; sampleText: string; sampleWidth: number },
): Measure {
  const { fontName, fontSize, sampleText, sampleWidth } = opts;
  const predicted = widthOf(fonts, sampleText, fontName, fontSize);
  const ratio = predicted > 0 && sampleWidth > 0 ? sampleWidth / predicted : 1;
  const correction = ratio >= 0.5 && ratio <= 2 ? ratio : 1;
  return (text) => widthOf(fonts, text, fontName, fontSize) * correction;
}

