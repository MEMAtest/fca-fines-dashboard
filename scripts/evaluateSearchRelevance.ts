import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface EvalCase {
  id: string;
  category?: string;
  query: string;
  expectedAnyTop?: string[];
  maxRank?: number;
  expectedRegulatorTop?: string[];
  maxRegulatorRank?: number;
  expectedCountryTop?: string[];
  maxCountryRank?: number;
  expectedQueryMode?: string;
  minResults?: number;
  maxResults?: number;
  expectZeroResults?: boolean;
  mustPass?: boolean;
  notes?: string;
}

interface SearchResultRow {
  firm?: string;
  regulator?: string;
  countryCode?: string;
  countryName?: string;
  breachType?: string;
}

interface SearchResponse {
  results?: SearchResultRow[];
  pagination?: {
    total?: number;
  };
  metadata?: Record<string, unknown>;
}

interface EvaluationCategoryStats {
  total: number;
  passed: number;
  failedIds: string[];
  notEvaluatedIds: string[];
}

export function markUnevaluatedCases(
  cases: EvalCase[],
  categoryStats: Map<string, EvaluationCategoryStats>,
  failures: string[],
  warnings: string[],
) {
  for (const testCase of cases) {
    const category = testCase.category ?? 'uncategorized';
    const stats = categoryStats.get(category) ?? {
      total: 0,
      passed: 0,
      failedIds: [],
      notEvaluatedIds: [],
    };
    if (stats.total === 0 && !categoryStats.has(category)) stats.total = cases.filter((item) => (item.category ?? 'uncategorized') === category).length;
    if (!stats.notEvaluatedIds.includes(testCase.id)) stats.notEvaluatedIds.push(testCase.id);
    if (testCase.mustPass === false) {
      warnings.push(testCase.id);
    } else {
      failures.push(testCase.id);
      stats.failedIds.push(testCase.id);
    }
    categoryStats.set(category, stats);
  }
}

