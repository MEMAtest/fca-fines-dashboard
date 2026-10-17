/**
 * Site-wide constants for RegActions platform
 * Single source of truth for marketing copy and configuration
 */

import { PUBLIC_REGULATOR_CODES } from "../data/regulatorCoverage.js";

export const SITE_NAME = "RegActions";
// Public copy must match the configured live regulator set. Runtime views
// replace action totals with live API values; this is only the coverage count.
export const REGULATOR_COUNT_NUMERIC = PUBLIC_REGULATOR_CODES.length;
export const REGULATOR_COUNT = String(REGULATOR_COUNT_NUMERIC);
export const REGULATOR_COUNT_COPY = `${REGULATOR_COUNT} configured live financial regulators`;
export const SITE_DOMAIN = "regactions.com";
export const SITE_URL = `https://${SITE_DOMAIN}`;
