/**
 * Country-risk changes surface — a deterministic "what changed" builder.
 *
 * This module assembles dated change events strictly from data the repository
 * already tracks. It fabricates nothing: every event is derived from an
 * existing, cited source module (FATF plenary cycles, the promoted sanctions
 * snapshot, the EU tax list, the FIU/Egmont and BO-register review dates, and
 * the forward score-snapshot history). No external feeds are read here.
 *
 * Shape: a flat, reverse-chronological list of `ChangeEvent`s that both the
 * `/countries/changes` page and the `changes.xml` RSS feed render.
 */

import {
  getCountryByIso2,
  countrySlug,
  type Country,
} from "./countries.js";
import {
  FATF_CHANGE_LOG,
  fatfLabel,
  type FatfChange,
} from "./fatfStatus.js";
import {
  SANCTIONS_APPROVED_SNAPSHOT,
  SANCTIONS_APPROVED_STATUS,
} from "./sanctionsApprovedData.js";
import {
  EU_TAX_LIST,
  EU_TAX_LIST_REVIEWED,
  EU_TAX_LIST_SOURCE_URL,
} from "./euTaxList.js";
import {
  EGMONT_REVIEWED,
  EGMONT_SOURCE_URL,
} from "./egmontMembership.js";
import {
  BO_REGISTERS_REVIEWED,
  BO_REGISTERS_SOURCE_URL,
} from "./boRegisters.js";
import scoreSnapshotsRaw from "./scoreSnapshots.json" with { type: "json" };

/** The kinds of change event this surface tracks (all derived, none invented). */
export type ChangeKind =
  | "fatf"
  | "sanctions"
  | "eu-tax-list"
  | "score"
  | "fiu"
  | "bo-register";

export interface ChangeEvent {
  /** ISO date the change took effect (YYYY-MM-DD). */
  date: string;
  /** ISO2 of the country affected, or undefined for a global/list-wide event. */
  iso2?: string;
  /** Whether this event is about a single country or a global list. */
  scope: "country" | "global";
  kind: ChangeKind;
  /** Short headline, e.g. "Iraq added to the FATF grey list". */
  title: string;
  /** One-sentence detail with context. */
  detail: string;
  /** Where the change should link to (country page or source). */
  href: string;
}

interface ScoreSnapshot {
  date: string;
  scores: Record<string, number>;
}

/** Human label for a change kind (filter chips + RSS categories). */
export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
  fatf: "FATF listing",
  sanctions: "Sanctions",
  "eu-tax-list": "EU tax list",
  score: "Risk score",
  fiu: "FIU membership",
  "bo-register": "Ownership register",
};

function countryName(iso2: string): string {
  return getCountryByIso2(iso2)?.name ?? iso2;
}

/** Country page href, or the /countries index if the code does not resolve. */
function countryHref(iso2: string): string {
  const country = getCountryByIso2(iso2);
  return country ? `/countries/${countrySlug(country)}` : "/countries";
}

// ── FATF plenary changes ─────────────────────────────────────────────────────

/** One event per FATF addition/removal in the multi-cycle change-log. */
function fatfEvents(): ChangeEvent[] {
  return FATF_CHANGE_LOG.map((change: FatfChange): ChangeEvent => {
    const name = countryName(change.iso2);
    const list = fatfLabel(change.listing).toLowerCase();
    const verb = change.change === "added" ? "added to" : "removed from";
    return {
      date: change.date,
      iso2: change.iso2,
      scope: "country",
      kind: "fatf",
      title: `${name} ${verb} the FATF ${list}`,
      detail:
        change.change === "added"
          ? `${name} was placed on the FATF ${list} at the plenary of ${change.date}.`
          : `${name} was removed from the FATF ${list} at the plenary of ${change.date}, having addressed its action plan.`,
      href: countryHref(change.iso2),
    };
  });
}

// ── Sanctions snapshot promotion ─────────────────────────────────────────────

/**
 * The sanctions snapshot promotion is one dated global event. Where a country
 * carries a comprehensive country-wide programme in the approved snapshot, we
 * additionally emit a per-country event dated to the same promotion — the most
 * material, cleanly derivable per-country signal (comprehensive scope restricts
 * broad ordinary dealings, so it is the honest one to surface).
 */
