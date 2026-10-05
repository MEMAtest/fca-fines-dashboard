const SEARCH_CONSOLE_API_BASE =
  "https://www.googleapis.com/webmasters/v3/sites";

export type SearchConsoleSitemap = {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  isSitemapsIndex?: boolean;
  errors?: number;
  warnings?: number;
};

export function sitemapCollectionUrl(property: string): string {
  return `${SEARCH_CONSOLE_API_BASE}/${encodeURIComponent(property)}/sitemaps`;
}

export function sitemapUrl(property: string, feedPath: string): string {
  return `${sitemapCollectionUrl(property)}/${encodeURIComponent(feedPath)}`;
}

async function ensureOk(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`Search Console sitemap ${operation} failed (${response.status})`);
  }
}

export async function submitSitemap(
  token: string,
  property: string,
  feedPath: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(sitemapUrl(property, feedPath), {
    method: "PUT",
    headers: { authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "submission");
}

export async function getSitemap(
  token: string,
  property: string,
  feedPath: string,
  fetcher: typeof fetch = fetch,
): Promise<SearchConsoleSitemap> {
  const response = await fetcher(sitemapUrl(property, feedPath), {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  await ensureOk(response, "verification");
  return (await response.json()) as SearchConsoleSitemap;
}
