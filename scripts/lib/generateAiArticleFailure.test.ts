import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sendArticleReviewEmail = vi.fn();
const closePool = vi.fn(async () => undefined);
const failedQualityReport = {
  passed: false,
  score: 95,
  checks: [{ id: "article_evidence_contract", name: "Article Evidence Contract", weight: "required", passed: false,
    message: "Declared evidence-record count does not match the evidence contract (19 unique records)" }],
  requiredPassed: 17,
  requiredTotal: 18,
  softPassed: 0,
  softTotal: 0,
};
const passedQualityReport = { ...failedQualityReport, passed: true, checks: failedQualityReport.checks.map((check) => ({ ...check, passed: true })) };
const runQualityGate = vi.fn(() => failedQualityReport);
const runDraftingAgent = vi.fn(async () => ({
  title: "Building Effective AML Controls",
  excerpt: "A bounded guide to effective AML control design from a selected set of official enforcement evidence.",
  keywords: ["AML", "controls", "enforcement", "governance", "risk"],
  content: "Rejected article content retained only for bounded failure diagnostics. ".repeat(8),
}));

vi.mock("../lib/articleData.js", () => ({
  buildDataContext: vi.fn(async () => ({
    records: Array.from({ length: 19 }, (_, index) => ({ id: `r${index + 1}` })),
    dateRange: { start: "2025-11-06", end: "2026-10-08" },
    topRegulators: ["FINRA", "CBUAE", "OCC"],
    stats: [],
    totalActions: 19,
  })),
  closePool,
  formatDataTable: vi.fn(() => "fixture evidence table"),
  getRequiredCaseCitationCount: vi.fn(() => 5),
  getRequiredVerifiedAmountCount: vi.fn(() => 0),
}));

vi.mock("../lib/editorialCalendar.js", () => ({
  getEditorialArticleType: vi.fn(() => "evergreen-guide"),
  selectTopic: vi.fn(() => ({
    title: "Board Guide: Building Effective AML Controls",
    track: "evergreen-guide",
    slug: "board-guide-aml-controls",
    dataType: "aml",
    keywords: ["AML"],
    category: "AML",
  })),
}));

vi.mock("../lib/articleQuality.js", () => ({
  getArticleQualityWordRange: vi.fn(() => ({ minimumWords: 1_100, maximumWords: 1_600 })),
  runQualityGate,
  formatQualityReport: vi.fn(() => "fixture quality report"),
}));

vi.mock("../lib/articleReview.js", () => ({ sendArticleReviewEmail }));
vi.mock("../lib/editorialAgents.js", () => ({
  EDITORIAL_MODELS: { drafting: "mock-model" },
  EDITORIAL_PROMPT_VERSION: "test",
  normaliseEditorialExcerpt: (value: string) => value,
  runDraftingAgent,
}));
vi.mock("../lib/editorialWorkflow.js", () => ({
  buildInitialEditorialManifest: vi.fn(),
  normaliseToHouseStyle: (value: string) => value,
}));
vi.mock("../lib/brandVoice.js", () => ({ getBrandVoiceSystemPrefix: () => "" }));