function sanctionsEvents(): ChangeEvent[] {
  const effectiveAt = SANCTIONS_APPROVED_SNAPSHOT.effectiveAt;
  if (!effectiveAt) return [];
  const events: ChangeEvent[] = [
    {
      date: effectiveAt,
      scope: "global",
      kind: "sanctions",
      title: `Sanctions evidence snapshot promoted (${SANCTIONS_APPROVED_SNAPSHOT.countryCount} jurisdictions)`,
      detail: `RegActions promoted a new deterministic sanctions-evidence snapshot covering ${SANCTIONS_APPROVED_SNAPSHOT.countryCount} jurisdictions and ${SANCTIONS_APPROVED_SNAPSHOT.approvedCount} approved programmes, sourced from OFAC, UK, EU and UN catalogues.`,
      href: "/countries/methodology/v2",
    },
  ];

  // Per-country: countries with a comprehensive country-wide programme.
  const comprehensive = SANCTIONS_APPROVED_STATUS.filter((record) =>
    record.programs.some((program) => program.tier === "comprehensive"),
  )
    .map((record) => record.iso2)
    .filter((iso2) => Boolean(getCountryByIso2(iso2)))
    .sort((a, b) => countryName(a).localeCompare(countryName(b)));

  for (const iso2 of comprehensive) {
    const name = countryName(iso2);
    events.push({
      date: effectiveAt,
      iso2,
      scope: "country",
      kind: "sanctions",
      title: `${name} confirmed under a comprehensive sanctions programme`,
      detail: `The promoted sanctions snapshot confirms ${name} carries a comprehensive country-wide programme; screen the applicable OFAC, UK, EU and UN lists.`,
      href: countryHref(iso2),
    });
  }
  return events;
}

// ── EU tax list ──────────────────────────────────────────────────────────────

/**
 * The EU tax-list update is one dated global event, plus a per-country event
 * for each currently listed jurisdiction (dated to the same Council update).
 */
