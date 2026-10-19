import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkspaceRecords } from "./fetchWorkspaceRecords.js";

vi.mock("../hooks/useUnifiedData.js", () => ({
  fetchPages: vi.fn(),
  transformUnifiedRecord: (record: unknown) => record,
}));

function response(results: unknown[], total: number): Response {
  return {
    ok: true,
    json: async () => ({ results, pagination: { total } }),
  } as Response;
}

describe("fetchWorkspaceRecords cancellation", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts in-flight pages and does not start queued pages after cancellation", async () => {
    const controller = new AbortController();
    const requestedOffsets: number[] = [];
    let resolveSecondPageStarted!: () => void;
    const startedSecondPage = new Promise<void>((resolve) => {
      resolveSecondPageStarted = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const offset = Number(new URL(String(input)).searchParams.get("offset") ?? 0);
      requestedOffsets.push(offset);
      if (offset === 0) {
        return response(Array.from({ length: 1000 }, (_, index) => ({ id: `record-${index}` })), 5000);
      }
      if (offset === 2000) resolveSecondPageStarted();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const operation = fetchWorkspaceRecords({}, "GBP", 10000, { signal: controller.signal });
    await startedSecondPage;
    controller.abort();

    await expect(operation).rejects.toMatchObject({ name: "AbortError" });
    expect(requestedOffsets).toEqual(expect.arrayContaining([0, 1000, 2000]));
    expect(requestedOffsets).not.toEqual(expect.arrayContaining([3000, 4000]));
  });
});
