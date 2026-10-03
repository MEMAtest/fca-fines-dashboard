import { Link, useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";
import { getCountryEnforcementSummary, hasEnforcementCoverage } from "../../../data/countryEnforcement.js";

/** Reuses the EXISTING RegActions enforcement data for this country — no new scraping. */
export function AtlasEnforcementTab() {
  const { country } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;

  const covered = hasEnforcementCoverage(country.iso2);
  const summary = covered ? getCountryEnforcementSummary(country.iso2) : undefined;

  return (
    <section className="atlas-card">
      <h3>Enforcement actions tracked on RegActions</h3>
      {!summary || summary.regulators.length === 0 ? (
        <p className="atlas-empty">No systematic enforcement-data source covered for {country.name} yet.</p>
      ) : (
        <>
          <p>
            {summary.trackedActions.toLocaleString("en-GB")} tracked action(s) across {summary.regulatorCount}{" "}
            regulator(s).
          </p>
          <table className="atlas-table">
            <thead>
              <tr>
                <th>Regulator</th>
                <th>Tracked actions</th>
                <th>Years</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {summary.regulators.map((r) => (
                <tr key={r.code}>
                  <td>{r.fullName}</td>
                  <td>{r.count}</td>
                  <td>{r.years}</td>
                  <td>
                    <Link to={r.overviewPath}>View on RegActions</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="atlas-card__note" style={{ fontSize: "0.8rem", color: "var(--ra-text-secondary)", marginTop: "0.6rem" }}>
        Court and criminal actions (Phase 3) are not yet in this view. Coverage level is shown, never a bare
        zero where a source has not yet been built.
      </p>
    </section>
  );
}
