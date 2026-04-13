import { parseStringPromise } from "xml2js";
import { fetchText, normalizeWhitespace } from "./euFineHelpers.js";

export interface OfficialSearchItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
  query: string;
  sourceUrl: string;
}

interface BingRssFeed {
  rss?: {
    channel?: Array<{
      item?: Array<{
        title?: string[];
        link?: string[];
        description?: string[];
        pubDate?: string[];
      }>;
    }>;
  };
}

interface DiscoverOfficialUrlsOptions {
  queries: string[];
  allowedHosts: string[];
  requiredPathSubstrings?: string[];
  limit?: number | null;
}

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isAllowedHost(hostname: string, allowedHosts: string[]) {
  const normalized = normalizeHost(hostname);
  return allowedHosts.some((host) => {
    const allowed = normalizeHost(host);
    return normalized === allowed || normalized.endsWith(`.${allowed}`);
  });
}

function normalizeUrl(input: string) {
  try {
    const parsed = new URL(input);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function parseBingSearchRss(
  xml: string,
  query: string,
  sourceUrl: string,
): Promise<OfficialSearchItem[]> {
  const parsed = await parseStringPromise(xml) as BingRssFeed;
  const items = parsed.rss?.channel?.[0]?.item || [];

  return items.map((item) => ({
    title: normalizeWhitespace(item.title?.[0] || ""),
    link: normalizeWhitespace(item.link?.[0] || ""),
    description: normalizeWhitespace(item.description?.[0] || ""),
    pubDate: normalizeWhitespace(item.pubDate?.[0] || "") || null,
    query,
    sourceUrl,
  })).filter((item) => item.link);
}

export function filterOfficialSearchItems(
  items: OfficialSearchItem[],
  allowedHosts: string[],
  requiredPathSubstrings: string[] = [],
) {
  const filtered = new Map<string, OfficialSearchItem>();

  for (const item of items) {
    const normalizedUrl = normalizeUrl(item.link);
    if (!normalizedUrl) {
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(normalizedUrl);
    } catch {
      continue;
    }

    if (!isAllowedHost(parsed.hostname, allowedHosts)) {
      continue;
    }

    const normalizedPath = parsed.pathname.toLowerCase();
    if (
      requiredPathSubstrings.length > 0
      && !requiredPathSubstrings.some((segment) => normalizedPath.includes(segment.toLowerCase()))
    ) {
      continue;
    }

    filtered.set(normalizedUrl, {
      ...item,
      link: normalizedUrl,
    });
  }

  return [...filtered.values()];
}

export async function discoverOfficialUrlsViaBingRss({
  queries,
  allowedHosts,
  requiredPathSubstrings = [],
  limit = null,
}: DiscoverOfficialUrlsOptions) {
  const collected: OfficialSearchItem[] = [];

  for (const query of queries) {
    const sourceUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
    const xml = await fetchText(sourceUrl, { timeout: 45000 });
    const parsed = await parseBingSearchRss(xml, query, sourceUrl);
    collected.push(...parsed);
  }

  const filtered = filterOfficialSearchItems(
    collected,
    allowedHosts,
    requiredPathSubstrings,
  );

  if (limit && limit > 0) {
    return filtered.slice(0, limit);
  }

  return filtered;
}
