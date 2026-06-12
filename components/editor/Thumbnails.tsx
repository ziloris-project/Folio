"use client";

import { useState } from "react";
import {
  RotateCw,
  Trash2,
  Copy,
  Plus,
} from "lucide-react";
import { useEditor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Thumbnail } from "./Thumbnail";
import { Tooltip } from "../ui/Tooltip";

export function Thumbnails() {
  const pages = useEditor((s) => s.pages);
  const selectedPageId = useEditor((s) => s.selectedPageId);
  const selectPage = useEditor((s) => s.selectPage);
  const rotatePage = useEditor((s) => s.rotatePage);
  const deletePage = useEditor((s) => s.deletePage);
  const duplicatePage = useEditor((s) => s.duplicatePage);
  const insertBlankPage = useEditor((s) => s.insertBlankPage);
  const movePage = useEditor((s) => s.movePage);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function scrollToPage(id: string) {
    selectPage(id);
    document.getElementById(`page-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-panel">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted">
        <span>Pages ({pages.length})</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        <ol className="flex flex-col gap-3">
          {pages.map((page, i) => {
            const selected = page.id === selectedPageId;
            return (
              <li
                key={page.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIndex(i);
                }}
                onDragEnd={() => {
                  if (dragIndex !== null && overIndex !== null) movePage(dragIndex, overIndex);
                  setDragIndex(null);
                  setOverIndex(null);
                }}
                className={cn(
                  "group relative flex flex-col items-center gap-1 rounded-lg p-2 transition-colors",
                  overIndex === i && dragIndex !== null && dragIndex !== i
                    ? "ring-2 ring-accent"
                    : "ring-1 ring-transparent",
                  selected ? "bg-panel-2" : "hover:bg-panel-2/50",
                )}
              >
                <button
                  onClick={() => scrollToPage(page.id)}
                  className="flex flex-col items-center"
                >
                  <div className={cn("rounded ring-1", selected ? "ring-accent" : "ring-border")}>
                    <Thumbnail page={page} />
                  </div>
                  <span className="mt-1 text-xs text-muted">{i + 1}</span>
                </button>

                {/* Hover action bar */}
                <div className="absolute right-2 top-2 flex gap-0.5 rounded-md bg-background/80 p-0.5 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100">
                  <Tooltip label="Rotate" side="top">
                    <button
                      onClick={() => rotatePage(page.id, 1)}
                      className="rounded p-1 text-muted hover:text-foreground hover:bg-panel-2"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Duplicate" side="top">
                    <button
                      onClick={() => duplicatePage(page.id)}
                      className="rounded p-1 text-muted hover:text-foreground hover:bg-panel-2"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Insert blank after" side="top">
                    <button
                      onClick={() => insertBlankPage(i)}
                      className="rounded p-1 text-muted hover:text-foreground hover:bg-panel-2"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                  <Tooltip label="Delete" side="top">
                    <button
                      onClick={() => deletePage(page.id)}
                      disabled={pages.length === 1}
                      className="rounded p-1 text-muted hover:text-red-400 hover:bg-panel-2 disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
