import type { VercelRequest, VercelResponse } from "@vercel/node";
import countryRiskHandler from "../../country-risk/[iso2].js";
import { allowWebsiteDataRequest } from "../../../server/services/developerApiAccess.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  allowWebsiteDataRequest(req);
  return countryRiskHandler(req, res);
}
