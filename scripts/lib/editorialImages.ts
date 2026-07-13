import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { dirname, join } from "node:path";
import { createCanvas, loadImage } from "canvas";
import type { ImageSpec } from "../../src/types/editorial.js";

const PROHIBITED_PROMPT_CONTENT = /\b(logo|official document|final notice|currency figure|fine amount|penalty amount|regulator badge|letterhead)\b/i;

function safePublicOutput(root: string, outputPath: string) {
  const relative = outputPath.replace(/^\//, "");
  if (!relative.startsWith("blog/images/") || !/\.png$/i.test(relative)) {
    throw new Error(`Unsafe generated image output path: ${outputPath}`);
  }
  return join(root, "public", relative);
}

function safeReviewOutput(root: string, imageId: string) {
  const filename = `${imageId.replace(/[^a-z0-9_-]+/gi, "-")}.png`;
  return join(root, "scripts", "data", "review-assets", filename);
}

function checkedReviewPath(root: string, reviewAssetPath: string) {
  const expectedRoot = join(root, "scripts", "data", "review-assets");
  const absolute = join(root, reviewAssetPath.replace(/^\//, ""));
  if (!absolute.startsWith(`${expectedRoot}/`)) throw new Error(`Unsafe review asset path: ${reviewAssetPath}`);
  return absolute;
}

function hashBuffer(value: Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Generate only explicitly approved, non-factual inline illustrations. */
export async function generateAiImageCandidates(root: string, images: ImageSpec[]) {
  const targets = images.filter((image) => {
    if (image.generatedBy !== "openrouter-image") return false;
    if (!image.reviewAssetPath || !image.assetHash) return true;
    const reviewPath = checkedReviewPath(root, image.reviewAssetPath);
    if (!existsSync(reviewPath)) return true;
    const actualHash = hashBuffer(readFileSync(reviewPath));
    if (actualHash !== image.assetHash) {
      throw new Error(`Review image hash mismatch: ${image.id}`);
    }
    return false;
  });
  if (targets.length === 0) return images;
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for AI illustration candidates");

  const generated = new Map<string, { reviewAssetPath: string; assetHash: string }>();
  for (const image of targets) {
    if (image.factual) throw new Error(`AI image ${image.id} must be non-factual`);
    if (!image.prompt?.trim()) throw new Error(`AI image ${image.id} has no prompt`);
    if (PROHIBITED_PROMPT_CONTENT.test(image.prompt)) {
      throw new Error(`AI image ${image.id} requests prohibited official or factual content`);
    }

    const response = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://regactions.com",
        "X-Title": "RegActions Editorial Engine",
      },
      body: JSON.stringify({
        model: process.env.EDITORIAL_IMAGE_MODEL || "bytedance-seed/seedream-4.5",
        prompt: [
          "Create a restrained editorial illustration for a UK regulatory intelligence publication.",
          "Use an abstract institutional visual language in deep navy, slate and muted teal.",
          "Do not include words, numbers, logos, badges, documents, signatures or regulator branding.",
          image.prompt,
        ].join(" "),
        n: 1,
        resolution: "4K",
        aspect_ratio: image.width === image.height ? "1:1" : image.width > image.height ? "3:2" : "4:5",
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`OpenRouter Image API failed for ${image.id}: HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
    }
    const result = await response.json() as { data?: Array<{ b64_json?: string; media_type?: string }> };
    const candidate = result.data?.[0];
    if (candidate?.media_type && !["image/png", "image/jpeg"].includes(candidate.media_type)) {
      throw new Error(`OpenRouter Image API returned unsupported ${candidate.media_type} for ${image.id}`);
    }
    const encoded = candidate?.b64_json;
    if (!encoded) throw new Error(`Image API returned no image for ${image.id}`);
    const output = safeReviewOutput(root, image.id);
    mkdirSync(dirname(output), { recursive: true });
    let buffer: Buffer = Buffer.from(encoded, "base64");
    if (candidate?.media_type === "image/jpeg") {
      const source = await loadImage(buffer);
      const canvas = createCanvas(source.width, source.height);
      canvas.getContext("2d").drawImage(source, 0, 0);
      buffer = canvas.toBuffer("image/png");
    }
    writeFileSync(output, buffer);
    generated.set(image.id, {
      reviewAssetPath: output.slice(root.length).replace(/^\//, ""),
      assetHash: hashBuffer(buffer),
    });
  }
  return images.map((image) => generated.has(image.id) ? { ...image, ...generated.get(image.id) } : image);
}

export function imageCandidatesForReview(root: string, images: ImageSpec[]) {
  return images
    .filter((image) => image.generatedBy === "openrouter-image" && image.reviewAssetPath)
    .map((image) => {
      const buffer = readFileSync(checkedReviewPath(root, image.reviewAssetPath!));
      if (hashBuffer(buffer) !== image.assetHash) throw new Error(`Review image hash mismatch: ${image.id}`);
      return { id: image.id, dataUrl: `data:image/png;base64,${buffer.toString("base64")}` };
    });
}

export function publishApprovedAiImages(root: string, images: ImageSpec[]) {
  const paths: string[] = [];
  for (const image of images.filter((candidate) => candidate.generatedBy === "openrouter-image")) {
    if (!image.approved || !image.reviewAssetPath || !image.assetHash) {
      throw new Error(`AI image ${image.id} lacks approval or reviewed provenance`);
    }
    const reviewPath = checkedReviewPath(root, image.reviewAssetPath);
    const buffer = readFileSync(reviewPath);
    if (hashBuffer(buffer) !== image.assetHash) throw new Error(`Approved image hash mismatch: ${image.id}`);
    const output = safePublicOutput(root, image.outputPath);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(reviewPath, output);
    unlinkSync(reviewPath);
    paths.push(image.outputPath);
  }
  return paths;
}

export function cleanupReviewImageCandidates(root: string, images: ImageSpec[]) {
  for (const image of images) {
    if (!image.reviewAssetPath) continue;
    const reviewPath = checkedReviewPath(root, image.reviewAssetPath);
    if (existsSync(reviewPath)) unlinkSync(reviewPath);
  }
}