function euTaxListEvents(): ChangeEvent[] {
  if (!EU_TAX_LIST_REVIEWED) return [];
  const listed = [...EU_TAX_LIST]
    .filter((entry) => Boolean(getCountryByIso2(entry.iso2)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const names = listed.map((entry) => entry.name).join(", ");
  const events: ChangeEvent[] = [
    {
      date: EU_TAX_LIST_REVIEWED,
      scope: "global",
      kind: "eu-tax-list",
      title: `EU tax blacklist updated (${listed.length} jurisdictions listed)`,
      detail: `The Council of the EU updated its list of non-cooperative jurisdictions for tax purposes (Annex I). Currently listed: ${names}.`,
      href: EU_TAX_LIST_SOURCE_URL,
    },
  ];
  for (const entry of listed) {
    events.push({
      date: EU_TAX_LIST_REVIEWED,
      iso2: entry.iso2,
      scope: "country",
      kind: "eu-tax-list",
      title: `${entry.name} on the EU tax blacklist`,
      detail: `${entry.name} is on the EU list of non-cooperative jurisdictions for tax purposes (Annex I), as of the ${EU_TAX_LIST_REVIEWED} Council update.`,
      href: countryHref(entry.iso2),
    });
  }
  return events;
}

// ── Score-snapshot deltas ────────────────────────────────────────────────────

/**
 * Per-country score-move events, derived by comparing consecutive dated score
 * snapshots. With a single snapshot there is no delta and this returns nothing;
 * a real trend only accrues once a second snapshot is recorded. Small moves are
 * suppressed so noise does not swamp the feed.
 *
 * Exposed with an optional `snapshots` arg so the zero-delta path can be tested
 * deterministically against a fixture.
 */
export function scoreDeltaEvents(
  snapshots: ScoreSnapshot[] = scoreSnapshotsRaw as ScoreSnapshot[],
  minDelta = 0.5,
): ChangeEvent[] {
  if (snapshots.length < 2) return [];
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const events: ChangeEvent[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    for (const iso2 of Object.keys(curr.scores)) {
      const before = prev.scores[iso2];
      const after = curr.scores[iso2];
      if (before === undefined || after === undefined) continue;
      const delta = Math.round((after - before) * 10) / 10;
      if (Math.abs(delta) < minDelta) continue;
      const country = getCountryByIso2(iso2);
      if (!country) continue;
      const direction = delta > 0 ? "rose" : "fell";
      events.push({
        date: curr.date,
        iso2,
        scope: "country",
        kind: "score",
        title: `${country.name} risk score ${direction} ${before.toFixed(1)} to ${after.toFixed(1)}`,
        detail: `The RegActions composite country-risk score for ${country.name} ${direction} from ${before.toFixed(1)} to ${after.toFixed(1)} out of 10 between ${prev.date} and ${curr.date}.`,
        href: countryHref(iso2),
      });
    }
  }
  return events;
}

// ── Coarse review-date events (FIU / BO register) ────────────────────────────

/**
 * The Egmont FIU membership and BO-register datasets carry a single review
 * date each. These are coarse, list-wide "reviewed" events (not per-country
 * changes) so the surface honestly records when the framework data was last
 * refreshed, without asserting any per-country movement.
 */
function reviewedEvents(): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  if (EGMONT_REVIEWED) {
    events.push({
      date: EGMONT_REVIEWED,
      scope: "global",
      kind: "fiu",
      title: "Egmont Group FIU membership reviewed",
      detail: `RegActions reviewed Egmont Group financial-intelligence-unit membership against the published members list on ${EGMONT_REVIEWED}.`,
      href: EGMONT_SOURCE_URL,
    });
  }
  if (BO_REGISTERS_REVIEWED) {
    events.push({
      date: BO_REGISTERS_REVIEWED,
      scope: "global",
      kind: "bo-register",
      title: "Beneficial-ownership register availability reviewed",
      detail: `RegActions refreshed beneficial-ownership register availability from the Open Ownership map on ${BO_REGISTERS_REVIEWED}.`,
      href: BO_REGISTERS_SOURCE_URL,
    });
  }
  return events;
}

// ── Assembly ─────────────────────────────────────────────────────────────────

/**
 * Every derived change event, newest-first. Ties on date are broken by kind
 * then title so the ordering is deterministic across builds.
 */
export function buildCountryChanges(): ChangeEvent[] {
  const all = [
    ...fatfEvents(),
    ...sanctionsEvents(),
    ...euTaxListEvents(),
    ...scoreDeltaEvents(),
    ...reviewedEvents(),
  ];
  return all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    return a.title.localeCompare(b.title);
  });
}

/** The distinct kinds present in the assembled feed, in stable label order. */
export function changeKindsPresent(events: ChangeEvent[] = buildCountryChanges()): ChangeKind[] {
  const present = new Set(events.map((event) => event.kind));
  return (Object.keys(CHANGE_KIND_LABELS) as ChangeKind[]).filter((kind) =>
    present.has(kind),
  );
}

/**
 * The most recent developments for one country (per-country card). Global
 * events are excluded so the card only shows changes attributable to that
 * jurisdiction. Returns an empty array when there are none, so the caller can
 * honestly omit the card entirely.
 */
export function recentChangesForCountry(
  iso2: string,
  limit = 3,
  events: ChangeEvent[] = buildCountryChanges(),
): ChangeEvent[] {
  const code = iso2.toUpperCase();
  return events
    .filter((event) => event.scope === "country" && event.iso2 === code)
    .slice(0, limit);
}

/** Group the feed by ISO date, newest-first, for the grouped page list. */
export interface ChangeDateGroup {
  date: string;
  events: ChangeEvent[];
}

export function changesByDate(
  events: ChangeEvent[] = buildCountryChanges(),
): ChangeDateGroup[] {
  const byDate = new Map<string, ChangeEvent[]>();
  for (const event of events) {
    const arr = byDate.get(event.date) ?? [];
    arr.push(event);
    byDate.set(event.date, arr);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, group]) => ({ date, events: group }));
}

export type { ScoreSnapshot, Country };
