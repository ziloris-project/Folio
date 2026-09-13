"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { clamp } from "./utils";
import { features, isFeatureEnabled } from "./config";
import { sniffFontData, validateDocumentFile, validateFontFile, validatePdfFile } from "./files";
import { openPdfiumDoc, getPdfiumDoc, dropPdfiumDoc, reloadPdfiumDoc } from "./pdf/pdfium/registry";
import { PasswordRequiredError, type PdfiumDoc } from "./pdf/pdfium/doc";
import { baselineOf, extentOf, spanOf } from "./pdf/text/geometry";
import { calibratedMeasure, loadMetrics } from "./pdf/text/measure";
import { paragraphAt, reflowParagraph, type Paragraph } from "./pdf/text/paragraphs";
import {
  appendLineLike,
  listPageObjects,
  setObjectText,
  setObjectFill,
  setObjectStrokeColor,
  setObjectStrokeWidth,
  setObjectFontSize,
  moveObject,
  deleteObject as deletePdfObject,
  recreateTextObject,
} from "./pdf/pdfium/objects";
import type {
  Annotation,
  PageItem,
  PageObject,
  PdfSource,
  RGBA,
  Rotation,
  SourceId,
  ToolId,
} from "./pdf/types";

export interface ToolSettings {
  color: string;
  strokeWidth: number;
  fontSize: number;
  opacity: number;
  fill: boolean;
}

export type Status = "empty" | "loading" | "ready" | "error" | "password";

/**
 * A font file the user supplied for this document. Only the bytes are kept
 * here: PDFium font handles belong to one PdfiumDoc instance, and undo/redo
 * replaces that instance, so each document loads its own handle on demand
 * (PdfiumDoc.loadFont caches it under `id`).
 */
export interface UploadedFont {
  id: string;
  /** Label for the font picker, taken from the file name. */
  name: string;
  bytes: Uint8Array;
}

interface EditorState {
  status: Status;
  error: string | null;
  fileName: string;
  /** Bytes/name held while we prompt for a password, so we can retry. `mode`
   *  distinguishes opening a new document from appending to the current one. */
  pendingLoad: { bytes: Uint8Array; name: string; mode: "open" | "merge" } | null;
  passwordError: string | null;
  sources: Record<SourceId, PdfSource>;
  pages: PageItem[];

  zoom: number;
  activeTool: ToolId;
  tool: ToolSettings;

  selectedPageId: string | null;
  selectedAnnotationId: string | null;

  /** An image/signature awaiting placement - follows the cursor until a page is
   *  clicked (see PageView). null when not placing. */
  pendingImage: { dataUrl: string; naturalW: number; naturalH: number } | null;

  /** Transient status message shown as a toast. `id` changes per message so the
   *  UI can re-trigger its auto-dismiss timer. */
  toast: { id: string; message: string; kind: "info" | "success" | "error" } | null;

  // ----- existing-content editing (PDFium page objects) -----
  /** Cache of enumerated page objects, keyed by page id (lazy in edit mode). */
  pageObjects: Record<string, PageObject[]>;
  selectedObject: { pageId: string; index: number } | null;
  /** Fonts uploaded while this document is open, offered for every text line. */
  uploadedFonts: UploadedFont[];

  // ----- undo/redo history -----
  /** Live per-source document bytes; new ref after each content edit. */
  sourceBytes: Record<SourceId, Uint8Array>;
  past: Snapshot[];
  future: Snapshot[];

  // ----- document lifecycle -----
  loadFile: (file: File) => Promise<void>;
  mergeFile: (file: File) => Promise<void>;
  submitPassword: (password: string) => Promise<void>;
  cancelPassword: () => void;
  reset: () => void;

  // ----- view / tools -----
  setZoom: (z: number) => void;
  zoomBy: (delta: number) => void;
  setTool: (t: ToolId) => void;
  setToolSettings: (patch: Partial<ToolSettings>) => void;

  // ----- selection -----
  selectPage: (id: string | null) => void;
  selectAnnotation: (id: string | null) => void;
  setPendingImage: (img: EditorState["pendingImage"]) => void;
  showToast: (message: string, kind?: "info" | "success" | "error") => void;
  dismissToast: () => void;

  // ----- page ops -----
  rotatePage: (id: string, dir: 1 | -1) => void;
  deletePage: (id: string) => void;
  movePage: (from: number, to: number) => void;
  insertBlankPage: (afterIndex: number) => void;
  duplicatePage: (id: string) => void;

