import { normalize, type EntryInput } from "./dictionary.ts";

// Matches the Glossary extension's existing two-column, first-comma import contract.
export function parseGlossaryCsv(text: string): EntryInput[] {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) throw new Error("CSVが空です。");
  const names = new Set<string>();
  return source.split(/\r?\n/).map((line, index) => {
    const comma = line.indexOf(",");
    const term = line.slice(0, comma).trim();
    const description = line
      .slice(comma + 1)
      .trim()
      .replace(/\\n/g, "\n");
    if (comma < 1 || !term || !description)
      throw new Error(`${index + 1}行目：用語,説明 の形式で入力してください。`);
    if (names.has(normalize(term)))
      throw new Error(`${index + 1}行目：用語が重複しています（${term}）。`);
    names.add(normalize(term));
    return { term, reading: "", description };
  });
}
