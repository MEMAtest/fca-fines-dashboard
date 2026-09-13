import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());

describe("regulator comparison deep-link contract", () => {
  it("matches the client route and bypasses the intentional non-SPA 404 fallback", () => {
    const routerSource = fs.readFileSync(path.join(root, "src/router.tsx"), "utf8");
    const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(routerSource).toContain('path: "/regulators/:regulatorCode/compare"');

    const compareRewrite = vercel.rewrites.find(
      (rewrite) => rewrite.source === "/regulators/:regulatorCode/compare",
    );
    const notFoundRewriteIndex = vercel.rewrites.findIndex(
      (rewrite) => rewrite.destination === "/api/not-found",
    );

    expect(compareRewrite).toEqual({
      source: "/regulators/:regulatorCode/compare",
      destination: "/index.html",
    });
    expect(vercel.rewrites.indexOf(compareRewrite!)).toBeLessThan(notFoundRewriteIndex);
  });
});