  // ----- annotation ops -----
  addAnnotation: (pageId: string, ann: Annotation) => void;
  updateAnnotation: (pageId: string, ann: Annotation) => void;
  removeAnnotation: (pageId: string, annId: string) => void;

  // ----- existing-content object ops -----
  refreshObjects: (pageId: string) => Promise<void>;
  selectObject: (sel: { pageId: string; index: number } | null) => void;
  /** `reflow` re-wraps the surrounding paragraph; pass it on commit, not per keystroke. */
  editObjectText: (
    pageId: string,
    index: number,
    text: string,
    opts?: { reflow?: boolean },
  ) => Promise<void>;
  setObjectColor: (pageId: string, index: number, color: RGBA, which: "fill" | "stroke") => Promise<void>;
  setObjectStrokeWidthValue: (pageId: string, index: number, width: number) => Promise<void>;
  setObjectFontSizeValue: (pageId: string, index: number, current: number, next: number) => Promise<void>;
  /** `fontName` is a standard-14 name or the id of an entry in uploadedFonts. */
  setObjectFontName: (pageId: string, index: number, fontName: string) => Promise<void>;
  /** Validate a font file, remember it for this document and apply it to the line. */
  uploadFont: (pageId: string, index: number, file: File) => Promise<void>;
  moveObjectBy: (pageId: string, index: number, dxOverlay: number, dyOverlay: number) => Promise<void>;
  deleteObject: (pageId: string, index: number) => Promise<void>;

