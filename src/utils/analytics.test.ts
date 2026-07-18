import { beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@vercel/analytics", () => ({ track }));

import { trackEvent } from "./analytics.js";

describe("analytics privacy boundary", () => {
  beforeEach(() => {
    track.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  });

  it("removes identity and free-text properties before third-party or first-party measurement", () => {
    trackEvent("watchlist_success", {
      firmName: "Sensitive Firm plc",
      email: "person@example.com",
      query: "John Smith",
      source: "watch_firm_button",
    });
    expect(track).toHaveBeenCalledWith("watchlist_success", { source: "watch_firm_button" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("emits only an allowlisted first-party funnel payload", () => {
    trackEvent("evidence_modal_opened", {
      regulator: "FCA",
      surface: "regulator_workspace",
      source_status: "official_verified",
      firmName: "Sensitive Firm plc",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const options = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(options.body));
    expect(body).toMatchObject({
      eventName: "evidence_opened",
      eventVersion: 1,
      dimensions: {
        regulator: "FCA",
        surface: "regulator_workspace",
        source_status: "official_verified",
      },
    });
    expect(JSON.stringify(body)).not.toContain("Sensitive Firm");
  });
});
