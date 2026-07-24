import { getRegulatorCoverage, type RegulatorCoverage } from "../../../src/data/regulatorCoverage.js";

export const SCRAPER_CONTRACT_VERSION = "scraper-contract-v1";

export interface ScraperQualityContractOverride {
  allowZeroRecords?: boolean;
  minimumPreparedRecords?: number;
  maximumPreparedCountDropFraction?: number;
}

export interface ResolvedScraperQualityContract {
  version: typeof SCRAPER_CONTRACT_VERSION;
  regulatorCode: string;
  sourceClass: RegulatorCoverage["automationLevel"];
  cadence: RegulatorCoverage["feedContract"]["cadence"];
  allowZeroRecords: boolean;
  minimumPreparedRecords: number;
  maximumPreparedCountDropFraction: number;
  staleAfterDays: number;
  operatorAction: string;
}

function defaultMinimum(coverage: RegulatorCoverage) {
  if (coverage.automationLevel === "sparse_source") return 0;
  const batchCeiling = coverage.scrapeMode === "archive"
    || coverage.scrapeMode === "open_data"
    || coverage.scrapeMode === "search_register"
    || coverage.scrapeMode === "table"
    ? 10
    : 3;
  return Math.max(1, Math.min(coverage.feedContract.minimumHealthyRecords, batchCeiling));
}

function defaultMaximumDrop(coverage: RegulatorCoverage) {
  if (coverage.automationLevel === "sparse_source") return 0.9;
  if (coverage.automationLevel === "curated_archive") return 0.8;
  if (coverage.automationLevel === "low_frequency") return 0.55;
  return coverage.feedContract.cadence === "fragile" ? 0.55 : 0.35;
}

export function resolveScraperQualityContract(
  regulatorCode: string,
  override: ScraperQualityContractOverride = {},
): ResolvedScraperQualityContract {
  const coverage = getRegulatorCoverage(regulatorCode);
  if (!coverage) {
    throw new Error(`No regulator feed contract is registered for ${regulatorCode}.`);
  }
  const contract: ResolvedScraperQualityContract = {
    version: SCRAPER_CONTRACT_VERSION,
    regulatorCode: coverage.code,
    sourceClass: coverage.automationLevel,
    cadence: coverage.feedContract.cadence,
    allowZeroRecords: override.allowZeroRecords ?? coverage.feedContract.zeroResultPolicy === "sparse_source",
    minimumPreparedRecords: override.minimumPreparedRecords
      ?? (override.allowZeroRecords === true ? 0 : defaultMinimum(coverage)),
    maximumPreparedCountDropFraction: override.maximumPreparedCountDropFraction ?? defaultMaximumDrop(coverage),
    staleAfterDays: coverage.feedContract.staleAfterDays,
    operatorAction: coverage.feedContract.operatorAction,
  };
  if (!Number.isInteger(contract.minimumPreparedRecords) || contract.minimumPreparedRecords < 0) {
    throw new Error("minimumPreparedRecords must be a non-negative integer.");
  }
  if (contract.maximumPreparedCountDropFraction < 0 || contract.maximumPreparedCountDropFraction >= 1) {
    throw new Error("maximumPreparedCountDropFraction must be at least 0 and below 1.");
  }
  if (contract.allowZeroRecords && contract.minimumPreparedRecords > 0) {
    throw new Error("A zero-record contract cannot require a positive minimumPreparedRecords value.");
  }
  return contract;
}
