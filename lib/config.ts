/**
 * Central app configuration and feature flags.
 *
 * Folio ships as a fully static site (`output: "export"`) served from Cloudflare
 * as plain static assets, so there is no build-time env to read from. Config
 * therefore lives here as plain constants: to change a value, edit this file and
 * redeploy. Feature flags gate work that is incomplete or not yet supported -
 * flip one to `true` only once the feature is actually built.
 */

export const appConfig = {
  name: "Folio",
  url: "https://folio.ziloris.com",
} as const;

export const features = {
  /** In-place editing of existing content objects + annotation tools. */
  contentEdit: true,
  /** Split / extract a page into a separate PDF. */
  pageExtract: true,
  /** Import .docx / .rtf by converting to an editable PDF in-browser. */
  docImport: true,

  // ---- Not yet supported / experimental (keep false until built) ----
  /** Group per-glyph text objects into editable words. Algorithm landed
   *  (lib/pdf/pdfium/grouping.ts); UI wiring + edit path pending verification. */
  textGrouping: false,
  /** Multi-line paragraph reflow of existing text runs. */
  textReflow: false,
  /** AcroForm form-field detection and filling. */
  formFields: false,
  /** True redaction (content removal + burn). */
  redaction: false,
  /** OCR for scanned / image-only PDFs. */
  ocr: false,
  /** Set or remove a password (encryption) on export. */
  encryptExport: false,
  /** Cryptographic digital signatures (vs. drawn image signatures). */
  digitalSignature: false,
} as const;

/** Names of the available feature flags. */
export type FeatureName = keyof typeof features;

/** Whether a given feature is currently enabled. */
export function isFeatureEnabled(name: FeatureName): boolean {
  return features[name];
}
