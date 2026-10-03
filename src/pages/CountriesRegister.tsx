import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GLOBAL_REGISTER_AUTHORITIES } from "../data/globalRegister.js";
import { AUTHORITY_ROLE_LABELS } from "../data/authorityRoles.js";
import { getCountryByIso2, countrySlug } from "../data/countries.js";
import type { RegisterAuthorityRole } from "../data/globalRegisterTypes.js";
import "../styles/atlas.css";

const PAGE_SIZE = 50;

const ROLE_OPTIONS = Object.keys(AUTHORITY_ROLE_LABELS) as RegisterAuthorityRole[];

/** /countries/register — role-filterable authority register, 50 rows/page. */
export function CountriesRegister() {
  const [role, setRole] = useState<RegisterAuthorityRole | "all">("all");
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const filtered = role === "all" ? GLOBAL_REGISTER_AUTHORITIES : GLOBAL_REGISTER_AUTHORITIES.filter((a) => a.role === role);
    return [...filtered].sort((a, b) => a.iso2.localeCompare(b.iso2) || a.name.localeCompare(b.name));
  }, [role]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
      <h1 style={{ fontFamily: "var(--ra-font-serif)" }}>Global authority register</h1>
      <p style={{ color: "var(--ra-text-secondary)", marginBottom: "1rem" }}>
        {GLOBAL_REGISTER_AUTHORITIES.length} published authority rows. Filter by role.
      </p>
      <select
        value={role}
        onChange={(e) => {
          setRole(e.target.value as RegisterAuthorityRole | "all");
          setPage(0);
        }}
        className="atlas-search"
        style={{ width: "auto", marginBottom: "1rem" }}
        aria-label="Filter by authority role"
      >
        <option value="all">All roles</option>
        {ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {AUTHORITY_ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      <table className="atlas-table">
        <thead>
          <tr>
            <th>Country</th>
            <th>Authority</th>
            <th>Role</th>
            <th>Grade</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((a) => {
            const country = getCountryByIso2(a.iso2);
            return (
              <tr key={`${a.iso2}-${a.role}-${a.name}`}>
                <td>{country?.name ?? a.iso2}</td>
                <td>{a.name}</td>
                <td>{AUTHORITY_ROLE_LABELS[a.role]}</td>
                <td>{a.grade}</td>
                <td>
                  {country && (
                    <Link to={`/atlas/countries/${countrySlug(country)}/authorities`}>View</Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", alignItems: "center" }}>
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </button>
        <span>
          Page {page + 1} of {totalPages}
        </span>
        <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
