import { SaxesParser } from "saxes";

// Accept self-contained static SVG. Never pass executable or external resources to the renderer.
export function validateSvg(source: string): void {
  const reject = () => {
    throw new Error(
      "SVGは外部参照・スクリプトを含まない静的な画像を選んでください。",
    );
  };
  const css = (value: string) => {
    if (/[\\@]|\/\*/.test(value)) reject();
    const remaining = value.replace(/url\(\s*(['"]?)#[\w:.-]+\1\s*\)/gi, "");
    if (/url\s*\(/i.test(remaining)) reject();
  };
  const allowed = new Set(
    "svg g defs title desc metadata path rect circle ellipse line polyline polygon text tspan textPath use symbol clipPath mask linearGradient radialGradient stop pattern marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence style image".split(
      " ",
    ),
  );
  const parser = new SaxesParser({ xmlns: true });
  let root = false;
  let inStyle = false;
  let styleText = "";
  parser.on("doctype", reject);
  parser.on("processinginstruction", reject);
  parser.on("opentag", (tag) => {
    if (inStyle) reject();
    if (!root) {
      if (tag.local !== "svg" || tag.uri !== "http://www.w3.org/2000/svg")
        reject();
      root = true;
    }
    if (tag.uri !== "http://www.w3.org/2000/svg" || !allowed.has(tag.local))
      reject();
    inStyle = tag.local === "style";
    if (inStyle) styleText = "";
    for (const attr of Object.values(tag.attributes)) {
      if (attr.prefix === "xmlns" || attr.name === "xmlns") continue;
      if (/^on/i.test(attr.local) || attr.local === "base") reject();
      if (
        ["href", "src"].includes(attr.local) &&
        !/^#[\w:.-]+$/.test(attr.value)
      )
        reject();
      css(attr.value);
    }
  });
  parser.on("closetag", () => {
    if (inStyle) css(styleText);
    inStyle = false;
  });
  parser.on("text", (text) => {
    if (inStyle) styleText += text;
  });
  parser.on("cdata", (text) => {
    if (inStyle) styleText += text;
  });
  try {
    parser.write(source).close();
  } catch {
    reject();
  }
  if (!root) reject();
}
