import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("unified search Express route registration", () => {
  it("mounts the website wrapper separately from the registered API handler", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "server.ts"), "utf8");

    expect(source).toContain('import siteUnifiedSearchHandler from "./api/site/unified/search.js";');
    expect(source).toContain('app.get("/api/site/unified/search"');
    expect(source).toContain("await siteUnifiedSearchHandler(req as any, res as any);");
    expect(source).toContain('app.get("/api/unified/search"');
    expect(source).toContain("await unifiedSearchHandler(req as any, res as any);");
  });
});
