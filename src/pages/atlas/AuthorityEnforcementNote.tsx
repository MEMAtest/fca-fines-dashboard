import { Link } from "react-router-dom";
import type { RegisterAuthority } from "../../data/globalRegisterTypes.js";
import { PUBLIC_REGULATOR_NAV_ITEMS } from "../../data/regulatorCoverage.js";
import { ROLES_WITHOUT_SANCTIONING_POWER } from "../../data/authorityRoles.js";

/**
 * The fines-link note shown on every authority card/node, driven ONLY by
 * RegActions' existing data:
 *   - mapped to a tracked regulator  -> "Issues fines — N actions tracked"
 *   - sourced sanctioning role, unmapped -> "Enforcement powers, not yet tracked"
 *   - role with no sanctioning power -> nothing
 * Mapping is the explicit regactionsRegulatorId column; never fuzzy-matched here.
 */
export function AuthorityEnforcementNote({ authority }: { authority: RegisterAuthority }) {
  if (authority.regactionsRegulatorId) {
    const reg = PUBLIC_REGULATOR_NAV_ITEMS.find((r) => r.code === authority.regactionsRegulatorId);
    if (reg) {
      return (
        <p className="atlas-authority-card__enforcement">
          Issues fines — <Link to={reg.overviewPath}>{reg.count} actions tracked on RegActions</Link>
        </p>
      );
    }
  }

  if (ROLES_WITHOUT_SANCTIONING_POWER.includes(authority.role)) {
    return null;
  }

  return <p className="atlas-authority-card__enforcement">Enforcement powers, not yet tracked by RegActions.</p>;
}
