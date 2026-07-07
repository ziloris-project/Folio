import { cn } from "@/lib/utils";

/**
 * Renders inline text filled with a slowly drifting neon gradient. Used for the
 * single emphasised word in the hero headline so the rest stays legible.
 */
export function AuroraText({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "animate-aurora bg-clip-text text-transparent",
        "[background-image:linear-gradient(110deg,var(--neon-cyan),var(--neon-iris),var(--neon-cyan))]",
        className,
      )}
    >
      {children}
    </span>
  );
}
