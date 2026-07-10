# Folio - Roadmap

Folio is under active development. This file tracks what works today, what is
coming next, and what is intentionally out of scope. Feature flags for the
in-progress items live in [.env.example](.env.example).

## Available today

- Open, render and navigate PDFs (PDFium-WASM), including password-protected files
- Merge additional PDFs into the current document
- Page operations: reorder, rotate, delete, duplicate, insert blank page
- Edit existing content objects in place: move, recolor, resize, delete
- Replace fonts on existing text runs (standard-14) and edit single-run text
- Annotations: text, ink, highlight, rectangle, ellipse, line, arrow, image
- Draw-to-sign signature dialog
- Undo / redo with snapshot history
- Export a flattened PDF (annotations baked in via pdf-lib)

## Next up (prioritized)

1. **Wire the feature-flag config** - a typed `lib/config.ts` that reads the
   `NEXT_PUBLIC_FEATURE_*` vars so unfinished tools can be hidden in production
   and enabled locally. Unblocks everything below.
2. **Split / extract pages** (`FEATURE_PAGE_EXTRACT`) - select pages and export
   them as a separate PDF. Reuses the existing export pipeline.
3. **Multi-line paragraph reflow** (`FEATURE_TEXT_REFLOW`) - edit existing text
   across line breaks, not just a single run.
4. **Form-field filling** (`FEATURE_FORM_FIELDS`) - detect AcroForm fields and
   let users fill them.
5. **Encrypted export** (`FEATURE_ENCRYPT_EXPORT`) - set / remove a password on
   the exported file.
6. **Mobile / touch polish** - refine gestures and layout for small screens.

## Later / exploratory

- True redaction (`FEATURE_REDACTION`) - guaranteed content removal, not just delete
- OCR for scanned documents (`FEATURE_OCR`)
- Cryptographic digital signatures (`FEATURE_DIGITAL_SIGNATURE`)
- Accessibility tagging / structure

## Not supported (out of scope, by design)

- **No server, no uploads, no cloud storage.** Folio is a local-only, in-browser
  editor. Files never leave the device, so there is no account system, no
  server-side processing, and no cloud sync.
- **No re-editable annotation layer after export.** Export flattens annotations
  into the page; reopening the exported file treats them as page content.
- **No real-time collaboration / multi-user editing.**
- **No telemetry or analytics that transmit document contents.**

## Known limitations (today)

- Existing-text edits are per-run; multi-line paragraphs may need font recreation
  to render typed glyphs (standard-14 fonts only).
- Very large PDFs are limited by available browser memory (everything is in-memory).
- Object "delete" removes content from the stream but is not a security-grade redaction.
