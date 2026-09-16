import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readDictionary, saveEntry, searchEntries } from "../src/dictionary.ts";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "personal-dictionary-test-"));
  return {
    path: join(dir, "dictionary.json"),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("用語、読み、説明、空欄、文字幅とカナで検索できる", () => {
  const entries = [
    {
      id: "a",
      term: "冪等性",
      reading: "べきとうせい idempotency",
      description: "APIのリトライ設計",
    },
    {
      id: "b",
      term: "キャッシュ",
      reading: "cache",
      description: "結果を再利用",
    },
  ];
  for (const query of [
    "冪等",
    "ベキトウ",
    "ＩＤＥＭＰＯＴＥＮＣＹ",
    "リトライ",
    "api リトライ",
  ])
    assert.deepEqual(
      searchEntries(entries, query).map((e) => e.id),
      ["a"],
    );
  assert.deepEqual(
    searchEntries(entries, "きゃっしゅ").map((e) => e.id),
    ["b"],
  );
  assert.equal(searchEntries(entries, "未登録").length, 0);
  assert.equal(searchEntries(entries, "   ").length, 2);
});

test("用語のみの追加と編集が実ファイルに残り、他の項目を保持する", () => {
  const f = fixture();
  try {
    assert.deepEqual(readDictionary(f.path), []);
    saveEntry(f.path, { term: "  冪等性  ", reading: "", description: "" });
    const first = readDictionary(f.path)[0];
    assert.equal(first.term, "冪等性");
    assert.equal(first.description, "");
    saveEntry(f.path, {
      term: "キャッシュ",
      reading: "cache",
      description: "再利用",
    });
    const other = readDictionary(f.path)[1];
    saveEntry(
      f.path,
      {
        term: "冪等性",
        reading: "べきとうせい",
        description: "繰り返しても同じ結果\nリトライ",
      },
      first,
    );
    assert.deepEqual(readDictionary(f.path), [
      {
        ...first,
        reading: "べきとうせい",
        description: "繰り返しても同じ結果\nリトライ",
      },
      other,
    ]);
    assert.equal(JSON.parse(readFileSync(f.path, "utf8")).version, 1);
  } finally {
    f.close();
  }
});

test("空欄、重複、古い編集は保存せず元の内容を維持する", () => {
  const f = fixture();
  try {
    saveEntry(f.path, { term: "API", reading: "", description: "" });
    const original = readDictionary(f.path)[0];
    let bytes = readFileSync(f.path, "utf8");
    assert.throws(
      () => saveEntry(f.path, { term: "　 ", reading: "", description: "" }),
      /用語/,
    );
    assert.throws(
      () => saveEntry(f.path, { term: "ａｐｉ", reading: "", description: "" }),
      /登録済み/,
    );
    assert.equal(readFileSync(f.path, "utf8"), bytes);
    saveEntry(f.path, { ...original, description: "更新後" }, original);
    bytes = readFileSync(f.path, "utf8");
    assert.throws(
      () =>
        saveEntry(f.path, { ...original, description: "古い画面" }, original),
      /変更されています/,
    );
    assert.equal(readFileSync(f.path, "utf8"), bytes);
  } finally {
    f.close();
  }
});

test("壊れたファイル、未知の形式、重複IDを上書きしない", () => {
  const f = fixture();
  const e = { id: "a", term: "API", reading: "", description: "" };
  try {
    for (const raw of [
      "{broken",
      '{"version":2,"entries":[]}',
      '{"version":1,"entries":[{}]}',
      JSON.stringify({ version: 1, entries: [e, e] }),
    ]) {
      writeFileSync(f.path, raw);
      assert.throws(() => readDictionary(f.path), /形式/);
      assert.throws(
        () => saveEntry(f.path, { term: "test", reading: "", description: "" }),
        /形式/,
      );
      assert.equal(readFileSync(f.path, "utf8"), raw);
    }
  } finally {
    f.close();
  }
});

test("別の保存処理がある間はファイルを変更しない", () => {
  const f = fixture();
  try {
    saveEntry(f.path, { term: "API", reading: "", description: "" });
    const bytes = readFileSync(f.path, "utf8");
    mkdirSync(`${f.path}.lock`);
    assert.throws(
      () => saveEntry(f.path, { term: "other", reading: "", description: "" }),
      /進行中/,
    );
    assert.equal(readFileSync(f.path, "utf8"), bytes);
  } finally {
    f.close();
  }
});

test("旧形式を読み込み、参考URLの追加・変更・空欄化を保存できる", () => {
  const f = fixture();
  const legacy = {
    id: "legacy",
    term: "冪等性",
    reading: "",
    description: "元の説明",
  };
  try {
    writeFileSync(f.path, JSON.stringify({ version: 1, entries: [legacy] }));
    assert.deepEqual(readDictionary(f.path), [legacy]);
    saveEntry(
      f.path,
      {
        ...legacy,
        referenceUrl: " https://example.com/docs?q=日本語#section ",
      },
      legacy,
    );
    const updated = readDictionary(f.path)[0];
    assert.deepEqual(updated, {
      ...legacy,
      referenceUrl: "https://example.com/docs?q=日本語#section",
    });
    const bytes = readFileSync(f.path, "utf8");
    assert.throws(
      () => saveEntry(f.path, { ...legacy, description: "古い編集" }, legacy),
      /変更されています/,
    );
    assert.equal(readFileSync(f.path, "utf8"), bytes);
    saveEntry(
      f.path,
      { ...updated, referenceUrl: "http://example.com/new" },
      updated,
    );
    assert.equal(
      readDictionary(f.path)[0].referenceUrl,
      "http://example.com/new",
    );
    const current = readDictionary(f.path)[0];
    saveEntry(f.path, { ...current, referenceUrl: "" }, current);
    assert.deepEqual(readDictionary(f.path), [legacy]);
  } finally {
    f.close();
  }
});

test("不正な参考URLを保存せず、ファイルからも受け付けない", () => {
  const f = fixture();
  try {
    saveEntry(f.path, { term: "API", reading: "", description: "" });
    const original = readDictionary(f.path)[0];
    const bytes = readFileSync(f.path, "utf8");
    for (const referenceUrl of [
      "example.com",
      "https://",
      "javascript:alert(1)",
      "file:///tmp/file",
      "data:text/html,test",
    ]) {
      assert.throws(
        () => saveEntry(f.path, { ...original, referenceUrl }, original),
        /参考URL/,
      );
      assert.equal(readFileSync(f.path, "utf8"), bytes);
    }
    for (const referenceUrl of [123, "javascript:alert(1)"]) {
      const raw = JSON.stringify({
        version: 1,
        entries: [{ ...original, referenceUrl }],
      });
      writeFileSync(f.path, raw);
      assert.throws(() => readDictionary(f.path), /形式/);
      assert.equal(readFileSync(f.path, "utf8"), raw);
    }
  } finally {
    f.close();
  }
});
