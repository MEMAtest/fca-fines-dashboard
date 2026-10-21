import { afterEach, describe, expect, test, vi } from "vitest";

const { createCompletion, parseResponse } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  parseResponse: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createCompletion } };
    responses = { parse: parseResponse };
  },
}));

import { runMetadataRepairAgent } from "../../scripts/lib/editorialAgents.js";

const sourceArticle = {
  title: "An article title within the required limit",
  excerpt: "A source-grounded excerpt with enough detail to describe the regulatory action and its significance without adding unsupported claims or predictions.",
  keywords: ["regulation", "enforcement", "governance", "evidence", "controls"],
  content: "An article based only on the supplied regulatory evidence.",
};

function response(metadata: unknown) {
  return { choices: [{ message: { content: JSON.stringify(metadata) } }] };
}

describe("metadata repair schema recovery", () => {
  const priorEnv = {
    provider: process.env.EDITORIAL_PROVIDER,
    approved: process.env.EDITORIAL_OPENROUTER_APPROVED,
    key: process.env.OPENROUTER_API_KEY,
    openAiKey: process.env.OPENAI_API_KEY,
  };

  afterEach(() => {
    vi.clearAllMocks();
    if (priorEnv.provider === undefined) delete process.env.EDITORIAL_PROVIDER;
    else process.env.EDITORIAL_PROVIDER = priorEnv.provider;
    if (priorEnv.approved === undefined) delete process.env.EDITORIAL_OPENROUTER_APPROVED;
    else process.env.EDITORIAL_OPENROUTER_APPROVED = priorEnv.approved;
    if (priorEnv.key === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = priorEnv.key;
    if (priorEnv.openAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorEnv.openAiKey;
  });

  test("re-prompts once when plausible metadata exceeds the title limit, without truncating it", async () => {
    process.env.EDITORIAL_PROVIDER = "openrouter";
    process.env.EDITORIAL_OPENROUTER_APPROVED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    const tooLong = "A regulatory action title that is deliberately longer than the strict seventy character limit";
    const tooLongExcerpt = `${sourceArticle.excerpt} Additional supplied-context wording that pushes this excerpt beyond its strict character limit without changing any of the underlying facts.`;
    const valid = { ...sourceArticle, title: "A concise regulatory action title" };
    createCompletion
      .mockResolvedValueOnce(response({ ...valid, title: tooLong, excerpt: tooLongExcerpt }))
      .mockResolvedValueOnce(response(valid));

    const repaired = await runMetadataRepairAgent({ article: sourceArticle, issues: ["Clarify the action"] });

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(repaired.title).toBe(valid.title);
    const retryMessages = createCompletion.mock.calls[1]?.[0]?.messages;
    expect(JSON.stringify(retryMessages)).toContain("10-70 characters");
    expect(JSON.stringify(retryMessages)).toContain("never truncate");
  });

  test("fails closed when the bounded correction still violates metadata limits", async () => {
    process.env.EDITORIAL_PROVIDER = "openrouter";
    process.env.EDITORIAL_OPENROUTER_APPROVED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    const tooLong = "A regulatory action title that is deliberately longer than the strict seventy character limit";
    createCompletion
      .mockResolvedValueOnce(response({ ...sourceArticle, title: tooLong }))
      .mockResolvedValueOnce(response({ ...sourceArticle, title: "A valid title length", keywords: ["FCA", "AML", "boards", "controls"] }));

    await expect(runMetadataRepairAgent({ article: sourceArticle, issues: [] }))
      .rejects.toThrow(/regactions_metadata_repair returned JSON with the wrong shape/);
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });

  test("returns valid first-pass metadata without spending a correction call", async () => {
    process.env.EDITORIAL_PROVIDER = "openrouter";
    process.env.EDITORIAL_OPENROUTER_APPROVED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    createCompletion.mockResolvedValueOnce(response(sourceArticle));

    await expect(runMetadataRepairAgent({ article: sourceArticle, issues: [] }))
      .resolves.toMatchObject({ title: sourceArticle.title });
    expect(createCompletion).toHaveBeenCalledTimes(1);
  });

  test("retries an excerpt-only overlength response instead of accepting a truncated candidate", async () => {
    process.env.EDITORIAL_PROVIDER = "openrouter";
    process.env.EDITORIAL_OPENROUTER_APPROVED = "true";
    process.env.OPENROUTER_API_KEY = "test-key";
    const longExcerpt = `This source-grounded excerpt is deliberately over the strict maximum length. ${"Additional source context must not be cut from the middle of this text. ".repeat(4)}`;
    createCompletion
      .mockResolvedValueOnce(response({ ...sourceArticle, excerpt: longExcerpt }))
      .mockResolvedValueOnce(response(sourceArticle));

    const repaired = await runMetadataRepairAgent({ article: sourceArticle, issues: [] });

    expect(createCompletion).toHaveBeenCalledTimes(2);
    expect(repaired.excerpt).toBe(sourceArticle.excerpt);
    const firstUserMessage = createCompletion.mock.calls[0]?.[0]?.messages.find((message: { role: string }) => message.role === "user");
    expect(JSON.parse(firstUserMessage.content).article).toEqual(sourceArticle);
    expect(JSON.parse(firstUserMessage.content).article.content).toBe(sourceArticle.content);
  });

  test("uses the OpenAI Responses.parse path for one bounded corrective retry", async () => {
    process.env.EDITORIAL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    parseResponse
      .mockRejectedValueOnce(new Error("regactions_metadata_repair title must be at most 70 characters"))
      .mockResolvedValueOnce({ output_parsed: sourceArticle });

    const repaired = await runMetadataRepairAgent({ article: sourceArticle, issues: ["Keep the official action date intact"] });

    expect(repaired.title).toBe(sourceArticle.title);
    expect(parseResponse).toHaveBeenCalledTimes(2);
    const retryInput = parseResponse.mock.calls[1]?.[0]?.input;
    expect(JSON.stringify(retryInput)).toContain("title must be at most 70 characters");
    expect(JSON.stringify(retryInput)).toContain("Keep the official action date intact");
  });

  test("fails closed after one invalid OpenAI correction response", async () => {
    process.env.EDITORIAL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    parseResponse
      .mockRejectedValueOnce(new Error("invalid title length"))
      .mockRejectedValueOnce(new Error("excerpt must be at most 220 characters"));

    await expect(runMetadataRepairAgent({ article: sourceArticle, issues: [] }))
      .rejects.toThrow(/excerpt must be at most 220 characters/);
    expect(parseResponse).toHaveBeenCalledTimes(2);
  });
});
