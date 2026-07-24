import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getBoardPackShare } from "../../../server/services/boardPackPersistence.js";
import {
  requireBoardPackPersistence,
  requireBoardPackRateLimit,
  sendBoardPackError,
} from "../persistenceApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBoardPackPersistence(res)) return;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireBoardPackRateLimit(req);
    const result = await getBoardPackShare(String(req.query.shareToken ?? ""));
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    return res.status(200).json(result);
  } catch (error) {
    return sendBoardPackError(res, error);
  }
}
