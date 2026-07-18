export interface DeliveryCertificationConfig {
  baseUrl: string;
  cronSecret: string;
  boardPackSecret: string;
  monitorId: string;
  boardPackLeadId: string;
  confirmSend: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readDeliveryCertificationConfig(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): DeliveryCertificationConfig {
  const baseUrl = (environment.DELIVERY_CERTIFICATION_BASE_URL || environment.NEXT_PUBLIC_BASE_URL || "https://regactions.com").replace(/\/$/, "");
  const cronSecret = environment.CRON_SECRET?.trim() || "";
  const boardPackSecret = environment.BOARD_PACK_RETRY_SECRET?.trim() || cronSecret;
  const monitorId = environment.DELIVERY_SMOKE_MONITOR_ID?.trim() || "";
  const boardPackLeadId = environment.DELIVERY_SMOKE_BOARD_PACK_LEAD_ID?.trim() || "";
  if (!/^https?:\/\//.test(baseUrl)) throw new Error("DELIVERY_CERTIFICATION_BASE_URL must be an HTTP(S) URL");
  if (!cronSecret) throw new Error("CRON_SECRET is required");
  if (!boardPackSecret) throw new Error("BOARD_PACK_RETRY_SECRET or CRON_SECRET is required");
  if (!UUID_PATTERN.test(monitorId)) throw new Error("DELIVERY_SMOKE_MONITOR_ID must be a UUID");
  if (!UUID_PATTERN.test(boardPackLeadId)) throw new Error("DELIVERY_SMOKE_BOARD_PACK_LEAD_ID must be a UUID");
  return { baseUrl, cronSecret, boardPackSecret, monitorId, boardPackLeadId, confirmSend: args.includes("--confirm-send") };
}

export function describeDeliveryCertification(config: DeliveryCertificationConfig) {
  return [
    { name: "monitor health", method: "GET", path: "/api/monitors/health", sendsEmail: false },
    { name: "Board Pack health", method: "GET", path: "/api/board-pack/health", sendsEmail: false },
    { name: "monitor transport smoke", method: "POST", path: `/api/cron/process-monitors?mode=smoke&monitorId=${encodeURIComponent(config.monitorId)}`, sendsEmail: true },
    { name: "Board Pack notification", method: "POST", path: `/api/board-pack/retry-leads?leadId=${encodeURIComponent(config.boardPackLeadId)}`, sendsEmail: true },
  ] as const;
}
