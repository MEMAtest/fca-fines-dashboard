/**
 * Send (or render) a test persona digest.
 *
 *   npx tsx scripts/jobs/sendPersonaDigestTest.ts <personaId> <email>
 *   npx tsx scripts/jobs/sendPersonaDigestTest.ts <personaId> --html-out digest.html
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { getSqlClient } from "../../server/db.js";
import { isDeliverableDigestEmail } from "../../server/services/digestRecipients.js";
import { renderPersonaDigest, sendTestDigest } from "../../server/services/personaDigestService.js";

const [personaId, target, outPath] = process.argv.slice(2);
if (!personaId || !target) {
  console.error("Usage: sendPersonaDigestTest.ts <personaId> <email | --html-out path>");
  process.exit(1);
}

const sql = getSqlClient();
try {
  if (target === "--html-out") {
    const { itemCount, email, error } = await renderPersonaDigest(personaId);
    if (!email) throw new Error(error || "Nothing rendered");
    writeFileSync(outPath || "persona-digest.html", email.html);
    console.log(JSON.stringify({ personaId, itemCount, subject: email.subject, written: outPath || "persona-digest.html" }));
  } else {
    if (!isDeliverableDigestEmail(target)) throw new Error(`Undeliverable email address: ${target}`);
    const result = await sendTestDigest(personaId, target);
    console.log(JSON.stringify({ personaId, ...result }));
    if (!result.success) process.exitCode = 1;
  }
} finally {
  await sql.end();
}
