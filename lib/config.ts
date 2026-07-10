/**
 * Central app configuration and feature flags.
 *
 * Folio runs in the browser, so every value here comes from a `NEXT_PUBLIC_`
 * variable (see `.env.example`). Next.js inlines these at build time by
 * statically replacing each `process.env.NEXT_PUBLIC_*` reference, so they MUST
 * be written out literally below - a dynamic lookup like `process.env[name]`
 * would NOT be inlined and would read as undefined in the browser.
 *
 * Feature flags gate work that is incomplete or not yet supported. They default
 * to off, so a production build only exposes finished features unless a flag is
 * explicitly enabled in the environment.
 */

/** Parse a flag value; treats "true"/"1" as on, everything else as off. */
function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === "") return fallback;
  return value === "true" || value === "1";
}

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || "Folio",
  url: process.env.NEXT_PUBLIC_APP_URL || "https://folio.ziloris.com",
} as const;

export const features = {
  /** In-place editing of existing content objects + annotation tools. */
  contentEdit: bool(process.env.NEXT_PUBLIC_FEATURE_CONTENT_EDIT, true),

  // ---- Not yet supported / experimental (default off) ----
  /** Multi-line paragraph reflow of existing text runs. */
  textReflow: bool(process.env.NEXT_PUBLIC_FEATURE_TEXT_REFLOW),
  /** AcroForm form-field detection and filling. */
  formFields: bool(process.env.NEXT_PUBLIC_FEATURE_FORM_FIELDS),
  /** True redaction (content removal + burn). */
  redaction: bool(process.env.NEXT_PUBLIC_FEATURE_REDACTION),
  /** OCR for scanned / image-only PDFs. */
  ocr: bool(process.env.NEXT_PUBLIC_FEATURE_OCR),
  /** Split / extract selected pages into a separate PDF. */
  pageExtract: bool(process.env.NEXT_PUBLIC_FEATURE_PAGE_EXTRACT),
  /** Set or remove a password (encryption) on export. */
  encryptExport: bool(process.env.NEXT_PUBLIC_FEATURE_ENCRYPT_EXPORT),
  /** Cryptographic digital signatures (vs. drawn image signatures). */
  digitalSignature: bool(process.env.NEXT_PUBLIC_FEATURE_DIGITAL_SIGNATURE),
} as const;

/** Names of the available feature flags. */
export type FeatureName = keyof typeof features;

/** Whether a given feature is currently enabled. */
export function isFeatureEnabled(name: FeatureName): boolean {
  return features[name];
}
