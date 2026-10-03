import type { RegisterAuthority, RegisterAuthorityRole } from "../../data/globalRegisterTypes.js";
import { AUTHORITY_ROLE_LABELS } from "../../data/authorityRoles.js";

/**
 * Authored SVG diagram: "Regulated firms" in the centre, connected to each
 * MAPPED (published) authority role by a labelled reporting-route edge.
 * Edges exist only where a published row supports that role for this
 * country; everything else reads "route not yet mapped" rather than being
 * invented.
 */
const ROUTE_LABELS: Record<RegisterAuthorityRole, string> = {
  fiu: "SARs / STRs",
  aml_supervisor: "AML supervision",
  prudential: "Prudential supervision",
  securities: "Securities conduct",
  insurance: "Insurance conduct",
  pensions: "Pensions conduct",
  central_bank: "Monetary / prudential",
  crime_enforcement: "Crime referrals",
  prosecutor: "Prosecution referrals",
  sanctions_tfs: "Sanctions reporting / licences",
  company_bo_registry: "BO / company filings",
  data_protection: "Data-protection compliance",
};

const DIAGRAM_ROLES: RegisterAuthorityRole[] = [
  "fiu",
  "aml_supervisor",
  "sanctions_tfs",
  "crime_enforcement",
  "company_bo_registry",
  "central_bank",
];

const WIDTH = 640;
const HEIGHT = 360;
const CENTRE = { x: WIDTH / 2, y: HEIGHT / 2 };
const RADIUS = 150;

export function AtlasAuthoritiesDiagram({ authorities }: { authorities: RegisterAuthority[] }) {
  const byRole = new Map<RegisterAuthorityRole, RegisterAuthority>();
  for (const a of authorities) if (!byRole.has(a.role)) byRole.set(a.role, a);

  const nodes = DIAGRAM_ROLES.map((role, idx) => {
    const angle = (idx / DIAGRAM_ROLES.length) * Math.PI * 2 - Math.PI / 2;
    const x = CENTRE.x + RADIUS * Math.cos(angle);
    const y = CENTRE.y + RADIUS * Math.sin(angle);
    return { role, x, y, authority: byRole.get(role) };
  });

  return (
    <svg
      className="atlas-diagram"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Reporting routes from regulated firms to mapped authorities"
    >
      {nodes.map((n) => (
        <line
          key={`edge-${n.role}`}
          x1={CENTRE.x}
          y1={CENTRE.y}
          x2={n.x}
          y2={n.y}
          className={`atlas-diagram__edge${n.authority ? " atlas-diagram__edge--mapped" : ""}`}
          strokeDasharray={n.authority ? undefined : "4 4"}
        />
      ))}

      <circle cx={CENTRE.x} cy={CENTRE.y} r={46} className="atlas-diagram__node atlas-diagram__node--centre" />
      <text x={CENTRE.x} y={CENTRE.y - 4} textAnchor="middle" fontWeight={600} fontSize={13}>
        Regulated
      </text>
      <text x={CENTRE.x} y={CENTRE.y + 12} textAnchor="middle" fontWeight={600} fontSize={13}>
        firms
      </text>

      {nodes.map((n) => (
        <g key={`node-${n.role}`}>
          <circle cx={n.x} cy={n.y} r={38} className="atlas-diagram__node" />
          <text x={n.x} y={n.y - 4} textAnchor="middle" fontSize={10.5} fontWeight={600}>
            {n.authority ? n.authority.acronym ?? AUTHORITY_ROLE_LABELS[n.role] : AUTHORITY_ROLE_LABELS[n.role]}
          </text>
          <text x={n.x} y={n.y + 10} textAnchor="middle" className="atlas-diagram__label" fontSize={9}>
            {n.authority ? ROUTE_LABELS[n.role] : "route not yet mapped"}
          </text>
        </g>
      ))}
    </svg>
  );
}