  // ----- undo/redo -----
  /** Capture a history checkpoint before a mutation (call once per user gesture). */
  beginHistory: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

/** A restorable editor checkpoint. sourceBytes shares immutable Uint8Array refs
 *  with the live state, so unchanged sources cost nothing to snapshot. */
interface Snapshot {
  pages: PageItem[];
  sourceBytes: Record<SourceId, Uint8Array>;
}

const HISTORY_LIMIT = 60;

const DEFAULT_TOOL: ToolSettings = {
  color: "#ef4444",
  strokeWidth: 3,
  fontSize: 16,
  opacity: 1,
  fill: false,
};

/** Read a File into a Uint8Array. */
async function readBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** Build PageItems for every page of a freshly opened source. */
async function pagesForSource(source: PdfSource, password = ""): Promise<PageItem[]> {
  const doc = await openPdfiumDoc(source.id, source.bytes, password);
  const pages: PageItem[] = [];
  for (let i = 0; i < doc.pageCount; i++) {
    const { width, height } = doc.pageSize(i);
    pages.push({
      id: nanoid(),
      sourceId: source.id,
      sourcePageIndex: i,
      // Intrinsic /Rotate was normalized to 0 in the PDFium doc; fold the
      // original rotation into our model as the single source of truth.
      rotation: (((doc.intrinsicRotationDeg(i) % 360) + 360) % 360) as Rotation,
      width,
      height,
      annotations: [],
      editVersion: 0,
    });
  }
  return pages;
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export const useEditor = create<EditorState>((set, get) => ({
  status: "empty",
  error: null,
  fileName: "",
  sources: {},
  pages: [],

  zoom: 1,
  activeTool: "select",
  tool: { ...DEFAULT_TOOL },

  selectedPageId: null,
  selectedAnnotationId: null,
  pendingImage: null,
  toast: null,

  pageObjects: {},
  selectedObject: null,
  uploadedFonts: [],

  pendingLoad: null,
  passwordError: null,

  sourceBytes: {},
  past: [],
  future: [],

  loadFile: async (file) => {
    const check = validateDocumentFile(file);
    if (!check.ok) {
      set({ status: "error", error: check.error });
      return;
    }
    set({ status: "loading", error: null });
    try {
      // Word-processor documents are converted to an editable-text PDF in the
      // browser first; plain PDFs pass straight through.
      const { isConvertibleDoc, convertToPdf } = await import("./pdf/convert");
      if (features.docImport && isConvertibleDoc(file.name)) {
        const { bytes, name } = await convertToPdf(file);
        await openInto(set, bytes, name, "");
        return;
      }
    } catch (e) {
      set({ status: "error", error: e instanceof Error ? e.message : "Failed to import document" });
      return;
    }
    const bytes = await readBytes(file);
    await openInto(set, bytes, file.name, "");
  },

  submitPassword: async (password) => {
    const pending = get().pendingLoad;
    if (!pending) return;
    set({ passwordError: null });
    if (pending.mode === "merge") {
      await mergeInto(get, set, pending.bytes, pending.name, password);
    } else {
      set({ status: "loading" });
      await openInto(set, pending.bytes, pending.name, password);
    }
  },

  cancelPassword: () =>
    set((s) => ({
      // Cancelling a merge keeps the current document; cancelling an initial
      // open returns to the empty state.
      status: s.pendingLoad?.mode === "merge" ? "ready" : "empty",
      pendingLoad: null,
      passwordError: null,
      error: null,
    })),

  mergeFile: async (file) => {
    const check = validatePdfFile(file);
    if (!check.ok) {
      get().showToast(check.error ?? "Couldn't merge that file.", "error");
      return;
    }
    const bytes = await readBytes(file);
    await mergeInto(get, set, bytes, file.name, "");
  },

  reset: () => {
    Object.keys(get().sources).forEach(dropPdfiumDoc);
    set({
      status: "empty",
      error: null,
      fileName: "",
      pendingLoad: null,
      passwordError: null,
      sources: {},
      pages: [],
      selectedPageId: null,
      selectedAnnotationId: null,
      pendingImage: null,
      pageObjects: {},
      selectedObject: null,
      uploadedFonts: [],
      sourceBytes: {},
      past: [],
      future: [],
      zoom: 1,
      activeTool: "select",
    });
  },

  setZoom: (z) => set({ zoom: clamp(z, 0.25, 6) }),
  zoomBy: (delta) => set((s) => ({ zoom: clamp(s.zoom + delta, 0.25, 6) })),
  setTool: (t) =>
    set({
      activeTool: t,
      selectedAnnotationId: null,
      selectedObject: t === "edit" ? get().selectedObject : null,
    }),
  setToolSettings: (patch) => set((s) => ({ tool: { ...s.tool, ...patch } })),

  selectPage: (id) => set({ selectedPageId: id }),
  selectAnnotation: (id) => set({ selectedAnnotationId: id }),
  setPendingImage: (img) => set({ pendingImage: img }),
  showToast: (message, kind = "info") => set({ toast: { id: nanoid(), message, kind } }),
  dismissToast: () => set({ toast: null }),

  rotatePage: (id, dir) => {
    get().beginHistory();
    set((s) => ({
      pages: s.pages.map((p) => {
        if (p.id !== id) return p;
        const idx = ROTATIONS.indexOf(p.rotation);
        const next = ROTATIONS[(idx + (dir === 1 ? 1 : 3)) % 4];
        return { ...p, rotation: next };
      }),
    }));
  },

  deletePage: (id) => {
    // A document must keep at least one page; deleting the last would leave a
    // blank editor with no way back. (The rail's delete button is also disabled
    // at one page, but guard the store too, and skip the dead undo checkpoint.)
    if (get().pages.length <= 1) return;
    get().beginHistory();
    set((s) => {
      const pages = s.pages.filter((p) => p.id !== id);
      const selectedPageId =
        s.selectedPageId === id ? pages[0]?.id ?? null : s.selectedPageId;
      return { pages, selectedPageId };
    });
  },

  movePage: (from, to) => {
    get().beginHistory();
    set((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.pages.length || to >= s.pages.length)
        return s;
      const pages = s.pages.slice();
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      return { pages };
    });
  },

  insertBlankPage: (afterIndex) => {
    get().beginHistory();
    set((s) => {
      const ref = s.pages[afterIndex];
      const blank: PageItem = {
        id: nanoid(),
        sourceId: null,
        sourcePageIndex: 0,
        rotation: 0,
        width: ref?.width ?? 595, // default A4-ish (in points)
        height: ref?.height ?? 842,
        annotations: [],
        editVersion: 0,
      };
      const pages = s.pages.slice();
      pages.splice(afterIndex + 1, 0, blank);
      return { pages, selectedPageId: blank.id };
    });
  },

  duplicatePage: (id) => {
    get().beginHistory();
    set((s) => {
      const idx = s.pages.findIndex((p) => p.id === id);
      if (idx < 0) return s;
      const orig = s.pages[idx];
      const copy: PageItem = {
        ...orig,
        id: nanoid(),
        annotations: orig.annotations.map((a) => ({ ...a, id: nanoid() })),
      };
      const pages = s.pages.slice();
      pages.splice(idx + 1, 0, copy);
      return { pages };
    });
  },

  addAnnotation: (pageId, ann) => {
    get().beginHistory();
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId ? { ...p, annotations: [...p.annotations, ann] } : p,
      ),
      selectedAnnotationId: ann.id,
    }));
  },

  // No history checkpoint here: continuous drags/typing call beginHistory() once
  // at gesture start (see useMoveDrag / TextNode), so each gesture is one undo.
  updateAnnotation: (pageId, ann) =>
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId
          ? { ...p, annotations: p.annotations.map((a) => (a.id === ann.id ? ann : a)) }
          : p,
      ),
    })),

  removeAnnotation: (pageId, annId) => {
    get().beginHistory();
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === pageId
          ? { ...p, annotations: p.annotations.filter((a) => a.id !== annId) }
          : p,
      ),
      selectedAnnotationId:
        s.selectedAnnotationId === annId ? null : s.selectedAnnotationId,
    }));
  },

  // ----- existing-content object ops -----
  refreshObjects: async (pageId) => {
    const page = get().pages.find((p) => p.id === pageId);
    if (!page?.sourceId) return;
    const docP = getPdfiumDoc(page.sourceId);
    if (!docP) return;
    const doc = await docP;
    const objects = listPageObjects(doc, page.sourcePageIndex);
    set((s) => ({ pageObjects: { ...s.pageObjects, [pageId]: objects } }));
  },

  selectObject: (sel) => set({ selectedObject: sel }),

  // All mutators follow the same shape: resolve the source doc, mutate, rewrite
  // the content stream, bump editVersion (to re-render the canvas), and refresh
  // the cached object list (bounds/props change after edits).
  //
  // Each one applies to every part of the selected entry, not just its index. A
  // word grouped out of per-glyph runs is one thing on screen but many objects
  // in the file, and colouring or moving only the first letter of it is the
  // whole class of bug this fans out to avoid.
  editObjectText: async (pageId, index, text, opts) => {
    const parts = partsOf(get, pageId, index);
    // Reflow is deliberately not run on every keystroke, even though it could
    // be. Pouring text through the paragraph as you type moves it between lines
    // under the caret: type a word onto the end of line one and the tail of it
    // lands on line two, so the field you are typing into loses text you just
    // entered. Waiting for the edit to be committed means the line simply grows
    // while you work and settles into the paragraph when you are done.
    const plan = opts?.reflow ? await planReflow(get, pageId, index, text) : null;

    let rejected = false;
    let removed: number[] = [];
    await mutateObject(get, set, pageId, (doc, pageIndex) => {
      if (plan) {
        const out = applyReflow(doc, pageIndex, plan);
        rejected = !out.ok;
        removed = out.removed;
        return;
      }
      // A run's font is often an embedded subset carrying only the glyphs the
      // file already used, so it can refuse characters that were never on the
      // page. PDFium reports that and leaves the run's text alone. Check before
      // touching the rest of the line, because tearing it down around a refused
      // write erases the line and leaves only its first run behind.
      if (!setObjectText(doc, pageIndex, index, text)) {
        rejected = true;
        return;
      }
      // The line's other runs are now spelled out by the one just rewritten, so
      // they have to go.
      removed = dropRuns(doc, pageIndex, parts, index);
    });

    // Removing a run renumbers every index above it, so a selection sitting
    // above one of them now points at the wrong object.
    reindexSelection(get, set, pageId, index, removed);

    if (rejected) {
      get().showToast(
        "That text uses an embedded font without those characters. Replace the font to edit this line.",
        "error",
      );
    }
  },

  setObjectColor: async (pageId, index, color, which) => {
    const parts = partsOf(get, pageId, index);
    await mutateObject(get, set, pageId, (doc, pageIndex) => {
      for (const p of parts) {
        if (which === "fill") setObjectFill(doc, pageIndex, p, color);
        else setObjectStrokeColor(doc, pageIndex, p, color);
      }
    });
  },

  setObjectStrokeWidthValue: async (pageId, index, width) => {
    const parts = partsOf(get, pageId, index);
    await mutateObject(get, set, pageId, (doc, pageIndex) => {
      for (const p of parts) setObjectStrokeWidth(doc, pageIndex, p, width);
    });
  },

  setObjectFontSizeValue: async (pageId, index, current, next) => {
    const entry = entryAt(get, pageId, index);
    const parts = entry?.parts ?? [index];
    // Scale every run about the word's own baseline start. Left to scale around
    // its own origin, each glyph would grow in place and the word would collapse
    // into overlapping letters; a shared anchor moves them apart in step.
    const anchor = entry?.type === "text" ? entry.origin : undefined;
    await mutateObject(get, set, pageId, (doc, pageIndex) => {
      for (const p of parts) setObjectFontSize(doc, pageIndex, p, current, next, anchor);
    });
  },

  moveObjectBy: async (pageId, index, dxOverlay, dyOverlay) => {
    const parts = partsOf(get, pageId, index);
    // Overlay space is top-left origin; PDF is bottom-left, so flip dy.
    await mutateObject(get, set, pageId, (doc, pageIndex) => {
      for (const p of parts) moveObject(doc, pageIndex, p, dxOverlay, -dyOverlay);
    });
  },

  deleteObject: async (pageId, index) => {
    // Descending, because removing an object renumbers every index above it.
    const parts = [...partsOf(get, pageId, index)].sort((a, b) => b - a);
    await mutateObject(get, set, pageId, (doc, pageIndex) => {
      for (const p of parts) deletePdfObject(doc, pageIndex, p);
    });
    set({ selectedObject: null });
  },

  // Recreate a text run in a standard font (guarantees typed glyphs render and
  // sets an exact size). The object moves to the top of the z-order, so we
  // follow the selection to its new index.
  setObjectFontName: async (pageId, index, fontName) => {
    const page = get().pages.find((p) => p.id === pageId);
    if (!page?.sourceId) return;
    const target = get().pageObjects[pageId]?.find((o) => o.index === index);
    if (!target || target.type !== "text") return;
    const sourceId = page.sourceId;
    const docP = getPdfiumDoc(sourceId);
    if (!docP) return;
    const doc = await docP;
    // An uploaded font is loaded into this document here, inside the edit, so a
    // document that undo/redo just reloaded from bytes gets its own handle.
    const uploaded = get().uploadedFonts.find((f) => f.id === fontName);
    const font = uploaded ? doc.loadFont(uploaded.id, uploaded.bytes) : undefined;
    if (font === 0) {
      get().showToast("That font could not be loaded.", "error");
      return;
    }
    get().beginHistory();
    // recreateTextObject rebuilds the whole line from the anchor run, so the
    // line's other runs would draw their glyphs underneath it a second time.
    // Remove them first, and shift the anchor by however many sat below it,
    // since removing an object renumbers everything above.
    const removed = dropRuns(doc, page.sourcePageIndex, target.parts, index);
    const anchor = index - removed.filter((p) => p < index).length;
    const newIndex = recreateTextObject(doc, page.sourcePageIndex, anchor, {
      fontName,
      text: target.text,
      fontSize: target.fontSize,
      color: target.color,
      font,
    });
    doc.regenerate(page.sourcePageIndex);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === pageId ? { ...p, editVersion: p.editVersion + 1 } : p)),
      sourceBytes: { ...s.sourceBytes, [sourceId]: doc.save() },
    }));
    await get().refreshObjects(pageId);
    if (newIndex >= 0) set({ selectedObject: { pageId, index: newIndex } });
  },

  uploadFont: async (pageId, index, file) => {
    const check = validateFontFile(file);
    if (!check.ok) {
      get().showToast(check.error ?? "Couldn't use that font.", "error");
      return;
    }
    const bytes = await readBytes(file);
    const sniff = sniffFontData(bytes);
    if (!sniff.ok) {
      get().showToast(sniff.error ?? "Couldn't use that font.", "error");
      return;
    }
    const page = get().pages.find((p) => p.id === pageId);
    if (!page?.sourceId) return;
    const docP = getPdfiumDoc(page.sourceId);
    if (!docP) return;
    const doc = await docP;

    // The same file picked twice is one font, not two entries in the picker.
    const known = get().uploadedFonts.find((f) => sameBytes(f.bytes, bytes));
    const entry = known ?? { id: `font-${nanoid()}`, name: file.name.replace(/\.(ttf|otf)$/i, ""), bytes };

    // Load before remembering it, so a file that only looks like a font never
    // reaches the picker. A signature is easy to get right on a corrupt file,
    // and PDFium answers that with a null handle rather than a trap.
    if (!doc.loadFont(entry.id, entry.bytes)) {
      get().showToast("That font file is damaged or unsupported.", "error");
      return;
    }
    if (!known) set((s) => ({ uploadedFonts: [...s.uploadedFonts, entry] }));
    await get().setObjectFontName(pageId, index, entry.id);
  },

  // ----- undo/redo -----
  beginHistory: () =>
    set((s) => ({
      past: [...s.past, { pages: s.pages, sourceBytes: s.sourceBytes }].slice(-HISTORY_LIMIT),
      future: [],
    })),

  undo: async () => {
    const { past } = get();
    if (!past.length) return;
    const snap = past[past.length - 1];
    const current: Snapshot = { pages: get().pages, sourceBytes: get().sourceBytes };
    await applySnapshot(get, set, snap);
    set((s) => ({ past: s.past.slice(0, -1), future: [...s.future, current] }));
  },

  redo: async () => {
    const { future } = get();
    if (!future.length) return;
    const snap = future[future.length - 1];
    const current: Snapshot = { pages: get().pages, sourceBytes: get().sourceBytes };
    await applySnapshot(get, set, snap);
    set((s) => ({ future: s.future.slice(0, -1), past: [...s.past, current] }));
  },
}));

