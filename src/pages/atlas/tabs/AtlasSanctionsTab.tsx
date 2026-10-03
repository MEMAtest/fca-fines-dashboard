import { useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";
import { getFatfStatus, fatfLabel } from "../../../data/fatfStatus.js";
import { getSanctions } from "../../../data/sanctionsStatus.js";

/**
 * MINIMAL PLACEHOLDER — Coder B (Phase 2) owns this tab's body and will
 * replace it with the full sanctions/FATF dated-history timeline
 * (register_sanctions_snapshots + the change log). Until then this renders
 * only the EXISTING, already-published `fatfStatus`/`sanctionsStatus` facts
 * for the country, honestly, with no invented history.
 *
 * Do not add parsing or history logic here — see Coder B's branch.
 */
export function AtlasSanctionsTab() {
  const { country } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;

  const fatf = getFatfStatus(country.iso2);
  const sanctions = getSanctions(country.iso2);

  return (
    <section className="atlas-card">
      <h3>Sanctions & FATF</h3>

      <div className="atlas-key-facts" style={{ marginBottom: "0.75rem" }}>
        <div>
          <dt>FATF status</dt>
          <dd>{fatf ? fatfLabel(fatf.listing) : "Not on a FATF public list"}</dd>
        </div>
        <div>
          <dt>Sanctions programmes (country-level)</dt>
          <dd>{sanctions ? sanctions.programs.length : 0}</dd>
        </div>
      </div>

      {sanctions && sanctions.programs.length > 0 && (
        <table className="atlas-table">
          <thead>
            <tr>
              <th>Imposer</th>
              <th>Tier</th>
              <th>Programme</th>
            </tr>
          </thead>
          <tbody>
            {sanctions.programs.map((p) => (
              <tr key={`${p.imposer}-${p.program}`}>
                <td>{p.imposer}</td>
                <td>{p.tier}</td>
                <td>{p.program}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="atlas-empty" style={{ marginTop: "0.75rem" }}>
        Dated sanctions-list and FATF-plenary history is not yet built for this tab (Phase 2, in progress on a
        separate branch). This is a coverage gap, not a finding that nothing has changed.
      </p>
    </section>
  );
}
