import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

export interface WorkspaceReturn {
  /** Safe in-app path to return to, or null when there is nothing to go back to. */
  destination: string | null;
  /** Human label for the origin, e.g. "Fines workspace". */
  label: string;
}

/**
 * Reads the `from`/`fromLabel` trail that `ProductWorkspaceShell` attaches to
 * its secondary navigation links.
 *
 * Those destinations (/board-pack, /regulators, /methodology/enforcement) render
 * outside the workspace shell, so the sidebar vanishes when a user follows one.
 * The trail lets each destination offer a "Back to …" link instead of being a
 * dead end.
 *
 * `destination` is validated as a same-origin absolute path: it must start with
 * a single "/" so a crafted `?from=//evil.example` or `?from=https://evil.example`
 * cannot turn an internal control into an off-site redirect.
 */
export function useWorkspaceReturn(): WorkspaceReturn {
  const [searchParams] = useSearchParams();

  const destination = useMemo(() => {
    const candidate = searchParams.get("from");
    if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
      return null;
    }
    return candidate;
  }, [searchParams]);

  const label = searchParams.get("fromLabel")?.trim() || "previous workspace";

  return { destination, label };
}