export async function fetchSearchCase(
  baseUrl: string,
  testCase: EvalCase,
  timeoutMs: number,
  request: typeof fetch = fetch,
) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/search?q=${encodeURIComponent(testCase.query)}`;
  try {
    const response = await request(url, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      testCase,
      responseOk: response.ok,
      status: response.status,
      json: await response.json() as SearchResponse,
      error: null as string | null,
    };
  } catch (error) {
    return {
      testCase,
      responseOk: false,
      status: null,
      json: {} as SearchResponse,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function usage() {
  console.error(
    'Usage: npx tsx scripts/evaluateSearchRelevance.ts [baseUrl] [evalSetPath...]',
  );
}

function findRank(values: string[], expected: string[]) {
  const normalizedExpected = expected.map((value) => value.toLowerCase());
  for (let index = 0; index < values.length; index += 1) {
    const candidate = values[index]?.toLowerCase() ?? '';
    if (normalizedExpected.some((value) => candidate.includes(value))) {
      return index + 1;
    }
  }
  return null;
}

async function main() {
  const baseUrl = process.argv[2] || 'https://regactions.com';
  const evalSetPaths =
    process.argv.length > 3
      ? process.argv.slice(3)
      : [
          path.resolve(
            process.cwd(),
            'research/search-relevance-eval-set.json',
          ),
        ];

  if (!baseUrl) {
    usage();
    process.exit(1);
  }

  const evalSet = evalSetPaths.flatMap((evalSetPath) => {
    const raw = fs.readFileSync(evalSetPath, 'utf8');
    return JSON.parse(raw) as EvalCase[];
  });
  const failures: string[] = [];
  const warnings: string[] = [];
  const categoryStats = new Map<string, EvaluationCategoryStats>();
  for (const testCase of evalSet) {
    const category = testCase.category ?? 'uncategorized';
    const stats = categoryStats.get(category) ?? {
      total: 0,
      passed: 0,
      failedIds: [],
      notEvaluatedIds: [],
    };
    stats.total += 1;
    stats.notEvaluatedIds.push(testCase.id);
    categoryStats.set(category, stats);
  }

  const concurrency = Math.max(1, Math.min(4, Number(process.env.SEARCH_EVAL_CONCURRENCY) || 2));
  const requestTimeoutMs = Math.max(1_000, Math.min(60_000, Number(process.env.SEARCH_EVAL_TIMEOUT_MS) || 40_000));
  const budgetMs = Math.max(60_000, Math.min(12 * 60_000, Number(process.env.SEARCH_EVAL_BUDGET_MS) || 11 * 60_000));
  const deadline = Date.now() + budgetMs;
  let completedCases = 0;
  for (let batchStart = 0; batchStart < evalSet.length; batchStart += concurrency) {
    if (Date.now() >= deadline) {
      const skipped = evalSet.slice(batchStart);
      markUnevaluatedCases(skipped, categoryStats, failures, warnings);
      console.log(`BUDGET exhausted after ${completedCases}/${evalSet.length}; marked ${skipped.length} unstarted cases as not evaluated`);
      break;
    }
    const batch = evalSet.slice(batchStart, batchStart + concurrency);
    console.log(`START cases ${batchStart + 1}-${batchStart + batch.length} of ${evalSet.length}`);
    const batchResponses = await Promise.all(batch.map((testCase) =>
      fetchSearchCase(baseUrl, testCase, requestTimeoutMs),
    ));

    for (const { testCase, responseOk, status, json, error } of batchResponses) {
    const results = json.results ?? [];
    const topFirms = results.slice(0, 5).map((result) => result.firm ?? '');
    const topRegulators = results.slice(0, 5).map((result) => result.regulator ?? '');
    const topCountries = results
      .slice(0, 5)
      .map((result) => result.countryCode ?? result.countryName ?? '');
    const total = json.pagination?.total ?? 0;
    const queryMode = typeof json.metadata?.queryMode === 'string'
      ? json.metadata.queryMode
      : null;
    const mustPass = testCase.mustPass !== false;

    let passed = responseOk;
    const checks: string[] = [];

    if (!responseOk) {
      checks.push(error ? `request error: ${error}` : `HTTP ${status}`);
    }

    if (testCase.expectZeroResults) {
      const zeroPassed = total === 0;
      passed &&= zeroPassed;
      checks.push(zeroPassed ? 'zero-results ok' : `expected 0 results, got ${total}`);
    }

    if (testCase.expectedAnyTop?.length && testCase.maxRank) {
      const rank = findRank(topFirms, testCase.expectedAnyTop);
      const rankPassed = rank != null && rank <= testCase.maxRank;
      passed &&= rankPassed;
      checks.push(
        rankPassed
          ? `firm hit at rank ${rank}`
          : `expected firm within top ${testCase.maxRank}, got ${rank ?? 'none'}`,
      );
    }

    if (testCase.expectedRegulatorTop?.length && testCase.maxRegulatorRank) {
      const rank = findRank(topRegulators, testCase.expectedRegulatorTop);
      const rankPassed = rank != null && rank <= testCase.maxRegulatorRank;
      passed &&= rankPassed;
      checks.push(
        rankPassed
          ? `regulator hit at rank ${rank}`
          : `expected regulator within top ${testCase.maxRegulatorRank}, got ${rank ?? 'none'}`,
      );
    }

    if (testCase.expectedCountryTop?.length && testCase.maxCountryRank) {
      const rank = findRank(topCountries, testCase.expectedCountryTop);
      const rankPassed = rank != null && rank <= testCase.maxCountryRank;
      passed &&= rankPassed;
      checks.push(
        rankPassed
          ? `country hit at rank ${rank}`
          : `expected country within top ${testCase.maxCountryRank}, got ${rank ?? 'none'}`,
      );
    }

    if (testCase.expectedQueryMode) {
      const modePassed = queryMode === testCase.expectedQueryMode;
      passed &&= modePassed;
      checks.push(
        modePassed
          ? `query mode ${queryMode}`
          : `expected query mode ${testCase.expectedQueryMode}, got ${queryMode ?? 'none'}`,
      );
    }

    if (testCase.minResults !== undefined) {
      const minPassed = total >= testCase.minResults;
      passed &&= minPassed;
      checks.push(
        minPassed
          ? `min results ok (${total})`
          : `expected at least ${testCase.minResults} results, got ${total}`,
      );
    }

    if (testCase.maxResults !== undefined) {
      const maxPassed = total <= testCase.maxResults;
      passed &&= maxPassed;
      checks.push(
        maxPassed
          ? `max results ok (${total})`
          : `expected at most ${testCase.maxResults} results, got ${total}`,
      );
    }

    const line = `${passed ? 'PASS' : 'FAIL'} ${testCase.id}: ${checks.join(' | ')}`;
    console.log(line);
    console.log(
      JSON.stringify(
        {
          query: testCase.query,
          total,
          queryMode,
          topFirms,
          topRegulators,
          topCountries,
          notes: testCase.notes ?? null,
          correction: json.metadata?.correction ?? null,
          mustPass,
        },
        null,
        2,
      ),
    );

    if (!passed) {
      if (mustPass) {
        failures.push(testCase.id);
      } else {
        warnings.push(testCase.id);
      }
    }

    const category = testCase.category ?? 'uncategorized';
    const current = categoryStats.get(category)!;
    current.notEvaluatedIds = current.notEvaluatedIds.filter((id) => id !== testCase.id);
    if (passed) {
      current.passed += 1;
    } else {
      current.failedIds.push(testCase.id);
    }
    categoryStats.set(category, current);
    completedCases += 1;
    }
    console.log(`PROGRESS ${completedCases}/${evalSet.length} cases completed; ${failures.length} failures, ${warnings.length} warnings`);
  }

  const categorySummary = Array.from(categoryStats.entries())
    .map(([category, stats]) => ({
      category,
      totalCases: stats.total,
      passedCases: stats.passed,
      failedCases: stats.total - stats.passed,
      evaluatedCases: stats.total - stats.notEvaluatedIds.length,
      notEvaluatedCases: stats.notEvaluatedIds.length,
      passRate: Number(((stats.passed / stats.total) * 100).toFixed(1)),
      failedIds: stats.failedIds,
      notEvaluatedIds: stats.notEvaluatedIds,
    }))
    .sort((left, right) => left.category.localeCompare(right.category));

  console.log(
    JSON.stringify(
      {
        baseUrl,
        evalSetPaths,
        totalCases: evalSet.length,
        evaluatedCases: completedCases,
        notEvaluatedCases: evalSet.length - completedCases,
        failedCases: failures.length,
        warningCases: warnings.length,
        failures,
        warnings,
        categorySummary,
      },
      null,
      2,
    ),
  );

  process.exitCode = failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
