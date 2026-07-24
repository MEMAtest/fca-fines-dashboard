import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BoardPackDashboard } from "../components/BoardPackDashboard.js";
import {
  BOARD_ARCHETYPES_BY_ID,
  BOARD_FOCUS_OPTIONS,
} from "../data/boardIntelligence.js";
import { useSEO } from "../hooks/useSEO.js";
import type { BoardPackSharedSnapshotV1 } from "../types/boardPackPersistence.js";
import {
  buildControlChecklist,
  summarizeControlChallenge,
} from "../utils/boardIntelligence.js";
import "../styles/board-intelligence.css";

export function BoardPackShared() {
  const { shareToken = "" } = useParams();
  const [snapshot, setSnapshot] = useState<BoardPackSharedSnapshotV1 | null>(null);
  const [error, setError] = useState("");
  useSEO({
    title: "Shared Board Pack | RegActions",
    description: "Read-only RegActions Board Pack snapshot.",
    robots: "noindex, nofollow, noarchive",
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/board-pack/shares/${encodeURIComponent(shareToken)}`, {
      signal: controller.signal,
      credentials: "omit",
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Shared Board Pack is unavailable");
        setSnapshot(body.snapshot);
      })
      .catch((caught) => {
        if ((caught as Error).name !== "AbortError") {
          setError(caught instanceof Error ? caught.message : "Shared Board Pack is unavailable");
        }
      });
    return () => controller.abort();
  }, [shareToken]);

  const controls = useMemo(
    () => snapshot ? buildControlChecklist(snapshot.result) : [],
    [snapshot],
  );
  const controlSummary = useMemo(
    () => snapshot
      ? summarizeControlChallenge(controls, snapshot.payload.controlStatuses)
      : undefined,
    [controls, snapshot],
  );

  if (error) return <main className="board-quick"><section className="board-quick__empty"><h1>Shared pack unavailable</h1><p>{error}</p><Link to="/board-pack">Create a local Board Pack</Link></section></main>;
  if (!snapshot || !controlSummary) return <main className="board-quick"><section className="board-quick__empty">Loading shared Board Pack...</section></main>;

  const archetype = BOARD_ARCHETYPES_BY_ID[snapshot.payload.firmProfile.archetypeId];
  const focus = BOARD_FOCUS_OPTIONS.find((item) => item.id === snapshot.payload.firmProfile.boardFocus)!;
  const settings = snapshot.payload.presentationSettings;
  return (
    <main className="board-quick">
      <section className="board-quick__hero">
        <div>
          <span className="board-quick__eyebrow">Read-only shared snapshot</span>
          <h1>{snapshot.payload.label}</h1>
          <p>Generated {new Date(snapshot.generatedAt).toLocaleString("en-GB")}. This immutable snapshot cannot edit the owner’s draft.</p>
        </div>
      </section>
      <section className="board-quick__preview">
        <BoardPackDashboard
          pack={snapshot.result}
          profileSummary={`${archetype.label} under a ${focus.label.toLowerCase()} lens.`}
          archetypeLabel={archetype.label}
          boardFocusLabel={focus.label}
          generatedLabel={new Date(snapshot.generatedAt).toLocaleDateString("en-GB")}
          confidentialityLabel={settings.confidentialityLabel}
          clientLabel={settings.clientLabel}
          analystNote={snapshot.payload.analystNote}
          workingMode={snapshot.payload.assuranceMode}
          readOnly
          lowerConfidenceCodes={[]}
          controlSummary={controlSummary}
          controlChecklist={controls}
          controlStatuses={snapshot.payload.controlStatuses}
          onControlStatusChange={() => undefined}
        />
      </section>
    </main>
  );
}
