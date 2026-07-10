/**
 * Generate the on-page and social artwork for every published article.
 *
 * The artwork is intentionally typographic and non-factual. Numbers, regulator
 * marks and document facsimiles never appear in generated covers, which keeps
 * the visual layer separate from the evidence layer.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { getPublishedAllArticles } from "../src/data/blogArticles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(ROOT, "dist", "blog", "images");

const VARIANTS = [
  { suffix: "hero", width: 1600, height: 900 },
  { suffix: "square", width: 1080, height: 1080 },
  { suffix: "portrait", width: 1080, height: 1350 },
] as const;

function coverNode({
  title,
  category,
  width,
  height,
}: {
  title: string;
  category: string;
  width: number;
  height: number;
}): ReactNode {
  const compact = width / height > 1.4;
  return {
    type: "div",
    props: {
      style: {
        width,
        height,
        display: "flex",
        position: "relative",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: compact ? "82px 94px" : "80px 72px",
        overflow: "hidden",
        color: "#f8fafc",
        background: "linear-gradient(135deg, #071827 0%, #102c38 54%, #0b574f 100%)",
        fontFamily: "Space Grotesk",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              width: compact ? 610 : 540,
              height: compact ? 610 : 540,
              right: compact ? -170 : -220,
              top: compact ? -160 : -80,
              border: "2px solid rgba(94, 234, 212, 0.22)",
              borderRadius: "50%",
            },
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", alignItems: "center", gap: "18px" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    width: 52,
                    height: 52,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    background: "#0FA77D",
                    color: "#ffffff",
                    fontSize: 22,
                    fontWeight: 700,
                  },
                  children: "RA",
                },
              },
              {
                type: "div",
                props: {
                  style: { color: "#cbd5e1", fontSize: 26, letterSpacing: "0.4px" },
                  children: "RegActions Editorial",
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: "24px", maxWidth: compact ? 1180 : 900 },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignSelf: "flex-start",
                    padding: "8px 18px",
                    borderRadius: 999,
                    background: "rgba(15, 167, 125, 0.18)",
                    color: "#5eead4",
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: "0.7px",
                    textTransform: "uppercase",
                  },
                  children: category,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: compact ? (title.length > 72 ? 54 : 64) : title.length > 72 ? 52 : 60,
                    fontWeight: 700,
                    lineHeight: 1.08,
                    letterSpacing: "-1.6px",
                  },
                  children: title,
                },
              },
              {
                type: "div",
                props: {
                  style: { color: "#94a3b8", fontSize: 22 },
                  children: "Independent regulatory enforcement intelligence",
                },
              },
            ],
          },
        },
      ],
    },
  } as unknown as ReactNode;
}

async function main() {
  const fontPath = join(__dirname, "fonts", "SpaceGrotesk-Bold.ttf");
  if (!existsSync(fontPath)) throw new Error(`Missing font: ${fontPath}`);
  const fontBuffer = readFileSync(fontPath);
  const fontData = fontBuffer.buffer.slice(
    fontBuffer.byteOffset,
    fontBuffer.byteOffset + fontBuffer.byteLength,
  );
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const articles = getPublishedAllArticles();
  for (const article of articles) {
    for (const variant of VARIANTS) {
      const svg = await satori(
        coverNode({ ...variant, title: article.title, category: article.category }),
        {
          width: variant.width,
          height: variant.height,
          fonts: [{ name: "Space Grotesk", data: fontData, weight: 700, style: "normal" }],
        },
      );
      const png = new Resvg(svg, { fitTo: { mode: "width", value: variant.width } }).render().asPng();
      writeFileSync(join(OUTPUT_DIR, `${article.slug}-${variant.suffix}.png`), png);
    }
  }

  console.log(`Created ${articles.length * VARIANTS.length} editorial images in dist/blog/images/`);
}

main().catch((error) => {
  console.error("Editorial image generation failed:", error);
  process.exit(1);
});
