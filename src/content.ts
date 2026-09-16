import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { EntryInput } from "./dictionary.ts";

export function plainMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+.!|~$-])/g, "\\$1")
    .replace(/\n/g, "  \n");
}

export function formulaBody(value: string): string {
  let formula = value.trim();
  for (const [open, close] of [
    ["$$", "$$"],
    ["\\[", "\\]"],
    ["\\(", "\\)"],
    ["\\begin{equation}", "\\end{equation}"],
    ["\\begin{math}", "\\end{math}"],
  ]) {
    if (formula.startsWith(open) && formula.endsWith(close)) {
      formula = formula.slice(open.length, -close.length).trim();
      break;
    }
  }
  // Keep the formula inside one math block; never allow injected Markdown/HTML images.
  if (formula.includes("$$") || /!\s*\[|<\s*\/?[a-z][^>]*>/i.test(formula))
    throw new Error(
      "数式欄にはLaTeXの数式を1つ入力してください。画像は画像欄で添付できます。",
    );
  return formula;
}

export function entryMarkdown(
  entry: EntryInput,
  imagePaths: string[] = [],
): string {
  const text = [
    `# ${plainMarkdown(entry.term || "プレビュー")}`,
    entry.reading ? plainMarkdown(entry.reading) : "",
    entry.description
      ? plainMarkdown(entry.description)
      : "説明はまだありません。",
  ];
  if (entry.formula?.trim()) {
    try {
      text.push(`## 数式\n\n$$\n${formulaBody(entry.formula)}\n$$`);
    } catch (error) {
      text.push(
        plainMarkdown(error instanceof Error ? error.message : String(error)),
      );
    }
  }
  for (const path of imagePaths) {
    const url = pathToFileURL(path).href;
    text.push(`![添付画像](${url})`);
  }
  return text.filter(Boolean).join("\n\n");
}

export function savedImagePaths(
  directory: string,
  images: string[] = [],
): string[] {
  return images.map((name) => join(directory, "images", name));
}
