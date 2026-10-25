#!/usr/bin/env node
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pageCountries } from "../../src/data/countryView.js";
import { computeCountryRiskV3 } from "../../src/data/countryRiskV3.js";
import { buildCountryRiskShadowReport, parseAsOfDate, parseShadowBenchmarkJson } from "../../src/data/countryRiskShadow.js";

function flagValue(name: string): string | undefined {
  const equalsArg = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const allowedFlags = new Set(["--as-of", "--output", "--benchmark"]);
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--")) {
    const name = arg.split("=", 1)[0];
    if (!allowedFlags.has(name)) throw new Error(`Unsupported option: ${name}`);
  }
}

const asOfFlag = flagValue("--as-of") ?? new Date().toISOString().slice(0, 10);
const asOf = parseAsOfDate(asOfFlag);
const outputArg = flagValue("--output");
if (process.argv.includes("--output") && !outputArg) throw new Error("--output requires a path");
const output = path.resolve(outputArg ?? `/tmp/country-risk-shadow-${asOfFlag}.json`);
const benchmarkPath = flagValue("--benchmark");
if (process.argv.includes("--benchmark") && !benchmarkPath) throw new Error("--benchmark requires a manually supplied JSON path");

let benchmark = null;
if (benchmarkPath) {
  const benchmarkFile = path.resolve(benchmarkPath);
  const metadata = await stat(benchmarkFile);
  if (!metadata.isFile() || metadata.size > 1_048_576) throw new Error("Benchmark file must be a regular file no larger than 1 MiB");
  benchmark = parseShadowBenchmarkJson(await readFile(benchmarkFile));
}

const countries = pageCountries().map((country) => ({
  iso2: country.iso2,
  country: country.name,
  result: computeCountryRiskV3(country.iso2, { asOf }),
}));
const report = buildCountryRiskShadowReport({ asOf, countries, benchmark });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify(report.summary));
console.log(`Wrote offline shadow evidence to ${output}`);
