import { useEffect, useRef, useState } from "react";
import type { BoardFirmProfile } from "../data/boardIntelligence.js";
import type { BoardPackResult } from "../utils/boardIntelligence.js";

export interface BoardPackEvidenceResponse {
  pack: BoardPackResult;
  totalConsidered: number;
  methodologyVersion: string;
  analysisDate: string;
  selectedCaseResolutions: Array<{ requestedId: string; canonicalCaseId: string; aliasVersion?: string }>;
  controlEvidenceAvailable?: boolean;
}

export function useBoardPackEvidence(profile: BoardFirmProfile, selectedCaseIds: string[] = []) {
  const [pack, setPack] = useState<BoardPackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalConsidered, setTotalConsidered] = useState(0);
  const [methodologyVersion, setMethodologyVersion] = useState<string | null>(null);
  const [analysisDate, setAnalysisDate] = useState<string | null>(null);
  const [selectedCaseResolutions, setSelectedCaseResolutions] = useState<BoardPackEvidenceResponse["selectedCaseResolutions"]>([]);
  const [controlEvidenceAvailable, setControlEvidenceAvailable] = useState<boolean | undefined>();
  const requestGeneration = useRef(0);
  const profileKey = JSON.stringify(profile);
  const selectedCaseIdsKey = JSON.stringify(selectedCaseIds);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      fetch("/api/board-pack/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: JSON.parse(profileKey), selectedCaseIds: JSON.parse(selectedCaseIdsKey) }),
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error(`Board Pack evidence request failed (${response.status})`);
        return await response.json() as BoardPackEvidenceResponse;
      }).then((result) => {
        if (generation !== requestGeneration.current || controller.signal.aborted) return;
        setPack(result.pack);
        setTotalConsidered(result.totalConsidered);
        setMethodologyVersion(result.methodologyVersion);
        setAnalysisDate(result.analysisDate);
        setSelectedCaseResolutions(result.selectedCaseResolutions ?? []);
        setControlEvidenceAvailable(result.controlEvidenceAvailable);
      }).catch((cause: unknown) => {
        if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return;
        if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : "Unable to load Board Pack evidence");
      }).finally(() => {
        if (!controller.signal.aborted && generation === requestGeneration.current) setLoading(false);
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [profileKey, selectedCaseIdsKey]);

  return { pack, loading, error, totalConsidered, methodologyVersion, analysisDate, selectedCaseResolutions, controlEvidenceAvailable };
}
