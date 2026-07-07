import { cn } from "@/lib/utils";

/**
 * An animated perspective grid that scrolls toward a vanishing point —
 * the neon backdrop for the landing hero. Pure CSS; no JS per frame.
 */
export function RetroGrid({
  className,
  cellSize = 56,
  opacity = 0.22,
}: {
  className?: string;
  cellSize?: number;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden [perspective:220px]",
        className,
      )}
      style={{ opacity }}
    >
      <div className="absolute inset-0 [transform:rotateX(58deg)]">
        <div
          className="animate-grid-scroll absolute -inset-x-[120%] -top-[60%] h-[260%]
            [background-image:linear-gradient(to_right,color-mix(in_oklab,var(--neon-iris)_50%,transparent)_1px,transparent_0),linear-gradient(to_bottom,color-mix(in_oklab,var(--neon-iris)_50%,transparent)_1px,transparent_0)]
            [background-repeat:repeat]"
          style={
            {
              "--grid-cell": `${cellSize}px`,
              backgroundSize: `${cellSize}px ${cellSize}px`,
            } as React.CSSProperties
          }
        />
      </div>
      {/* Fade the grid into the page toward the horizon. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#06060a]" />
    </div>
  );
}
