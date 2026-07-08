/**
 * Shared screen<->page coordinate helpers for the overlay.
 *
 * The page container is rotated via CSS, so we invert that rotation to recover
 * coordinates in unrotated page-point space (the space annotations are stored
 * in). `el` must be an element that exactly covers the unrotated media box
 * (e.g. the overlay layer), sized mediaW*zoom x mediaH*zoom.
 */
export function toPagePoint(
  e: { clientX: number; clientY: number },
  el: HTMLElement,
  rotation: number,
  mediaW: number,
  mediaH: number,
  zoom: number,
) {
  return toPagePointFromRect(e, el.getBoundingClientRect(), rotation, mediaW, mediaH, zoom);
}

/**
 * Same mapping as {@link toPagePoint} but against a pre-measured rect. Reading
 * `getBoundingClientRect()` on every pointermove forces a synchronous layout;
 * during a drag we measure once (see {@link trackRect}) and reuse it, so moves
 * stay off the layout critical path.
 */
export function toPagePointFromRect(
  e: { clientX: number; clientY: number },
  rect: DOMRect, // axis-aligned bbox of the rotated element
  rotation: number,
  mediaW: number,
  mediaH: number,
  zoom: number,
) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const rad = (-rotation * Math.PI) / 180;
  const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    x: (rx + (mediaW * zoom) / 2) / zoom,
    y: (ry + (mediaH * zoom) / 2) / zoom,
  };
}

export interface RectTracker {
  /** The element's current viewport rect (kept fresh across scroll/resize). */
  get(): DOMRect;
  /** Stop listening - call on pointerup / gesture end. */
  dispose(): void;
}

/**
 * Measure `el`'s rect once and keep it current for the life of a drag without
 * re-measuring on every pointermove. The rect only changes when the page
 * scrolls or resizes, so we refresh on exactly those (capture-phase `scroll`
 * catches scrolling of any ancestor, e.g. the page viewport).
 */
export function trackRect(el: HTMLElement): RectTracker {
  let rect = el.getBoundingClientRect();
  const update = () => {
    rect = el.getBoundingClientRect();
  };
  window.addEventListener("scroll", update, true);
  window.addEventListener("resize", update);
  return {
    get: () => rect,
    dispose: () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    },
  };
}
