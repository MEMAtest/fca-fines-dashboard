import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSectionEditorialBrief, runDraftingAgent } from "./editorialAgents.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EnforcementRecord } from "./articleData.js";

const openAiMock = vi.hoisted(() => ({
  calls: [] as Array<Record<string, any>>,
  responder: null as null | ((payload: Record<string, any>) => unknown | Promise<unknown>),
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: async (payload: Record<string, any>) => {
      openAiMock.calls.push(payload);
      if (!openAiMock.responder) throw new Error("No mocked structured response configured");
      return { choices: [{ message: { content: JSON.stringify(await openAiMock.responder(payload)) } }] };
    } } };
    responses = { create: async () => { throw new Error("Unexpected Responses API call in drafting test"); },
      parse: async () => { throw new Error("Unexpected Responses API call in drafting test"); } };
    constructor(_options: Record<string, unknown>) {}
  },
}));

vi.mock("openai/helpers/zod", () => ({
  zodResponseFormat: (_schema: unknown, name: string) => ({ type: "json_schema", json_schema: { name } }),
  zodTextFormat: (_schema: unknown, name: string) => ({ type: "json_schema", json_schema: { name } }),
}));

afterEach(() => {
  openAiMock.calls.length = 0;
  openAiMock.responder = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("section drafting feedback propagation", () => {
  it("carries retry feedback and the original evidence requirements into section prompts", () => {
    const feedback = [
      "Write about the supplied source records only.",
      "Previous attempt failed these checks:",
      "- Article Evidence Contract: Declared evidence-record count does not match the evidence contract (19 unique records)",
    ].join("\n");

    expect(buildSectionEditorialBrief(feedback)).toContain("supplied source records only");
    expect(buildSectionEditorialBrief(feedback)).toContain("Declared evidence-record count does not match the evidence contract (19 unique records)");
    expect(buildSectionEditorialBrief(feedback)).toContain("both apply to this section");
  });

  it("guards the real runDraftingAgent call chain from userPrompt into each generated section", () => {
    const source = readFileSync(join(process.cwd(), "scripts/lib/editorialAgents.ts"), "utf-8");
    const generator = readFileSync(join(process.cwd(), "scripts/generate-ai-article.ts"), "utf-8");
    expect(generator).toMatch(/runDraftingAgent\(systemPrompt, userPrompt/);
    expect(generator).toMatch(/IMPORTANT FEEDBACK FROM PREVIOUS ATTEMPT/);
    expect(generator).toMatch(/if \(!article\) \{\s*qualityReport = null;/);
    expect(generator).toMatch(/if \(!article \|\| !qualityReport\?\.passed\)/);
    expect(source).toMatch(/editorialBrief:\s*buildSectionEditorialBrief\(editorialBrief\)/);
    expect(source).toMatch(/draftSection\(\{ section, outline, records, editorialBrief:\s*userPrompt \}\)/);
  });

  it("sends prior contract feedback in each actual structured section request without a provider call", async () => {
    openAiMock.calls.length = 0;
    vi.stubEnv("EDITORIAL_PROVIDER", "openrouter");
    vi.stubEnv("EDITORIAL_OPENROUTER_APPROVED", "true");
    vi.stubEnv("OPENROUTER_API_KEY", "mock-only-not-a-credential");

    const records: EnforcementRecord[] = Array.from({ length: 5 }, (_, index) => ({
      id: `fixture-${index + 1}`,
      regulator: ["FCA", "SEC", "FINRA", "OCC", "CBI"][index]!,
      firm_individual: `Fixture Firm ${index + 1} Ltd`,
      amount: 0,
      currency: "UNKNOWN",
      amount_gbp: 0,
      date_issued: `2026-10-0${index + 1}`,
      breach_type: "AML control failure",
      summary: "The official notice describes an AML control failure.",
      notice_url: `https://www.fca.org.uk/notices/${index + 1}`,
      source_url: "",
      amount_verified: false,
    }));
    const sectionTargets: Record<string, number> = {
      overview: 180, actions: 320, analysis: 270, implications: 230, takeaways: 200,
    };
    openAiMock.responder = async (payload) => {
      const requestName = payload.response_format?.json_schema?.name as string;
      let response: Record<string, unknown>;
      if (requestName === "regactions_evidence_outline") {
        response = {
          title: "Evidence-led AML Controls",
          excerpt: "A bounded review of AML control failures and the evidence available in selected official enforcement records, with limits clearly stated and no assumptions beyond the supplied notices.",
          keywords: ["AML", "controls", "enforcement", "governance", "risk"],
          sections: ["overview", "actions", "analysis", "implications", "takeaways", "data"].map((key) => ({
            key,
            angle: `Explain the evidence relevant to the ${key} section in the supplied source records.`,
            sourceRecordIds: records.map((record) => record.id),
          })),
        };
      } else {
        const userPayload = JSON.parse(payload.messages.find((message: { role: string }) => message.role === "user").content);
        const sectionKey = String(requestName).match(/regactions_section_(overview|actions|analysis|implications|takeaways)/)?.[1]
          || String(userPayload.sectionKey);
        const target = sectionTargets[sectionKey] || 180;
        let markdown: string;
        if (sectionKey === "takeaways") {
          markdown = Array.from({ length: 5 }, (_, bullet) =>
            `- ${Array.from({ length: 39 }, (_unused, word) => `takeaway${bullet}word${word}`).join(" ")}`
          ).join("\n");
        } else {
          const names = sectionKey === "actions" ? records.map((record) => record.firm_individual).join(" ") : "";
          const fillerCount = target - names.split(/\s+/).filter(Boolean).length;
          markdown = `${names} ${Array.from({ length: fillerCount }, (_unused, word) => `${sectionKey}word${word}`).join(" ")}`.trim();
        }
        response = { key: sectionKey, markdown };
      }
      return response;
    };

    const feedback = "Previous attempt failed these checks:\n- Article Evidence Contract: Declared evidence-record count does not match the evidence contract (19 unique records)";
    const result = await runDraftingAgent(
      "Use only evidence from the supplied rows.",
      `Write a bounded article from the source rows.\n\n${feedback}`,
      { records, minimumWords: 0, maximumWords: 5_000 },
    );

    const sectionRequests = openAiMock.calls.filter((payload) => String(payload.response_format?.json_schema?.name).startsWith("regactions_section_"));
    expect(sectionRequests).toHaveLength(5);
    for (const payload of sectionRequests) {
      const userContent = payload.messages.find((message: { role: string }) => message.role === "user").content;
      const sectionPayload = JSON.parse(userContent);
      const developerPrompt = payload.messages.find((message: { role: string }) => message.role === "system").content;
      expect(sectionPayload.editorialBrief).toContain("Declared evidence-record count does not match the evidence contract (19 unique records)");
      expect(sectionPayload.editorialBrief).toContain("both apply to this section");
      expect(sectionPayload.editorialBrief).toContain("Minimum case-citation and amount-citation targets are coverage requirements, not sample totals.");
      expect(developerPrompt).toContain("Never classify an action as non-monetary");
      expect(developerPrompt).toContain("Do not collectively label actions with unknown amounts as “non-monetary actions”.");
    }
    expect(result.content).toContain("## About the Data");
    expect(openAiMock.calls).toHaveLength(sectionRequests.length + 1);
    openAiMock.responder = null;
  });
});
