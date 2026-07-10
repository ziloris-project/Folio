/**
 * A tiny document block model shared by the .docx / .rtf importers. It captures
 * just enough structure - headings, paragraphs, list items and styled inline
 * runs - to lay out a readable, *editable-text* PDF with pdf-lib. Exact source
 * layout (columns, precise spacing, floats) is intentionally not preserved;
 * the goal is faithful content you can then edit in Folio.
 */

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type BlockType = "h1" | "h2" | "h3" | "p" | "li";

export interface Block {
  type: BlockType;
  runs: Run[];
  /** For list items: ordered (numbered) vs unordered (bulleted). */
  ordered?: boolean;
  /** 1-based number for ordered list items. */
  index?: number;
  /** List nesting depth (0 = top level), used for indentation. */
  level?: number;
}

const INLINE_BOLD = new Set(["b", "strong"]);
const INLINE_ITALIC = new Set(["i", "em"]);

/** Collect styled inline runs from an element, skipping nested lists (handled
 *  separately so they become their own blocks). */
function inlineRuns(node: Node, bold: boolean, italic: boolean, out: Run[]): void {
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3 /* text */) {
      const text = (n.textContent ?? "").replace(/\s+/g, " ");
      if (text) out.push({ text, bold, italic });
      return;
    }
    if (n.nodeType !== 1 /* element */) return;
    const el = n as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out.push({ text: "\n", bold, italic });
      return;
    }
    if (tag === "ul" || tag === "ol") return; // nested list: handled by walk()
    inlineRuns(el, bold || INLINE_BOLD.has(tag), italic || INLINE_ITALIC.has(tag), out);
  });
}

function runsOf(el: Element): Run[] {
  const runs: Run[] = [];
  inlineRuns(el, false, false, runs);
  return runs;
}

function walkList(list: Element, ordered: boolean, level: number, out: Block[]): void {
  let index = 1;
  list.childNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    const el = n as Element;
    if (el.tagName.toLowerCase() !== "li") return;
    out.push({ type: "li", runs: runsOf(el), ordered, index: index++, level });
    // Recurse into any nested lists inside this item.
    el.childNodes.forEach((c) => {
      if (c.nodeType !== 1) return;
      const ct = (c as Element).tagName.toLowerCase();
      if (ct === "ul" || ct === "ol") walkList(c as Element, ct === "ol", level + 1, out);
    });
  });
}

function walk(root: Node, out: Block[]): void {
  root.childNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    const el = n as Element;
    switch (el.tagName.toLowerCase()) {
      case "h1":
        out.push({ type: "h1", runs: runsOf(el) });
        break;
      case "h2":
        out.push({ type: "h2", runs: runsOf(el) });
        break;
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        out.push({ type: "h3", runs: runsOf(el) });
        break;
      case "p":
        out.push({ type: "p", runs: runsOf(el) });
        break;
      case "ul":
        walkList(el, false, 0, out);
        break;
      case "ol":
        walkList(el, true, 0, out);
        break;
      case "table":
        // Flatten each row to a tab-separated paragraph.
        el.querySelectorAll("tr").forEach((tr) => {
          const runs: Run[] = [];
          tr.querySelectorAll("td, th").forEach((cell, i) => {
            if (i > 0) runs.push({ text: "    ", bold: false, italic: false });
            inlineRuns(cell, false, false, runs);
          });
          if (runs.length) out.push({ type: "p", runs });
        });
        break;
      default:
        walk(el, out); // div/section/article/etc.
    }
  });
}

/**
 * Parse an HTML fragment (as produced by mammoth) into a flat block list.
 * Browser-only: relies on the DOM's `DOMParser`.
 */
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks: Block[] = [];
  walk(doc.body, blocks);
  return blocks;
}
