import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createBoardPackDraft } from "../../../server/services/boardPackPersistence.js";
import {
  requireBoardPackPersistence,
  requireBoardPackRateLimit,
  requireJsonBody,
  sendBoardPackError,
} from "../persistenceApi.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireBoardPackPersistence(res)) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireBoardPackRateLimit(req);
    const created = await createBoardPackDraft(requireJsonBody(req));
    res.setHeader("Cache-Control", "no-store");
    return res.status(201).json(created);
  } catch (error) {
    return sendBoardPackError(res, error);
  }
}
