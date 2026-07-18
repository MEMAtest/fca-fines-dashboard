import { describe, expect, it } from "vitest";
import { describeDeliveryCertification, readDeliveryCertificationConfig } from "./deliveryCertification.js";

const environment = {
  DELIVERY_CERTIFICATION_BASE_URL: "https://regactions.com/",
  CRON_SECRET: "cron-secret",
  DELIVERY_SMOKE_MONITOR_ID: "9f3bd8b4-6cb0-4d31-b632-d33f28ff0dd0",
  DELIVERY_SMOKE_BOARD_PACK_LEAD_ID: "406455e7-2f6a-48c5-9204-67a0bc3f0232",
};

describe("delivery certification", () => {
  it("is dry-run by default and does not expose secrets in its plan", () => {
    const config = readDeliveryCertificationConfig([], environment);
    expect(config.confirmSend).toBe(false);
    expect(config.baseUrl).toBe("https://regactions.com");
    expect(JSON.stringify(describeDeliveryCertification(config))).not.toContain("cron-secret");
  });

  it("requires explicit send confirmation and controlled UUID records", () => {
    expect(readDeliveryCertificationConfig(["--confirm-send"], environment).confirmSend).toBe(true);
    expect(() => readDeliveryCertificationConfig([], { ...environment, DELIVERY_SMOKE_MONITOR_ID: "bad" }))
      .toThrow("must be a UUID");
  });
});
