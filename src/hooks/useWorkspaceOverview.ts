import { useEffect, useMemo, useState } from "react";
import {
  fetchUnifiedOverview,
  type UnifiedOverviewParams,
  type UnifiedOverviewResponse,
} from "../api.js";

export function useWorkspaceOverview(params: UnifiedOverviewParams) {
  const stableParams = useMemo(() => params, [
    params.regulator,
    params.country,
    params.year,
    params.breachCategory,
    params.sector,
    params.q,
    params.currency,
  ]);
  const [data, setData] = useState<UnifiedOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchUnifiedOverview(stableParams)
      .then((response) => {
        if (active) setData(response);
      })
      .catch(() => {
        if (active) setError("Exact aggregate figures are temporarily unavailable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [stableParams]);

  return { data, loading, error };
}
