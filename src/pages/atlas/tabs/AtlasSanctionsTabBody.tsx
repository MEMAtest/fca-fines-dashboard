import { useEffect, useState } from "react";
import { getFatfStatus } from "../../../data/fatfStatus.js";
import { getApprovedSanctions } from "../../../data/sanctionsApprovedData.js";
import { REGISTER_HISTORY_SNAPSHOT, type RegisterHistorySnapshotEvent } from "../../../data/registerHistorySnapshot.js";

export interface AtlasSanctionsTabBodyProps {
  iso2: string;
}

/**
 * Sanctions & FATF history tab body (Phase 2). Shows:
 *   1. current FATF status + sanctions regimes (existing, already-verified data)
 *   2. a dated timeline of change-log events (committed last-5 snapshot first,
 *      upgraded to the full /api/register/[iso2]/history list once it loads)
 * Every event carries its source link and date. Honest empty state when no
 * dated changes have been recorded for the jurisdiction yet — never implies
 * "no sanctions" when the data is simply missing.
 */
export function AtlasSanctionsTabBody({ iso2 }: AtlasSanctionsTabBodyProps) {
  const upperIso2 = iso2.toUpperCase();
  const fatf = getFatfStatus(upperIso2);
  const sanctions = getApprovedSanctions(upperIso2);

  const snapshotEvents = REGISTER_HISTORY_SNAPSHOT[upperIso2] ?? [];
  const [events, setEvents] = useState<RegisterHistorySnapshotEvent[]>(snapshotEvents);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEvents(REGISTER_HISTORY_SNAPSHOT[upperIso2] ?? []);
    setLoaded(false);
    fetch(`/api/register/${upperIso2}/history`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.events) return;
        setEvents(
          data.events.map((e: any) => ({
            iso2: e.iso2,
            category: e.category,
            eventDate: e.eventDate,
            summary: e.summary,
            sourceUrl: e.sourceUrl,
          })),
        );
        setLoaded(true);
      })
      .catch(() => {
        // Network/API unavailable: keep the committed snapshot, no fabricated fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [upperIso2]);

  const firstRunDate = "2026-10-03"; // date the sanctions/FATF change-log pipeline first shipped

  return (
    <div className="atlas-sanctions-tab" data-testid="atlas-sanctions-tab">
      <section className="atlas-sanctions-tab__status" aria-label="Current FATF and sanctions status">
        <h3>FATF status</h3>
        {fatf ? (
          <p>
            <strong>{fatf.listing === "call-for-action" ? "Black list" : "Grey list"}</strong>
            {fatf.requiredAction ? ` — ${fatf.requiredAction.replace("-", " ")}` : ""}
            {" "}· last reviewed {fatf.lastReviewed}
          </p>
        ) : (
          <p>Not on the FATF black or grey list as of the last plenary review.</p>
        )}

        <h3>Sanctions regimes</h3>
        {sanctions && sanctions.programs.length > 0 ? (
          <ul>
            {sanctions.programs.map((program: (typeof sanctions.programs)[number]) => (
              <li key={`${program.imposer}-${program.program}`}>
                {program.imposer}: {program.program} ({program.tier}) — reviewed {program.reviewed}
                {" "}
                <a href={program.sourceUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>No jurisdiction-level sanctions programme recorded for this country.</p>
        )}
      </section>

      <section className="atlas-sanctions-tab__timeline" aria-label="Dated sanctions and FATF change history">
        <h3>Change history{loaded ? "" : " (cached)"}</h3>
        {events.length > 0 ? (
          <ol className="atlas-sanctions-tab__timeline-list">
            {events.map((event) => (
              <li key={`${event.eventDate}-${event.summary}`}>
                <time dateTime={event.eventDate}>{event.eventDate}</time>
                {" — "}
                {event.summary}
                {" "}
                <a href={event.sourceUrl} target="_blank" rel="noreferrer">
                  source
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p>No dated changes recorded since {firstRunDate}.</p>
        )}
      </section>
    </div>
  );
}

export default AtlasSanctionsTabBody;
