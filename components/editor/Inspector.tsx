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
  // What the user has actually typed, and which object it belongs to. Selecting
  // a line focuses this field, so moving from one line to the next fires a blur
  // with no edit behind it; committing that would rewrite (and re-wrap) a
  // paragraph nobody touched. Only a real keystroke puts something here.
  const pending = useRef<string | null>(null);
  // The typing session: which object live applies write to (see pump), and
  // what was last sent to it.
  const session = useRef<{ pageId: string; index: number; applied: string | null } | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const frame = useRef<number | null>(null);
  if (prevKey !== objKey) {
    setPrevKey(objKey);
    setText(obj?.type === "text" ? obj.text : "");
  }

  // Re-seed the buffer when the object's own text changes underneath it, which
  // happens when a re-wrap redistributes the paragraph and the selected line
  // ends up holding less than was typed into it. Guarded twice: an uncommitted
  // edit or a focused field means the user is mid-thought, and replacing what
  // they are typing with what is currently on the page would eat keystrokes.
  const objText = obj?.type === "text" ? obj.text : "";
  useEffect(() => {
    const ta = textareaRef.current;
    if (pending.current !== null) return;
    if (ta && document.activeElement === ta) return;
    setText(objText);
  }, [objText]);

  // Smart edit: selecting a text object drops the caret straight into its editor,
  // so clicking page text lands you in the text field without a second click
  // (an image/shape has no editor, so it just stays selected for moving).
  const isText = obj?.type === "text";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const ta = textareaRef.current;
    // A selection that changes while this field still has focus is the store
    // renumbering objects under an edit in progress (collapsing a line's runs
    // removes objects, which shifts every index above them). That is the same
    // line, not a new one: keep the uncommitted edit and leave the caret where
    // the user put it, or typing would jump to the end mid-word.
    if (ta && document.activeElement === ta) return;
    // A genuinely new selection, so any uncommitted edit belonged to the object
    // that just went away. Blur has already had its chance to commit it.
    pending.current = null;
    session.current = null;
    if (!isText || !ta) return;
    ta.focus();
    const end = ta.value.length;
    ta.setSelectionRange(end, end);
  }, [objKey, isText]);

  // Live apply. Typed text reaches the page on the next animation frame rather
  // than after a pause in typing: an apply no longer saves the document, takes
  // its own undo step or re-lists the page (see the store), so it is cheap
  // enough to run while the user types.
  //
  // At most one apply runs at a time. Keystrokes that land while one is in
  // flight are not queued one by one; when it finishes, the next apply takes
  // whatever the field holds by then, so a slow page coalesces typing instead
  // of falling further behind it.
  //
  // The session remembers which object it writes to, and follows it. The first
  // apply to a line made of several runs collapses them into one and renumbers
  // the page, and a keystroke already on its way still carries the old index,
  // which now names a different object. Serializing the applies and taking
  // each index from the one before is what keeps every write on this line.
  const pump = () => {
    frame.current = null;
    const s = session.current;
    const value = pending.current;
    if (inflight.current || !s || value === null || value === s.applied) return;
    s.applied = value;
    inflight.current = editObjectText(s.pageId, s.index, value).then((index) => {
      s.index = index;
      inflight.current = null;
      pump();
    });
  };

  const scheduleApply = () => {
    if (frame.current === null) frame.current = requestAnimationFrame(pump);
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
                    pending.current = e.target.value;
                    session.current ??= {
                      pageId: selectedObject.pageId,
                      index: obj.index,
                      applied: null,
                    };
                    scheduleApply();
                  }}
                  onKeyDown={(e) => {
                    // Esc leaves the field (Enter still inserts a newline);
                    // blur commits any pending change, matching on-page text.
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={() => {
                    // Committing is where the paragraph re-wraps. Doing it on
                    // every keystroke would move text between lines under the
                    // caret, so while typing the line just grows.
                    if (frame.current !== null) cancelAnimationFrame(frame.current);
                    frame.current = null;
                    const edit = pending.current;
                    const s = session.current;
                    // Nothing was typed, so there is nothing to commit. Blur
                    // fires just from moving between lines, and committing on
                    // that would rewrite and re-wrap a paragraph nobody touched.
                    if (edit === null || !s) return;
                    pending.current = null;
                    session.current = null;
                    // Behind any apply still running, so the commit reads the
                    // index that apply leaves the line at.
                    void (inflight.current ?? Promise.resolve()).then(() =>
                      editObjectText(s.pageId, s.index, edit, { reflow: true }),
                    );
                  }}
                  rows={3}
                  className="resize-none rounded-md border border-border bg-panel-2 p-2 text-sm text-foreground outline-none focus:border-accent"
                />
                <span className="text-[11px] text-muted">
                  Updates the page as you type. The paragraph re-wraps when you leave the field.
                </span>
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
                {/* Controlled and pinned to the placeholder: picking a font is an
                    action, not a setting the field keeps. Left uncontrolled, the
                    same element is reused for every line, so it went on showing
                    the last font chosen for a line that does not use it, and
                    choosing that font again fired no change event at all. */}
                <select
                  value=""
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
