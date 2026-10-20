import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("axios", () => ({ default: { post } }));

import { createFlareSolverrClient } from "../lib/flaresolverr.js";

describe("FlareSolverr response URL validation", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValueOnce({ data: { status: "ok", session: "test-session" } });
  });

  it("rejects a valid response page whose URL is a different case", async () => {
    post.mockResolvedValueOnce({
      data: {
        status: "ok",
        solution: {
          url: "https://www.fma.govt.nz/about-us/enforcement/cases/bnz/",
          status: 200,
          response: "<h1>BNZ</h1>",
        },
      },
    });
    const client = await createFlareSolverrClient({
      endpoint: "http://solver.test",
      responseURLValidator: (requested, response) => requested === response,
    });

    await expect(
      client.get("https://www.fma.govt.nz/about-us/enforcement/cases/cbl/"),
    ).rejects.toThrow(/response URL did not match requested URL/);
  });

  it("rejects a missing solution URL when validation is configured", async () => {
    post.mockResolvedValueOnce({
      data: { status: "ok", solution: { status: 200, response: "<h1>CBL</h1>" } },
    });
    const client = await createFlareSolverrClient({
      endpoint: "http://solver.test",
      responseURLValidator: (requested, response) => requested === response,
    });

    await expect(client.get("https://www.fma.govt.nz/cases/cbl/")).rejects.toThrow(
      /response URL did not match requested URL.*<missing>/,
    );
  });

  it("accepts a matching solution URL when the validator approves it", async () => {
    post.mockResolvedValueOnce({
      data: {
        status: "ok",
        solution: {
          url: "https://www.fma.govt.nz/cases/cbl/",
          status: 200,
          response: "<h1>CBL</h1>",
        },
      },
    });
    const client = await createFlareSolverrClient({
      endpoint: "http://solver.test",
      responseURLValidator: (requested, response) => requested === response,
    });

    await expect(client.get("https://www.fma.govt.nz/cases/cbl/")).resolves.toBe(
      "<h1>CBL</h1>",
    );
  });
});
