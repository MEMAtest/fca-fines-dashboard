import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const pdfPath = process.env.BOARD_PACK_PDF_PATH;
if (!pdfPath) throw new Error("BOARD_PACK_PDF_PATH is required");

const outputDirectory = process.env.PRODUCTION_ACCEPTANCE_ARTIFACT_DIR ?? dirname(pdfPath);
await mkdir(outputDirectory, { recursive: true });
const file = await readFile(pdfPath);
const details = await stat(pdfPath);
if (!file.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("Board Pack download does not start with a PDF signature.");
if (details.size < 5_000) throw new Error(`Board Pack PDF is unexpectedly small (${details.size} bytes).`);

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

const pdfInfo = run("pdfinfo", [pdfPath]);
const pages = Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1] ?? 0);
if (pages < 1) throw new Error("Board Pack PDF has no pages.");
const extractedText = run("pdftotext", ["-layout", pdfPath, "-"]);
for (const heading of ["Executive summary", "Board / Risk Committee Use"]) {
  if (!extractedText.includes(heading)) throw new Error(`Board Pack PDF is missing the expected heading: ${heading}`);
}
if (/\u00ad/.test(extractedText) || /[A-Za-z]-\s*\n\s*[a-z]/.test(extractedText)) {
  throw new Error("Board Pack PDF contains a soft-hyphen or a split lowercase word.");
}

const renderStem = join(outputDirectory, "board-pack-page");
run("pdftoppm", ["-f", "1", "-l", "1", "-png", "-r", "144", pdfPath, renderStem]);
const renderPath = `${renderStem}-1.png`;
const renderDetails = await stat(renderPath);
if (renderDetails.size < 1_000) throw new Error("Board Pack first-page render is unexpectedly small.");

const metadata = {
  pdf: basename(pdfPath),
  bytes: details.size,
  pages,
  pdfInfo,
  render: basename(renderPath),
  renderBytes: renderDetails.size,
  headingsChecked: ["Executive summary", "Board / Risk Committee Use"],
};
await writeFile(join(outputDirectory, "board-pack-pdf-verification.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify(metadata));
