"use client";

import { useRef, useState } from "react";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import * as Separator from "@radix-ui/react-separator";
import {
  MousePointer2, Type, Pencil, Highlighter, Square, Circle, Minus,
  ArrowUpRight, Image as ImageIcon, PenTool, Eraser, FolderOpen, FilePlus2,
  Download, ZoomIn, ZoomOut, Loader2, TextCursorInput,
} from "lucide-react";
import { nanoid } from "nanoid";
import { useEditor } from "@/lib/store";
import type { ImageAnnotation, ToolId } from "@/lib/pdf/types";
import { downloadBlob } from "@/lib/utils";
import { Tooltip } from "../ui/Tooltip";
import { IconButton } from "../ui/IconButton";
import { SignatureDialog } from "./SignatureDialog";

const TOOLS: { id: ToolId; icon: typeof Type; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select / Move (V)" },
  { id: "edit", icon: TextCursorInput, label: "Edit content — existing text, borders & images (C)" },
  { id: "text", icon: Type, label: "Text (T)" },
  { id: "ink", icon: Pencil, label: "Draw (D)" },
  { id: "highlight", icon: Highlighter, label: "Highlight (H)" },
  { id: "rect", icon: Square, label: "Rectangle (R)" },
  { id: "ellipse", icon: Circle, label: "Ellipse (O)" },
  { id: "line", icon: Minus, label: "Line (L)" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow (A)" },
  { id: "image", icon: ImageIcon, label: "Insert image" },
  { id: "signature", icon: PenTool, label: "Signature" },
  { id: "eraser", icon: Eraser, label: "Eraser (E)" },
];

const PALETTE = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#6366f1", "#111827", "#ffffff"];

/** Place an image annotation centered on the currently-selected page. */
function placeImageCentered(dataUrl: string, naturalW: number, naturalH: number) {
  const st = useEditor.getState();
  const page = st.pages.find((p) => p.id === st.selectedPageId) ?? st.pages[0];
  if (!page) return;
  const maxW = page.width * 0.5;
  const scale = Math.min(1, maxW / naturalW);
  const w = naturalW * scale;
  const h = naturalH * scale;
  const ann: ImageAnnotation = {
    id: nanoid(), type: "image", dataUrl,
    x: (page.width - w) / 2, y: (page.height - h) / 2, width: w, height: h,
  };
  st.addAnnotation(page.id, ann);
  st.setTool("select");
}

export function Toolbar() {
  const activeTool = useEditor((s) => s.activeTool);
  const setTool = useEditor((s) => s.setTool);
  const tool = useEditor((s) => s.tool);
  const setToolSettings = useEditor((s) => s.setToolSettings);
  const zoom = useEditor((s) => s.zoom);
  const setZoom = useEditor((s) => s.setZoom);
  const zoomBy = useEditor((s) => s.zoomBy);
  const fileName = useEditor((s) => s.fileName);
  const reset = useEditor((s) => s.reset);
  const mergeFile = useEditor((s) => s.mergeFile);

  const openRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);

  const showStroke = ["ink", "rect", "ellipse", "line", "arrow"].includes(activeTool);
  const showColor =
    activeTool !== "select" && activeTool !== "edit" && activeTool !== "eraser" &&
    activeTool !== "image" && activeTool !== "signature";
  const showFont = activeTool === "text";
  const showFill = activeTool === "rect" || activeTool === "ellipse";

  function onPickTool(id: ToolId) {
    if (id === "image") { imageRef.current?.click(); return; }
    if (id === "signature") { setSigOpen(true); return; }
    setTool(id);
  }

  function onImageFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => placeImageCentered(dataUrl, img.naturalWidth, img.naturalHeight);
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function onSave() {
    setSaving(true);
    try {
      const { buildPdf } = await import("@/lib/pdf/save");
      const { getPdfiumDoc } = await import("@/lib/pdf/pdfium/registry");
      const { pages, sources } = useEditor.getState();
      // Stage 1: bake existing-content edits via PDFium (these bytes also have
      // intrinsic rotation normalized to 0). Stage 2: pdf-lib assembles page
      // order/rotation and overlay annotations.
      const sourceBytes: Record<string, Uint8Array> = {};
      for (const id of Object.keys(sources)) {
        const docP = getPdfiumDoc(id);
        sourceBytes[id] = docP ? (await docP).save() : sources[id].bytes;
      }
      const bytes = await buildPdf({ pages, sourceBytes });
      const ab = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(ab).set(bytes);
      const name = fileName.replace(/\.pdf$/i, "") || "document";
      downloadBlob(new Blob([ab], { type: "application/pdf" }), `${name}-edited.pdf`);
    } catch (e) {
      console.error(e);
      alert("Failed to export PDF: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <header className="flex flex-col border-b border-border bg-panel">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* File group */}
        <div className="flex items-center gap-1">
          <Tooltip label="Open another PDF">
            <IconButton onClick={() => openRef.current?.click()}>
              <FolderOpen className="h-4.5 w-4.5" />
            </IconButton>
          </Tooltip>
          <Tooltip label="Append a PDF (merge)">
            <IconButton onClick={() => mergeRef.current?.click()}>
              <FilePlus2 className="h-4.5 w-4.5" />
            </IconButton>
          </Tooltip>
        </div>

        <Separator.Root orientation="vertical" className="mx-1 h-6 w-px bg-border" />

        {/* Tools */}
        <ToggleGroup.Root
          type="single"
          value={activeTool}
          onValueChange={(v) => v && onPickTool(v as ToolId)}
          className="flex items-center gap-0.5"
        >
          {TOOLS.map(({ id, icon: Icon, label }) => (
            <Tooltip key={id} label={label}>
              <ToggleGroup.Item value={id} asChild>
                <IconButton variant={activeTool === id ? "active" : "ghost"}>
                  <Icon className="h-4.5 w-4.5" />
                </IconButton>
              </ToggleGroup.Item>
            </Tooltip>
          ))}
        </ToggleGroup.Root>

        <div className="flex-1" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <IconButton onClick={() => zoomBy(-0.2)}><ZoomOut className="h-4.5 w-4.5" /></IconButton>
          <button
            onClick={() => setZoom(1)}
            className="w-14 rounded px-1 py-1 text-center text-xs text-muted hover:text-foreground"
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton onClick={() => zoomBy(0.2)}><ZoomIn className="h-4.5 w-4.5" /></IconButton>
        </div>

        <Separator.Root orientation="vertical" className="mx-1 h-6 w-px bg-border" />

        <Tooltip label="Download edited PDF">
          <button
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </button>
        </Tooltip>
      </div>

      {/* Contextual settings strip */}
      {(showColor || showStroke || showFont || showFill) && (
        <div className="flex items-center gap-4 border-t border-border px-3 py-1.5 text-xs text-muted">
          {showColor && (
            <div className="flex items-center gap-1.5">
              <span>Color</span>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setToolSettings({ color: c })}
                  className="h-5 w-5 rounded-full ring-1 ring-border transition hover:scale-110"
                  style={{ background: c, outline: tool.color === c ? "2px solid var(--accent)" : "none", outlineOffset: 1 }}
                />
              ))}
              <input
                type="color"
                value={tool.color}
                onChange={(e) => setToolSettings({ color: e.target.value })}
                className="h-5 w-6 cursor-pointer rounded bg-transparent"
              />
            </div>
          )}
          {showStroke && (
            <label className="flex items-center gap-2">
              <span>Width</span>
              <input
                type="range" min={1} max={24} value={tool.strokeWidth}
                onChange={(e) => setToolSettings({ strokeWidth: Number(e.target.value) })}
              />
              <span className="w-5 tabular-nums">{tool.strokeWidth}</span>
            </label>
          )}
          {showFont && (
            <label className="flex items-center gap-2">
              <span>Size</span>
              <input
                type="range" min={8} max={72} value={tool.fontSize}
                onChange={(e) => setToolSettings({ fontSize: Number(e.target.value) })}
              />
              <span className="w-6 tabular-nums">{tool.fontSize}px</span>
            </label>
          )}
          {showFill && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox" checked={tool.fill}
                onChange={(e) => setToolSettings({ fill: e.target.checked })}
              />
              <span>Fill</span>
            </label>
          )}
        </div>
      )}

      {/* Hidden inputs + dialogs */}
      <input ref={openRef} type="file" accept="application/pdf,.pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { reset(); void useEditor.getState().loadFile(f); } }} />
      <input ref={mergeRef} type="file" accept="application/pdf,.pdf" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void mergeFile(f); e.target.value = ""; }} />
      <input ref={imageRef} type="file" accept="image/png,image/jpeg" hidden
        onChange={(e) => { onImageFile(e.target.files?.[0]); e.target.value = ""; }} />
      <SignatureDialog
        open={sigOpen}
        onOpenChange={setSigOpen}
        onConfirm={(dataUrl, w, h) => { placeImageCentered(dataUrl, w, h); setSigOpen(false); }}
      />
    </header>
  );
}
