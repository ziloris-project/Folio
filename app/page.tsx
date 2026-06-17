"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

// The editor is browser-only (pdf.js web worker, canvas, File APIs), so we load
// it client-side with no SSR. This also keeps the heavy pdf.js/pdf-lib bundles
// out of the server graph.
const Editor = dynamic(
  () => import("@/components/editor/Editor").then((m) => m.Editor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    ),
  },
);

export default function Home() {
  return <Editor />;
}
