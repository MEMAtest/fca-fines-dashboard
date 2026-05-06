import fs from 'node:fs';
import path from 'node:path';

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
  const categoryStats = new Map<
    string,
    { total: number; passed: number; failedIds: string[] }
  >();

  for (const testCase of evalSet) {
    const url = `${baseUrl.replace(/\/$/, '')}/api/search?q=${encodeURIComponent(testCase.query)}`;
    const response = await fetch(url);
    const json = (await response.json()) as SearchResponse;
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

    let passed = response.ok;
    const checks: string[] = [];

    if (!response.ok) {
      checks.push(`HTTP ${response.status}`);
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
    const current = categoryStats.get(category) ?? {
      total: 0,
      passed: 0,
      failedIds: [],
    };
    current.total += 1;
    if (passed) {
      current.passed += 1;
    } else {
      current.failedIds.push(testCase.id);
    }
    categoryStats.set(category, current);
  }

  const categorySummary = Array.from(categoryStats.entries())
    .map(([category, stats]) => ({
      category,
      totalCases: stats.total,
      passedCases: stats.passed,
      failedCases: stats.total - stats.passed,
      passRate: Number(((stats.passed / stats.total) * 100).toFixed(1)),
      failedIds: stats.failedIds,
    }))
    .sort((left, right) => left.category.localeCompare(right.category));

  console.log(
    JSON.stringify(
      {
        baseUrl,
        evalSetPaths,
        totalCases: evalSet.length,
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

void main();
