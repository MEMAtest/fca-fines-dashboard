import "dotenv/config";
import {
  describeDeliveryCertification,
  readDeliveryCertificationConfig,
} from "../server/services/deliveryCertification.js";

async function callEndpoint(baseUrl: string, item: ReturnType<typeof describeDeliveryCertification>[number], secret: string) {
  const response = await fetch(`${baseUrl}${item.path}`, {
    method: item.method,
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.json().catch(() => ({ error: "Non-JSON response" })) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${item.name} failed (${response.status}): ${String(body.error || "unknown error")}`);
  return { name: item.name, status: response.status, result: body };
}

async function main() {
  const config = readDeliveryCertificationConfig(process.argv.slice(2));
  const plan = describeDeliveryCertification(config);
  console.log(JSON.stringify({ mode: config.confirmSend ? "confirm-send" : "dry-run", baseUrl: config.baseUrl, plan }, null, 2));
  if (!config.confirmSend) {
    console.log("Dry run complete. Re-run with --confirm-send only for controlled test records and authorised recipients.");
    return;
  }

  const results = [];
  for (const item of plan) {
    const secret = item.name.startsWith("Board Pack") ? config.boardPackSecret : config.cronSecret;
    results.push(await callEndpoint(config.baseUrl, item, secret));
  }
  console.log(JSON.stringify({ certifiedAt: new Date().toISOString(), results }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
