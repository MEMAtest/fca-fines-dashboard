import "dotenv/config";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scrapers = [
  "scrapeFise.ts",
  "scrapeFtdk.ts",
  "scrapeFtno.ts",
  "scrapeCnbcz.ts",
  "scrapeCysec.ts",
  "scrapeFinfsa.ts",
];

export async function main() {
  const args = process.argv.slice(2);

  for (const scraper of scrapers) {
    await new Promise<void>((resolve, reject) => {
      const moduleUrl = pathToFileURL(join(__dirname, scraper)).href;
      const child = spawn(
        process.execPath,
        [
          "--import",
          "tsx/esm",
          "-e",
          `import(${JSON.stringify(moduleUrl)}).then((m) => m.main())`,
          "--",
          ...args,
        ],
        {
          stdio: "inherit",
          env: process.env,
        },
      );

      child.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`${scraper} exited with code ${code}`));
      });
    });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("❌ Europe Phase 2 scraper run failed:", error);
    process.exit(1);
  });
}
