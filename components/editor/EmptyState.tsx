"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { useEditor } from "@/lib/store";
import { cn } from "@/lib/utils";

export function EmptyState() {
  const loadFile = useEditor((s) => s.loadFile);
  const status = useEditor((s) => s.status);
  const error = useEditor((s) => s.error);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const loading = status === "loading";

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (file) void loadFile(file);
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex w-full max-w-xl cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-16 text-center transition-colors",
          dragging
            ? "border-accent bg-accent/10"
            : "border-border bg-panel hover:border-muted",
        )}
      >
        {loading ? (
          <Loader2 className="h-10 w-10 animate-spin text-accent" />
        ) : (
          <FileUp className="h-10 w-10 text-muted" />
        )}
        <div>
          <p className="text-lg font-medium">
            {loading ? "Opening PDF…" : "Drop a PDF here, or click to browse"}
          </p>
          <p className="mt-1 text-sm text-muted">
            Everything stays on your device — nothing is uploaded.
          </p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => pick(e.target.files)}
        />
      </div>
    </div>
  );
}
