import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import type { FineRecord } from "../types.js";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
  notation: "compact",
});

function fmtAmount(n: number): string {
  return n > 0 ? gbp.format(n) : "—";
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function breachLabel(record: FineRecord): string {
  if (record.breach_categories?.length) return record.breach_categories[0];
  return record.breach_type || "—";
}

interface Props {
  iso2: string;
  countryName: string;
}

/**
 * Live enforcement rollup for a country — client-side, from `all_regulatory_fines`
 * via the unified search API. Progressive enhancement over the prerendered
 * regulator/action-count evidence (which crawlers see). Displayed, never scored.
 */
export function CountryEnforcementLive({ iso2, countryName }: Props) {
  const { fines, stats, loading, error } = useUnifiedData({
    regulator: "All",
    country: iso2,
    year: 0,
    currency: "GBP",
  });

  const topCases = useMemo(
    () =>
      [...fines]
        .filter((f) => f.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    [fines],
  );

  // Nothing to enhance: keep the prerendered static evidence as the sole view.
  if (loading) {
    return (
      <p className="country-live__status" aria-live="polite">
        Loading live enforcement figures for {countryName}…
      </p>
    );
  }
  if (error || !stats || stats.totalFines === 0) return null;

  return (
    <div className="country-live">
      <div className="country-live__cards">
        <div className="country-live__card">
          <span className="country-live__value">{fmtAmount(stats.totalAmount)}</span>
          <span className="country-live__label">Total penalties</span>
        </div>
        <div className="country-live__card">
          <span className="country-live__value">
            {stats.totalFines.toLocaleString("en-GB")}
          </span>
          <span className="country-live__label">Enforcement actions</span>
        </div>
        <div className="country-live__card">
          <span className="country-live__value">{fmtAmount(stats.maxFine)}</span>
          <span className="country-live__label">
            Largest{stats.maxFirmName ? ` · ${stats.maxFirmName}` : ""}
          </span>
        </div>
        {stats.dominantBreach && (
          <div className="country-live__card">
            <span className="country-live__value country-live__value--sm">
              {stats.dominantBreach}
            </span>
            <span className="country-live__label">Most common breach</span>
          </div>
        )}
      </div>

      {topCases.length > 0 && (
        <table className="country-live__table">
          <thead>
            <tr>
              <th>Firm / individual</th>
              <th>Regulator</th>
              <th className="country-live__num">Amount</th>
              <th>Date</th>
              <th>Breach</th>
            </tr>
          </thead>
          <tbody>
            {topCases.map((c) => (
              <tr key={c.id}>
                <td>{c.firm_individual}</td>
                <td>{c.regulator}</td>
                <td className="country-live__num">{fmtAmount(c.amount)}</td>
                <td>{fmtDate(c.date_issued)}</td>
                <td>{breachLabel(c)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="country-live__note">
        Live figures from the RegActions enforcement database.{" "}
        <Link to={`/search?country=${iso2}`}>Explore all {countryName} actions →</Link>
      </p>
    </div>
  );
}

export default CountryEnforcementLive;
