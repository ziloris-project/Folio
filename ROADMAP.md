# Folio - Roadmap

Folio is under active development. This file tracks what works today, what is
coming next, and what is intentionally out of scope. Feature flags for the
in-progress items live in [.env.example](.env.example).

## Available today

- Open, render and navigate PDFs (PDFium-WASM), including password-protected
  files (detected on open **and** merge, with a retry prompt)
- Open Word documents (`.docx`, `.rtf`) by converting them to an editable-text
  PDF entirely in the browser (content and structure, not exact layout)
- Merge / append other PDFs into the current document
- Page operations: drag-reorder, rotate, duplicate, delete (keeps the last
  page), insert blank page, and extract a single page as its own PDF
- Thumbnail rail with active-page sync and click-to-jump
- Edit existing content objects in place: move, retype, recolor (fill/stroke),
  stroke width, font size, delete
- Recreate existing text runs in a standard-14 font (honors explicit line breaks)
- Annotations: text (bold), ink, highlight, rectangle, ellipse, line, arrow,
  image, and draw-to-sign signatures; eraser and Delete/Backspace
- Undo / redo with snapshot history
- Zoom: buttons, Ctrl/Cmd + wheel at the cursor, pinch-to-zoom, fit-to-width
- Toast notifications and full keyboard shortcuts
- Export a PDF with edits and annotations baked in (pdf-lib)

## Next up (prioritized)

1. **Real PDF annotations on export** - emit proper text-markup / shape / link
   annotations instead of flattening everything onto the page, so annotations
   stay selectable and editable in other viewers.
2. **Form-field filling** (`FEATURE_FORM_FIELDS`) - detect AcroForm fields and
   let users fill them (PDFium form APIs).
3. **Multi-page extract / range export** - extend the current single-page
   extract to a selectable page range.
4. **Higher-fidelity .docx import** - tables, images and richer list nesting in
   the in-browser converter.
5. **Find / text search** across the document.
6. **Mobile / touch polish** - refine gestures and layout for small screens.

## Later / hard / exploratory

- **Encrypted export** (`FEATURE_ENCRYPT_EXPORT`) - set/remove a password on the
  exported file. Hard: pdf-lib cannot encrypt on save, so this needs a different
  save path.
- **Multi-line paragraph reflow** (`FEATURE_TEXT_REFLOW`) of existing text runs.
- **True redaction** (`FEATURE_REDACTION`) - guaranteed content removal + burn.
- **OCR** for scanned / image-only PDFs (`FEATURE_OCR`).
- **Cryptographic digital signatures** (`FEATURE_DIGITAL_SIGNATURE`).
- Bookmarks / outline editing, document metadata editing, multi-select and
  copy/paste of objects, accessibility tagging.

## Not supported (out of scope, by design)

- **No server, no uploads, no cloud storage.** Folio is a local-only, in-browser
  editor. Files never leave the device, so there is no account system, no
  server-side processing, and no cloud sync.
- **No real-time collaboration / multi-user editing.**
- **No telemetry or analytics that transmit document contents.**

## Known limitations (today)

- Existing-text edits render reliably only through the 9 standard-14 fonts;
  custom / embedded / non-Latin glyph coverage is limited.
- Exported annotations are flattened onto the page - they are not re-editable
  PDF annotations once exported (until item 2 above lands).
- Object "delete" removes content from the stream but is not security-grade redaction.
- Everything is held in memory, so very large PDFs are limited by browser RAM.
- `.docx` / `.rtf` import preserves content and basic structure (headings,
  paragraphs, lists, bold/italic) but not exact layout; tables are flattened to
  text and images are dropped. Legacy binary `.doc` is not supported.
