import fs from 'node:fs';
import path from 'node:path';

interface EvalCase {
  id: string;
  query: string;
  expectedAnyTop?: string[];
  maxRank?: number;
  expectedRegulatorTop?: string[];
  maxRegulatorRank?: number;
  expectZeroResults?: boolean;
  notes?: string;
}

interface SearchResultRow {
  firm?: string;
  regulator?: string;
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
    'Usage: npx tsx scripts/evaluateSearchRelevance.ts [baseUrl] [evalSetPath]',
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
  const baseUrl = process.argv[2] || 'https://fcafines.memaconsultants.com';
  const evalSetPath =
    process.argv[3]
    || path.resolve(
      process.cwd(),
      'research/search-relevance-eval-set.json',
    );

  if (!baseUrl) {
    usage();
    process.exit(1);
  }

  const raw = fs.readFileSync(evalSetPath, 'utf8');
  const evalSet = JSON.parse(raw) as EvalCase[];
  const failures: string[] = [];

  for (const testCase of evalSet) {
    const url = `${baseUrl.replace(/\/$/, '')}/api/search?q=${encodeURIComponent(testCase.query)}`;
    const response = await fetch(url);
    const json = (await response.json()) as SearchResponse;
    const results = json.results ?? [];
    const topFirms = results.slice(0, 5).map((result) => result.firm ?? '');
    const topRegulators = results.slice(0, 5).map((result) => result.regulator ?? '');
    const total = json.pagination?.total ?? 0;

    let passed = true;
    const checks: string[] = [];

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

    const line = `${passed ? 'PASS' : 'FAIL'} ${testCase.id}: ${checks.join(' | ')}`;
    console.log(line);
    console.log(
      JSON.stringify(
        {
          query: testCase.query,
          total,
          topFirms,
          topRegulators,
          notes: testCase.notes ?? null,
          correction: json.metadata?.correction ?? null,
        },
        null,
        2,
      ),
    );

    if (!passed) {
      failures.push(testCase.id);
    }
  }

  console.log(
    JSON.stringify(
      {
        baseUrl,
        evalSetPath,
        totalCases: evalSet.length,
        failedCases: failures.length,
        failures,
      },
      null,
      2,
    ),
  );

  process.exitCode = failures.length > 0 ? 1 : 0;
}

void main();
