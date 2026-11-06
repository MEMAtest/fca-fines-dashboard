// Server-side response probe for production acceptance.
// Replaces the Vercel runtime-log check: requests public pages and the data
// APIs they depend on, and fails on any 5xx, network error, non-JSON API
// response, or page without the app shell. It cannot see errors from requests
// it does not make, and the written result says so.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const baseUrl = (process.env.BASE_URL || "https://regactions.com").replace(/\/$/, "");
const outDir = process.env.PRODUCTION_ACCEPTANCE_ARTIFACT_DIR || "artifacts/production-acceptance";
const timeoutMs = 30_000;

const pages = ["/", "/regulators/fca", "/regulators/dnb", "/countries", "/blog", "/topics/largest-fca-fines"];
const apis = [
  "/api/homepage/stats",
  "/api/unified/stats",
  "/api/unified/overview",
  "/api/globe/stats",
  "/api/fca-fines/stats",
  "/api/fca-fines/years",
  "/api/uk-enforcement/health",
  "/api/search?q=barclays&limit=1",
];

async function probe(path, kind) {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: { "user-agent": "RegActions-production-acceptance" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text();
    const ms = Date.now() - started;
    const type = res.headers.get("content-type") || "";
    let problem = null;
    if (res.status >= 500) problem = `HTTP ${res.status}`;
    else if (res.status !== 200) problem = `unexpected HTTP ${res.status}`;
    else if (kind === "api") {
      if (!type.includes("application/json")) problem = `non-JSON content-type ${type}`;
      else {
        try {
          JSON.parse(body);
        } catch {
          problem = "unparsable JSON";
        }
      }
    } else if (!body.includes('id="root"')) problem = "app shell missing";
    return { path, kind, status: res.status, ms, problem };
  } catch (error) {
    return { path, kind, status: null, ms: Date.now() - started, problem: `request failed: ${error.message}` };
  }
}

const results = [];
for (const path of pages) results.push(await probe(path, "page"));
for (const path of apis) results.push(await probe(path, "api"));

const failures = results.filter((r) => r.problem);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "server-response-probe.json"), `${JSON.stringify({ baseUrl, results }, null, 2)}\n`);
writeFileSync(
  join(outDir, "server-response-probe.txt"),
  [
    `Probed ${results.length} production routes on ${baseUrl}; ${failures.length} failed.`,
    "Vercel runtime logs were not read: this probe sees only the responses to its own requests.",
    ...results.map((r) => `${r.problem ? "FAIL" : "ok  "} ${r.kind} ${r.path} ${r.status ?? "-"} ${r.ms}ms${r.problem ? ` (${r.problem})` : ""}`),
  ].join("\n") + "\n",
);

for (const r of results) console.log(`${r.problem ? "FAIL" : "ok"} ${r.kind} ${r.path} ${r.status ?? "-"} ${r.ms}ms${r.problem ? ` ${r.problem}` : ""}`);
if (failures.length) {
  console.error(`${failures.length} production route(s) failed the server response probe.`);
  process.exit(1);
}
