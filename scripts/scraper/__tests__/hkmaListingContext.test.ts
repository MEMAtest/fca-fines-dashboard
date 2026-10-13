import { describe, expect, it } from "vitest";
import { getHkmaListingRequestContext } from "../scrapeHkma.js";

describe("HKMA listing request context", () => {
  it("reads the csrf_token meta tag and session cookies from the listing page", () => {
    const html = "<html><head><meta name='csrf_token' content='abc123'></head></html>";
    expect(
      getHkmaListingRequestContext(html, [
        "PHPSESSID=xyz; path=/; HttpOnly",
        "SF_cookie_2=q=; path=/; Secure",
      ]),
    ).toEqual({ csrfToken: "abc123", cookie: "PHPSESSID=xyz; SF_cookie_2=q=" });
  });

  it("rejects a CDN-cached copy that lacks the token or cookie (the caller retries with a cache-buster)", () => {
    expect(() => getHkmaListingRequestContext("<html></html>", ["a=b"])).toThrow(/CSRF token or session cookie/);
    expect(() =>
      getHkmaListingRequestContext("<meta name='csrf_token' content='t'>", undefined),
    ).toThrow(/CSRF token or session cookie/);
  });
});
