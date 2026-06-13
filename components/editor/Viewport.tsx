"use client";

import { useEditor } from "@/lib/store";
import { PageView } from "./PageView";

export function Viewport() {
  const pages = useEditor((s) => s.pages);

  return (
    <div className="flex-1 overflow-auto bg-canvas">
      <div className="flex min-h-full flex-col items-center gap-6 py-10 pl-10 pr-6">
        {pages.map((page, i) => (
          <PageView key={page.id} page={page} index={i} />
        ))}
      </div>
    </div>
  );
}