/** Restore a snapshot: reload any source whose bytes changed, then swap pages. */
async function applySnapshot(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  snap: Snapshot,
) {
  const live = get().sourceBytes;
  for (const id of Object.keys(snap.sourceBytes)) {
    if (snap.sourceBytes[id] !== live[id]) {
      await reloadPdfiumDoc(id, snap.sourceBytes[id]);
    }
  }
  set({
    pages: snap.pages,
    sourceBytes: snap.sourceBytes,
    // Object indices/bitmaps are now stale; clear caches and selection.
    pageObjects: {},
    selectedObject: null,
    selectedAnnotationId: null,
  });
}

/** Open bytes into a fresh document, or fall into the password-prompt state. */
async function openInto(
  set: (partial: Partial<EditorState>) => void,
  bytes: Uint8Array,
  name: string,
  password: string,
) {
  try {
    const source: PdfSource = { id: nanoid(), name, bytes };
    const pages = await pagesForSource(source, password);
    set({
      status: "ready",
      fileName: name,
      sources: { [source.id]: source },
      pages,
      selectedPageId: pages[0]?.id ?? null,
      selectedAnnotationId: null,
      pageObjects: {},
      selectedObject: null,
      uploadedFonts: [],
      sourceBytes: { [source.id]: source.bytes },
      past: [],
      future: [],
      pendingLoad: null,
      passwordError: null,
    });
  } catch (e) {
    if (e instanceof PasswordRequiredError) {
      set({
        status: "password",
        pendingLoad: { bytes, name, mode: "open" },
        passwordError: e.wrongPassword ? e.message : null,
      });
    } else {
      set({ status: "error", error: e instanceof Error ? e.message : "Failed to open PDF" });
    }
  }
}

