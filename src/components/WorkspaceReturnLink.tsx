import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useWorkspaceReturn } from "../hooks/useWorkspaceReturn.js";

/**
 * "Back to {workspace}" affordance for pages that sit outside
 * `ProductWorkspaceShell` but are reachable from its sidebar.
 *
 * Renders nothing when the page was reached directly (no `from` trail), so the
 * same page works both as a workspace destination and as a standalone entry
 * point from marketing surfaces.
 */
export function WorkspaceReturnLink() {
  const { destination, label } = useWorkspaceReturn();

  if (!destination) return null;

  return (
    <Link className="workspace-return" to={destination}>
      <ArrowLeft size={15} aria-hidden="true" />
      Back to {label}
    </Link>
  );
}
