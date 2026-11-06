import { TrendingUp } from "lucide-react";
import { formatDate } from "../data/countryView.js";
import { largestGapDays } from "../data/scoreMovers.js";

export interface TrendPoint {
  date: string;
  score: number;
}

interface Props {
  scoreAvailable: boolean;
  history: TrendPoint[];
  /** Where the series comes from, so the copy never overclaims. */
  source: "persisted" | "weekly-snapshots" | "baseline";
  publishedScore: number | null;
  statusExplanation: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

export function CountryRiskTrend({ scoreAvailable, history, source, publishedScore, statusExplanation }: Props) {
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  const first = history[0];
  const runChange = latest && previous ? round1(latest.score - previous.score) : null;
  const sinceStart = latest && first && history.length >= 2 ? round1(latest.score - first.score) : null;
  const tracking = scoreAvailable && history.length >= 2;
  const gap = largestGapDays(history);

  return (
    <div className="cx-card cx-trend">
      <span className="cx-card__eyebrow">
        <TrendingUp size={12} /> Risk trend
      </span>
      {tracking ? (
        <>
          <p className="cx-trend__state">Tracking</p>
          <svg className="cx-trend__svg" viewBox="0 0 200 60" preserveAspectRatio="none" role="img" aria-label={`Score history, ${history.length} points`}>
            <polyline
              points={history
                .map((p, i) => `${(i / (history.length - 1)) * 200},${60 - (p.score / 10) * 60}`)
                .join(" ")}
              fill="none"
              stroke="#136a9b"
              strokeWidth="2"
            />
          </svg>
          {source === "weekly-snapshots" && (
            <div className="cx-trend__stats">
              <div>
                <b>{publishedScore === null ? "—" : publishedScore.toFixed(1)}</b>
                <span>Current</span>
              </div>
              <div>
                <b>{latest.score.toFixed(1)}</b>
                <span>Snapshot {formatDate(latest.date)}</span>
              </div>
              <div>
                <b>{sinceStart === null ? "n/a" : signed(sinceStart)}</b>
                <span>Since {formatDate(first.date)}</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="cx-trend__state">{scoreAvailable ? "Baseline" : "No score to trend"}</p>
          <div className="cx-trend__stats">
            <div>
              <b>{publishedScore === null ? "—" : publishedScore.toFixed(1)}</b>
              <span>Current</span>
            </div>
            <div>
              <b>{previous ? previous.score.toFixed(1) : "—"}</b>
              <span>Previous run</span>
            </div>
            <div>
              <b>{runChange === null ? "n/a" : signed(runChange)}</b>
              <span>Run change</span>
            </div>
          </div>
        </>
      )}
      <p className="cx-card__note">
        {scoreAvailable && first
          ? source === "weekly-snapshots"
            ? `${history.length} snapshots since ${formatDate(first.date)}. ${gap > 10 ? "Snapshot dates have been irregular; missed snapshots are not back-filled. " : ""}`
            : `Score history started ${formatDate(first.date)}. `
          : ""}
        {scoreAvailable ? statusExplanation : "A trend will appear when enough information is available to publish a score."}
      </p>
      {scoreAvailable && (
        <details className="cx-trend__why">
          <summary>Why this changed</summary>
          <p className="cx-card__note">
            {runChange === null
              ? "The current score is calculated from the v3.1 underlying-risk pillars; sanctions and FATF status are shown as legal treatment overlays, except for the labelled FATF listing status used where no mutual evaluation exists."
              : source === "weekly-snapshots"
                ? `Between the last two snapshots the score moved by ${signed(runChange)}; listing changes (FATF, sanctions) are dated on the changes page.`
                : `The latest persisted source run moved the score by ${signed(runChange)}; the exact current arithmetic is shown above.`}
          </p>
        </details>
      )}
    </div>
  );
}
