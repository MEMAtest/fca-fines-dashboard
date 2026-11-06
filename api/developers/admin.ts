import { timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSqlClient } from "../../server/db.js";
import {
  issueDeveloperApiKey, listDeveloperApiKeys, revokeDeveloperApiKey,
} from "../../server/services/developerApiAdmin.js";

/**
 * Optional HTTP admin surface, protected by ADMIN_API_KEY (same Bearer pattern
 * as /api/digest-subscribers). It fails closed while ADMIN_API_KEY is unset.
 * The documented approval path is the local CLI (`npm run api-keys`).
 */
function bearerMatches(header: string | undefined, secret: string): boolean {
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (!adminKey) return res.status(503).json({ error: "admin_not_configured", message: "API key administration is not configured." });
  const header = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  if (!bearerMatches(header, adminKey)) return res.status(401).json({ error: "unauthorized" });
  const sql = getSqlClient();
  try {
    if (req.method === "GET") return res.status(200).json({ keys: await listDeveloperApiKeys(sql) });
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (req.method === "POST") {
      const issued = await issueDeveloperApiKey(sql, {
        applicationId: body.applicationId === undefined ? undefined : Number(body.applicationId),
        organisation: body.organisation as string | undefined, contactName: body.contactName as string | undefined,
        email: body.email as string | undefined, label: body.label as string | undefined,
        months: body.months === undefined ? undefined : Number(body.months),
        minuteLimit: body.minuteLimit === undefined ? undefined : Number(body.minuteLimit),
        dailyLimit: body.dailyLimit === undefined ? undefined : Number(body.dailyLimit),
        issuedBy: "admin-api",
      });
      return res.status(201).json({ ...issued, notice: "The key is shown once and only its hash is stored." });
    }
    if (req.method === "DELETE") {
      return res.status(200).json({ revoked: await revokeDeveloperApiKey(sql, String(body.keyPrefix ?? req.query.keyPrefix ?? ""), body.reason as string | undefined) });
    }
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "method_not_allowed" });
  } catch (error) {
    return res.status(400).json({ error: "admin_request_failed", message: error instanceof Error ? error.message : "failed" });
  }
}
