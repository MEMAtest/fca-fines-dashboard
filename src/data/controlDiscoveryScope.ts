import { PUBLIC_REGULATOR_CODES } from "./regulatorCoverage.js";
import { UK_ENFORCEMENT_REGULATORS } from "./ukEnforcement.js";

/** Live public regulator perimeter used only for control discovery. */
export const CONTROL_DISCOVERY_REGULATOR_CODES: readonly string[] = Object.freeze(
  [...new Set([
    ...PUBLIC_REGULATOR_CODES,
    ...UK_ENFORCEMENT_REGULATORS.filter(({ stage }) => stage === "live").map(({ code }) => code),
  ].map((code) => code.trim().toUpperCase()))].sort(),
);
