import { cn } from "@/lib/utils";

/**
 * The Folio logo glyph: a geometric "F" with its stem sliced off at an angle,
 * filled with the cyan->indigo landing gradient. Meant to sit immediately left
 * of the "Folio" wordmark. Hand-built path - not a font letter or stock icon.
 */
export function FolioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn("text-neon-cyan", className)}
    >
      <defs>
        <linearGradient
          id="folio-f"
          x1="7"
          y1="5"
          x2="17"
          y2="19"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--neon-cyan)" />
          <stop offset="1" stopColor="var(--neon-iris)" />
        </linearGradient>
      </defs>
      <path
        d="M7 5.5H17.5V8.6H11V10.9H15.7V14H11V18.7L7 16.2Z"
        fill="url(#folio-f)"
      />
    </svg>
  );
}
