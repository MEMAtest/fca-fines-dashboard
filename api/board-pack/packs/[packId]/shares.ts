import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createBoardPackShare,
  parseOwnerBearer,
} from "../../../../server/services/boardPackPersistence.js";
import {
  requireBoardPackPersistence,
  requireBoardPackRateLimit,
  sendBoardPackError,
} from "../../persistenceApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBoardPackPersistence(res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireBoardPackRateLimit(req);
    const result = await createBoardPackShare(
      String(req.query.packId ?? ""),
      parseOwnerBearer(req.headers.authorization),
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json({
      ...result,
      shareUrl: `/board-pack/shared/${result.shareToken}`,
    });
  } catch (error) {
    return sendBoardPackError(res, error);
  }
}
