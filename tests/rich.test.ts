import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { saveEntry, readDictionary, importEntries } from "../src/dictionary.ts";
import { parseGlossaryCsv } from "../src/csv.ts";
import { entryMarkdown, formulaBody, plainMarkdown } from "../src/content.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "dictionary-rich-"));
  return {
    dir,
    path: join(dir, "dictionary.json"),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}
const value = { term: "分数", reading: "ぶんすう", description: "比を表す" };

test("数式と画像を保存し、元画像がなくても保持し、通常編集でも画像を残す", () => {
  const f = fixture();
  try {
    const source = join(f.dir, "original.png");
    copyFileSync(join(process.cwd(), "assets/icon.png"), source);
    const bytes = readFileSync(source);
    saveEntry(f.path, {
      ...value,
      formula: String.raw`\frac{a}{b}`,
      imagePaths: [source],
    });
    const original = readDictionary(f.path)[0];
    rmSync(source);
    assert.equal(original.formula, String.raw`\frac{a}{b}`);
    assert.equal(original.images?.length, 1);
    assert.deepEqual(
      readFileSync(join(f.dir, "images", original.images![0])),
      bytes,
    );
    saveEntry(f.path, { ...original, description: "説明を修正" }, original);
    assert.deepEqual(readDictionary(f.path)[0].images, original.images);
    const current = readDictionary(f.path)[0];
    saveEntry(f.path, { ...current, formula: "x^2" }, current);
    const before = readFileSync(f.path);
    assert.throws(
      () => saveEntry(f.path, current, current),
      /変更されています/,
    );
    assert.deepEqual(readFileSync(f.path), before);
  } finally {
    f.close();
  }
});

test("不正画像の添付・画像パス逸脱・不正数式は辞書を変更しない", () => {
  const f = fixture();
  try {
    saveEntry(f.path, value);
    const original = readDictionary(f.path)[0];
    const before = readFileSync(f.path);
    const bad = join(f.dir, "bad.png");
    writeFileSync(bad, '<svg><image href="https://example.com/a.png"/></svg>');
    assert.throws(
      () => saveEntry(f.path, { ...original, imagePaths: [bad] }, original),
      /SVG/,
    );
    assert.throws(
      () =>
        saveEntry(
          f.path,
          { ...original, formula: "$$ x $$ ![x](https://example.com)" },
          original,
        ),
      /数式欄/,
    );
    assert.deepEqual(readFileSync(f.path), before);
    for (const images of [["../../secret.png"], "oops", [null]]) {
      writeFileSync(
        f.path,
        JSON.stringify({ version: 1, entries: [{ ...original, images }] }),
      );
      assert.throws(() => readDictionary(f.path), /形式/);
    }
  } finally {
    f.close();
  }
});

test("数式だけをRaycastの数式ブロックへ渡し、説明の外部画像は無効化する", () => {
  assert.equal(
    formulaBody(String.raw`\[\frac{a}{b}\]`),
    String.raw`\frac{a}{b}`,
  );
  assert.equal(formulaBody("$$x^2$$"), "x^2");
  const rendered = entryMarkdown(
    {
      ...value,
      description: "![remote](https://example.com/a.png)",
      formula: String.raw`\sum_{i=1}^{n} x_i`,
    },
    ["/tmp/a b.png"],
  );
  assert(rendered.includes("$$\n\\sum_{i=1}^{n} x_i\n$$"));
  assert(!rendered.includes("![remote]"));
  assert(rendered.includes("file:///tmp/a%20b.png"));
  assert.equal(plainMarkdown("$x$"), "\\$x\\$");
});

test("既存Glossary CSV形式を保持し、エラーとバッチ重複を拒否する", () => {
  const parsed = parseGlossaryCsv(
    "AMC,説明,カンマを含む\\n次の行\r\n学認,読み：がくにん\r\n",
  );
  assert.deepEqual(parsed, [
    { term: "AMC", reading: "", description: "説明,カンマを含む\n次の行" },
    { term: "学認", reading: "", description: "読み：がくにん" },
  ]);
  for (const raw of [
    "",
    "AMC",
    "AMC,",
    ",説明",
    "AMC,説明\n\n学認,説明",
    "AMC,説明\namc,別の説明",
  ])
    assert.throws(() => parseGlossaryCsv(raw));
  assert.equal(parseGlossaryCsv("\uFEFFAMC,説明")[0].term, "AMC");
});

test("一括追加は既存項目を上書きせず、不正バッチを全件拒否する", () => {
  const f = fixture();
  try {
    const pending = parseGlossaryCsv("AMC,AIの説明\n学認,大学アカウント");
    // Another command adds this after the user sees the preview.
    saveEntry(f.path, {
      term: "amc",
      reading: "",
      description: "人間の修正",
      formula: "x^2",
    });
    const original = readDictionary(f.path)[0];
    const result = importEntries(f.path, pending);
    assert.equal(result.added, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(readDictionary(f.path)[0], original);
    assert.equal(readDictionary(f.path)[1].term, "学認");
    const before = readFileSync(f.path);
    assert.throws(() => importEntries(f.path, [value, { ...value, term: "" }]));
    assert.throws(() => importEntries(f.path, [value, value]), /重複/);
    assert.deepEqual(readFileSync(f.path), before);
  } finally {
    f.close();
  }
});

test("選んだ画像だけを外し、共有画像・式・他の用語を保持し、復元できる", () => {
  const f = fixture();
  try {
    const a = join(f.dir, "a.svg");
    const b = join(f.dir, "b.svg");
    writeFileSync(
      a,
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    );
    writeFileSync(
      b,
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>',
    );
    saveEntry(f.path, { ...value, formula: "x^2", imagePaths: [a, b] });
    saveEntry(f.path, { ...value, term: "共有", imagePaths: [a] });
    const [original, shared] = readDictionary(f.path);
    const [first, second] = original.images!;
    const originalBytes = readFileSync(join(f.dir, "images", first));
    saveEntry(f.path, { ...original, removedImages: [first] }, original);
    const [after, sharedAfter] = readDictionary(f.path);
    assert.deepEqual(after.images, [second]);
    assert.equal(after.formula, "x^2");
    assert.deepEqual(sharedAfter, shared);
    assert.deepEqual(readFileSync(join(f.dir, "images", first)), originalBytes);
    const before = readFileSync(f.path);
    assert.throws(
      () =>
        saveEntry(f.path, { ...original, removedImages: [second] }, original),
      /変更されています/,
    );
    assert.throws(
      () => saveEntry(f.path, { ...after, removedImages: [first] }, after),
      /登録されていない/,
    );
    assert.deepEqual(readFileSync(f.path), before);
    saveEntry(f.path, { ...after, removedImages: [second] }, after);
    const empty = readDictionary(f.path)[0];
    assert.equal(empty.images, undefined);
    saveEntry(
      f.path,
      { ...empty, imagePaths: [join(f.dir, "images", first)] },
      empty,
    );
    assert.deepEqual(readDictionary(f.path)[0].images, [first]);
  } finally {
    f.close();
  }
});
