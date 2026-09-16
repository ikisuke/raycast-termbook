import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { validateSvg } from "./svg.ts";
import { join } from "node:path";

export function isImageName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{64}\.(png|jpg|gif|webp|svg)$/.test(value)
  );
}

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export function imageData(path: string): { bytes: Buffer; extension: string } {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES)
    throw new Error("画像は1枚20MB以下のファイルを選んでください。");
  return decodeImage(readFileSync(path));
}

export function decodeImage(bytes: Buffer): {
  bytes: Buffer;
  extension: string;
} {
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new Error("画像は1枚20MB以下にしてください。");
  let extension: string;
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    extension = "png";
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    extension = "jpg";
  else if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()))
    extension = "gif";
  else if (
    bytes.subarray(0, 4).toString() === "RIFF" &&
    bytes.subarray(8, 12).toString() === "WEBP"
  )
    extension = "webp";
  else if (bytes.toString("utf8").trimStart().startsWith("<")) {
    validateSvg(bytes.toString("utf8"));
    extension = "svg";
  } else throw new Error("PNG、JPEG、GIF、WebP、SVGの画像を選んでください。");
  return { bytes, extension };
}

export function copyImages(directory: string, paths: string[]): string[] {
  // Validate every image before copying any of them.
  const images = paths.map(imageData);
  return storeImages(directory, images);
}

export function storeImages(
  directory: string,
  images: { bytes: Buffer; extension: string }[],
): string[] {
  if (!images.length) return [];
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return images.map(({ bytes, extension }) => {
    const name = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
    try {
      writeFileSync(join(directory, name), bytes, { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!readFileSync(join(directory, name)).equals(bytes))
        throw new Error(
          "保存済み画像が破損しています。バックアップを確認してください。",
        );
    }
    return name;
  });
}
