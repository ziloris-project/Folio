# Folio

**A fast, private, open-source PDF editor that runs entirely in your browser.**

Open a PDF, edit its text, drop in signatures, images and shapes, reorder pages, then export - all without a single byte ever leaving your device. No accounts, no uploads, no server.

> **Status: under active development (alpha).** Folio is still being built - features are landing fast, and things may change or break between commits. Not yet recommended for critical documents. A hosted build will be available at **[folio.ziloris.com](https://folio.ziloris.com)**.

<p align="left">
  <img alt="Status" src="https://img.shields.io/badge/status-in%20development-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black">
</p>

---

## Why Folio

Most "free" online PDF editors upload your file to a server you don't control. Folio takes the opposite approach: the entire editor - rendering, editing, and exporting - runs **100% client-side** using a WebAssembly build of PDFium. Your documents stay on your machine.

- **Private by design.** Files are processed locally in your browser; nothing is ever uploaded.
- **Native-grade performance.** Rendering is powered by PDFium compiled to WebAssembly.
- **Free and open source.** MIT licensed, with no paywalls or feature gates.
- **Zero install.** Runs in any modern browser - nothing to download or set up.

## Features

| Status | Feature |
| ------ | ------- |
| Available | Open and render any PDF locally (PDFium-WASM) - nothing is uploaded |
| Available | Open Word documents (`.docx`, `.rtf`) - converted to an editable-text PDF in your browser |
| Available | Password-protected PDFs - detected on open **and** merge, with a retry prompt |
| Available | Merge / append other PDFs into the current document |
| Available | Page management - reorder (drag), rotate, duplicate, delete, insert blank, extract a page as its own PDF |
| Available | Thumbnail rail with active-page sync (scroll ↔ selection) and click-to-jump |
| Available | Edit existing content - select, move, retype, recolor, resize and replace fonts on the PDF's own text / image objects |
| Available | Multi-line text editing with a live, debounced Inspector panel |
| Available | Annotate - text, freehand ink, highlight, rectangle, ellipse, line and arrow |
| Available | Insert images and draw-to-sign signatures, placed by clicking on the page |
| Available | Eraser plus `Delete` / `Backspace` to remove selected objects & annotations |
| Available | Undo / redo with snapshot history (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`) |
| Available | Zoom - buttons, `Ctrl`/`⌘` + wheel at the cursor, pinch-to-zoom, and fit-to-width toggle |
| Available | Keyboard shortcuts for every tool, plus toast notifications for actions |
| Available | Export to a real PDF with edits and annotations baked in (pdf-lib) |
| Planned | Form-field (AcroForm) editing |
| Planned | Broader mobile / touch polish |

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router) + **React 19** + **TypeScript**
- **[@embedpdf/pdfium](https://www.npmjs.com/package/@embedpdf/pdfium)** - PDFium compiled to WebAssembly (BSD-3), for rendering & page-object editing
- **[pdf-lib](https://pdf-lib.js.org/)** - export / annotation baking
- **[Zustand](https://zustand-demo.pmnd.rs/)** - editor state & undo/redo history
- **[Radix UI](https://www.radix-ui.com/)** primitives + **[Tailwind CSS](https://tailwindcss.com/)** + **[lucide-react](https://lucide.dev/)** icons

## Getting started

**Prerequisites:** Node.js 20+.

```bash
# 1. Install dependencies (a postinstall step copies pdfium.wasm into /public)
npm install

# 2. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and drop a PDF onto the window to start editing.

### Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run copy-wasm` | Copy `pdfium.wasm` into `public/` (runs automatically on install) |

## Project structure

```
app/                     Next.js App Router entry (client-only editor island)
components/
  editor/                Editor shell, viewport, toolbar, inspector, thumbnails
    annotations/         Text / image / shape annotation nodes + drag hooks
  ui/                    Reusable UI primitives (IconButton, Tooltip)
lib/
  pdf/
    pdfium/              PDFium-WASM runtime, document, page-object operations
    coords.ts            Rotation-aware screen <-> page coordinate mapping
    save.ts              pdf-lib export & annotation baking
  store.ts               Zustand editor store + undo/redo history
  utils.ts               Helpers (cn, clamp, downloadBlob)
```

## Roadmap

Page management (reorder, rotate, duplicate, delete, insert, merge) and the core editing/annotation toolset are in place. The near-term focus is form-field (AcroForm) support and broader touch/mobile polish, followed by the hosted release at **folio.ziloris.com**. Issues and ideas are very welcome.

## Contributing

Contributions are welcome! Since the project is moving quickly, please open an issue to discuss larger changes before sending a PR. Bug reports and small fixes can go straight to a pull request.

## License

[MIT](LICENSE) - free to use, modify, and distribute.

Folio bundles [PDFium](https://pdfium.googlesource.com/pdfium/) (BSD-3-Clause) via `@embedpdf/pdfium`.