/** Append a source to the current document, or fall into the password prompt
 *  (keeping the current document visible). */
async function mergeInto(
  get: () => EditorState,
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void,
  bytes: Uint8Array,
  name: string,
  password: string,
) {
  try {
    const source: PdfSource = { id: nanoid(), name, bytes };
    const newPages = await pagesForSource(source, password);
    get().beginHistory();
    set((s) => ({
      sources: { ...s.sources, [source.id]: source },
      pages: [...s.pages, ...newPages],
      sourceBytes: { ...s.sourceBytes, [source.id]: source.bytes },
      pendingLoad: null,
      passwordError: null,
    }));
    get().showToast(`Added ${newPages.length} page${newPages.length === 1 ? "" : "s"}`, "success");
  } catch (e) {
    if (e instanceof PasswordRequiredError) {
      set({ pendingLoad: { bytes, name, mode: "merge" }, passwordError: e.wrongPassword ? e.message : null });
    } else {
      get().showToast("Couldn't merge PDF: " + (e instanceof Error ? e.message : "unknown error"), "error");
    }
  }
}

/** Byte-for-byte equality, used to recognise a font file uploaded twice. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The cached page-object entry a selection index refers to, if still listed. */
function entryAt(get: () => EditorState, pageId: string, index: number): PageObject | undefined {
  return get().pageObjects[pageId]?.find((o) => o.index === index);
}

