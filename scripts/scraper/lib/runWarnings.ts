/**
 * Non-fatal operational warnings raised by a loader during a run (for example
 * "3 scanned notices are awaiting extraction"). runScraper copies them into the
 * run summary JSON so ops can see them without the run failing.
 */
const warnings: string[] = [];

export function recordRunWarning(message: string): void {
  warnings.push(message);
  console.warn(`⚠️ ${message}`);
  // Surfaces as an annotation on the GitHub Actions run.
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Scraper ops warning::${message.replace(/\r?\n/g, " ")}`);
}

export function drainRunWarnings(): string[] {
  return warnings.splice(0, warnings.length);
}
