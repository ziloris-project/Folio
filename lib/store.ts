"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import { clamp } from "./utils";
import { openPdfiumDoc, getPdfiumDoc, dropPdfiumDoc, reloadPdfiumDoc } from "./pdf/pdfium/registry";
import { PasswordRequiredError, type PdfiumDoc } from "./pdf/pdfium/doc";
import {
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
  editObjectText: (pageId: string, index: number, text: string) => Promise<void>;
  setObjectColor: (pageId: string, index: number, color: RGBA, which: "fill" | "stroke") => Promise<void>;
  setObjectStrokeWidthValue: (pageId: string, index: number, width: number) => Promise<void>;
  setObjectFontSizeValue: (pageId: string, index: number, current: number, next: number) => Promise<void>;
  setObjectFontName: (pageId: string, index: number, fontName: string) => Promise<void>;
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

  pendingLoad: null,
  passwordError: null,

  sourceBytes: {},
  past: [],
  future: [],

  loadFile: async (file) => {
    set({ status: "loading", error: null });
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
  editObjectText: async (pageId, index, text) => {
    await mutateObject(get, set, pageId, (doc, pageIndex) =>
      setObjectText(doc, pageIndex, index, text),
    );
  },

  setObjectColor: async (pageId, index, color, which) => {
    await mutateObject(get, set, pageId, (doc, pageIndex) =>
      which === "fill"
        ? setObjectFill(doc, pageIndex, index, color)
        : setObjectStrokeColor(doc, pageIndex, index, color),
    );
  },

  setObjectStrokeWidthValue: async (pageId, index, width) => {
    await mutateObject(get, set, pageId, (doc, pageIndex) =>
      setObjectStrokeWidth(doc, pageIndex, index, width),
    );
  },

  setObjectFontSizeValue: async (pageId, index, current, next) => {
    await mutateObject(get, set, pageId, (doc, pageIndex) =>
      setObjectFontSize(doc, pageIndex, index, current, next),
    );
  },

  moveObjectBy: async (pageId, index, dxOverlay, dyOverlay) => {
    // Overlay space is top-left origin; PDF is bottom-left, so flip dy.
    await mutateObject(get, set, pageId, (doc, pageIndex) =>
      moveObject(doc, pageIndex, index, dxOverlay, -dyOverlay),
    );
  },

  deleteObject: async (pageId, index) => {
    await mutateObject(get, set, pageId, (doc, pageIndex) =>
      deletePdfObject(doc, pageIndex, index),
    );
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
    get().beginHistory();
    const newIndex = recreateTextObject(doc, page.sourcePageIndex, index, {
      fontName,
      text: target.text,
      fontSize: target.fontSize,
      color: target.color,
    });
    doc.regenerate(page.sourcePageIndex);
    set((s) => ({
      pages: s.pages.map((p) => (p.id === pageId ? { ...p, editVersion: p.editVersion + 1 } : p)),
      sourceBytes: { ...s.sourceBytes, [sourceId]: doc.save() },
    }));
    await get().refreshObjects(pageId);
    if (newIndex >= 0) set({ selectedObject: { pageId, index: newIndex } });
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
