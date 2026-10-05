import {
  accessToken,
  readCredentialsFromEnv,
  SEARCH_CONSOLE_SCOPE_WEBMASTERS,
} from "./lib/searchConsole.js";
import {
  getSitemap,
  submitSitemap,
} from "./lib/searchConsoleSitemap.js";
import { readSitemapSubmissionConfig } from "./lib/searchConsoleSitemapSubmission.js";

async function main() {
  const config = readSitemapSubmissionConfig();
  const token = await accessToken(
    config.credentials,
    SEARCH_CONSOLE_SCOPE_WEBMASTERS,
  );

  await submitSitemap(token, config.property, config.feedPath);
  const verification = await getSitemap(
    token,
    config.property,
    config.feedPath,
  );

  console.log(`Submitted ${config.feedPath} to Search Console.`);
  console.log(
    `Verified path=${verification.path ?? config.feedPath}`,
    `lastSubmitted=${verification.lastSubmitted ?? "unknown"}`,
    `lastDownloaded=${verification.lastDownloaded ?? "not yet downloaded"}`,
    `errors=${verification.errors ?? 0}`,
    `warnings=${verification.warnings ?? 0}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Search Console sitemap submission failed");
  process.exitCode = 1;
});
