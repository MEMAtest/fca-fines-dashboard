/**
 * Resolve a world-atlas (countries-110m) polygon name → our ISO alpha-2 code.
 * The atlas uses abbreviated / alternate names that the general alias resolver
 * in `countries.ts` misses, so we patch those here. Shared by any map view
 * (flat choropleth or globe) so the name→ISO mapping can't drift between them.
 */
import { resolveCountry } from "./countries.js";

const ATLAS_ALIASES: Record<string, string> = {
  "united states of america": "US",
  "dem. rep. congo": "CD",
  congo: "CG",
  "central african rep.": "CF",
  "s. sudan": "SS",
  "bosnia and herz.": "BA",
  "dominican rep.": "DO",
  "eq. guinea": "GQ",
  "w. sahara": "EH",
  "solomon is.": "SB",
  czechia: "CZ",
  "north macedonia": "MK",
  "côte d'ivoire": "CI",
  "cote d'ivoire": "CI",
  korea: "KR",
  "dem. rep. korea": "KP",
  myanmar: "MM",
  "lao pdr": "LA",
  syria: "SY",
  iran: "IR",
  russia: "RU",
  türkiye: "TR",
  turkey: "TR",
};

/** Atlas polygon display name → ISO alpha-2, or undefined if unmatched. */
export function iso2ForAtlasName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const key = name.toLowerCase();
  if (ATLAS_ALIASES[key]) return ATLAS_ALIASES[key];
  return resolveCountry(name)?.iso2;
}

/** GeoJSON feature (from the world-atlas topology) → ISO alpha-2. */
export function iso2ForFeature(f: { properties?: { name?: string } }): string | undefined {
  return iso2ForAtlasName(f?.properties?.name);
}
