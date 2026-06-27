import { cn } from "@/lib/utils";

/**
 * The Folio wordmark glyph: a single sheet with a dog-eared corner (a "folio"
 * is one leaf of paper) and two text rules, drawn monoline with the cyan→indigo
 * landing gradient. Hand-drawn paths — not an off-the-shelf icon.
 */
export function FolioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden
      className={cn("text-neon-cyan", className)}
    >
      <defs>
        <linearGradient
          id="folio-mark"
          x1="6"
          y1="4"
          x2="22"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--neon-cyan)" />
          <stop offset="1" stopColor="var(--neon-iris)" />
        </linearGradient>
      </defs>
      {/* Sheet outline with the corner cut away for the fold. */}
      <path
        d="M9 3.75H16L22 9.75V22A2 2 0 0 1 20 24H9A2 2 0 0 1 7 22V5.75A2 2 0 0 1 9 3.75Z"
        stroke="url(#folio-mark)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* The dog-ear. */}
      <path
        d="M16 3.75V9.75H22"
        stroke="url(#folio-mark)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Three text rules. */}
      <path
        d="M11 18H18M11 14.5H18M11 11H14.5"
        stroke="url(#folio-mark)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
