import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("compact control discovery cards", () => {
  it("clamps the case context and gives mobile the lead case facts before match evidence", () => {
    const explorer = readFileSync("src/styles/enforcement-explorer.css", "utf8");
    expect(explorer).toMatch(/\.enforcement-explorer__case-summary\s*\{[^}]*-webkit-line-clamp:\s*2/);
    expect(explorer).toMatch(/\.enforcement-explorer__control-match-preview\s*\{[^}]*-webkit-line-clamp:\s*2/);
    expect(explorer).toMatch(/\.enforcement-explorer__case-amount--review\s*\{[^}]*background:[^}]*color:/);
    expect(explorer).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.enforcement-explorer__case-facts\s*\{[^}]*display:\s*flex/);
    expect(explorer).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.enforcement-explorer__meta-col\s*\{[^}]*display:\s*none/);
    expect(explorer).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.enforcement-explorer__entity strong\s*\{[^}]*font-size:\s*15px/);
    expect(explorer).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?\.enforcement-explorer__case-summary,.enforcement-explorer__control-match-preview\s*\{[^}]*font-size:\s*13px/);
    expect(explorer).toMatch(/\.enforcement-explorer__control-match summary\s*\{[^}]*min-height:\s*32px/);
    expect(explorer).toMatch(/\.enforcement-explorer__evidence-link\s*\{[^}]*min-height:\s*32px/);
  });

  it("keeps full modal passages behind a keyboard-operable native disclosure", () => {
    const modal = readFileSync("src/styles/evidence-modal.css", "utf8");
    expect(modal).toMatch(/\.evidence-modal__control-match-preview\s*\{[^}]*-webkit-line-clamp:\s*2/);
    expect(modal).toMatch(/\.evidence-modal__control-match summary\s*\{[^}]*cursor:\s*pointer/);
    expect(modal).toMatch(/@media\s*\(max-width:\s*700px\)[\s\S]*?\.evidence-modal__control-match summary\s*\{[^}]*min-height:\s*32px/);
  });
});