describe("failed trial generation CLI path", () => {
  afterEach(() => {
    sendArticleReviewEmail.mockClear();
    closePool.mockClear();
    runDraftingAgent.mockReset();
    runQualityGate.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("retains bounded failure diagnostics under trial-dir and exits before email, draft, or result success", async () => {
    runQualityGate.mockReturnValue(failedQualityReport);
    runDraftingAgent.mockResolvedValue({
      title: "Building Effective AML Controls",
      excerpt: "A bounded guide to effective AML control design from a selected set of official enforcement evidence.",
      keywords: ["AML", "controls", "enforcement", "governance", "risk"],
      content: "Rejected article content retained only for bounded failure diagnostics. ".repeat(8),
    });
    const trialDir = mkdtempSync(join(tmpdir(), "regactions-editorial-failure-"));
    const resultFile = join(trialDir, "result.json");
    const previousArgv = process.argv;
    process.argv = [process.execPath, "scripts/generate-ai-article.ts", "--trial", `--trial-dir=${trialDir}`, `--result-file=${resultFile}`];
    let exitCalls = 0;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      exitCalls += 1;
      if (exitCalls === 1) throw new Error("EXPECTED_PROCESS_EXIT");
      return undefined;
    }) as never);

    try {
      await import("../generate-ai-article.js");
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
      expect(sendArticleReviewEmail).not.toHaveBeenCalled();
      expect(readdirSync(join(trialDir, "generation-failures"))).toHaveLength(1);
      const failurePath = join(trialDir, "generation-failures", readdirSync(join(trialDir, "generation-failures"))[0]!);
      const failure = JSON.parse(readFileSync(failurePath, "utf-8"));
      expect(failure.attempts).toHaveLength(1);
      expect(failure.attempts[0].quality.failedChecks[0].message)
        .toBe("Declared evidence-record count does not match the evidence contract (19 unique records)");
      expect(failure.attempts[0].content).toContain("Rejected article content retained");
      expect(failure.sourceRowsIncluded).toBe(false);
      expect(readFileSync(join(trialDir, "generation-log.json"), "utf-8")).toContain("all_attempts_failed");
      expect(() => readFileSync(resultFile, "utf-8")).toThrow();
      expect(() => readFileSync(join(trialDir, "board-guide-aml-controls.json"), "utf-8")).toThrow();
    } finally {
      process.argv = previousArgv;
      exit.mockRestore();
      rmSync(trialDir, { recursive: true, force: true });
    }
  });

  it("retains provider exceptions with a null quality report and no result-file success", async () => {
    runQualityGate.mockReturnValue(failedQualityReport);
    runDraftingAgent.mockRejectedValue(new Error("structured output schema rejected"));
    const trialDir = mkdtempSync(join(tmpdir(), "regactions-editorial-null-failure-"));
    const resultFile = join(trialDir, "result.json");
    const previousArgv = process.argv;
    process.argv = [process.execPath, "scripts/generate-ai-article.ts", "--trial", `--trial-dir=${trialDir}`, `--result-file=${resultFile}`];
    let exitCalls = 0;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      exitCalls += 1;
      if (exitCalls === 1) throw new Error("EXPECTED_PROCESS_EXIT");
      return undefined;
    }) as never);

    try {
      await import("../generate-ai-article.js");
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
      const failureDir = join(trialDir, "generation-failures");
      const failurePath = join(failureDir, readdirSync(failureDir)[0]!);
      const failure = JSON.parse(readFileSync(failurePath, "utf-8"));
      expect(failure.attempts[0].quality).toBeNull();
      expect(failure.attempts[0].generationError).toContain("structured output schema rejected");
      expect(sendArticleReviewEmail).not.toHaveBeenCalled();
      expect(() => readFileSync(resultFile, "utf-8")).toThrow();
    } finally {
      process.argv = previousArgv;
      exit.mockRestore();
      rmSync(trialDir, { recursive: true, force: true });
    }
  });

  it("retries a failed trial within its explicit cap, includes exact feedback, and saves only isolated success", async () => {
    runQualityGate.mockReturnValueOnce(failedQualityReport).mockReturnValueOnce(passedQualityReport);
    runDraftingAgent
      .mockResolvedValueOnce({
        title: "Building Effective AML Controls",
        excerpt: "A bounded guide to effective AML control design from a selected set of official enforcement evidence.",
        keywords: ["AML", "controls", "enforcement", "governance", "risk"],
        content: "First rejected article content. ".repeat(80),
      })
      .mockResolvedValueOnce({
        title: "Building Effective AML Controls",
        excerpt: "A bounded guide to effective AML control design from a selected set of official enforcement evidence.",
        keywords: ["AML", "controls", "enforcement", "governance", "risk"],
        content: "Second article passed the mocked strict quality gate. ".repeat(80),
      });
    const trialDir = mkdtempSync(join(tmpdir(), "regactions-editorial-retry-trial-"));
    const resultFile = join(trialDir, "result.json");
    const previousArgv = process.argv;
    const previousTrialMode = process.env.EDITORIAL_TRIAL_MODE;
    process.argv = [process.execPath, "scripts/generate-ai-article.ts", "--trial", "--trial-attempts=2", `--trial-dir=${trialDir}`, `--result-file=${resultFile}`];

    try {
      await import("../generate-ai-article.js");
      const savedDraft = join(trialDir, "board-guide-aml-controls.json");
      await vi.waitFor(() => expect(readFileSync(savedDraft, "utf-8")).toContain("Second article passed"));
      expect(runDraftingAgent).toHaveBeenCalledTimes(2);
      expect(runDraftingAgent.mock.calls[1]?.[1]).toContain("Declared evidence-record count does not match the evidence contract (19 unique records)");
      expect(sendArticleReviewEmail).not.toHaveBeenCalled();
      expect(() => readFileSync(resultFile, "utf-8")).toThrow();
      expect(readFileSync(join(trialDir, "generation-log.json"), "utf-8")).toContain("trial_saved");
      expect(() => readdirSync(join(trialDir, "generation-failures"))).toThrow();
    } finally {
      process.argv = previousArgv;
      if (previousTrialMode === undefined) delete process.env.EDITORIAL_TRIAL_MODE;
      else process.env.EDITORIAL_TRIAL_MODE = previousTrialMode;
      rmSync(trialDir, { recursive: true, force: true });
    }
  });

  it.each([
    { argv: ["--trial", "--trial-attempts=0", "--trial-dir=/tmp/ignored"], message: "integer from 1 to 3" },
    { argv: ["--trial", "--trial-attempts=4", "--trial-dir=/tmp/ignored"], message: "integer from 1 to 3" },
    { argv: ["--trial", "--trial-attempts=1.5", "--trial-dir=/tmp/ignored"], message: "integer from 1 to 3" },
    { argv: ["--trial", "--trial-attempts=2", "--trial-attempts=3", "--trial-dir=/tmp/ignored"], message: "specified only once" },
    { argv: ["--trial-attempts=2"], message: "only with --trial" },
  ])("rejects invalid trial-attempt options: $argv", async ({ argv, message }) => {
    const previousArgv = process.argv;
    process.argv = [process.execPath, "scripts/generate-ai-article.ts", ...argv];
    try {
      await expect(import("../generate-ai-article.js")).rejects.toThrow(message);
      expect(runDraftingAgent).not.toHaveBeenCalled();
      expect(sendArticleReviewEmail).not.toHaveBeenCalled();
    } finally {
      process.argv = previousArgv;
    }
  });
});
