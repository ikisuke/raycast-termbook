import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { askCodex, parseCodexDraft } from "../src/codex.ts";
import { saveEntry, readDictionary } from "../src/dictionary.ts";
import { decodeImage, storeImages } from "../src/media.ts";

test("生成した短い説明とLaTeXを編集して明示保存するまで辞書は変わらない", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-draft-test-"));
  try {
    const path = join(dir, "dictionary.json");
    saveEntry(path, {
      term: "既存",
      reading: "",
      description: "保持",
    });
    const before = readFileSync(path, "utf8");
    const draft = parseCodexDraft(
      JSON.stringify({
        illustrationSvg: "",
        reading: "じょうびぶんほうていしき、ODE",
        description:
          "一つの独立変数に関する未知関数と、その導関数の関係を表す方程式。",
        formula: String.raw`\frac{dx_t}{dt}=v_\theta(x_t,t)`,
      }),
      "常微分方程式",
    );
    assert.equal(readFileSync(path, "utf8"), before);
    assert.equal(draft.formula, String.raw`\frac{dx_t}{dt}=v_\theta(x_t,t)`);
    saveEntry(path, { ...draft, description: "自分で修正した説明" });
    const entries = readDictionary(path);
    assert.equal(entries.length, 2);
    assert.equal(
      entries.find((entry) => entry.term === draft.term)?.description,
      "自分で修正した説明",
    );
    assert.equal(
      entries.find((entry) => entry.term === draft.term)?.formula,
      draft.formula,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("解説SVGは添付保存後に元の下書き画像を消しても読み出せる", () => {
  const dir = mkdtempSync(join(tmpdir(), "codex-svg-test-"));
  try {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="white"/><text x="40" y="60" font-size="24">入力 → 処理 → 出力</text></svg>';
    const draft = parseCodexDraft(
      JSON.stringify({
        reading: "",
        description: "処理の流れ",
        formula: "",
        illustrationSvg: svg,
      }),
      "処理",
    );
    const temporary = join(dir, "draft");
    const names = storeImages(temporary, [
      decodeImage(Buffer.from(draft.illustrationSvg)),
    ]);
    const path = join(dir, "dictionary.json");
    saveEntry(path, {
      ...draft,
      imagePaths: names.map((name) => join(temporary, name)),
    });
    rmSync(temporary, { recursive: true });
    const entry = readDictionary(path)[0];
    assert.equal(entry.images?.length, 1);
    assert.equal(
      readFileSync(join(dir, "images", entry.images![0]), "utf8"),
      svg,
    );
    for (const illustrationSvg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/track"/></svg>',
      "x".repeat(30001),
    ]) {
      assert.throws(() =>
        parseCodexDraft(
          JSON.stringify({
            reading: "",
            description: "test",
            formula: "",
            illustrationSvg,
          }),
          "用語",
        ),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("不正・過大・数式への画像混入を拒否し、数式なしは許可する", () => {
  const valid = {
    illustrationSvg: "",
    reading: "",
    description: "処理を繰り返しても結果が変わらない性質。",
    formula: "",
  };
  assert.equal(parseCodexDraft(JSON.stringify(valid), "冪等性").formula, "");
  for (const value of [
    null,
    {},
    { ...valid, description: " " },
    { ...valid, description: "あ".repeat(601) },
    { ...valid, formula: "![image](https://example.com/a.png)" },
  ]) {
    assert.throws(() => parseCodexDraft(JSON.stringify(value), "用語"));
  }
  assert.throws(() => parseCodexDraft("not JSON", "用語"));
});

test("空欄・過大入力と中止済みの問い合わせはCLI実行前に拒否する", async () => {
  await assert.rejects(askCodex(" ", new AbortController().signal), /1〜200/);
  await assert.rejects(
    askCodex("a".repeat(201), new AbortController().signal),
    /1〜200/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(askCodex("用語", controller.signal), /abort/i);
});
