import { join } from "node:path";
import { decodeImage, MAX_IMAGE_BYTES, storeImages } from "./media.ts";

function imageUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "画像URLは認証情報を含まないhttp/https URLを入力してください。",
    );
  return url;
}

export async function downloadImage(
  value: string,
  directory: string,
): Promise<string> {
  let url = imageUrl(value);
  const signal = AbortSignal.timeout(15_000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      credentials: "omit",
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("画像URLの転送先がありません。");
      url = imageUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(
        `画像を取得できませんでした（HTTP ${response.status}）。`,
      );
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES)
        throw new Error("画像は1枚20MB以下にしてください。");
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        total += chunk.length;
        if (total > MAX_IMAGE_BYTES)
          throw new Error("画像は1枚20MB以下にしてください。");
        chunks.push(chunk);
      }
    } finally {
      await reader.cancel();
    }
    const image = decodeImage(Buffer.concat(chunks));
    return join(directory, storeImages(directory, [image])[0]);
  }
  throw new Error("画像URLの転送回数が多すぎます。");
}
