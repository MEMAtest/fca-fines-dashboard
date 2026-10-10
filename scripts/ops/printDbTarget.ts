import "dotenv/config";
import { assertExpectedDbTarget, describeDbTarget } from "../lib/dbTarget.js";

// Prints the database host/name the scrapers would write to (never the
// password) and exits non-zero when it differs from REGACTIONS_EXPECTED_DB_*.
const target = describeDbTarget();
if (!target) {
  console.error("No REGACTIONS_DATABASE_URL / DATABASE_URL configured.");
  process.exit(2);
}
try {
  assertExpectedDbTarget("db-target check");
  console.log(JSON.stringify({ host: target.host, database: target.database }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(3);
}
