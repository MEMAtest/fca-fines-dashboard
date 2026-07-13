import { describe, expect, test } from "vitest";
import type { ArticleOutline, DraftedSection, RegulatoryReview } from "../../scripts/lib/editorialSchemas.js";
import {
  SECTION_BLUEPRINTS,
  composeDraftedSections,
  getArticleLengthRepairPlan,
  normaliseEditorialOutline,
  replaceArticleSections,
  routeRegulatoryIssuesToSections,
  splitArticleSections,
} from "../../scripts/lib/editorialSections.js";

const records = Array.from({ length: 8 }, (_, index) => ({
  id: `record-${index + 1}`,
  regulator: index % 2 === 0 ? "FCA" : "SEC",
  firm_individual: `Example Firm ${index + 1}`,
  amount_verified: index < 4,
}));

function outline(): ArticleOutline {
  return {
    title: "Evidence-Led Enforcement Analysis for Senior Boards",
    excerpt: "A source-backed analysis of recent regulatory actions, their verified findings and the practical control questions they raise for senior leaders.",
    keywords: ["enforcement", "governance", "controls", "boards", "regulation"],
    sections: SECTION_BLUEPRINTS.map((section, index) => ({
      key: section.key,
      angle: `Use official evidence to explain the ${section.heading.toLowerCase()} without unsupported predictions.`,
      sourceRecordIds: index === 0 ? ["unknown-record"] : [`record-${(index % 8) + 1}`],
    })),
  };
}

describe("section-based editorial pipeline", () => {
  test("plans evidence-checked expansion when repair drops below the article minimum", () => {
    const normalised = normaliseEditorialOutline(outline(), records);
    const content = normalised.sections.map((section) =>
      `## ${section.heading}\n\n${"Evidence sentence. ".repeat(section.key === "data" ? 20 : 80)}`
    ).join("\n\n");
    const plan = getArticleLengthRepairPlan(content, normalised);
    expect(plan).not.toBeNull();
    expect(plan?.key).not.toBe("data");
    expect(plan?.key).not.toBe("takeaways");
    expect(plan!.targetWords).toBeGreaterThan(plan!.currentWords);
  });

  test("normalises an outline to fixed budgets and valid record IDs", () => {
    const normalised = normaliseEditorialOutline(outline(), records);
    expect(normalised.sections.map((section) => section.key)).toEqual(SECTION_BLUEPRINTS.map((section) => section.key));
    expect(normalised.sections.map((section) => section.targetWords)).toEqual(SECTION_BLUEPRINTS.map((section) => section.targetWords));
    expect(normalised.sections.flatMap((section) => section.sourceRecordIds)).not.toContain("unknown-record");
    expect(new Set(normalised.sections.flatMap((section) => section.sourceRecordIds)).size).toBeGreaterThanOrEqual(5);
  });

  test("assembles and parses six bounded Markdown sections", () => {
    const normalised = normaliseEditorialOutline(outline(), records);
    const drafted: DraftedSection[] = normalised.sections.map((section) => ({
      key: section.key,
      markdown: `${section.heading} evidence paragraph. `.repeat(20),
    }));
    const content = composeDraftedSections(normalised, drafted);
    expect(content.match(/^##\s+/gm)).toHaveLength(6);
    expect(splitArticleSections(content).map((section) => section.key)).toEqual(SECTION_BLUEPRINTS.map((section) => section.key));
  });

  test("routes unsupported verifier claims to the closest section", () => {
    const normalised = normaliseEditorialOutline(outline(), records);
    const drafted: DraftedSection[] = normalised.sections.map((section) => ({
      key: section.key,
      markdown: section.key === "actions"
        ? "The FCA imposed a verified penalty on Example Firm 1 for control failings. ".repeat(8)
        : `${section.heading} source-backed discussion. `.repeat(12),
    }));
    const content = composeDraftedSections(normalised, drafted);
    const review: RegulatoryReview = {
      passed: false,
      issues: [],
      claims: [{
        id: "claim-1",
        text: "The FCA imposed a penalty on Example Firm 1 for control failings.",
        kind: "amount",
        sourceIds: ["source:record-1"],
        recordIds: ["record-1"],
        verdict: "unsupported",
        verifier: "regulatory-verifier-agent",
      }],
    };
    const routed = routeRegulatoryIssuesToSections(content, review);
    expect(routed.has("actions")).toBe(true);
    expect(routed.get("actions")?.[0]).toContain("UNSUPPORTED");
  });

  test("replaces only the repaired section", () => {
    const normalised = normaliseEditorialOutline(outline(), records);
    const drafted: DraftedSection[] = normalised.sections.map((section) => ({
      key: section.key,
      markdown: `${section.key} original evidence. `.repeat(20),
    }));
    const content = composeDraftedSections(normalised, drafted);
    const repaired = replaceArticleSections(content, new Map([["analysis", "Repaired analysis using supported evidence only."]]));
    const sections = splitArticleSections(repaired);
    expect(sections.find((section) => section.key === "analysis")?.markdown).toBe("Repaired analysis using supported evidence only.");
    expect(sections.find((section) => section.key === "overview")?.markdown).toContain("overview original evidence");
  });
});
