#!/usr/bin/env npx tsx
/**
 * Gate for the automated weekly score snapshot (which self-merges to main).
 *
 *   npx tsx scripts/validate-score-snapshots.ts --base=<main copy> --file=<generated>
 *
 * Fails unless the generated history is a strict, append-only extension of the
 * history already on main.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

export interface SnapshotLike {
  date: string;
  scores: Record<string, number>;
  methodologyVersion?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COUNTRY_DROP = 2;

function structuralErrors(label: string, history: unknown): string[] {
  if (!Array.isArray(history)) return [`${label}: not a JSON array`];
  const errors: string[] = [];
  let previous: string | null = null;
  history.forEach((entry: SnapshotLike, index) => {
    const where = `${label}[${index}]`;
    if (!entry || typeof entry.date !== "string" || !ISO_DATE.test(entry.date) || Number.isNaN(Date.parse(entry.date))) {
      errors.push(`${where}: invalid date`);
      return;
    }
    if (previous !== null && entry.date <= previous) errors.push(`${where}: date ${entry.date} is not strictly after ${previous}`);
    previous = entry.date;
    if (!entry.scores || typeof entry.scores !== "object" || Array.isArray(entry.scores)) {
      errors.push(`${where}: scores missing`);
      return;
    }
    for (const [iso2, score] of Object.entries(entry.scores)) {
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 10) {
        errors.push(`${where}: score for ${iso2} is out of range (${String(score)})`);
      }
    }
  });
  return errors;
}

export function validateSnapshotHistory(base: unknown, next: unknown): string[] {
  const errors = [...structuralErrors("base", base), ...structuralErrors("generated", next)];
  if (errors.length) return errors;
  const baseHistory = base as SnapshotLike[];
  const nextHistory = next as SnapshotLike[];

  // Superset: every existing entry survives byte-for-byte in meaning.
  for (const entry of baseHistory) {
    const kept = nextHistory.find((candidate) => candidate.date === entry.date);
    if (!kept) errors.push(`history dropped the ${entry.date} snapshot`);
    else if (JSON.stringify(kept) !== JSON.stringify(entry)) errors.push(`history changed the ${entry.date} snapshot`);
  }
  const added = nextHistory.filter((entry) => !baseHistory.some((existing) => existing.date === entry.date));
  if (added.length > 1) errors.push(`more than one new snapshot (${added.map((entry) => entry.date).join(", ")})`);
  const last = baseHistory[baseHistory.length - 1];
  for (const entry of added) {
    if (last && entry.date <= last.date) errors.push(`new snapshot ${entry.date} is not after the latest existing ${last.date}`);
    if (last) {
      const previousCount = Object.keys(last.scores).length;
      const newCount = Object.keys(entry.scores).length;
      if (newCount < previousCount - MAX_COUNTRY_DROP) {
        errors.push(`new snapshot covers ${newCount} countries, down from ${previousCount} (allowed drop ${MAX_COUNTRY_DROP})`);
      }
    }
  }
  return errors;
}

function arg(name: string): string {
  const value = process.argv.find((item) => item.startsWith(`--${name}=`))?.split("=")[1];
  if (!value) throw new Error(`Missing --${name}=<path>`);
  return value;
}

function main() {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
  const errors = validateSnapshotHistory(read(arg("base")), read(arg("file")));
  if (errors.length) {
    console.error(`Score snapshot validation failed:\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log("Score snapshot history is a valid append-only extension of main.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
