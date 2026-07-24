import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  deleteBoardPackDraft,
  getBoardPackDraft,
  parseOwnerBearer,
  updateBoardPackDraft,
} from "../../../server/services/boardPackPersistence.js";
import {
  requireBoardPackPersistence,
  requireBoardPackRateLimit,
  requireJsonBody,
  sendBoardPackError,
} from "../persistenceApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBoardPackPersistence(res)) return;
  try {
    await requireBoardPackRateLimit(req);
    const packId = String(req.query.packId ?? "");
    const ownerToken = parseOwnerBearer(req.headers.authorization);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") {
      return res.status(200).json(await getBoardPackDraft(packId, ownerToken));
    }
    if (req.method === "PATCH") {
      const body = requireJsonBody(req) as { revision?: unknown; payload?: unknown };
      const expectedRevision = Number(body?.revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
        throw new Error("A positive revision is required");
      }
      return res.status(200).json(
        await updateBoardPackDraft(packId, ownerToken, expectedRevision, body.payload),
      );
    }
    if (req.method === "DELETE") {
      await deleteBoardPackDraft(packId, ownerToken);
      return res.status(204).end();
    }
    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return sendBoardPackError(res, error);
  }
}
