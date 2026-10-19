import { execFileSync } from "node:child_process";
import { classifyEnforcementOutcome } from "../src/data/enforcementOutcomes.js";
import { enforcementOutcomePredicate } from "../server/services/enforcementOutcomeSql.js";
import { ENFORCEMENT_OUTCOME_SQL_FIXTURES } from "../server/services/enforcementOutcomeSqlFixtures.js";

// Read-only local verification. The default connects over the local Unix
// socket to the `postgres` database; an alternate local database NAME may be
// passed as argv[2]. URLs are rejected so credentials cannot leak into output.
// No schema, tables, or persistent data are created or changed.
const database = process.argv[2] ?? "postgres";
if (!/^[A-Za-z0-9_-]+$/.test(database)) {
  throw new Error("Pass a local database name only (not a connection URL).");
}
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const nullableText = (value: unknown) => value == null ? "NULL::text" : `${quote(String(value))}::text`;
const nullableJson = (value: unknown) => value == null
  ? "NULL::jsonb"
  : `${quote(JSON.stringify(value))}::jsonb`;
const nullableBoolean = (value: unknown) => value == null ? "NULL::boolean" : `${value ? "TRUE" : "FALSE"}::boolean`;
const nullableNumeric = (value: unknown) => value == null || value === "" ? "NULL::numeric" : `${quote(String(value))}::numeric`;

const values = ENFORCEMENT_OUTCOME_SQL_FIXTURES.map(({ id, input }) => `(
  ${quote(id)}::text,
  ${nullableText(input.breachType)},
  ${nullableJson(input.breachCategories)},
  ${nullableText(input.summary)},
  ${nullableText(input.noticeUrl)},
  ${nullableText(input.sourceUrl)},
  ${nullableBoolean(input.requiresAmountReview)},
  ${nullableNumeric(input.amountGbp)},
  ${nullableNumeric(input.amountEur)}
)`).join(",\n");
const query = `WITH fixtures(id, breach_type, breach_categories, summary, notice_url, source_url, requires_amount_review, amount_gbp, amount_eur) AS (VALUES ${values})
SELECT id,
  COALESCE(${enforcementOutcomePredicate("Monetary", "fixtures")}, FALSE),
  COALESCE(${enforcementOutcomePredicate("Non-monetary", "fixtures")}, FALSE),
  COALESCE(${enforcementOutcomePredicate("Pending and alerts", "fixtures")}, FALSE)
FROM fixtures ORDER BY id`;
const output = execFileSync("psql", [
  "-X", "-q", "-A", "-t", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-h", "/tmp", "-d", database,
  "-c", `BEGIN READ ONLY; ${query}; ROLLBACK;`,
], { encoding: "utf8" });
const actualById = new Map(output.trim().split("\n").map((line) => {
  const [id, monetary, nonMonetary, pendingAlerts] = line.split("\t");
  return [id, [monetary === "t", nonMonetary === "t", pendingAlerts === "t"]] as const;
}));

for (const { id, input } of ENFORCEMENT_OUTCOME_SQL_FIXTURES) {
  const classification = classifyEnforcementOutcome(input);
  const expected = [
    classification.outcomeTypes.includes("monetary_penalty"),
    classification.recordClass === "enforcement_outcome" && !classification.outcomeTypes.includes("monetary_penalty"),
    classification.recordClass === "proceeding" || classification.recordClass === "regulatory_alert",
  ];
  const actual = actualById.get(id);
  if (!actual || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${id}: classifier=${expected.join(",")}; SQL=${actual?.join(",") ?? "no result"}; class=${classification.recordClass}`);
  }
}

console.log(`Outcome SQL parity passed for ${ENFORCEMENT_OUTCOME_SQL_FIXTURES.length} synthetic fixtures against the local PostgreSQL service.`);
