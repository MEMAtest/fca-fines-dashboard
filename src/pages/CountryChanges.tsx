import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, CheckCircle, ExternalLink, Mail, Rss } from "lucide-react";
import {
  buildCountryChanges,
  changesByDate,
  changeKindsPresent,
  CHANGE_KIND_LABELS,
  type ChangeEvent,
  type ChangeKind,
} from "../data/countryChanges.js";
import { formatDate } from "../data/countryView.js";
import "../styles/country-hub.css";

const KIND_CLASS: Record<ChangeKind, string> = {
  fatf: "cx-chg-tag--fatf",
  sanctions: "cx-chg-tag--sanctions",
  "eu-tax-list": "cx-chg-tag--eutax",
  score: "cx-chg-tag--score",
  fiu: "cx-chg-tag--fiu",
  "bo-register": "cx-chg-tag--bo",
};

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function EventRow({ event }: { event: ChangeEvent }) {
  const tagClass = `cx-chg-tag ${KIND_CLASS[event.kind]}`;
  return (
    <li className="cx-chg-row">
      <div className="cx-chg-row__head">
        <span className={tagClass}>{CHANGE_KIND_LABELS[event.kind]}</span>
        {isExternal(event.href) ? (
          <a
            className="cx-chg-row__title"
            href={event.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {event.title} <ExternalLink size={12} aria-hidden="true" />
          </a>
        ) : (
          <Link className="cx-chg-row__title" to={event.href}>
            {event.title}
          </Link>
        )}
      </div>
      <p className="cx-chg-row__detail">{event.detail}</p>
    </li>
  );
}

type SubStatus = "idle" | "submitting" | "success" | "error";

function ChangesSubscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubStatus>("idle");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }
    setStatus("submitting");
    try {
      const res = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, topic: "country-changes" }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to subscribe");
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="cx-chg-sub cx-chg-sub--done">
        <CheckCircle size={18} aria-hidden="true" />
        <p>
          Check your inbox. Click the link in our email to confirm your weekly
          country-risk changes digest.
        </p>
      </div>
    );
  }

  return (
    <form className="cx-chg-sub" onSubmit={submit}>
      <div className="cx-chg-sub__intro">
        <Mail size={16} aria-hidden="true" />
        <span>Get a weekly digest of country-risk changes by email.</span>
      </div>
      <div className="cx-chg-sub__row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          required
        />
        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "..." : "Subscribe"}
        </button>
      </div>
      {(status === "error" || error) && (
        <p className="cx-chg-sub__err">
          <AlertCircle size={13} aria-hidden="true" /> {error || "Something went wrong"}
        </p>
      )}
      <p className="cx-chg-sub__note">Double opt-in. Unsubscribe anytime with one click.</p>
    </form>
  );
}

export function CountryChanges() {
  const events = useMemo(() => buildCountryChanges(), []);
  const kinds = useMemo(() => changeKindsPresent(events), [events]);
  const [kindFilter, setKindFilter] = useState<"all" | ChangeKind>("all");

  const filtered = useMemo(
    () => (kindFilter === "all" ? events : events.filter((e) => e.kind === kindFilter)),
    [events, kindFilter],
  );
  const groups = useMemo(() => changesByDate(filtered), [filtered]);
  const latestDate = events[0]?.date;

  const counts = useMemo(() => {
    const c: Partial<Record<ChangeKind, number>> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  return (
    <div className="cx-chg">
      <header className="cx-chg__header">
        <nav className="cx-chg__crumbs" aria-label="Breadcrumb">
          <Link to="/countries" className="cx-chg__back">
            <ArrowLeft size={14} aria-hidden="true" /> Country risk
          </Link>
        </nav>
        <h1 className="cx-chg__title">What changed in country risk</h1>
        <p className="cx-chg__lead">
          A dated record of every change RegActions already tracks: FATF plenary
          additions and removals, sanctions-evidence snapshot promotions, EU tax
          list updates, framework-data reviews, and composite score moves once a
          trend accrues. Every entry is derived from a cited source; nothing is
          fabricated.
        </p>
        <div className="cx-chg__meta">
          {latestDate && (
            <span className="cx-chg__asof">
              {events.length} tracked changes · latest {formatDate(latestDate)}
            </span>
          )}
          <a
            className="cx-chg__rss"
            href="/changes.xml"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Rss size={13} aria-hidden="true" /> RSS feed
          </a>
        </div>
      </header>

      <div className="cx-chg__filters" role="group" aria-label="Filter changes by kind">
        <button
          type="button"
          aria-pressed={kindFilter === "all"}
          className={`cx-chg-chip${kindFilter === "all" ? " cx-chg-chip--on" : ""}`}
          onClick={() => setKindFilter("all")}
        >
          All <b>{events.length}</b>
        </button>
        {kinds.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={kindFilter === kind}
            className={`cx-chg-chip${kindFilter === kind ? " cx-chg-chip--on" : ""}`}
            onClick={() => setKindFilter(kindFilter === kind ? "all" : kind)}
          >
            {CHANGE_KIND_LABELS[kind]} <b>{counts[kind] ?? 0}</b>
          </button>
        ))}
      </div>

      <ChangesSubscribe />

      {groups.length === 0 ? (
        <p className="cx-chg__empty">No changes match this filter.</p>
      ) : (
        <ol className="cx-chg__timeline">
          {groups.map((group) => (
            <li key={group.date} className="cx-chg__group">
              <div className="cx-chg__date">
                <time dateTime={group.date}>{formatDate(group.date)}</time>
                <span className="cx-chg__date-count">
                  {group.events.length} change{group.events.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="cx-chg__list">
                {group.events.map((event, i) => (
                  <EventRow key={`${event.kind}-${event.iso2 ?? "global"}-${i}`} event={event} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <footer className="cx-chg__footer">
        <span>
          Derived from FATF plenary outcomes, the promoted sanctions snapshot,
          the EU Council tax list, Egmont Group membership and the Open Ownership
          register map.
        </span>
        <span>
          <Link to="/countries/fatf-grey-list">
            FATF grey &amp; black list <ExternalLink size={11} aria-hidden="true" />
          </Link>
        </span>
      </footer>
    </div>
  );
}

export default CountryChanges;
