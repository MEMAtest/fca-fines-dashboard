import { useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";
import { AtlasSanctionsTabBody } from "./AtlasSanctionsTabBody.js";

/** Route wrapper for the /atlas/countries/:slug/sanctions tab. Body owned by Coder B (Phase 2). */
export function AtlasSanctionsTab() {
  const { country } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;
  return <AtlasSanctionsTabBody iso2={country.iso2} />;
}