/**
 * Every PDFium object index an entry stands for. One entry is usually one
 * object, but a word reconstructed from per-glyph runs covers all of them, and
 * an edit that reaches only `index` would touch a single letter of it.
 *
 * Falls back to the index alone if the cache has been cleared (undo drops it),
 * which is the same single-object behaviour as before grouping existed.
 */
function partsOf(get: () => EditorState, pageId: string, index: number): number[] {
  return entryAt(get, pageId, index)?.parts ?? [index];
}

interface ReflowPlan {
  paragraph: Paragraph;
  /** The paragraph's text after the edit, broken to fit its column. */
  lines: string[];
  /** The page as it stands, so content below the block can be moved. */
  objects: PageObject[];
}

/**
 * Work out how the edited line's paragraph should be laid out, or null if there
 * is nothing to reflow into.
 *
 * Measurement is calibrated against the edited line itself: we know its text
 * and the width that text really occupies on the page, which corrects for the
 * embedded font we have no metrics for. See pdf/text/measure.ts.
 */
async function planReflow(
  get: () => EditorState,
  pageId: string,
  index: number,
  text: string,
): Promise<ReflowPlan | null> {
  if (!isFeatureEnabled("textReflow")) return null;
  const objects = get().pageObjects[pageId];
  if (!objects) return null;
  const paragraph = paragraphAt(objects, index);
  if (!paragraph) return null;

  const target = paragraph.lines[paragraph.target];
  const fonts = await loadMetrics();
  const measure = calibratedMeasure(fonts, {
    fontName: target.fontName,
    fontSize: target.fontSize,
    sampleText: target.text,
    sampleWidth: spanOf(target),
  });
  const lines = reflowParagraph(paragraph, text, measure);

  // If the re-wrap lands on exactly what is already there, do not touch the
  // page. Rewriting a paragraph to the state it is already in still rebuilds
  // its runs and still costs an undo step, and any drift between our metrics
  // and the file's would show up as the block twitching for no reason.
  const current = paragraph.lines.slice(paragraph.target).map((l) => l.text);
  if (lines.length === current.length && lines.every((t, i) => t === current[i])) return null;

  return { paragraph, lines, objects };
}

