import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { spawn } from "node:child_process";
import * as cheerio from "cheerio";
import { sha256Hex, type OfficialSourcePassage } from "../../server/services/controlEvidence.js";
import { isOfficialRegulatorySource } from "../lib/editorialWorkflow.js";

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;
const ADDITIONAL_EXACT_OFFICIAL_HOSTS = new Set([
  "fss.or.kr",
  "fsca.co.za",
  "sec.gov.ng",
  "ndic.gov.ng",
  "prod-entitysearchwebapplication.azurewebsites.net",
]);

export type FetchResponse = { bytes: Uint8Array; finalUrl: string; contentType: string };
export type Resolver = (hostname: string) => Promise<string[]>;

/** Use the notice as the effective case source when present; validate rather than silently falling back. */
export function effectiveOfficialCaseSource(noticeUrl: unknown, sourceUrl: unknown): string {
  const notice = noticeUrl == null ? "" : String(noticeUrl).trim();
  const effective = notice || (sourceUrl == null ? "" : String(sourceUrl).trim());
  if (!effective || !isOfficialRegulatorySource(effective)) {
    throw new Error("Effective case source URL is not an approved official regulatory source");
  }
  return effective;
}

function isAllowedHost(host: string): boolean {
  const hostname = host.toLowerCase().replace(/\.$/, "");
  return isOfficialRegulatorySource(`https://${hostname}/`) ||
    [...ADDITIONAL_EXACT_OFFICIAL_HOSTS].some((domain) => hostname === domain ||
      (domain !== "prod-entitysearchwebapplication.azurewebsites.net" && hostname.endsWith(`.${domain}`)));
}

function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return isPrivateAddress(lower.slice(7));
  if (isIP(lower) === 6) return !/^[23]/.test(lower) || lower.startsWith("2001:db8:");
  const parts = lower.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && parts[2] === 113) ||
    (a === 100 && b >= 64 && b <= 127);
}

export async function validateOfficialUrl(input: string, resolve: Resolver = async (host) => {
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.map(({ address }) => address);
}): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("Source URL is malformed"); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error("Only credential-free HTTPS URLs on the standard port are permitted");
  }
  if (!isAllowedHost(url.hostname)) throw new Error(`Unapproved official source host: ${url.hostname}`);
  const addresses = await resolve(url.hostname);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("Official source resolved to a private or invalid address");
  return url;
}

export async function fetchOfficialSource(input: string, options: {
  fetchImpl?: typeof fetch;
  resolver?: Resolver;
  timeoutMs?: number;
  maxBytes?: number;
} = {}): Promise<FetchResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  let url = await validateOfficialUrl(input, options.resolver);
  const maxBytes = options.maxBytes ?? MAX_SOURCE_BYTES;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS),
      headers: { "user-agent": "RegActions-control-evidence/1.0 (+https://regactions.com)" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === MAX_REDIRECTS) throw new Error("Source exceeded redirect limit");
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response has no Location header");
      const next = new URL(location, url);
      const checked = await validateOfficialUrl(next.toString(), options.resolver);
      if (checked.origin !== url.origin) throw new Error("Cross-origin redirects are not permitted");
      url = checked;
      continue;
    }
    if (!response.ok) throw new Error(`Official source returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw new Error("Official source exceeds body size cap");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Official source has no response body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Official source exceeds body size cap");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { bytes, finalUrl: url.toString(), contentType: response.headers.get("content-type") ?? "" };
  }
  throw new Error("Source redirect handling failed");
}

function decodeHtml(bytes: Uint8Array): string {
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, form, svg").remove();
  const passages: OfficialSourcePassage[] = [];
  $("h1, h2, h3, p, li, blockquote").each((index, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length >= 40) passages.push({ text, locator: `html:${element.tagName.toLowerCase()}[${index + 1}]` });
  });
  return passages.map(({ text, locator }) => `${locator}\n${text}`).join("\n\n");
}

function pdfToText(bytes: Uint8Array): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"], { stdio: ["pipe", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let size = 0;
    let errorSize = 0;
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("pdftotext exceeded extraction timeout")); }
    }, FETCH_TIMEOUT_MS);
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_SOURCE_BYTES) { child.kill("SIGKILL"); fail(new Error("Extracted PDF text exceeds size cap")); return; }
      output.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const available = 8 * 1024 - errorSize;
      if (available > 0) { errors.push(chunk.subarray(0, available)); errorSize += Math.min(chunk.length, available); }
    });
    child.on("error", (error) => fail(error));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve(Buffer.concat(output).toString("utf8"));
      else reject(new Error(`pdftotext failed: ${Buffer.concat(errors).toString("utf8").slice(0, 300)}`));
    });
    child.stdin.end(Buffer.from(bytes));
  });
}

export async function extractOfficialSource(response: FetchResponse): Promise<{ passages: OfficialSourcePassage[]; contentHash: string }> {
  const contentHash = sha256Hex(response.bytes);
  const isPdf = response.contentType.toLowerCase().includes("pdf") || Buffer.from(response.bytes.slice(0, 5)).toString("ascii") === "%PDF-";
  const isHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(response.contentType);
  if (!isPdf && !isHtml) throw new Error(`Unsupported official source content type: ${response.contentType || "missing"}`);
  const sourceText = isPdf ? await pdfToText(response.bytes) : decodeHtml(response.bytes);
  let passages: OfficialSourcePassage[];
  if (isPdf) {
    passages = sourceText.split(/\n\s*\n+/).map((text, index) => ({
      text: text.replace(/\s+/g, " ").trim(), locator: `pdf:paragraph[${index + 1}]`,
    })).filter((p) => p.text.length >= 40);
  } else {
    passages = sourceText.split(/\n\n/).map((block) => {
      const split = block.indexOf("\n");
      return { locator: block.slice(0, split), text: block.slice(split + 1) };
    }).filter((p) => p.locator && p.text);
  }
  if (!passages.length) throw new Error("No reviewable paragraphs were extracted from official source");
  return { passages, contentHash };
}
