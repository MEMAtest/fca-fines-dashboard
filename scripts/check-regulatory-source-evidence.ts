import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import "dotenv/config";
import { getRegulatorCoverage } from "../src/data/regulatorCoverage.js";
import {
  deriveSourceLinkStatus,
  type SourceLinkStatus,
} from "../src/utils/sourceLinks.js";

const CHECKER_VERSION = "source-check-v1";
const MAX_HASH_BYTES = 64 * 1024;

interface Candidate {
  regulator: string;
  raw_url: string;
  evidence_url: string;
}

export interface SourceCheckResult {
  status: SourceLinkStatus;
  resolvedUrl: string | null;
  httpStatus: number | null;
  officialDomainMatch: boolean;
  contentHash: string | null;
  errorMessage: string | null;
}

function hostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function officialDomains(regulator: string) {
  return new Set(
    (getRegulatorCoverage(regulator)?.officialSources ?? [])
      .map((source) => hostname(source.url))
      .filter((value): value is string => Boolean(value)),
  );
}

function domainMatches(host: string | null, allowed: Set<string>) {
  if (!host) return false;
  return [...allowed].some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
}

async function readHash(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_HASH_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = MAX_HASH_BYTES - size;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      size += chunk.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!chunks.length) return null;
  return createHash("sha256")
    .update(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
    .digest("hex");
}

export async function checkOfficialSource(candidate: Candidate): Promise<SourceCheckResult> {
  const initial = deriveSourceLinkStatus(
    candidate.regulator,
    candidate.raw_url,
    null,
  );
  if (initial === "missing" || initial === "listing_only") {
    return {
      status: initial,
      resolvedUrl: candidate.raw_url || null,
      httpStatus: null,
      officialDomainMatch: domainMatches(
        hostname(candidate.raw_url),
        officialDomains(candidate.regulator),
      ),
      contentHash: null,
      errorMessage: null,
    };
  }

  const allowed = officialDomains(candidate.regulator);
  const initialDomainMatch = domainMatches(hostname(candidate.raw_url), allowed);
  if (!initialDomainMatch) {
    return {
      status: "official_unverified",
      resolvedUrl: candidate.raw_url,
      httpStatus: null,
      officialDomainMatch: false,
      contentHash: null,
      errorMessage: "URL is outside the regulator's configured official domains",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(candidate.raw_url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "RegActionsEvidenceChecker/1.0 (+https://regactions.com/methodology/enforcement)",
        Range: `bytes=0-${MAX_HASH_BYTES - 1}`,
      },
    });
    const resolvedUrl = response.url || candidate.raw_url;
    const resolvedDomainMatch = domainMatches(hostname(resolvedUrl), allowed);
    const contentHash = response.ok ? await readHash(response) : null;
    const isPublication =
      /application\/pdf/i.test(response.headers.get("content-type") ?? "") ||
      /\.pdf(?:$|[?#])/i.test(resolvedUrl);
    return {
      status:
        response.ok && resolvedDomainMatch
          ? isPublication
            ? "verified_publication"
            : "verified_detail"
          : "official_unverified",
      resolvedUrl,
      httpStatus: response.status,
      officialDomainMatch: resolvedDomainMatch,
      contentHash,
      errorMessage: response.ok
        ? null
        : `Official source returned HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      status: "official_unverified",
      resolvedUrl: candidate.raw_url,
      httpStatus: null,
      officialDomainMatch: true,
      contentHash: null,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function numberArgument(name: string, fallback: number) {
  const match = process.argv.find((arg) => arg.startsWith(`${name}=`));
  const parsed = Number(match?.split("=")[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const sql = postgres(databaseUrl, {
    ssl: databaseUrl.includes("sslmode=")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  const limit = numberArgument("--limit", 100);
  const regulator = process.argv
    .find((arg) => arg.startsWith("--regulator="))
    ?.split("=")[1]
    ?.toUpperCase();

  try {
    const candidates = await sql<Candidate[]>`
      SELECT DISTINCT ON (upper(canonical.regulator), evidence.evidence_url)
        upper(canonical.regulator) AS regulator,
        evidence.raw_url,
        evidence.evidence_url
      FROM public.all_regulatory_fines_canonical AS canonical
      CROSS JOIN LATERAL (
        SELECT
          COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '') AS raw_url,
          public.normalise_regulatory_evidence_url(
            COALESCE(NULLIF(canonical.notice_url, ''), NULLIF(canonical.source_url, ''), '')
          ) AS evidence_url
      ) AS evidence
      LEFT JOIN public.regulatory_source_assessments AS assessment
        ON assessment.regulator = upper(canonical.regulator)
       AND assessment.evidence_url = evidence.evidence_url
      WHERE evidence.raw_url <> ''
        AND (${regulator ?? null}::text IS NULL OR upper(canonical.regulator) = ${regulator ?? null})
        AND (assessment.checked_at IS NULL OR assessment.checked_at < now() - interval '30 days')
      ORDER BY upper(canonical.regulator), evidence.evidence_url, canonical.date_issued DESC
      LIMIT ${limit}
    `;

    let cursor = 0;
    const results: Array<{ candidate: Candidate; result: SourceCheckResult }> = [];
    const workers = Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];
        const result = await checkOfficialSource(candidate);
        await sql`
          INSERT INTO public.regulatory_source_assessments (
            regulator, evidence_url, source_status, resolved_url, checked_at,
            http_status, official_domain_match, content_hash, checker_version,
            error_message, updated_at
          ) VALUES (
            ${candidate.regulator}, ${candidate.evidence_url}, ${result.status},
            ${result.resolvedUrl}, now(), ${result.httpStatus},
            ${result.officialDomainMatch}, ${result.contentHash},
            ${CHECKER_VERSION}, ${result.errorMessage}, now()
          )
          ON CONFLICT (regulator, evidence_url) DO UPDATE SET
            source_status = EXCLUDED.source_status,
            resolved_url = EXCLUDED.resolved_url,
            checked_at = EXCLUDED.checked_at,
            http_status = EXCLUDED.http_status,
            official_domain_match = EXCLUDED.official_domain_match,
            content_hash = EXCLUDED.content_hash,
            checker_version = EXCLUDED.checker_version,
            error_message = EXCLUDED.error_message,
            updated_at = now()
        `;
        results.push({ candidate, result });
      }
    });
    await Promise.all(workers);

    const summary = results.reduce<Record<string, number>>((counts, item) => {
      counts[item.result.status] = (counts[item.result.status] ?? 0) + 1;
      return counts;
    }, {});
    console.log(JSON.stringify({ checked: results.length, summary }, null, 2));
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error("Source evidence check failed", error);
    process.exitCode = 1;
  });
}