/**
 * Write a reflowed paragraph back onto the page. Returns false if the font
 * refused any of the text, in which case nothing was changed.
 *
 * Only lines from the edited one down are touched, matching what was reflowed.
 * They are rewritten in place, which keeps every index stable and so keeps the
 * selection valid. A paragraph that grew gets new objects appended below its
 * last line, stepping down by its own leading along its own writing direction,
 * so this holds for rotated text. A paragraph that shrank leaves its surplus
 * lines blank, and they disappear on the next enumeration.
 *
 * Every write is attempted before any line is blanked. A subset font that
 * cannot encode the new text makes PDFium reject the write and leave the run
 * alone, and blanking the rest of the paragraph around a rejected write would
 * erase text that is still perfectly good.
 *
 * What this does not do is push whatever sits below the paragraph out of the
 * way. A block that grows can therefore overlap the one after it. Moving the
 * rest of the page would mean re-laying out content this edit never touched,
 * across tables, columns and the page boundary, which is a much larger change
 * than reflowing one paragraph.
 */
function applyReflow(
  doc: PdfiumDoc,
  pageIndex: number,
  plan: ReflowPlan,
): { ok: boolean; removed: number[] } {
  const { paragraph, lines } = plan;
  const rewritten = paragraph.lines.slice(paragraph.target);

  // Write every line before removing anything. One refused line would otherwise
  // leave the paragraph half rewritten, which is worse than not applying the
  // edit at all. A line the re-wrap emptied out is removed rather than written,
  // since PDFium has no empty text object to set it to.
  const kept = Math.min(rewritten.length, lines.length);
  for (let i = 0; i < kept; i++) {
    if (!setObjectText(doc, pageIndex, rewritten[i].index, lines[i])) {
      return { ok: false, removed: [] };
    }
  }

  // Make room before adding lines, so the new ones land in space that is
  // already clear rather than on top of the next block.
  shiftBelow(doc, pageIndex, plan, lines.length - rewritten.length);

  // Append before removing: the model run and the leading are expressed in the
  // current numbering, and appended objects land at the end where later
  // removals cannot disturb anything we still need.
  const last = paragraph.lines[paragraph.lines.length - 1];
  // "Down" one line in the text's own frame. The line normal is (-dy, dx), so
  // stepping against it is (dy, -dx); for unrotated text that is plain -leading
  // on y.
  for (let i = rewritten.length; i < lines.length; i++) {
    const steps = i - (rewritten.length - 1);
    const drop = paragraph.leading * steps;
    appendLineLike(doc, pageIndex, last.index, lines[i], drop * last.dir.y, -drop * last.dir.x);
  }

  // Everything the rewrite made redundant: the runs each line was assembled
  // from, plus whole lines the paragraph no longer needs because it shrank.
  const surplus: number[] = [];
  rewritten.forEach((line, i) => {
    if (i >= lines.length) surplus.push(...line.parts);
    else surplus.push(...line.parts.filter((p) => p !== line.index));
  });
  return { ok: true, removed: dropRuns(doc, pageIndex, surplus) };
}

