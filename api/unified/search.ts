/**
 * Unified Search API - Search across ALL regulators (FCA + EU)
 *
 * Queries the canonical enforcement evidence materialized view
 * Supports filtering by regulator, country, year, amount, breach, firm name
 * Returns normalized data with both EUR and GBP amounts
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
import { buildServerlessPostgresOptions, resolveConnectionString } from '../../server/db.js';
import {
  buildFcaFineCasePath,
  isValidFcaFineCaseId,
  normaliseFcaFineEntityName,
} from '../../server/services/fcaFineCases.js';
import { PUBLIC_REGULATOR_CODES } from '../../src/data/regulatorCoverage.js';
import { CONTROL_DISCOVERY_REGULATOR_CODES } from '../../src/data/controlDiscoveryScope.js';
import { resolveCountry } from '../../src/data/countries.js';
import { authoriseDeveloperApiRequest, setDeveloperApiCache } from '../../server/services/developerApiAccess.js';
import {
  CYBER_OPERATIONAL_RESILIENCE,
  CYBER_OPERATIONAL_RESILIENCE_ALIASES,
  conceptEvidenceReasons,
  resolveEnforcementConcept,
} from '../../src/data/enforcementConcepts.js';
import { classifyEnforcementOutcome } from '../../src/data/enforcementOutcomes.js';
import { enforcementFinesOnlyPredicate, enforcementOutcomePredicate } from '../../server/services/enforcementOutcomeSql.js';
import { expandSearchTerms, prepareEnforcementSearch } from '../../server/services/enforcementSearch.js';
import { expandFirmAliasTerms } from '../../server/services/firmAliases.js';
import { currentApprovedControlEvidenceIdentityPredicate } from '../../server/services/controlEvidenceSql.js';
import { buildControlCandidateCaseSourceSql } from '../../server/services/controlDiscoverySql.js';
import {
  CONTROL_DEFINITIONS,
  CONTROL_TAXONOMY_VERSION,
  resolveControlQuery,
} from '../../src/data/controlTaxonomy.js';

const databaseUrl = resolveConnectionString() || '';
const sql = postgres(databaseUrl, buildServerlessPostgresOptions(databaseUrl));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const access = await authoriseDeveloperApiRequest(req, res, '/api/unified/search');
  if (!access) return;
  setDeveloperApiCache(res, access);

  try {
    // Parse query parameters
    const {
      q,                  // Browse or filter by firm, summary, breach or regulator
      regulator,          // 'FCA', 'BaFin', 'AMF', etc.
      country,            // 'UK', 'DE', 'FR', etc.
      countryScope,       // 'worldwide' suppresses only natural-language country hints
      year,               // 2024, 2025, etc.
      month,              // 1-12, used by monthly chart drill-downs
      minAmount,          // Minimum fine amount
      maxAmount,          // Maximum fine amount
      amountBand,         // Exact Fines analytics drill-down band
      breachCategory,     // 'AML', 'MARKET_ABUSE', etc.
      sector,             // Normalized firm category
      outcome,            // Optional Fines workspace outcome filter
      control,            // One or more governed control codes
      finesOnly,          // Optional control-search monetary-penalty scope
      currency = 'GBP',   // 'GBP' or 'EUR' for display
      firmName,           // Fuzzy search on firm name
      sortBy = 'date_issued', // Sort column
      order = 'desc',     // 'asc' or 'desc'
      limit = '100',      // Results per page
      offset = '0'        // Pagination offset
    } = req.query as Record<string, string>;

    // Validate inputs
    const validSortColumns = ['date_issued', 'amount_gbp', 'amount_eur', 'firm_individual', 'regulator', 'country_code'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'date_issued';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const limitNum = Math.min(parseInt(limit) || 100, 5000); // Command Centre can request the public working set
    const offsetNum = parseInt(offset) || 0;

    // Choose amount column based on currency preference
    const trustedAmountColumn = currency === 'EUR' ? 'trusted_amount_eur' : 'trusted_amount_gbp';

    const naturalControlQuery = q?.trim() ? resolveControlQuery(q.trim()) : null;
    const validControlCodes = new Set(CONTROL_DEFINITIONS.map((item) => item.code));
    const explicitControlCodes = control ? control.split(',').map((value) => value.trim()).filter(Boolean) : [];
    if (explicitControlCodes.some((value) => !validControlCodes.has(value))) {
      return res.status(400).json({ error: 'Invalid control filter' });
    }
    // The UI turns natural control intent into explicit URL filters when a
    // user changes a checkbox. Keep running the same location/regulator
    // preparer on that residual text so e.g. `q=uk&countryScope=worldwide`
    // doesn't become a literal firm-name search after that transition.
    const controlIntentQuery = naturalControlQuery?.residualQuery
      ?? (explicitControlCodes.length && q?.trim() ? q.trim() : null);
    const controlSearchHints = controlIntentQuery ? prepareEnforcementSearch(controlIntentQuery) : null;
    const requestedControls = [
      ...explicitControlCodes,
      ...(naturalControlQuery?.controls ?? []),
    ].map((value) => value.trim()).filter((value, index, values) =>
      validControlCodes.has(value) && values.indexOf(value) === index,
    );
    const hasControlIntentContext = naturalControlQuery !== null || explicitControlCodes.length > 0;
    const residualQuery = hasControlIntentContext
      ? (controlSearchHints && (controlSearchHints.countryHints.length || controlSearchHints.regulatorHints.length)
        ? controlSearchHints.firmIntentQuery
        : controlIntentQuery ?? '')
      : q?.trim() ?? '';
    const effectiveOutcome = outcome || undefined;
    const finesOnlyRequested = naturalControlQuery?.finesOnly || finesOnly === '1' || finesOnly === 'true';
    const worldwideCountryScope = countryScope === 'worldwide';
    const explicitCountryCode = !worldwideCountryScope && country ? resolveCountry(country)?.iso2 ?? country.trim().toUpperCase() : null;
    // Keep a compact, user-facing description of the same geography and
    // regulator perimeter used below. The UI must not re-parse q on its own.
    const explicitRegulatorCodes = regulator?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
    const resolvedCountryCodes = explicitCountryCode
      ? [explicitCountryCode]
      : !worldwideCountryScope && controlSearchHints?.countryHints.length
        ? [...controlSearchHints.countryHints]
        : null;
    const requestedRegulatorScope = explicitRegulatorCodes.length
      ? explicitRegulatorCodes.map((value) => value.toUpperCase())
      : controlSearchHints?.regulatorHints.length
        ? [...controlSearchHints.regulatorHints].map((value) => value.toUpperCase())
        : requestedControls.length
          ? [...CONTROL_DISCOVERY_REGULATOR_CODES]
          : [...PUBLIC_REGULATOR_CODES].map((value) => value.toUpperCase());
    const resolvedRegulatorCodes = requestedControls.length
      ? requestedRegulatorScope.filter((value) => CONTROL_DISCOVERY_REGULATOR_CODES.includes(value))
      : requestedRegulatorScope;
    const resolvedScope = {
      countryCodes: resolvedCountryCodes,
      countrySource: explicitCountryCode ? 'explicit_filter' as const : resolvedCountryCodes ? 'query_hint' as const : 'all' as const,
      regulatorCodes: [...new Set(resolvedRegulatorCodes)],
      regulatorSource: explicitRegulatorCodes.length
        ? 'explicit_filter' as const
        : controlSearchHints?.regulatorHints.length
          ? 'query_hint' as const
          : 'live_default' as const,
      coverage: 'observed_matches' as const,
    };

    // Control searches require a completed index for the current taxonomy.
    // Later case growth is surfaced as a coverage caveat rather than silently
    // broadening the result set or blocking otherwise current matches.
    let controlIndexState: { scan_as_of: string; indexed_at: string; public_case_count: number; public_max_case_id: string | null } | null = null;
    if (requestedControls.length) {
      const stateRows = await sql.unsafe(`
        SELECT taxonomy_version, scan_as_of, indexed_at, public_case_count,
               public_max_case_id, complete
        FROM public.enforcement_control_summary_index_state_versions
        WHERE scope_key = $1
          AND taxonomy_version = $2
        LIMIT 1
      `, ['public', CONTROL_TAXONOMY_VERSION]);
      const state = stateRows[0];
      if (!state || state.complete !== true || state.taxonomy_version !== CONTROL_TAXONOMY_VERSION) {
        return res.status(503).json({ error: 'Control evidence is temporarily unavailable' });
      }
      controlIndexState = {
        scan_as_of: state.scan_as_of,
        indexed_at: state.indexed_at,
        public_case_count: Number(state.public_case_count) || 0,
        public_max_case_id: state.public_max_case_id ? String(state.public_max_case_id) : null,
      };
    }

    // Treat the normalised category array and the legacy breach type as one
    // public theme field. The overview endpoint uses the same expression, so a
    // theme tile always opens the records that produced its aggregate.
    const categoryExpression = `COALESCE(
      CASE WHEN jsonb_typeof(breach_categories) = 'string'
        THEN (breach_categories #>> '{}')::jsonb
        ELSE breach_categories
      END,
      jsonb_build_array(COALESCE(breach_type, 'Other / not classified'))
    )`;

    // Build WHERE conditions
    const conditions = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (regulator) {
      const regulatorList = regulator.split(',').map((value) => value.trim()).filter(Boolean);
      if (requestedControls.length) {
        conditions.push(`UPPER(regulator) = ANY($${paramIndex++}::text[])`);
        params.push(regulatorList.map((value) => value.toUpperCase()));
      } else if (regulatorList.length > 1) {
        conditions.push(`regulator = ANY($${paramIndex++})`);
        params.push(regulatorList);
      } else {
        conditions.push(`regulator = $${paramIndex++}`);
        params.push(regulatorList[0]);
      }
    } else {
      if (!requestedControls.length) {
        // Ordinary search retains the existing live/public regulator scope.
        conditions.push(`regulator = ANY($${paramIndex++})`);
        params.push(PUBLIC_REGULATOR_CODES);
      }
    }

    if (requestedControls.length) {
      // Control discovery uses the normalized live-public + live-UK perimeter
      // shared with the summary indexer, regardless of stored code casing.
      conditions.push(`UPPER(regulator) = ANY($${paramIndex++}::text[])`);
      params.push(CONTROL_DISCOVERY_REGULATOR_CODES);
    }

    if (country) {
      conditions.push(`country_code = $${paramIndex++}`);
      params.push(explicitCountryCode);
    } else if (!worldwideCountryScope && controlSearchHints?.countryHints.length) {
      conditions.push(`country_code = ANY($${paramIndex++}::text[])`);
      params.push(controlSearchHints.countryHints);
    }

    if (!regulator && controlSearchHints?.regulatorHints.length) {
      conditions.push(`regulator = ANY($${paramIndex++}::text[])`);
      params.push(controlSearchHints.regulatorHints);
    }

    if (year) {
      const yearList = year
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value));
      if (yearList.length > 1) {
        conditions.push(`year_issued = ANY($${paramIndex++})`);
        params.push(yearList);
      } else if (yearList.length === 1) {
        conditions.push(`year_issued = $${paramIndex++}`);
        params.push(yearList[0]);
      }
    }

    if (month && Number(month) >= 1 && Number(month) <= 12) {
      conditions.push(`month_issued = $${paramIndex++}`);
      params.push(parseInt(month));
    }

    if (minAmount) {
      conditions.push(`${trustedAmountColumn} >= $${paramIndex++}`);
      params.push(parseFloat(minAmount));
    }

    if (maxAmount) {
      conditions.push(`${trustedAmountColumn} <= $${paramIndex++}`);
      params.push(parseFloat(maxAmount));
    }

    const amountBandPredicates: Record<string, string> = {
      unknown: `(${trustedAmountColumn} IS NULL OR ${trustedAmountColumn} <= 0)`,
      under_100k: `(${trustedAmountColumn} > 0 AND ${trustedAmountColumn} <= 100000)`,
      "100k_1m": `(${trustedAmountColumn} > 100000 AND ${trustedAmountColumn} <= 1000000)`,
      "1m_10m": `(${trustedAmountColumn} > 1000000 AND ${trustedAmountColumn} <= 10000000)`,
      "10m_100m": `(${trustedAmountColumn} > 10000000 AND ${trustedAmountColumn} <= 100000000)`,
      "100m_plus": `(${trustedAmountColumn} > 100000000)`,
    };
    if (amountBand && amountBandPredicates[amountBand]) conditions.push(amountBandPredicates[amountBand]);

    if (breachCategory) {
      const breachList = breachCategory
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      // Multiple selected themes are an inclusive match, consistent with the
      // comparison UI. The expression also handles double-encoded JSONB.
      conditions.push(`EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(${categoryExpression}) AS selected_theme(value)
        WHERE selected_theme.value = ANY($${paramIndex++}::text[])
      )`);
      params.push(breachList);
    }

    if (sector) {
      conditions.push(`COALESCE(firm_category, 'Sector not recorded') = $${paramIndex++}`);
      params.push(sector);
    }

    if (effectiveOutcome) {
      const predicate = enforcementOutcomePredicate(effectiveOutcome);
      if (predicate) conditions.push(predicate);
    }
    if (finesOnlyRequested) conditions.push(enforcementFinesOnlyPredicate());

    // Control discovery is grounded in either fingerprint-current indexed
    // stored-summary classifications or approved official passages whose
    // respondent and effective notice URL still match the current case row.
    // Keep evidence bases distinct; neither is promoted to the other's claim.
    let controlCaseSource = 'public.all_regulatory_fines_trusted AS c';
    if (requestedControls.length) {
      const codesParameter = paramIndex;
      const taxonomyParameter = paramIndex + 1;
      const regulatorCodesParameter = paramIndex + 2;
      params.push(requestedControls, CONTROL_TAXONOMY_VERSION, CONTROL_DISCOVERY_REGULATOR_CODES);
      paramIndex += 3;
      controlCaseSource = buildControlCandidateCaseSourceSql({
        controlCodesParameter: codesParameter,
        taxonomyVersionParameter: taxonomyParameter,
        regulatorCodesParameter,
        alias: 'c',
      });
    }

    if (firmName) {
      conditions.push(`firm_individual ILIKE $${paramIndex++}`);
      params.push(`%${firmName}%`);
    }

    if (residualQuery) {
      const preparedQuery = prepareEnforcementSearch(residualQuery);
      const firmSearchTerms = preparedQuery.firmIntentQueryWithoutLegalSuffix
        .split(/\s+/)
        .filter(Boolean);
      const firmWordPattern = (term: string) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return `(^|[^[:alnum:]])${escaped}([^[:alnum:]]|$)`;
      };
      // Concept searches require evidence in enforcement text. This prevents
      // entity names such as "Cyberstar" or "C5 Haven Cyber" from being
      // promoted solely because they contain a cyber-looking token. Concept
      // aliases are alternatives to the original phrase, so a search for
      // "data breach" can also find a ransomware or ICT-risk action.
      const concept = resolveEnforcementConcept(residualQuery);
      if (naturalControlQuery || explicitControlCodes.length) {
        const residualTerms = [...new Set(residualQuery.split(/\s+/).map((term) => term.trim()).filter(Boolean))].slice(0, 8);
        const termPredicates: string[] = [];
        for (const term of residualTerms) {
          const placeholder = `$${paramIndex++}`;
          params.push(`%${term}%`);
          termPredicates.push(`(firm_individual ILIKE ${placeholder} OR summary ILIKE ${placeholder} OR breach_type ILIKE ${placeholder} OR regulator ILIKE ${placeholder})`);
        }
        const firmAliases = expandFirmAliasTerms(residualQuery);
        if (firmAliases.length > 1) {
          conditions.push(`(firm_individual ILIKE ANY($${paramIndex++}::text[])${termPredicates.length ? ` OR (${termPredicates.join(' AND ')})` : ''})`);
          params.push(firmAliases.map((term) => `%${term}%`));
        } else if (termPredicates.length) conditions.push(`(${termPredicates.join(' AND ')})`);
      } else if (concept === CYBER_OPERATIONAL_RESILIENCE) {
        const conceptPatterns = CYBER_OPERATIONAL_RESILIENCE_ALIASES.map((alias) => `%${alias}%`);
        conditions.push(`(
          summary ILIKE ANY($${paramIndex}::text[])
          OR breach_type ILIKE ANY($${paramIndex}::text[])
          OR breach_categories::text ILIKE ANY($${paramIndex}::text[])
        )`);
        params.push(conceptPatterns);
        paramIndex++;
      } else if (
        firmSearchTerms.length > 0
        && preparedQuery.meaningfulTerms.some((term) => !preparedQuery.firmIntentTerms.includes(term))
        && preparedQuery.categoryHints.length > 0
      ) {
        // Mixed entity + topic searches require both entity evidence in the
        // firm's name and topic evidence in enforcement text. This handles
        // acronyms such as AML when the official text spells out their meaning,
        // without turning a topic-only query into a wider corpus scan.
        const firmTermPredicates = firmSearchTerms.map((term) => {
          const placeholder = `$${paramIndex++}`;
          params.push(firmWordPattern(term));
          return `firm_individual ~* ${placeholder}`;
        });
        const firmAliases = expandFirmAliasTerms(firmSearchTerms.join(' '))
          .map(firmWordPattern);
        const firmAliasPlaceholder = `$${paramIndex++}`;
        params.push(firmAliases);

        const topicTerms = preparedQuery.meaningfulTerms.filter((term) =>
          !preparedQuery.firmIntentTerms.includes(term),
        );
        const topicPatterns = [...new Set(
          expandSearchTerms(topicTerms).map((term) => `%${term.replace(/\s+/g, '%')}%`),
        )];
        const topicPlaceholder = `$${paramIndex++}`;
        params.push(topicPatterns);
        const exactPhrasePlaceholder = `$${paramIndex++}`;
        params.push(`%${residualQuery}%`);

        conditions.push(`(
          (
            (firm_individual ~* ANY(${firmAliasPlaceholder}::text[])
              OR (${firmTermPredicates.join(' AND ')}))
            AND (
              COALESCE(summary, '') ILIKE ANY(${topicPlaceholder}::text[])
              OR COALESCE(breach_type, '') ILIKE ANY(${topicPlaceholder}::text[])
              OR COALESCE(breach_categories::text, '') ILIKE ANY(${topicPlaceholder}::text[])
            )
          )
          OR summary ILIKE ${exactPhrasePlaceholder}
          OR breach_type ILIKE ${exactPhrasePlaceholder}
          OR breach_categories::text ILIKE ${exactPhrasePlaceholder}
        )`);
      } else {
        const lowSignalQualifiers = new Set([
          'action', 'actions', 'case', 'cases', 'enforcement', 'fine', 'fines',
          'notice', 'notices', 'order', 'orders', 'penalties', 'penalty',
          'sanction', 'sanctions',
        ]);
        const rawQueryTokens = residualQuery.split(/\s+/).filter(Boolean);
        const lastQueryToken = rawQueryTokens.at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hasTrailingLowSignalQualifier = Boolean(lastQueryToken && lowSignalQualifiers.has(lastQueryToken));
        const isFirmLookupWithTrailingQualifier =
          hasTrailingLowSignalQualifier
          && firmSearchTerms.length > 0
          && preparedQuery.meaningfulTerms.every((term) => preparedQuery.firmIntentTerms.includes(term))
          && preparedQuery.categoryHints.length === 0
          && (firmSearchTerms.length >= 2 || preparedQuery.isShortFirmLikeQuery);

        if (isFirmLookupWithTrailingQualifier) {
          const firmTermPredicates = firmSearchTerms.map((term) => {
            const placeholder = `$${paramIndex++}`;
            params.push(firmWordPattern(term));
            return `firm_individual ~* ${placeholder}`;
          });
          const firmAliases = expandFirmAliasTerms(firmSearchTerms.join(' ')).map(firmWordPattern);
          const aliasPlaceholder = `$${paramIndex++}`;
          params.push(firmAliases);
          const exactPhrasePlaceholder = `$${paramIndex++}`;
          params.push(`%${residualQuery}%`);
          conditions.push(`(
            (firm_individual ~* ANY(${aliasPlaceholder}::text[]) OR (${firmTermPredicates.join(' AND ')}))
            OR firm_individual ILIKE ${exactPhrasePlaceholder}
            OR summary ILIKE ${exactPhrasePlaceholder}
            OR breach_type ILIKE ${exactPhrasePlaceholder}
            OR breach_categories::text ILIKE ${exactPhrasePlaceholder}
            OR regulator ILIKE ${exactPhrasePlaceholder}
          )`);
        } else {
          conditions.push(`(
            firm_individual ILIKE $${paramIndex}
            OR summary ILIKE $${paramIndex}
            OR breach_type ILIKE $${paramIndex}
            OR regulator ILIKE $${paramIndex}
          )`);
          params.push(`%${residualQuery}%`);
          paramIndex++;
        }
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const projectionParamIndex = paramIndex;
    const paginationParamIndex = paramIndex + (requestedControls.length ? 2 : 0);
    const controlMatchesJoin = requestedControls.length
      ? `LEFT JOIN LATERAL (
          SELECT jsonb_agg(grounded_match.item ORDER BY grounded_match.code, grounded_match.basis) AS matches
          FROM (
            SELECT summary_match.control_code AS code, 'stored_summary'::text AS basis,
              jsonb_build_object(
                'code', summary_match.control_code,
                'basis', 'stored_summary',
                'field', summary_passage.value->>'field',
                'passage', summary_passage.value->>'passage',
                'matchedTerms', summary_passage.value->'matchedTerms'
              ) AS item
            FROM public.enforcement_control_summary_matches summary_match
            CROSS JOIN LATERAL jsonb_array_elements(summary_match.matched_passages) AS summary_passage(value)
            WHERE summary_match.public_case_id = c.public_case_id
              AND summary_match.control_code = ANY($${projectionParamIndex}::text[])
              AND summary_match.taxonomy_version = $${projectionParamIndex + 1}
              AND jsonb_array_length(summary_match.matched_passages) > 0
              AND summary_match.source_field_fingerprints = jsonb_build_object(
                'firm_individual', c.firm_individual,
                'summary', c.summary,
                'breach_type', c.breach_type,
                'breach_categories', c.breach_categories
              )
            UNION ALL
            SELECT approved_control.control_code, 'official_passage'::text,
              jsonb_build_object(
                'code', approved_control.control_code,
                'passage', approved_control.passage,
                'sourceUrl', approved_control.source_url,
                'contentHash', approved_control.content_hash,
                'locator', approved_control.locator,
                'respondent', approved_control.respondent,
                'attributionMethod', approved_control.attribution_method,
                'date', approved_control.fetched_at,
                'basis', 'official_passage'
              )
            FROM (
              SELECT DISTINCT ON (control_evidence.control_code)
                control_evidence.control_code, control_evidence.passage,
                control_evidence.source_url, control_evidence.content_hash,
                control_evidence.locator, control_evidence.fetched_at,
                control_evidence.respondent, control_evidence.attribution_method
              FROM public.enforcement_control_evidence control_evidence
              WHERE ${currentApprovedControlEvidenceIdentityPredicate('c', 'control_evidence')}
                AND control_evidence.control_code = ANY($${projectionParamIndex}::text[])
                AND control_evidence.taxonomy_version = $${projectionParamIndex + 1}
                AND control_evidence.review_status = 'approved'
              ORDER BY control_evidence.control_code,
                control_evidence.fetched_at DESC,
                control_evidence.locator ASC NULLS LAST,
                control_evidence.content_hash ASC
            ) AS approved_control
          ) AS grounded_match
        ) AS control_matches ON TRUE`
      : `LEFT JOIN LATERAL (SELECT '[]'::jsonb AS matches) AS control_matches ON TRUE`;

    // Query for results
    const countParams = [...params];
    const query = `
      SELECT
        id,
        regulator,
        regulator_full_name,
        country_code,
        country_name,
        firm_individual,
        firm_category,
        amount_original,
        currency,
        trusted_amount_gbp AS amount_gbp,
        trusted_amount_eur AS amount_eur,
        date_issued,
        year_issued,
        month_issued,
        breach_type,
        breach_categories,
        summary,
        notice_url,
        source_url,
        created_at,
        public_case_id AS canonical_case_id,
        duplicate_count,
        amount_quality,
        requires_amount_review,
        amount_verification_url,
        amount_override_reason,
        source_link_status,
        source_checked_at,
        source_http_status,
        source_official_domain_match,
        source_content_hash,
        COALESCE(control_matches.matches, '[]'::jsonb) AS control_matches
      FROM ${controlCaseSource}
      ${controlMatchesJoin}
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}, canonical_case_id ASC, id ASC
      LIMIT $${paginationParamIndex}
      OFFSET $${paginationParamIndex + 1}
    `;

    // Projection uses the same control set and current version as the EXISTS
    // filter. Non-control searches do not touch the optional control tables.
    if (requestedControls.length) params.push(requestedControls, CONTROL_TAXONOMY_VERSION);
    params.push(limitNum, offsetNum);

    const results = await sql.unsafe(query, params);
    const normalizedResults = results.map((row) => {
      const isFca = String(row.regulator || '').toUpperCase() === 'FCA';
      const firm = isFca
        ? normaliseFcaFineEntityName(
            row.firm_individual,
            row.notice_url ? String(row.notice_url) : null,
          )
        : row.firm_individual;
      const caseId = row.canonical_case_id
        ? String(row.canonical_case_id).toLowerCase()
        : '';
      const casePath =
        isFca && isValidFcaFineCaseId(caseId) &&
        Number(row.amount_gbp) > 0 &&
        row.requires_amount_review !== true
          ? buildFcaFineCasePath({
              caseId,
              firm,
              year: Number(row.year_issued),
            })
          : null;
      const concept = residualQuery ? resolveEnforcementConcept(residualQuery) : null;
      const matchReasons = concept === CYBER_OPERATIONAL_RESILIENCE
        ? conceptEvidenceReasons({
            breachType: row.breach_type,
            summary: row.summary,
            breachCategories: Array.isArray(row.breach_categories) ? row.breach_categories.map(String) : [],
          })
        : [];
      const outcome = classifyEnforcementOutcome({
        amountOriginal: row.amount_original,
        amountGbp: row.amount_gbp,
        amountEur: row.amount_eur,
        requiresAmountReview: row.requires_amount_review,
        amountQuality: row.amount_quality,
        breachType: row.breach_type,
        breachCategories: row.breach_categories,
        summary: row.summary,
        noticeUrl: row.notice_url,
        sourceUrl: row.source_url,
      });
      return {
        ...row,
        control_matches: (Array.isArray(row.control_matches) ? row.control_matches : []).flatMap((match: any) => {
          const label = CONTROL_DEFINITIONS.find((definition) => definition.code === match.code)?.label ?? match.code;
          const common = { ...match, label, matchedConcept: match.code };
          if (match.basis === 'official_passage') {
            return [{ ...common, matchReasons: [match.locator ? `Official passage (${match.locator})` : 'Approved official passage'] }];
          }
          const terms = Array.isArray(match.matchedTerms) ? match.matchedTerms.map(String) : [];
          return [{ ...common, matchReasons: terms.map((term: string) => `Stored summary: ${term}`) }];
        }),
        firm_individual: firm,
        canonical_case_path: casePath,
        recordClass: outcome.recordClass,
        outcomeTypes: outcome.outcomeTypes,
        primaryOutcome: outcome.primaryOutcome,
        monetaryPenaltyStatus: outcome.monetaryPenaltyStatus,
        publicationType: outcome.publicationType,
        proceduralStatus: outcome.proceduralStatus,
        classificationVersion: outcome.classificationVersion,
        outcomeMatchReasons: outcome.matchReasons,
        ...(concept === CYBER_OPERATIONAL_RESILIENCE && matchReasons.length > 0
          ? { matchedConcept: concept, matchReasons }
          : {}),
      };
    });

    // Query for total count
    const countQuery = `
      SELECT COUNT(*) as count
      FROM ${controlCaseSource}
      ${whereClause}
    `;

    const countResult = await sql.unsafe(countQuery, countParams);
    const totalCount = parseInt(countResult[0]?.count || 0);

    // Return response
    return res.status(200).json({
      results: normalizedResults,
      pagination: {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: (offsetNum + limitNum) < totalCount,
        pages: Math.ceil(totalCount / limitNum),
        currentPage: Math.floor(offsetNum / limitNum) + 1
      },
      filters: {
        q: q || null,
        control: requestedControls,
        outcome: effectiveOutcome || (finesOnlyRequested ? 'Fines only' : null),
        regulator: regulator || null,
        country: explicitCountryCode || null,
        year: year
          ? year.split(',').map(Number).filter(Number.isInteger)
          : null,
        month: month ? parseInt(month) : null,
        minAmount: minAmount ? parseFloat(minAmount) : null,
        maxAmount: maxAmount ? parseFloat(maxAmount) : null,
        breachCategory: breachCategory
          ? breachCategory.split(',').map((value) => value.trim()).filter(Boolean)
          : null,
        sector: sector || null,
        currency,
        firmName: firmName || null
        },
        resolvedScope,
        ...(controlIndexState ? {
          indexing: {
            indexedAsOf: controlIndexState.scan_as_of,
            indexedAt: controlIndexState.indexed_at,
            publicCaseCount: controlIndexState.public_case_count,
            publicMaxCaseId: controlIndexState.public_max_case_id,
            // The index is a snapshot, so newly published source cases may
            // remain pending until the next scheduled reconciliation.
            coveragePending: true,
          },
        } : {}),
    });

  } catch (error) {
    console.error('Unified search error:', {
      error: error instanceof Error ? error.message : error
    });
    const errorCode = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
    const requestedControlSearch = Boolean((req.query as Record<string, string>).control || (req.query as Record<string, string>).q && resolveControlQuery(String((req.query as Record<string, string>).q)));
    if (requestedControlSearch && errorCode === '42P01') {
      return res.status(503).json({ error: 'Control evidence is temporarily unavailable' });
    }
    return res.status(500).json({
      error: 'Search failed'
      // Schema details removed for security
    });
  }
}
