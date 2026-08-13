import "dotenv/config";
import { getSqlClient } from "../../server/db.js";
import { dispatchEmailDigests, isDigestDispatchWindow } from "../../server/services/emailDigestDispatch.js";

const dryRun = process.argv.includes("--dry-run");
const now = new Date();

if (!dryRun && !isDigestDispatchWindow(now)) {
  console.log(JSON.stringify({ skipped: true, reason: "Outside 07:00 Europe/London dispatch window" }));
  process.exit(0);
}

const sql = getSqlClient();
try {
  const result = await dispatchEmailDigests({ sql, now, dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (result.results.some((item) => !item.sent && !item.preview)) process.exitCode = 1;
} finally {
  await sql.end();
}
