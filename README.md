# Folio

**A fast, private, open-source PDF editor that runs entirely in your browser.**

Open a PDF, edit its text, drop in signatures, images and shapes, reorder pages, then export - all without a single byte ever leaving your device. No accounts, no uploads, no server.

> ⚠️ **Status: under active development (alpha).** Folio is still being built - features are landing fast, and things may change or break between commits. Not yet recommended for critical documents. A hosted build will be available at **[folio.ziloris.com](https://folio.ziloris.com)**.

<p align="left">
  <img alt="Status" src="https://img.shields.io/badge/status-in%20development-orange">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black">
</p>

---

## Why Folio

Most "free" online PDF editors upload your file to a server you don't control. Folio takes the opposite approach: the entire editor - rendering, editing, and exporting - runs **100% client-side** using a WebAssembly build of PDFium. Your documents stay on your machine.

- 🔒 **Private by design** - files are processed locally in your browser; nothing is uploaded.
- ⚡ **Fast** - native-grade rendering via PDFium compiled to WebAssembly.
- 🆓 **Free & open source** - MIT licensed, forever.
- 🧩 **No install** - runs in any modern browser.

## Features

| Status | Feature |
| :----: | ------- |
| ✅ | Open & render PDFs (PDFium-WASM), with page rotation |
| ✅ | Page thumbnail rail with page operations |
| ✅ | Select & move existing text / image objects on the page |
| ✅ | Replace fonts on existing text runs; multi-line text editing |
| ✅ | Add text, image and shape / ink / line annotations |
| ✅ | Draw-to-sign signature dialog |
| ✅ | Inspector panel for fine-grained content editing |
| ✅ | Undo / redo with snapshot history (`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`) |
| ✅ | Export / save (annotations baked in via pdf-lib) |
| 🚧 | Page insert / delete / merge across documents |
| 🚧 | Form-field editing |
| 🚧 | Mobile / touch polish |

✅ = available today · 🚧 = planned / in progress

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

Folio is early. The near-term focus is rounding out page management (insert/delete/merge), form-field support, and touch/mobile interactions, followed by the hosted release at **folio.ziloris.com**. Issues and ideas are very welcome.

## Contributing

Contributions are welcome! Since the project is moving quickly, please open an issue to discuss larger changes before sending a PR. Bug reports and small fixes can go straight to a pull request.

## License

[MIT](LICENSE) - free to use, modify, and distribute.

Folio bundles [PDFium](https://pdfium.googlesource.com/pdfium/) (BSD-3-Clause) via `@embedpdf/pdfium`.
