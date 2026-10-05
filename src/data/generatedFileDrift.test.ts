import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Generated files that were edited by hand, and generators that quietly undo
 * those edits, have caused four separate outages in this repository.
 *
 * The sanctions snapshot was hand-edited to reclassify Venezuela, and the
 * database never agreed. `governanceData.ts` had `hasGovernanceData` corrected
 * by hand to accept a partial dimension series, and `ingest-wgi.ts` reverted it
 * on every monthly run, dropping a jurisdiction and blocking the monthly
 * release for good. Both were found only by chasing a symptom weeks later.
 *
 * Each case had the same signature: a function the generator emits verbatim no
 * longer matched what the generator emits. That is checkable directly and
 * cheaply, without running the generator, which matters because most of these
 * fetch from the network.
 *
 * The rule: where a generator and its output export a function of the same
 * name, and the generator's copy is fully static (no interpolation), the two
 * must be byte-identical once comments and whitespace are normalised. A
 * hand-edit to such a function fails here rather than at the next ingest.
 */

const PAIRS: Array<{ output: string; generator: string }> = [
  { output: "src/data/governanceData.ts", generator: "scripts/ingest-wgi.ts" },
  { output: "src/data/cpiData.ts", generator: "scripts/ingest-cpi.ts" },
  { output: "src/data/blogArticleIndex.ts", generator: "scripts/generate-blog-index.ts" },
  { output: "src/data/fatfAssessmentData.ts", generator: "scripts/country-risk/ingest-fatf-assessments.ts" },
  { output: "src/data/euSanctionsRegimeData.ts", generator: "scripts/country-risk/ingest-eu-sanctions-regimes.ts" },
  { output: "src/data/beneficialOwnershipRegisterData.ts", generator: "scripts/country-risk/ingest-open-ownership.ts" },
  { output: "src/data/sanctionsApprovedData.ts", generator: "scripts/country-risk/promote-sanctions-snapshot.ts" },
];

/** Every `export function NAME(...) { ... }` block, by name, brace-matched. */
function exportedFunctions(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const declaration = /export function ([A-Za-z0-9_]+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = declaration.exec(source)) !== null) {
    const start = match.index;
    const bodyStart = source.indexOf("{", declaration.lastIndex);
    if (bodyStart === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = bodyStart; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) { end = i + 1; break; }
      }
    }
    if (end === -1) continue;
    found.set(match[1], source.slice(start, end));
  }
  return found;
}

/** Comments and whitespace carry no behaviour; everything else must match. */
function normalise(block: string): string {
  return block
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("generated files match their generators", () => {
  for (const { output, generator } of PAIRS) {
    it(`${output} does not drift from ${generator}`, () => {
      const outputSource = readFileSync(path.resolve(output), "utf8");
      const generatorSource = readFileSync(path.resolve(generator), "utf8");

      const emitted = exportedFunctions(generatorSource);
      const committed = exportedFunctions(outputSource);

      const shared = [...committed.keys()].filter((name) => emitted.has(name));
      for (const name of shared) {
        const template = emitted.get(name)!;
        // Anything interpolated is data, not logic, and legitimately differs.
        if (template.includes("${")) continue;
        expect(normalise(committed.get(name)!), `${output}: ${name}() no longer matches ${generator}`)
          .toBe(normalise(template));
      }
    });
  }

  it("every generated file still names the generator that produces it", () => {
    for (const { output, generator } of PAIRS) {
      const source = readFileSync(path.resolve(output), "utf8");
      expect(source, `${output} should name its generator in its header`).toContain(generator);
    }
  });
});
