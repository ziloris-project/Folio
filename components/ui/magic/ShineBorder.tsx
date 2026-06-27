import { cn } from "@/lib/utils";

/**
 * A conic neon border that slowly travels around its container. Rendered as a
 * masked overlay so it only paints the 1px ring, never the fill — drop it as a
 * sibling inside a `relative` element.
 */
export function ShineBorder({
  className,
  borderWidth = 1,
  duration = 9,
  colors = ["var(--neon-cyan)", "var(--neon-iris)"],
}: {
  className?: string;
  borderWidth?: number;
  duration?: number;
  colors?: string[];
}) {
  return (
    <div
      aria-hidden
      style={
        {
          "--shine-duration": `${duration}s`,
          padding: `${borderWidth}px`,
          backgroundImage: `linear-gradient(90deg, transparent, ${colors.join(
            ", ",
          )}, transparent)`,
          WebkitMask:
            "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        } as React.CSSProperties
      }
      className={cn(
        "animate-shine pointer-events-none absolute inset-0 rounded-[inherit]",
        className,
      )}
    />
  );
}
