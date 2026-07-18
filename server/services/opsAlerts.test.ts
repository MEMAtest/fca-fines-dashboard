import { describe, expect, it } from "vitest";
import { decideOpsAlert } from "./opsAlerts.js";

describe("operations alert transitions", () => {
  const now = new Date("2026-07-18T12:00:00.000Z");

  it("sends changed critical states and suppresses duplicate noise", () => {
    expect(decideOpsAlert({ lastStatus: "healthy", lastFingerprint: "old", lastAlertedAt: null }, "critical", "new", now).action).toBe("critical");
    expect(decideOpsAlert({ lastStatus: "critical", lastFingerprint: "same", lastAlertedAt: "2026-07-18T11:00:00.000Z" }, "critical", "same", now).action).toBe("skip");
  });

  it("reminds after 24 hours and reports recovery", () => {
    expect(decideOpsAlert({ lastStatus: "critical", lastFingerprint: "same", lastAlertedAt: "2026-07-17T11:00:00.000Z" }, "critical", "same", now).action).toBe("critical");
    expect(decideOpsAlert({ lastStatus: "critical", lastFingerprint: "same", lastAlertedAt: "2026-07-18T11:00:00.000Z" }, "warning", "new", now).action).toBe("recovery");
  });
});
