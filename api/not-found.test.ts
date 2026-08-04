import { describe, expect, it, vi } from "vitest";
import handler from "./not-found.js";

describe("not-found fallback", () => {
  it("returns a crawler-safe HTTP 404", () => {
    const send = vi.fn();
    const status = vi.fn(() => ({ send }));
    const setHeader = vi.fn();
    handler({} as never, { setHeader, status } as never);
    expect(status).toHaveBeenCalledWith(404);
    expect(setHeader).toHaveBeenCalledWith("X-Robots-Tag", "noindex, follow");
    expect(send.mock.calls[0]?.[0]).toContain('<meta name="robots" content="noindex, follow"');
  });
});
