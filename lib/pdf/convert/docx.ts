"use client";

import type { Block } from "./blocks";

/**
 * Convert a .docx file's bytes into our block model, in the browser. We use
 * mammoth's browser build (no Node built-ins) to get semantic HTML, then parse
 * that into blocks for the PDF renderer.
 */
export async function docxToBlocks(arrayBuffer: ArrayBuffer): Promise<Block[]> {
  const mammoth = await import("mammoth/mammoth.browser.js");
  const { htmlToBlocks } = await import("./blocks");
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToBlocks(html);
}
