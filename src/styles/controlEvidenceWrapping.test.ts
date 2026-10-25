import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("control evidence provenance wrapping", () => {
  it("allows long hashes and source labels to wrap inside mobile cards", () => {
    const modalCss = readFileSync("src/styles/evidence-modal.css", "utf8");
    const explorerCss = readFileSync("src/styles/enforcement-explorer.css", "utf8");

    expect(modalCss).toMatch(/\.evidence-modal__control-match\s*\{[^}]*min-width:\s*0/);
    expect(modalCss).toMatch(/\.evidence-modal__control-match\s*>\s*\*\s*\{\s*min-width:\s*0/);
    expect(modalCss).toMatch(/\.evidence-modal__control-match small,\.evidence-modal__control-match a\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere/);

    expect(explorerCss).toMatch(/\.enforcement-explorer__control-match\s*\{[^}]*min-width:\s*0/);
    expect(explorerCss).toMatch(/\.enforcement-explorer__control-match\s*>\s*\*\s*\{\s*min-width:\s*0/);
    expect(explorerCss).toMatch(/\.enforcement-explorer__control-match small,\.enforcement-explorer__control-match a\s*\{[^}]*max-width:\s*100%;[^}]*overflow-wrap:\s*anywhere/);
  });
});
