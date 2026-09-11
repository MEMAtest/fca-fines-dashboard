import type { VercelRequest, VercelResponse } from "@vercel/node";
import unifiedSearchHandler from "../../unified/search.js";
import { allowWebsiteDataRequest } from "../../../server/services/developerApiAccess.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  allowWebsiteDataRequest(req);
  return unifiedSearchHandler(req, res);
}
