import { issueSiteToken, SITE_TOKEN_COOKIE } from "./services/siteToken.js";

/** Cookie a real page load would carry, for tests that exercise the website lane. */
export function siteTestCookie(): string {
  process.env.CRON_SECRET ||= "test-cron-secret";
  return `${SITE_TOKEN_COOKIE}=${issueSiteToken()}`;
}
