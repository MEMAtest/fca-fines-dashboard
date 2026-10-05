import { readCredentialsFromEnv } from "./searchConsole.js";

export type SitemapSubmissionConfig = {
  property: string;
  feedPath: string;
  credentials: ReturnType<typeof readCredentialsFromEnv>;
};

export function readSitemapSubmissionConfig(
  env: NodeJS.ProcessEnv = process.env,
): SitemapSubmissionConfig {
  const property = env.SC_PROPERTY?.trim();
  if (!property) throw new Error("SC_PROPERTY is required");

  const feedPath = env.SITEMAP_URL?.trim();
  if (!feedPath) throw new Error("SITEMAP_URL is required");
  let parsedFeedPath: URL;
  try {
    parsedFeedPath = new URL(feedPath);
  } catch {
    throw new Error("SITEMAP_URL must be an absolute HTTPS URL");
  }
  if (parsedFeedPath.protocol !== "https:") {
    throw new Error("SITEMAP_URL must be an absolute HTTPS URL");
  }

  return { property, feedPath, credentials: readCredentialsFromEnv(env) };
}
