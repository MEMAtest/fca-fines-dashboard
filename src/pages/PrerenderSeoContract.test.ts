import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "scripts/prerender-seo.ts"), "utf8");

describe("prerendered SEO intent", () => {
  it("keeps the global fines route aligned with the hydrated database page", () => {
    expect(source).toContain('path: "/fines", title: "Regulatory Fines Database | Global Enforcement Actions"');
    expect(source).toContain('workspace.path === "/fines" ? "Regulatory Fines Database" : workspace.title');
    expect(source).toContain('"@id": `${datasetUrl}#dataset`');
    expect(source).toContain('const isGlobalFinesPage = meta.path === "/fines";');
  });

  it("keeps the FCA hub as the single FCA fines database destination", () => {
    expect(source).toContain('const path = `/regulators/${code.toLowerCase()}`');
    expect(source).toContain('"@id": `${BASE_URL}${path}#dataset`');
    expect(source).toContain('name: code === "FCA" ? "FCA Fines and Enforcement Database"');
    expect(source).toContain('href="/regulators/fca">Open the live FCA fines database</a>');
  });

  it("keeps the informational guide H1 aligned with the hydrated article", () => {
    expect(source).toContain("<h1>How FCA Enforcement Works: Investigation to Penalty</h1>");
  });
});
