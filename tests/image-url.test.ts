import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSvg } from "../src/svg.ts";
import { downloadImage } from "../src/image-url.ts";
import { saveEntry, readDictionary } from "../src/dictionary.ts";

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="#228899"/><circle cx="120" cy="50" r="30" fill="#ffffff"/></svg>';

test("静的SVGを受け入れ、外部参照・実行要素・XML破損を拒否する", () => {
  validateSvg(svg);
  validateSvg(
    '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/></svg>',
  );
  for (const content of [
    "<script>alert(1)</script>",
    '<rect onload="alert(1)"/>',
    '<image href="https://example.com/image.png"/>',
    '<use href="file:///etc/passwd"/>',
    '<image href="&#104;ttps://example.com/a.png"/>',
    "<foreignObject/>",
    '<style>@import "https://example.com/a.css";</style>',
    "<style>rect{fill:u<![CDATA[rl]]>(https://example.com/a.svg)}</style>",
    "<style>rect{fill:u\\72l(https://example.com/a.svg)}</style>",
    '<animate attributeName="href" to="https://example.com"/>',
    "<path>",
  ])
    assert.throws(
      () =>
        validateSvg(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`),
      /SVG/,
    );
  assert.throws(
    () =>
      validateSvg(
        '<!DOCTYPE svg SYSTEM "https://example.com/a"><svg xmlns="http://www.w3.org/2000/svg"/>',
      ),
    /SVG/,
  );
});

test("実HTTPからPNG/SVGを取得し、転送・失敗を処理し、保存後はサーバー不要", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dictionary-url-"));
  const png = readFileSync(join(process.cwd(), "assets/icon.png"));
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/svg" });
      res.end();
    } else if (req.url === "/svg") res.end(svg);
    else if (req.url === "/png") res.end(png);
    else if (req.url === "/large") {
      res.writeHead(200, { "content-length": 21 * 1024 * 1024 });
      res.end();
    } else if (req.url === "/loop") {
      res.writeHead(302, { location: "/loop" });
      res.end();
    } else if (req.url === "/html") res.end("<html>not an image</html>");
    else {
      res.writeHead(404);
      res.end();
    }
  });
  try {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const path = join(dir, "dictionary.json");
    const original = saveEntry(path, {
      term: "既存",
      reading: "",
      description: "維持",
    });
    const before = readFileSync(path);
    for (const suffix of ["/404", "/large", "/html", "/loop"])
      await assert.rejects(downloadImage(base + suffix, join(dir, "cache")));
    await assert.rejects(downloadImage("file:///etc/passwd", dir));
    await assert.rejects(
      downloadImage("https://user:pass@example.com/a.png", dir),
    );
    assert.deepEqual(readFileSync(path), before);
    const images = await Promise.all([
      downloadImage(base + "/redirect", join(dir, "cache")),
      downloadImage(base + "/png", join(dir, "cache")),
    ]);
    assert.equal(readFileSync(images[0], "utf8"), svg);
    assert.deepEqual(readFileSync(images[1]), png);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const added = saveEntry(path, {
      term: "図",
      reading: "",
      description: "",
      imagePaths: images,
    });
    rmSync(join(dir, "cache"), { recursive: true });
    assert.deepEqual(added[0], original[0]);
    const saved = readDictionary(path)[1];
    assert.equal(
      readFileSync(join(dir, "images", saved.images![0]), "utf8"),
      svg,
    );
    assert.deepEqual(readFileSync(join(dir, "images", saved.images![1])), png);
    const local = join(dir, "local.svg");
    writeFileSync(local, svg);
    const edited = saveEntry(path, { ...saved, imagePaths: [local] }, saved);
    assert.deepEqual(edited[1].images, saved.images);
  } finally {
    server.closeAllConnections();
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
