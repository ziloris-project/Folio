"use client";

import { useRef, useState } from "react";
import { motion } from "motion/react";
import { FileUp, Loader2, Star, Check, ChevronDown } from "lucide-react";
import { useEditor } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RetroGrid } from "../ui/magic/RetroGrid";
import { ShineBorder } from "../ui/magic/ShineBorder";
import { AuroraText } from "../ui/magic/AuroraText";
import { FolioMark } from "../ui/magic/FolioMark";

const FREE_POINTS = [
  "No sign-up or login",
  "No watermarks, ever",
  "No page or file-size caps",
  "Unlimited edits and exports",
  "No paywalled tools",
  "Open source under MIT",
];

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
    <div className="h-screen overflow-y-auto bg-[#06060a] text-foreground">
      {/* ───────────────── Hero ───────────────── */}
      <section className="relative flex min-h-screen flex-col overflow-hidden">
        <RetroGrid />
        {/* Soft glow pooling behind the upload card. */}
        <div className="pointer-events-none absolute left-1/2 top-[46%] z-0 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--neon-iris)_18%,transparent),transparent_68%)] blur-2xl" />

        {/* Top bar */}
        <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
          <div className="flex items-center gap-2.5">
            <FolioMark className="h-6 w-6 [filter:drop-shadow(0_0_7px_color-mix(in_oklab,var(--neon-cyan)_45%,transparent))]" />
            <span className="text-[15px] font-semibold tracking-tight">Folio</span>
          </div>
          <a
            href="https://github.com/ziloris-project/Folio"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <Star className="h-4 w-4" />
            <span className="hidden sm:inline">Star on GitHub</span>
          </a>
        </header>

        <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Edit PDFs. No limits.{" "}
              <AuroraText>Free.</AuroraText>
            </h1>

            <p className="mt-5 max-w-md text-balance text-[15px] leading-relaxed text-muted">
              Every tool, unlocked. Rewrite text, sign, reorder pages and export
              — no account, no watermark, nothing uploaded.
            </p>
          </motion.div>

          {/* Upload card */}
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="relative mt-10 w-full max-w-md"
          >
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  inputRef.current?.click();
              }}
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
                "group relative isolate flex cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-2xl border bg-white/[0.02] px-8 py-12 backdrop-blur-sm transition-colors",
                dragging
                  ? "border-neon-cyan/60 bg-neon-cyan/[0.06]"
                  : "border-white/10 hover:border-white/20",
              )}
            >
              <ShineBorder borderWidth={1} duration={dragging ? 3 : 9} />

              <span
                className={cn(
                  "grid h-14 w-14 place-items-center rounded-xl border border-white/10 bg-white/[0.04] transition-shadow",
                  dragging
                    ? "shadow-[0_0_30px_-6px_var(--neon-cyan)]"
                    : "shadow-[0_0_24px_-8px_var(--neon-iris)] group-hover:shadow-[0_0_30px_-6px_var(--neon-iris)]",
                )}
              >
                {loading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-neon-cyan" />
                ) : (
                  <FileUp className="h-6 w-6 text-neon-iris" />
                )}
              </span>

              <div className="space-y-1">
                <p className="text-base font-medium">
                  {loading
                    ? "Opening your PDF…"
                    : dragging
                      ? "Drop to open"
                      : "Drop a PDF, or click to browse"}
                </p>
                <p className="text-xs text-muted">
                  Any PDF · opens instantly · stays on your device
                </p>
              </div>

              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                hidden
                onChange={(e) => pick(e.target.files)}
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          </motion.div>
        </main>

        {/* Scroll cue */}
        <div className="relative z-10 flex justify-center pb-6 text-muted">
          <ChevronDown className="h-5 w-5 animate-bounce opacity-50" />
        </div>
      </section>

      {/* ───────────────── Free, everything ───────────────── */}
      <section className="relative border-t border-white/5 px-6 py-24 sm:py-28">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-3xl text-center"
        >
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-neon-cyan/80">
            No catch
          </p>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
            Free of cost. <AuroraText>Every last feature.</AuroraText>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-balance text-[15px] leading-relaxed text-muted">
            Most &ldquo;free&rdquo; PDF tools cap your pages, stamp a watermark,
            or hold export behind a subscription. Folio doesn&rsquo;t — because
            it runs on your machine, there&rsquo;s nothing to meter.
          </p>

          <ul className="mx-auto mt-10 grid max-w-xl gap-x-10 gap-y-4 text-left sm:grid-cols-2">
            {FREE_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3 text-[15px]">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neon-cyan/10 text-neon-cyan">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </motion.div>
      </section>

      {/* ───────────────── Footer ───────────────── */}
      <footer className="flex items-center justify-center gap-1.5 border-t border-white/5 px-6 py-5 text-xs text-muted sm:px-10">
        <span>© 2026 Folio</span>
        <span className="text-white/15">@</span>
        <a
          href="https://ziloris.com"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground/70 transition-colors hover:text-foreground"
        >
          ziloris
        </a>
      </footer>
    </div>
  );
}
