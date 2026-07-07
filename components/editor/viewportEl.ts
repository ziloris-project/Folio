"use client";

/**
 * Shared reference to the scrolling viewport element. Set by <Viewport/>, read
 * by the toolbar's fit-to-width action. Kept outside React state because it's a
 * DOM handle, not reactive data.
 */
export const viewportEl: { current: HTMLDivElement | null } = { current: null };
