"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2, Type, Square, Image as ImageIcon, Shapes } from "lucide-react";
import { useEditor } from "@/lib/store";
import { STANDARD_FONTS, type PageObject, type RGBA } from "@/lib/pdf/types";

function toHex({ r, g, b }: RGBA) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex: string, a = 255): RGBA {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

/** Range input that previews locally and commits to the store on release. */
function CommitSlider({
  value, min, max, step = 1, onCommit, label, suffix = "",
}: {
  value: number; min: number; max: number; step?: number;
  onCommit: (v: number) => void; label: string; suffix?: string;
}) {
  const [local, setLocal] = useState(value);
  // Sync external value → local during render (React-recommended over effects).
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setLocal(value);
  }
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={local}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        className="flex-1"
      />
      <span className="w-10 text-right tabular-nums text-foreground">
        {Math.round(local)}{suffix}
      </span>
    </label>
  );
}

function ColorRow({ label, color, onChange }: { label: string; color: RGBA; onChange: (c: RGBA) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="w-14 shrink-0">{label}</span>
      <input
        type="color"
        value={toHex(color)}
        onChange={(e) => onChange(fromHex(e.target.value, color.a))}
        className="h-7 w-10 cursor-pointer rounded bg-transparent"
      />
      <span className="tabular-nums text-foreground">{toHex(color)}</span>
    </label>
  );
}

const ICON = { text: Type, path: Square, image: ImageIcon, other: Shapes } as const;

export function Inspector() {
  const selectedObject = useEditor((s) => s.selectedObject);
  const pageObjects = useEditor((s) => s.pageObjects);
  const editObjectText = useEditor((s) => s.editObjectText);
  const setObjectColor = useEditor((s) => s.setObjectColor);
  const setObjectStrokeWidthValue = useEditor((s) => s.setObjectStrokeWidthValue);
  const setObjectFontSizeValue = useEditor((s) => s.setObjectFontSizeValue);
  const setObjectFontName = useEditor((s) => s.setObjectFontName);
  const deleteObject = useEditor((s) => s.deleteObject);

  const obj: PageObject | undefined = selectedObject
    ? pageObjects[selectedObject.pageId]?.find((o) => o.index === selectedObject.index)
    : undefined;

  // Local text buffer, re-seeded when the selected object changes (render-phase
  // sync keyed on object identity, so typing isn't clobbered by re-list).
  const objKey = selectedObject ? `${selectedObject.pageId}:${selectedObject.index}` : "";
  const [text, setText] = useState(obj?.type === "text" ? obj.text : "");
  const [prevKey, setPrevKey] = useState(objKey);
  if (prevKey !== objKey) {
    setPrevKey(objKey);
    setText(obj?.type === "text" ? obj.text : "");
  }

  // Smart edit: selecting a text object drops the caret straight into its editor,
  // so clicking page text lands you in the text field without a second click
  // (an image/shape has no editor, so it just stays selected for moving).
  const isText = obj?.type === "text";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!isText) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, [objKey, isText]);

  // Debounce live text apply - each apply regenerates the page, so we wait for a
  // pause in typing rather than firing on every keystroke.
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyTextDebounced = (pageId: string, index: number, value: string) => {
    if (applyTimer.current) clearTimeout(applyTimer.current);
    applyTimer.current = setTimeout(() => void editObjectText(pageId, index, value), 400);
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-panel">
      <div className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted">
        Inspector
      </div>

      {!obj ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
          Select any text, shape, line or image on the page to edit it.
        </div>
      ) : (
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          <div className="flex items-center gap-2 text-sm font-medium capitalize">
            {(() => {
              const Icon = ICON[obj.type];
              return <Icon className="h-4 w-4 text-accent" />;
            })()}
            {obj.type} object
          </div>

          {obj.type === "text" && selectedObject && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted">Text</span>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    applyTextDebounced(selectedObject.pageId, obj.index, e.target.value);
                  }}
                  onBlur={() => {
                    if (applyTimer.current) clearTimeout(applyTimer.current);
                    if (text !== obj.text) void editObjectText(selectedObject.pageId, obj.index, text);
                  }}
                  rows={3}
                  className="resize-none rounded-md border border-border bg-panel-2 p-2 text-sm text-foreground outline-none focus:border-accent"
                />
                <span className="text-[11px] text-muted">Applies as you type.</span>
              </div>
              <CommitSlider
                label="Size" min={4} max={96} value={Math.round(obj.fontSize)}
                onCommit={(v) => void setObjectFontSizeValue(selectedObject.pageId, obj.index, obj.fontSize, v)}
                suffix="pt"
              />
              <ColorRow
                label="Color" color={obj.color}
                onChange={(c) => void setObjectColor(selectedObject.pageId, obj.index, c, "fill")}
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                <span className="w-14 shrink-0">Font</span>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) void setObjectFontName(selectedObject.pageId, obj.index, e.target.value);
                  }}
                  className="flex-1 rounded-md border border-border bg-panel-2 px-2 py-1 text-foreground outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    {obj.fontName || "Replace font…"}
                  </option>
                  {STANDARD_FONTS.map((fn) => (
                    <option key={fn} value={fn}>{fn}</option>
                  ))}
                </select>
              </label>
              <p className="text-[11px] text-muted">
                Replacing the font guarantees typed characters render (the original may be a
                subset font missing glyphs) and enables multi-line text (use line breaks).
              </p>
            </>
          )}

          {obj.type === "path" && selectedObject && (
            <>
              <ColorRow
                label="Stroke" color={obj.strokeColor}
                onChange={(c) => void setObjectColor(selectedObject.pageId, obj.index, c, "stroke")}
              />
              <CommitSlider
                label="Width" min={0} max={20} step={0.5} value={obj.strokeWidth}
                onCommit={(v) => void setObjectStrokeWidthValue(selectedObject.pageId, obj.index, v)}
                suffix="pt"
              />
              <ColorRow
                label="Fill" color={obj.fillColor}
                onChange={(c) => void setObjectColor(selectedObject.pageId, obj.index, c, "fill")}
              />
            </>
          )}

          {obj.type === "image" && (
            <p className="text-xs text-muted">Drag to reposition. Use the toolbar to delete or replace.</p>
          )}

          <button
            onClick={() => selectedObject && void deleteObject(selectedObject.pageId, obj.index)}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-panel-2 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Delete object
          </button>
        </div>
      )}
    </aside>
  );
}
