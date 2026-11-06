#!/usr/bin/env npx tsx
// Owner tool. Runs locally against DATABASE_URL from .env.
//   scripts/api-keys.sh -- list
//   scripts/api-keys.sh -- applications
//   scripts/api-keys.sh -- issue --application <id> [--label X] [--daily-limit N] [--minute-limit N] [--months N]
//   scripts/api-keys.sh -- issue --organisation "Internal test" --contact-name "Ops" --email x@memaconsultants.com [...]
//   scripts/api-keys.sh -- revoke --key <prefix> [--reason "..."]
// The key is printed once; only its hash is stored. Nothing is emailed.
import "dotenv/config";
import { getSqlClient } from "../../server/db.js";
import {
  issueDeveloperApiKey, listDeveloperApiKeys, listPendingApplications, revokeDeveloperApiKey,
} from "../../server/services/developerApiAdmin.js";

const [command] = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const num = (name: string) => (arg(name) === undefined ? undefined : Number(arg(name)));

const sql = getSqlClient();
try {
  if (command === "list") {
    console.table(await listDeveloperApiKeys(sql));
  } else if (command === "applications") {
    console.table(await listPendingApplications(sql));
  } else if (command === "issue") {
    const issued = await issueDeveloperApiKey(sql, {
      applicationId: num("application"), organisation: arg("organisation"), contactName: arg("contact-name"),
      email: arg("email"), label: arg("label"), months: num("months"), minuteLimit: num("minute-limit"),
      dailyLimit: num("daily-limit"), issuedBy: "cli",
    });
    const { apiKey, ...meta } = issued;
    console.log(JSON.stringify(meta, null, 2));
    console.log("\nAPI key (shown once; deliver securely, never by plain email):");
    console.log(apiKey);
  } else if (command === "revoke") {
    const prefix = arg("key");
    if (!prefix) throw new Error("--key <prefix> required");
    console.log(JSON.stringify(await revokeDeveloperApiKey(sql, prefix, arg("reason")), null, 2));
  } else {
    throw new Error("Usage: api-keys list | applications | issue ... | revoke --key <prefix>");
  }
} finally {
  await sql.end();
}
