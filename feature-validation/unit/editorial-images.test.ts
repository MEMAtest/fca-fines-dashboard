import crypto from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { generateAiImageCandidates, publishApprovedAiImages } from "../../scripts/lib/editorialImages.js";
import type { ImageSpec } from "../../src/types/editorial.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(hashOverride?: string) {
  const root = mkdtempSync(join(tmpdir(), "regactions-editorial-image-"));
  roots.push(root);
  const reviewAssetPath = "scripts/data/review-assets/image-test.png";
  const reviewPath = join(root, reviewAssetPath);
  const data = Buffer.from("reviewed-image-bytes");
  mkdirSync(dirname(reviewPath), { recursive: true });
  writeFileSync(reviewPath, data);
  const image: ImageSpec = {
    id: "image:test:inline-1",
    purpose: "inline_illustration",
    width: 1536,
    height: 1024,
    altText: "Abstract governance illustration",
    outputPath: "/blog/images/test-inline-1.png",
    generatedBy: "openrouter-image",
    factual: false,
    sourceIds: [],
    approved: true,
    reviewAssetPath,
    assetHash: hashOverride || crypto.createHash("sha256").update(data).digest("hex"),
  };
  return { root, reviewPath, data, image };
}

describe("reviewed editorial image publishing", () => {
  test("reuses a hash-matched review candidate without another image API call", async () => {
    const { root, image } = fixture();
    const previousKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(generateAiImageCandidates(root, [image])).resolves.toEqual([image]);
    } finally {
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = previousKey;
    }
  });

  test("publishes the exact approved bytes and removes the review candidate", () => {
    const { root, reviewPath, data, image } = fixture();
    expect(publishApprovedAiImages(root, [image])).toEqual([image.outputPath]);
    expect(readFileSync(join(root, "public", "blog", "images", "test-inline-1.png"))).toEqual(data);
    expect(existsSync(reviewPath)).toBe(false);
  });

  test("rejects an asset whose bytes no longer match the reviewed hash", () => {
    const { root, image } = fixture("stale-hash");
    expect(() => publishApprovedAiImages(root, [image])).toThrow(/hash mismatch/);
  });
});
