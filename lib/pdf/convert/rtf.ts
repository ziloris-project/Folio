import type { Block, Run } from "./blocks";

/**
 * Minimal RTF -> block converter. RTF has no real document model beyond a tree
 * of groups and control words, so we extract paragraphs of styled text: enough
 * for a readable, editable PDF. Font tables, colors, images, headers/footers
 * and other destinations are skipped.
 */

// Common Windows-1252 punctuation in the 0x80-0x9F range (smart quotes, dashes).
const CP1252: Record<number, string> = {
  0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”",
  0x95: "•", 0x96: "–", 0x97: "—", 0x85: "…",
};

const IGNORE_DEST = new Set([
  "fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer",
  "footerf", "headerf", "footnote", "annotation", "xmlnstbl", "themedata",
  "colorschememapping", "latentstyles", "datastore", "generator", "listtable",
  "listoverridetable", "revtbl", "rsidtbl",
]);

function byteToChar(code: number): string {
  return CP1252[code] ?? String.fromCharCode(code);
}

export function rtfToBlocks(rtf: string): Block[] {
  const blocks: Block[] = [];
  let runs: Run[] = [];
  let text = "";
  let bold = false;
  let italic = false;
  let ignore = false;
  let ucSkip = 1; // chars to swallow after a \uN unicode escape
  let skip = 0;

  const stack: { bold: boolean; italic: boolean; ignore: boolean; ucSkip: number }[] = [];

  const flushText = () => {
    if (text) {
      runs.push({ text, bold, italic });
      text = "";
    }
  };
  const endPara = () => {
    flushText();
    blocks.push({ type: "p", runs });
    runs = [];
  };
  const emit = (s: string) => {
    if (ignore) return;
    if (skip > 0) { skip -= s.length; return; }
    text += s;
  };

  const n = rtf.length;
  let i = 0;
  while (i < n) {
    const c = rtf[i];

    if (c === "{") {
      stack.push({ bold, italic, ignore, ucSkip });
      i++;
    } else if (c === "}") {
      flushText();
      const s = stack.pop();
      if (s) ({ bold, italic, ignore, ucSkip } = s);
      i++;
    } else if (c === "\\") {
      const next = rtf[i + 1];
      if (next === "\\" || next === "{" || next === "}") {
        emit(next);
        i += 2;
        continue;
      }
      if (next === "'") {
        const code = parseInt(rtf.substr(i + 2, 2), 16);
        if (!Number.isNaN(code)) emit(byteToChar(code));
        i += 4;
        continue;
      }
      if (next === "*") { ignore = true; i += 2; continue; }
      if (next === "~") { emit(" "); i += 2; continue; }
      if (next === "-") { i += 2; continue; } // optional hyphen
      if (next === "_") { emit("‑"); i += 2; continue; } // non-breaking hyphen
      if (next === "\n" || next === "\r") { endPara(); i += 2; continue; }

      // Control word: letters, optional signed number, optional single space.
      let j = i + 1;
      let word = "";
      while (j < n && rtf[j] >= "a" && rtf[j] <= "z") { word += rtf[j]; j++; }
      // (uppercase control words don't exist in RTF, but be lenient)
      while (j < n && /[a-zA-Z]/.test(rtf[j])) { word += rtf[j]; j++; }
      let numStr = "";
      if (rtf[j] === "-") { numStr = "-"; j++; }
      while (j < n && rtf[j] >= "0" && rtf[j] <= "9") { numStr += rtf[j]; j++; }
      if (rtf[j] === " ") j++;
      const param = numStr === "" || numStr === "-" ? null : parseInt(numStr, 10);
      i = j;

      switch (word) {
        case "par":
        case "sect":
          if (!ignore) endPara();
          break;
        case "line":
          emit("\n");
          break;
        case "tab":
          emit("    ");
          break;
        case "emdash": emit("—"); break;
        case "endash": emit("–"); break;
        case "lquote": emit("‘"); break;
        case "rquote": emit("’"); break;
        case "ldblquote": emit("“"); break;
        case "rdblquote": emit("”"); break;
        case "bullet": emit("•"); break;
        case "b": flushText(); bold = param !== 0; break;
        case "i": flushText(); italic = param !== 0; break;
        case "uc": ucSkip = param ?? 1; break;
        case "u":
          if (param !== null) { emit(String.fromCharCode(param < 0 ? param + 65536 : param)); skip = ucSkip; }
          break;
        default:
          if (IGNORE_DEST.has(word)) ignore = true;
      }
    } else if (c === "\r" || c === "\n") {
      i++; // raw line breaks are insignificant in RTF
    } else {
      emit(c);
      i++;
    }
  }

  flushText();
  if (runs.length) blocks.push({ type: "p", runs });
  return blocks.filter((b) => b.runs.some((r) => r.text.trim().length > 0));
}
