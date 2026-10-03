import { Link, useOutletContext } from "react-router-dom";
import type { AtlasCountryContext } from "../AtlasCountry.js";

/**
 * Change-log timeline. `register_change_log` is append-only but has no
 * writer yet in Phase 1 (the weekly link/content-check lane is the planned
 * writer) — so this renders an honest empty state, never a fabricated
 * "no changes" claim.
 */
export function AtlasUpdatesTab() {
  const { country } = useOutletContext<AtlasCountryContext>();
  if (!country) return null;

  return (
    <section className="atlas-card">
      <h3>Updates</h3>
      <p className="atlas-empty">
        No change-log entries have been recorded for {country.name} yet — this tab's feed goes live once the
        weekly link/content-check lane starts writing to <code>register_change_log</code>. This is not a claim
        that nothing has changed.
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        See the site-wide <Link to="/countries/changes">country changes feed</Link> meanwhile.
      </p>
    </section>
  );
}
