import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Clock } from "lucide-react";
import { getCountryByIso2, countrySlug, flagEmoji } from "../data/countries.js";
import { formatDate } from "../data/countryView.js";
import {
  computeMovers,
  recentListingChanges,
  lastSnapshotDate,
  comparableSnapshots,
  largestGapDays,
  type Mover,
  type MoversWindow,
} from "../data/scoreMovers.js";
import "../styles/country-movers.css";

const WINDOWS = [4, 12] as const;

function MoverRow({ m }: { m: Mover }) {
  const country = getCountryByIso2(m.iso2);
  const up = m.delta > 0;
  return (
    <li className="cmv-row">
      <Link to={country ? `/countries/${countrySlug(country)}` : "/countries"} className="cmv-row__name">
        <span aria-hidden="true">{flagEmoji(m.iso2)}</span> {m.name}
      </Link>
      <span className={`cmv-row__delta cmv-row__delta--${up ? "up" : "down"}`}>
        {up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
        {up ? "+" : ""}
        {m.delta.toFixed(1)}
      </span>
      <span className="cmv-row__scores">
        {m.before.toFixed(1)} to {m.after.toFixed(1)}
      </span>
      <span className="cmv-row__reason">
        {m.reasons.length
          ? m.reasons.slice(0, 2).map((r) => `${r.title} (${formatDate(r.date)})`).join("; ")
          : "No dated listing change recorded; movement comes from underlying indicator updates."}
      </span>
    </li>
  );
}

function List({ title, rows, tone }: { title: string; rows: Mover[]; tone: "up" | "down" }) {
  return (
    <section className={`cmv-col cmv-col--${tone}`}>
      <h3>{title}</h3>
      {rows.length ? (
        <ol className="cmv-list">
          {rows.map((m) => (
            <MoverRow key={m.iso2} m={m} />
          ))}
        </ol>
      ) : (
        <p className="cmv-empty">None in this window.</p>
      )}
    </section>
  );
}

function Ready({ w }: { w: Extract<MoversWindow, { status: "ready" }> }) {
  return (
    <>
      <p className="cmv-note">
        Compared with the snapshot of {formatDate(w.fromDate)} ({Math.round(w.spanDays / 7)} weeks earlier, {w.spanDays} days).{" "}
        {w.unchangedCount} countries did not move.
      </p>
      <div className="cmv-grid">
        <List title="Biggest rises (higher risk)" rows={w.risers} tone="up" />
        <List title="Biggest falls (lower risk)" rows={w.fallers} tone="down" />
      </div>
    </>
  );
}

export default function CountryMovers() {
  const [weeks, setWeeks] = useState<(typeof WINDOWS)[number]>(4);
  const last = useMemo(() => lastSnapshotDate(), []);
  const snaps = useMemo(() => comparableSnapshots(), []);
  const win = useMemo(() => computeMovers(weeks), [weeks]);
  const recent = useMemo(
    () => (last ? recentListingChanges(84, last) : []),
    [last],
  );
  const gap = largestGapDays(snaps);

  return (
    <section className="cmv" aria-labelledby="cmv-title">
      <div className="cmv-head">
        <h2 id="cmv-title">Score movers</h2>
        <div className="cmv-toggle" role="group" aria-label="Comparison window">
          {WINDOWS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={weeks === n}
              className={`cmv-toggle__btn${weeks === n ? " cmv-toggle__btn--on" : ""}`}
              onClick={() => setWeeks(n)}
            >
              ~{n} weeks
            </button>
          ))}
        </div>
      </div>
      <p className="cmv-fresh">
        <Clock size={13} aria-hidden="true" />{" "}
        {last
          ? `Scores snapshotted weekly; latest snapshot ${formatDate(last)} (${snaps.length} on the current methodology).`
          : "No snapshot on the current methodology yet."}
        {gap > 10 ? " Some weeks were not recorded; we never back-fill missed weeks." : ""}
      </p>

      {win.status === "ready" ? (
        <Ready w={win} />
      ) : (
        <div className="cmv-insufficient" role="status">
          <p>
            <strong>Not enough history for a ~{weeks}-week comparison yet.</strong> Weekly snapshots on the current v3.1
            methodology began on {snaps[0] ? formatDate(snaps[0].date) : "the first run"}; older snapshots used a different
            methodology and are deliberately not compared, because that would show a method change as a country move.
            {win.availableFrom ? ` This view fills in from about ${formatDate(win.availableFrom)} once the snapshots span ${weeks} weeks.` : ""}
          </p>
        </div>
      )}

      {win.status === "insufficient" && recent.length > 0 && (
        <section className="cmv-recent">
          <h3>Dated listing changes in the 12 weeks to {last ? formatDate(last) : ""}</h3>
          <ul className="cmv-list">
            {recent.map((e) => (
              <li key={`${e.date}-${e.iso2}-${e.kind}-${e.title}`} className="cmv-row cmv-row--event">
                <Link to={e.href} className="cmv-row__name">{e.title}</Link>
                <span className="cmv-row__scores">{formatDate(e.date)}</span>
              </li>
            ))}
          </ul>
          <p className="cmv-note">
            <Link to="/countries/changes">All country-risk changes</Link>
          </p>
        </section>
      )}
    </section>
  );
}
