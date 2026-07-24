import type { VercelRequest, VercelResponse } from "@vercel/node";
import { boardPackPersistenceEnabled } from "../../server/services/boardPackPersistence.js";
import { enforceBoardPackRateLimit } from "../../server/services/boardPackPersistence.js";

export function requireBoardPackPersistence(res: VercelResponse) {
  if (boardPackPersistenceEnabled()) return true;
  res.status(404).json({ error: "Board Pack persistence is not enabled" });
  return false;
}

export function requireJsonBody(req: VercelRequest) {
  const size = Buffer.byteLength(JSON.stringify(req.body ?? null), "utf8");
  if (size > 64 * 1024) {
    throw Object.assign(new Error("Request body exceeds the 64 KB limit"), { statusCode: 413 });
  }
  return req.body;
}

export async function requireBoardPackRateLimit(req: VercelRequest) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  const scope = `${forwarded || "unknown"}|${req.url || "board-pack"}`;
  await enforceBoardPackRateLimit(scope);
}

export function sendBoardPackError(res: VercelResponse, error: unknown) {
  const statusCode = Number((error as { statusCode?: number })?.statusCode) || 400;
  const payload: Record<string, unknown> = {
    error: error instanceof Error ? error.message : "Board Pack request failed",
  };
  const currentRevision = (error as { currentRevision?: unknown })?.currentRevision;
  if (currentRevision !== undefined) payload.currentRevision = currentRevision;
  return res.status(statusCode).json(payload);
}
