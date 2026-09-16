import { formulaBody } from "./content.ts";
import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { copyImages, isImageName } from "./media.ts";
import { dirname, join } from "node:path";

export type Entry = {
  id: string;
  term: string;
  reading: string;
  description: string;
  referenceUrl?: string;
  formula?: string;
  images?: string[];
};
export type EntryInput = Pick<
  Entry,
  "term" | "reading" | "description" | "referenceUrl" | "formula"
>;
export type EntryDraft = EntryInput & {
  imagePaths?: string[];
  removedImages?: string[];
};
type Dictionary = { version: 1; entries: Entry[] };

export function isValidReferenceUrl(value: string): boolean {
  if (!value.trim()) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .trim();
}

export function searchEntries(entries: Entry[], query: string): Entry[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const text = normalize(
      `${entry.term}\n${entry.reading}\n${entry.description}`,
    );
    return words.every((word) => text.includes(word));
  });
}

export function readDictionary(path: string): Entry[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(
      "辞書ファイルを読み込めません。保存先のアクセス権を確認してください。",
      { cause: error },
    );
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (
      typeof data !== "object" ||
      data === null ||
      !("version" in data) ||
      data.version !== 1 ||
      !("entries" in data) ||
      !Array.isArray(data.entries)
    )
      throw new Error("Invalid schema");
    const ids = new Set<string>();
    for (const entry of data.entries) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        typeof entry.id !== "string" ||
        !entry.id ||
        ids.has(entry.id) ||
        typeof entry.term !== "string" ||
        !entry.term.trim() ||
        typeof entry.reading !== "string" ||
        typeof entry.description !== "string" ||
        (entry.referenceUrl !== undefined &&
          (typeof entry.referenceUrl !== "string" ||
            !isValidReferenceUrl(entry.referenceUrl))) ||
        (entry.formula !== undefined && typeof entry.formula !== "string") ||
        (entry.images !== undefined &&
          (!Array.isArray(entry.images) || !entry.images.every(isImageName)))
      )
        throw new Error("Invalid entry");
      ids.add(entry.id);
    }
    return data.entries as Entry[];
  } catch (error) {
    throw new Error(
      "辞書の形式を読み取れません。既存ファイルは変更していません。",
      { cause: error },
    );
  }
}

export function cleanInput(input: EntryInput): EntryInput {
  const referenceUrl = input.referenceUrl?.trim() ?? "";
  if (!isValidReferenceUrl(referenceUrl))
    throw new Error(
      "参考URLは https:// または http:// で始まるURLを入力してください。",
    );
  const formula = formulaBody(input.formula ?? "");
  if (!input.term.trim()) throw new Error("用語を入力してください。");
  return {
    term: input.term.trim(),
    reading: input.reading.trim(),
    description: input.description.trim(),
    ...(referenceUrl ? { referenceUrl } : {}),
    ...(formula ? { formula } : {}),
  };
}

// Synchronous read/modify/rename under a filesystem lock protects separate commands.
function updateDictionary(
  path: string,
  update: (entries: Entry[]) => Entry[],
): Entry[] {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const lock = `${path}.lock`;
  try {
    mkdirSync(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(
        "別の保存処理が進行中です。少し待って再度保存してください。続く場合はREADMEの復旧手順を確認してください。",
      );
    throw error;
  }
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const entries = readDictionary(path);
    const next = update(entries);
    const data: Dictionary = { version: 1, entries: next };
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    return next;
  } finally {
    if (existsSync(temp)) unlinkSync(temp);
    rmdirSync(lock);
  }
}

export function saveEntry(
  path: string,
  input: EntryDraft,
  original?: Entry,
): Entry[] {
  const values = cleanInput(input);
  return updateDictionary(path, (entries) => {
    if (
      entries.some(
        (entry) =>
          entry.id !== original?.id &&
          normalize(entry.term) === normalize(values.term),
      )
    )
      throw new Error(
        "同じ用語が登録済みです。辞書から検索して編集してください。",
      );
    if (original) {
      const current = entries.find((entry) => entry.id === original.id);
      if (
        !current ||
        current.term !== original.term ||
        current.reading !== original.reading ||
        current.description !== original.description ||
        (current.referenceUrl ?? "") !== (original.referenceUrl ?? "") ||
        (current.formula ?? "") !== (original.formula ?? "") ||
        JSON.stringify(current.images ?? []) !==
          JSON.stringify(original.images ?? [])
      )
        throw new Error(
          "この用語は別の画面で変更されています。辞書を再読み込みしてから編集してください。",
        );
    }
    const removed = input.removedImages ?? [];
    if (
      removed.some(
        (name) => !isImageName(name) || !original?.images?.includes(name),
      )
    )
      throw new Error("この用語に登録されていない画像は外せません。");
    const added = copyImages(
      join(dirname(path), "images"),
      input.imagePaths ?? [],
    );
    const images = [
      ...new Set([
        ...(original?.images ?? []).filter((name) => !removed.includes(name)),
        ...added,
      ]),
    ];
    const entry: Entry = {
      id: original?.id ?? randomUUID(),
      ...values,
      ...(images.length ? { images } : {}),
    };
    return original
      ? entries.map((item) => (item.id === original.id ? entry : item))
      : [...entries, entry];
  });
}

// Import is append-only. Read again under lock so preview-time races cannot overwrite entries.
export function importEntries(
  path: string,
  input: EntryInput[],
): { entries: Entry[]; added: number; skipped: number } {
  const values = input.map(cleanInput);
  const batchNames = new Set<string>();
  for (const value of values) {
    const name = normalize(value.term);
    if (batchNames.has(name))
      throw new Error(`CSV内で用語が重複しています：${value.term}`);
    batchNames.add(name);
  }
  let added = 0;
  const entries = updateDictionary(path, (entries) => {
    const names = new Set(entries.map((entry) => normalize(entry.term)));
    const fresh = values
      .filter((value) => !names.has(normalize(value.term)))
      .map((value) => ({ id: randomUUID(), ...value }));
    added = fresh.length;
    return [...entries, ...fresh];
  });
  return { entries, added, skipped: values.length - added };
}
