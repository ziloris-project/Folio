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
  const rect = el.getBoundingClientRect(); // axis-aligned bbox of the rotated element
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
