import { afterEach, describe, expect, test, vi } from "vitest";

const { createCompletion, createResponse } = vi.hoisted(() => ({
  createCompletion: vi.fn(),
  createResponse: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: createCompletion } };
    responses = { create: createResponse };
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

function openAiResponse(metadata: unknown) {
  return { output_text: JSON.stringify(metadata) };
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
    const retryUserMessage = retryMessages.find((message: { role: string }) => message.role === "user");
    expect(retryUserMessage.content).toContain(tooLong);
    expect(retryUserMessage.content).toContain(tooLongExcerpt);
    expect(retryUserMessage.content).toContain(`"excerpt":${tooLongExcerpt.length}`);
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
      .rejects.toThrow(/failed schema validation after one bounded correction attempt/);
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
    const retryUserMessage = createCompletion.mock.calls[1]?.[0]?.messages.find((message: { role: string }) => message.role === "user");
    expect(retryUserMessage.content).toContain(longExcerpt);
    expect(retryUserMessage.content).toContain("140-180 characters");
  });

  test("uses the OpenAI Responses.create path for one bounded corrective retry", async () => {
    process.env.EDITORIAL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    const overlong = { ...sourceArticle, title: "A real previous title that exceeds the strict limit by a meaningful amount" };
    createResponse
      .mockResolvedValueOnce(openAiResponse(overlong))
      .mockResolvedValueOnce(openAiResponse(sourceArticle));

    const repaired = await runMetadataRepairAgent({ article: sourceArticle, issues: ["Keep the official action date intact"] });

    expect(repaired.title).toBe(sourceArticle.title);
    expect(createResponse).toHaveBeenCalledTimes(2);
    const retryInput = createResponse.mock.calls[1]?.[0]?.input;
    expect(JSON.stringify(retryInput)).toContain(overlong.title);
    const retryUserMessage = retryInput.find((message: { role: string }) => message.role === "user");
    expect(retryUserMessage.content).toContain(`"title":${overlong.title.length}`);
    expect(JSON.stringify(retryInput)).toContain("Keep the official action date intact");
  });

  test("fails closed after one invalid OpenAI correction response", async () => {
    process.env.EDITORIAL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    createResponse
      .mockResolvedValueOnce(openAiResponse({ ...sourceArticle, title: "A title that is deliberately longer than seventy characters to fail schema parsing" }))
      .mockResolvedValueOnce(openAiResponse({ ...sourceArticle, keywords: ["FCA", "AML", "boards", "controls"] }));

    await expect(runMetadataRepairAgent({ article: sourceArticle, issues: [] }))
      .rejects.toThrow(/failed schema validation after one bounded correction attempt/);
    expect(createResponse).toHaveBeenCalledTimes(2);
  });

  test("does not copy generic provider error details into the corrective prompt", async () => {
    process.env.EDITORIAL_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    createResponse
      .mockRejectedValueOnce(new Error("SENSITIVE_PROVIDER_DIAGNOSTIC_DO_NOT_FORWARD"))
      .mockResolvedValueOnce(openAiResponse(sourceArticle));

    await runMetadataRepairAgent({ article: sourceArticle, issues: [] });

    expect(createResponse).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(createResponse.mock.calls[1]?.[0]?.input)).not.toContain("SENSITIVE_PROVIDER_DIAGNOSTIC_DO_NOT_FORWARD");
  });
});
