import { createSign } from "node:crypto";

/**
 * Shared Search Console client.
 *
 * Extracted from `scripts/reportSearchConsole.ts` so the weekly report and the
 * per-page delta report authenticate the same way. Hand-rolled JWT rather than
 * `googleapis` because the repo does not depend on it and this needs one
 * signed assertion and one POST.
 */

export type SearchConsoleRow = {
  keys?: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export interface SearchConsoleCredentials {
  client_email: string;
  private_key: string;
}

export interface SearchConsoleQueryBody {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  dimensionFilterGroups?: Array<{
    filters: Array<{
      dimension: string;
      operator: string;
      expression: string;
    }>;
  }>;
}

const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function encode(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export async function accessToken(
  credentials: SearchConsoleCredentials,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = encode(
    JSON.stringify({
      iss: credentials.client_email,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, "base64url")}`;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) {
    throw new Error(`Search Console authentication failed (${response.status})`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Search Console authentication returned no token");
  }
  return payload.access_token;
}

export async function query(
  token: string,
  property: string,
  body: SearchConsoleQueryBody,
): Promise<SearchConsoleRow[]> {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Search Console query failed (${response.status}): ${await response.text()}`,
    );
  }
  const payload = (await response.json()) as { rows?: SearchConsoleRow[] };
  return payload.rows ?? [];
}

export function readCredentialsFromEnv(): SearchConsoleCredentials {
  const raw = process.env.SC_CREDENTIALS_JSON?.trim();
  if (!raw) throw new Error("SC_CREDENTIALS_JSON is required");
  const parsed = JSON.parse(raw) as SearchConsoleCredentials;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      "SC_CREDENTIALS_JSON must contain client_email and private_key",
    );
  }
  return parsed;
}
