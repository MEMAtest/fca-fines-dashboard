import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { dirname, join } from "node:path";
import OpenAI from "openai";
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
  const targets = images.filter((image) => image.generatedBy === "gpt-image-2");
  if (targets.length === 0) return images;
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for AI illustration candidates");

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const generated = new Map<string, { reviewAssetPath: string; assetHash: string }>();
  for (const image of targets) {
    if (image.factual) throw new Error(`AI image ${image.id} must be non-factual`);
    if (!image.prompt?.trim()) throw new Error(`AI image ${image.id} has no prompt`);
    if (PROHIBITED_PROMPT_CONTENT.test(image.prompt)) {
      throw new Error(`AI image ${image.id} requests prohibited official or factual content`);
    }

    const response = await client.images.generate({
      model: process.env.EDITORIAL_IMAGE_MODEL || "gpt-image-2",
      prompt: [
        "Create a restrained editorial illustration for a UK regulatory intelligence publication.",
        "Use an abstract institutional visual language in deep navy, slate and muted teal.",
        "Do not include words, numbers, logos, badges, documents, signatures or regulator branding.",
        image.prompt,
      ].join(" "),
      size: image.width === image.height ? "1024x1024" : "1536x1024",
      quality: "high",
      output_format: "png",
    });
    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw new Error(`Image API returned no image for ${image.id}`);
    const output = safeReviewOutput(root, image.id);
    mkdirSync(dirname(output), { recursive: true });
    const buffer = Buffer.from(encoded, "base64");
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
    .filter((image) => image.generatedBy === "gpt-image-2" && image.reviewAssetPath)
    .map((image) => {
      const buffer = readFileSync(checkedReviewPath(root, image.reviewAssetPath!));
      if (hashBuffer(buffer) !== image.assetHash) throw new Error(`Review image hash mismatch: ${image.id}`);
      return { id: image.id, dataUrl: `data:image/png;base64,${buffer.toString("base64")}` };
    });
}

export function publishApprovedAiImages(root: string, images: ImageSpec[]) {
  const paths: string[] = [];
  for (const image of images.filter((candidate) => candidate.generatedBy === "gpt-image-2")) {
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