/**
 * Move what sits below a paragraph after it changed height.
 *
 * A block that grows a line has to put that line somewhere, and without this it
 * lands on top of whatever follows: the last line of a re-wrapped paragraph
 * printed straight through the first line of the next one. Shifting the rest of
 * the column by the same amount is what a text editor does, and is the
 * difference between re-wrapping being usable and being a trap.
 *
 * Only text that shares the column moves. A figure or a rule is left alone,
 * because we have no way to tell whether it was anchored to this block or to
 * the page, and moving artwork on a guess is worse than leaving a gap. Content
 * near the foot of the page can be pushed off it; the page does not grow.
 */
function shiftBelow(doc: PdfiumDoc, pageIndex: number, plan: ReflowPlan, extraLines: number) {
  if (!extraLines) return;
  const { paragraph, objects } = plan;

  // The block's own runs never move relative to themselves.
  const own = new Set<number>();
  for (const line of paragraph.lines) for (const p of line.parts) own.add(p);

  const bottom = Math.min(...paragraph.lines.map(baselineOf));
  const left = Math.min(...paragraph.lines.map((l) => extentOf(l).min));
  const right = Math.max(...paragraph.lines.map((l) => extentOf(l).max));

  const dir = paragraph.lines[0].dir;
  const drop = extraLines * paragraph.leading;
  // Down one line in the text's own frame: the line normal is (-dy, dx), so
  // moving against it is (dy, -dx). For unrotated text that is -drop on y.
  const dx = drop * dir.y;
  const dy = -drop * dir.x;

  for (const o of objects) {
    if (o.type !== "text" || own.has(o.index)) continue;
    if (baselineOf(o) >= bottom) continue; // above the block, or on its last line
    const e = extentOf(o);
    if (e.max <= left || e.min >= right) continue; // a different column
    for (const p of o.parts) moveObject(doc, pageIndex, p, dx, dy);
  }
}

/**
 * Remove page objects, returning the indices actually removed.
 *
 * Descending, because removing an object renumbers every index above it. This
 * is how a run stops drawing: PDFium rejects an empty string outright (it traps
 * inside the wasm rather than returning false), so a run that is no longer
 * wanted has to be deleted, not emptied.
 */
function dropRuns(
  doc: PdfiumDoc,
  pageIndex: number,
  indices: number[],
  keep?: number,
): number[] {
  const drop = [...new Set(indices)].filter((p) => p !== keep).sort((a, b) => b - a);
  for (const p of drop) deletePdfObject(doc, pageIndex, p);
  return drop;
}

/**
 * Follow the selection after runs were removed from under it.
 *
 * Every removed index below the selected object shifts it down by one. Without
 * this the inspector would still be pointing at `index` while the object that
 * lives there is now a different one, so the next keystroke would be typed into
 * the wrong line.
 */
function reindexSelection(
  get: () => EditorState,
  set: (partial: Partial<EditorState>) => void,
  pageId: string,
  index: number,
  removed: number[],
) {
  const shift = removed.filter((p) => p < index).length;
  if (!shift) return;
  const sel = get().selectedObject;
  if (sel?.pageId === pageId && sel.index === index) {
    set({ selectedObject: { pageId, index: index - shift } });
  }
}

/** Shared object-mutation pipeline: mutate → regenerate → re-render → re-list. */
async function mutateObject(
  get: () => EditorState,
  set: (partial: Partial<EditorState> | ((s: EditorState) => Partial<EditorState>)) => void,
  pageId: string,
  mutate: (doc: PdfiumDoc, pageIndex: number) => void,
) {
  const page = get().pages.find((p) => p.id === pageId);
  if (!page?.sourceId) return;
  const sourceId = page.sourceId;
  const docP = getPdfiumDoc(sourceId);
  if (!docP) return;
  const doc = await docP;
  get().beginHistory(); // checkpoint pre-edit state (pages + current source bytes)
  mutate(doc, page.sourcePageIndex);
  doc.regenerate(page.sourcePageIndex);
  set((s) => ({
    pages: s.pages.map((p) =>
      p.id === pageId ? { ...p, editVersion: p.editVersion + 1 } : p,
    ),
    // Record the new doc bytes as a fresh ref so undo can detect the change.
    sourceBytes: { ...s.sourceBytes, [sourceId]: doc.save() },
  }));
  await get().refreshObjects(pageId);
}
