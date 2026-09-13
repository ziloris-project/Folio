# Folio - Roadmap

Folio is under active development. This file tracks what works today, what is
coming next, and what is intentionally out of scope. Feature flags for the
in-progress items live as plain constants in [lib/config.ts](lib/config.ts)
(the site is fully static, so config is edited in code and redeployed).

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
- Rebuild per-glyph text runs into lines, so clicking page text selects the
  whole line instead of one letter, and every edit applies across it
- Re-wrap the surrounding paragraph when an edited line changes length, so text
  flows between lines instead of running off the page (applied on commit)
- Recreate existing text runs in a standard-14 font (honors explicit line breaks)
- Recreate existing text runs in an uploaded TrueType font, embedded in the
  exported PDF, and offered for every other line in the same document
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
2. **Form-field filling** (`features.formFields`) - detect AcroForm fields and
   let users fill them (PDFium form APIs).
3. **Multi-page extract / range export** - extend the current single-page
   extract to a selectable page range.
4. **Higher-fidelity .docx import** - tables, images and richer list nesting in
   the in-browser converter.
5. **Find / text search** across the document.
6. **Mobile / touch polish** - refine gestures and layout for small screens.

## Later / hard / exploratory

- **Encrypted export** (`features.encryptExport`) - set/remove a password on the
  exported file. Hard: pdf-lib cannot encrypt on save, so this needs a different
  save path.
- **True redaction** (`features.redaction`) - guaranteed content removal + burn.
- **OCR** for scanned / image-only PDFs (`features.ocr`).
- **Cryptographic digital signatures** (`features.digitalSignature`).
- Bookmarks / outline editing, document metadata editing, multi-select and
  copy/paste of objects, accessibility tagging.

## Not supported (out of scope, by design)

- **No server, no uploads, no cloud storage.** Folio is a local-only, in-browser
  editor. Files never leave the device, so there is no account system, no
  server-side processing, and no cloud sync.
- **No real-time collaboration / multi-user editing.**
- **No telemetry or analytics that transmit document contents.**

## Known limitations (today)

- Existing-text edits render reliably through the 9 standard-14 fonts or a font
  you upload. A file's own embedded fonts are often subsets and can still
  refuse new characters. Standard-14 fonts cover Latin text only; an uploaded
  font covers exactly the characters it contains, nothing more.
- Uploaded fonts:
  - Only TrueType outlines are accepted (`.ttf`, or an `.otf` that uses
    TrueType outlines). CFF-based OpenType, font collections (`.ttc`) and WOFF
    are rejected, because PDFium can only embed a font as a TrueType stream.
  - The whole font file is embedded (compressed, not subset), so a large font
    makes the exported PDF correspondingly larger.
  - Uploads are kept in memory for the open document only. They are not saved
    anywhere, and are gone after a reload or when another document is opened.
  - Applying the font again after an undo or redo embeds a second copy of it,
    since the reloaded document has no record of the first.
  - Characters are placed one glyph per character, with no shaping, so scripts
    that need ligatures or contextual forms (for example Arabic or Devanagari)
    will not render correctly.
  - Embedding a font in a PDF you share is subject to that font's licence.
    Checking that the licence allows it is up to you.
- Line grouping is geometric, so it inherits the ambiguity the PDF format
  leaves open. A PDF stores no space character between runs it positioned
  rather than spaced, so the gap is the only evidence, and a file with broken
  glyph spacing metrics can have a space invented where none belongs or omitted
  where one does. Run text itself is always preserved verbatim, so only the
  separators between runs are ever at stake. Refining that call is issue #1.
- Retyping a line that mixes styles adopts the style the line opens with, since
  the whole line is rewritten through its first run.
- Re-wrap shifts the rest of the text column when a paragraph changes height,
  but images and rules stay put, and content near the foot of a page can be
  pushed off it rather than onto the next page.
- Re-wrap needs a paragraph to measure a column from, so a line standing on its
  own is never re-wrapped: nothing on the page says how wide it may become.
- A hyphen at a line break survives re-wrapping. Telling a split word
  ("environ-" / "ment") from a real compound ("part-" / "time") needs a
  dictionary, so the hyphen is left visible rather than guessed away.
- Exported annotations are flattened onto the page - they are not re-editable
  PDF annotations once exported (until item 2 above lands).
- Object "delete" removes content from the stream but is not security-grade redaction.
- Everything is held in memory, so very large PDFs are limited by browser RAM.
- `.docx` / `.rtf` import preserves content and basic structure (headings,
  paragraphs, lists, bold/italic) but not exact layout; tables are flattened to
  text and images are dropped. Legacy binary `.doc` is not supported.
