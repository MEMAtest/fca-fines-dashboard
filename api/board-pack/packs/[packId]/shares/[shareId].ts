import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  parseOwnerBearer,
  revokeBoardPackShare,
} from "../../../../../server/services/boardPackPersistence.js";
import {
  requireBoardPackPersistence,
  requireBoardPackRateLimit,
  sendBoardPackError,
} from "../../../persistenceApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBoardPackPersistence(res)) return;
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireBoardPackRateLimit(req);
    await revokeBoardPackShare(
      String(req.query.packId ?? ""),
      String(req.query.shareId ?? ""),
      parseOwnerBearer(req.headers.authorization),
    );
    res.setHeader("Cache-Control", "no-store");
    return res.status(204).end();
  } catch (error) {
    return sendBoardPackError(res, error);
  }
}
