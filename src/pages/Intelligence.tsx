import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Clipboard,
  ExternalLink,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchAgenticWorkbench,
  fetchEnforcementBriefing,
  type AgenticWorkbenchResponse,
  type EnforcementBriefingResponse,
} from "../api.js";
import { PUBLIC_REGULATOR_SHELL_ITEMS } from "../data/regulatorShellNav.js";
import { useSEO } from "../hooks/useSEO.js";
import { useEvidenceModal } from "../components/EvidenceModalProvider.js";
import { buildEvidenceCase } from "../utils/evidenceCase.js";
import { trackEvent } from "../utils/analytics.js";
import "../styles/intelligence.css";

const PERSONA_OPTIONS = [
  { id: "", label: "All firm types" },
  { id: "investment_firm", label: "Investment Management" },
  { id: "wealth_management", label: "Wealth Management" },
  { id: "retail_bank", label: "Retail Banking" },
  { id: "payments_fintech", label: "Payments & Fintech" },
  { id: "insurance", label: "Insurance" },
  { id: "crypto", label: "Crypto & Digital Assets" },
  { id: "corporate_bank", label: "Corporate & Investment Banking" },
  { id: "consumer_credit", label: "Consumer Credit" },
];

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfYear() {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

function fiveYearStart() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 5);
  date.setDate(date.getDate() + 1);
  return localIsoDate(date);
}

function today() {
  return localIsoDate(new Date());
}

function formatAmount(value: number, currency: "GBP" | "EUR") {
  if (!Number.isFinite(value) || value <= 0) return "Non-monetary";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "n/a";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function citationNumber(id: string) {
  const numeric = Number(id.replace(/^\D+/, ""));
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER;
}

function buildCopyText(result: EnforcementBriefingResponse) {
  const lines = [
    "RegActions Enforcement Briefing",
    "",
    result.briefing.executiveSummary,
    "",
    "Key themes",
    ...result.briefing.keyThemes.map((theme, index) =>
      `${index + 1}. ${theme.title}: ${theme.narrative} ${theme.implication}`,
    ),
    "",
    "MLRO watch-points",
    ...result.briefing.mlroWatchPoints.map((point) => `- ${point}`),
    "",
    "Citations",
    ...result.citations.map((citation) =>
      `[${citation.id}] ${citation.firm} (${citation.regulator}, ${citation.dateIssued}) ${citation.url || ""}`.trim(),
    ),
    "",
    result.briefing.disclaimer,
  ];
  return lines.join("\n");
}

function describeGenerationBoundary(result: EnforcementBriefingResponse) {
  if (!result.datasetSummary.modelInput.sentToModel || result.fallbackUsed) {
    if (result.datasetSummary.evidenceActions > 0) {
      return `RegActions selected ${result.datasetSummary.evidenceActions} cited evidence records and generated this briefing deterministically from the qualified dataset.`;
    }
    return "No model was called because no qualified enforcement actions matched these filters.";
  }
  return `The language model received the qualified dataset summary and ${result.datasetSummary.modelInput.evidenceRowsSent} cited evidence records selected by RegActions. It did not retrieve or select evidence independently.`;
}

function chartLabel(value: string) {
  return value.length > 20 ? `${value.slice(0, 18)}...` : value;
}

function splitTerms(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function Intelligence() {
  const { openEvidence } = useEvidenceModal();
  useSEO({
    title: "Enforcement Briefing | RegActions",
    description:
      "Generate cited enforcement briefings and recurring themes from RegActions regulatory action data.",
    keywords:
      "agentic compliance intelligence, enforcement briefing, MLRO enforcement themes, regulatory fines AI",
    canonicalPath: "/intelligence",
    ogTitle: "Enforcement Briefing - RegActions",
    ogDescription:
      "Generate cited enforcement pattern briefings for compliance teams.",
    ogType: "website",
    ogImage: "https://regactions.com/og-image.png",
  });

  const [dateFrom, setDateFrom] = useState(startOfYear);
  const [dateTo, setDateTo] = useState(today);
  const [regulator, setRegulator] = useState("");
  const [personaId, setPersonaId] = useState("");
  const [query, setQuery] = useState("");
  const [currency, setCurrency] = useState<"GBP" | "EUR">("GBP");
  const [result, setResult] = useState<EnforcementBriefingResponse | null>(null);
  const [workbenchResult, setWorkbenchResult] = useState<AgenticWorkbenchResponse | null>(null);
  const [profileName, setProfileName] = useState("Example payments firm");
  const [workbenchPersonaId, setWorkbenchPersonaId] = useState("payments_fintech");
  const [jurisdictions, setJurisdictions] = useState("GB");
  const [products, setProducts] = useState("payments, e-money, open banking");
  const [riskFlags, setRiskFlags] = useState("AML, transaction monitoring, safeguarding");
  const [controlFramework, setControlFramework] = useState(
    "AML policy, customer due diligence, transaction monitoring and complaints MI are reviewed quarterly.",
  );
  const [researchQuestion, setResearchQuestion] = useState(
    "What are the most common AML breach patterns in payments and fintech firms over the selected date range?",
  );
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const filterPresets = useMemo(
    () => [
      {
        label: "FCA 5-year view",
        apply: () => {
          setDateFrom(fiveYearStart());
          setDateTo(today());
          setRegulator("FCA");
          setPersonaId("");
          setQuery("");
          setCurrency("GBP");
          setResult(null);
        },
      },
      {
        label: "AML controls",
        apply: () => {
          setDateFrom(fiveYearStart());
          setDateTo(today());
          setRegulator("FCA");
          setPersonaId("");
          setQuery("AML, transaction monitoring");
          setCurrency("GBP");
          setResult(null);
        },
      },
      {
        label: "Investment firms",
        apply: () => {
          setDateFrom(fiveYearStart());
          setDateTo(today());
          setRegulator("FCA");
          setPersonaId("investment_firm");
          setQuery("");
          setCurrency("GBP");
          setResult(null);
        },
      },
      {
        label: "Payments & fintech",
        apply: () => {
          setDateFrom(fiveYearStart());
          setDateTo(today());
          setRegulator("FCA");
          setPersonaId("payments_fintech");
          setQuery("");
          setCurrency("GBP");
          setResult(null);
        },
      },
    ],
    [],
  );

  const regulatorOptions = useMemo(
    () => [
      { code: "", label: "All regulators" },
      ...PUBLIC_REGULATOR_SHELL_ITEMS.map((item) => ({
        code: item.code,
        label: `${item.code} - ${item.country}`,
      })),
    ],
    [],
  );

  const displayedCitations = useMemo(() => {
    if (!result) return [];
    const referencedIds = new Set<string>();
    for (const theme of result.briefing.keyThemes) {
      for (const id of theme.evidenceIds) referencedIds.add(id);
    }
    for (const precedent of result.briefing.notablePrecedents) {
      if (precedent.citationId) referencedIds.add(precedent.citationId);
    }

    const selected = new Map<string, EnforcementBriefingResponse["citations"][number]>();
    for (const citation of result.citations) {
      if (referencedIds.has(citation.id) || selected.size < 12) {
        selected.set(citation.id, citation);
      }
    }
    return Array.from(selected.values()).sort(
      (left, right) => citationNumber(left.id) - citationNumber(right.id),
    );
  }, [result]);

  const themeChartData = useMemo(
    () =>
      result?.datasetSummary.topThemes.slice(0, 6).map((theme) => ({
        name: chartLabel(theme.label),
        fullName: theme.label,
        actions: theme.count,
        amount: theme.sampledAmount,
      })) || [],
    [result],
  );

  const evidenceFunnel = useMemo(() => {
    if (!result) return [];
    const max = Math.max(result.datasetSummary.matchedActions, 1);
    return [
      { label: "Matched", value: result.datasetSummary.matchedActions },
      { label: "Stats sample", value: result.datasetSummary.sampledActions },
      { label: "Cited evidence", value: result.datasetSummary.evidenceActions },
    ].map((item) => ({
      ...item,
      width: Math.max(8, Math.round((item.value / max) * 100)),
    }));
  }, [result]);

  const topFirmBars = useMemo(() => {
    if (!result) return [];
    const firms = result.datasetSummary.topFirms.slice(0, 5);
    const max = Math.max(...firms.map((firm) => firm.count), 1);
    return firms.map((firm) => ({
      ...firm,
      width: Math.max(8, Math.round((firm.count / max) * 100)),
    }));
  }, [result]);

  async function generateBriefing() {
    setLoading(true);
    setError(null);
    setCopied(false);
    setResult(null);
    try {
      const next = await fetchEnforcementBriefing({
        dateFrom,
        dateTo,
        regulator: regulator || undefined,
        personaId: personaId || undefined,
        query: query.trim() || undefined,
        currency,
        limit: 45,
      });
      setResult(next);
      trackEvent("briefing_generated", {
        surface: "intelligence_workspace",
        result_status: next.fallbackUsed ? "deterministic" : "model",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate briefing.");
    } finally {
      setLoading(false);
    }
  }

  async function copyBriefing() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildCopyText(result));
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Copy failed. Your browser blocked clipboard access for this page.");
    }
  }

  async function runWorkbench() {
    setWorkbenchLoading(true);
    setWorkbenchError(null);
    setWorkbenchResult(null);
    try {
      const next = await fetchAgenticWorkbench({
        dateFrom,
        dateTo,
        regulator: regulator || undefined,
        profile: {
          profileName,
          personaId: workbenchPersonaId || undefined,
          jurisdictions: splitTerms(jurisdictions),
          regulators: regulator ? [regulator] : undefined,
          products: splitTerms(products),
          riskFlags: splitTerms(riskFlags),
        },
        controlFramework,
        researchQuestion,
        lookbackDays: 30,
      });
      setWorkbenchResult(next);
    } catch (err) {
      setWorkbenchError(err instanceof Error ? err.message : "Unable to run agentic workbench.");
    } finally {
      setWorkbenchLoading(false);
    }
  }

  function openCitation(citation: EnforcementBriefingResponse["citations"][number]) {
    openEvidence(buildEvidenceCase({
      id: citation.actionId,
      entity: citation.firm,
      regulator: citation.regulator,
      dateIssued: citation.dateIssued,
      currency: result?.filters.currency || "GBP",
      summary: citation.title,
      source_url: citation.url,
    }, "intelligence_briefing"));
  }

  return (
    <main className="intelligence-page">
      <section className="intelligence-page__header">
        <div>
          <p className="intelligence-page__eyebrow">
            <Bot size={16} aria-hidden="true" />
            Evidence-led enforcement intelligence
          </p>
          <h1>Enforcement Briefing</h1>
          <p>
            Turn a selected enforcement dataset into an executive summary,
            comparable precedents, management questions and cited source evidence.
          </p>
        </div>
        <div className="intelligence-page__status">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>Grounded in official-source records</span>
        </div>
      </section>

      <section className="intelligence-page__workspace">
        <section className="intelligence-presets" aria-label="Analysis presets">
          <div>
            <p className="intelligence-section-kicker">Briefing presets</p>
            <h2>Start from a common enforcement lens</h2>
          </div>
          <div className="intelligence-presets__buttons">
            {filterPresets.map((preset) => (
              <button type="button" key={preset.label} onClick={preset.apply}>
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <form
          className="intelligence-filters"
          onSubmit={(event) => {
            event.preventDefault();
            void generateBriefing();
          }}
        >
          <label>
            <span>Date from</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            <span>Date to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label>
            <span>Regulator</span>
            <select
              value={regulator}
              onChange={(event) => setRegulator(event.target.value)}
            >
              {regulatorOptions.map((option) => (
                <option key={option.code || "all"} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Firm type</span>
            <select
              value={personaId}
              onChange={(event) => setPersonaId(event.target.value)}
            >
              {PERSONA_OPTIONS.map((option) => (
                <option key={option.id || "all"} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="intelligence-filters__query">
            <span>Theme or firm</span>
            <Search size={17} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="AML, Wise, transaction monitoring"
            />
          </label>
          <label>
            <span>Currency</span>
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as "GBP" | "EUR")}
            >
              <option value="GBP">GBP</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
          <button type="submit" className="intelligence-filters__submit" disabled={loading}>
            {loading ? <Loader2 size={18} aria-hidden="true" className="spin" /> : <Sparkles size={18} aria-hidden="true" />}
            <span>{loading ? "Generating" : "Generate briefing"}</span>
          </button>
        </form>

        {error ? (
          <div className="intelligence-alert" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {!result && !loading ? (
          <section className="intelligence-empty">
            <FileText size={24} aria-hidden="true" />
            <p>Select filters and generate a briefing.</p>
          </section>
        ) : null}

        <section className="agentic-workbench">
          <div className="agentic-workbench__header">
            <div>
              <p className="intelligence-section-kicker">Firm impact workbench</p>
              <h2>Apply the enforcement evidence to a firm profile</h2>
              <p>
                Compare the qualified evidence with a selected firm profile, recent
                change and the control information you provide.
              </p>
            </div>
            <button type="button" onClick={runWorkbench} disabled={workbenchLoading}>
              {workbenchLoading ? <Loader2 size={18} aria-hidden="true" className="spin" /> : <Bot size={18} aria-hidden="true" />}
              <span>{workbenchLoading ? "Analysing" : "Analyse firm impact"}</span>
            </button>
          </div>

          <div className="agentic-workbench__inputs">
            <label>
              <span>Profile name</span>
              <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </label>
            <label>
              <span>Agent profile</span>
              <select
                value={workbenchPersonaId}
                onChange={(event) => setWorkbenchPersonaId(event.target.value)}
              >
                {PERSONA_OPTIONS.filter((option) => option.id).map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Jurisdictions</span>
              <input value={jurisdictions} onChange={(event) => setJurisdictions(event.target.value)} />
            </label>
            <label>
              <span>Products</span>
              <input value={products} onChange={(event) => setProducts(event.target.value)} />
            </label>
            <label className="agentic-workbench__wide">
              <span>Risk flags</span>
              <input value={riskFlags} onChange={(event) => setRiskFlags(event.target.value)} />
            </label>
            <label className="agentic-workbench__wide">
              <span>Control framework</span>
              <textarea
                value={controlFramework}
                onChange={(event) => setControlFramework(event.target.value)}
                rows={3}
              />
            </label>
            <label className="agentic-workbench__wide">
              <span>Research question</span>
              <input
                value={researchQuestion}
                onChange={(event) => setResearchQuestion(event.target.value)}
              />
            </label>
          </div>

          {workbenchError ? (
            <div className="intelligence-alert" role="alert">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>{workbenchError}</span>
            </div>
          ) : null}

          {workbenchResult ? (
            <div className="agentic-workbench__results">
              <article>
                <p className="intelligence-section-kicker">Comparator</p>
                <h3>What would be worrying for this firm?</h3>
                <p>{workbenchResult.comparator.summary}</p>
                <ul>
                  {workbenchResult.comparator.riskThemes.slice(0, 4).map((theme) => (
                    <li key={theme.label}>
                      <strong>{theme.label}</strong>
                      <span>{theme.count} precedents - {theme.watchPoint}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article>
                <p className="intelligence-section-kicker">Horizon scan</p>
                <h3>What changed recently?</h3>
                <p>{workbenchResult.horizonScan.summary}</p>
                <ul>
                  {workbenchResult.horizonScan.trendDeltas.slice(0, 4).map((trend) => (
                    <li key={trend.label}>
                      <strong>{trend.label}</strong>
                      <span>{trend.recentCount} recent / {trend.previousCount} previous</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article>
                <p className="intelligence-section-kicker">Control gaps</p>
                <h3>What is not evidenced?</h3>
                <p>{workbenchResult.controlGapAnalysis.summary}</p>
                <ul>
                  {workbenchResult.controlGapAnalysis.priorityGaps.slice(0, 4).map((gap) => (
                    <li key={gap.theme}>
                      <strong>{gap.theme}</strong>
                      <span>{gap.severity} - {gap.reason}</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article>
                <p className="intelligence-section-kicker">Research agent</p>
                <h3>Cited analytical answer</h3>
                <p>{workbenchResult.research.answer}</p>
                <ul>
                  {workbenchResult.research.topFindings.slice(0, 4).map((finding) => (
                    <li key={finding.label}>
                      <strong>{finding.label}</strong>
                      <span>{finding.count} cited precedents</span>
                    </li>
                  ))}
                </ul>
              </article>

              <article className="agentic-workbench__impact">
                <p className="intelligence-section-kicker">Impact agent</p>
                <h3>{workbenchResult.impact.draftMemo.subject}</h3>
                <p>{workbenchResult.impact.summary}</p>
                <ul>
                  {workbenchResult.impact.impactFlags.map((flag) => (
                    <li key={flag.label}>
                      <strong>{flag.label}</strong>
                      <span>{flag.severity} - {flag.reason}</span>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          ) : null}
        </section>

        {result ? (
          <section className="intelligence-output" aria-live="polite">
            <div className="intelligence-output__toolbar">
              <div>
                <p className="intelligence-output__eyebrow">
                  {result.fallbackUsed ? "Deterministic evidence briefing" : "Evidence-generated briefing"}
                  {result.cached ? " - cached" : ""}
                </p>
                <h2>Briefing generated {formatDate(result.generatedAt)}</h2>
              </div>
              <button type="button" onClick={copyBriefing}>
                <Clipboard size={17} aria-hidden="true" />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>

            <div className="intelligence-metrics" aria-label="Briefing metrics">
              <div>
                <span>Actions</span>
                <strong>{result.stats.totalActions.toLocaleString("en-GB")}</strong>
              </div>
              <div>
                <span>Sampled value</span>
                <strong>
                  {formatAmount(
                    result.stats.sampledTotalAmount ?? result.stats.totalAmount,
                    result.filters.currency,
                  )}
                </strong>
              </div>
              <div>
                <span>Top theme</span>
                <strong>{result.stats.topCategories[0]?.category || "Mixed"}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>{result.briefing.confidence}</strong>
              </div>
            </div>

            <section className="intelligence-dataset-summary">
              <div>
                <p className="intelligence-section-kicker">Qualified dataset</p>
                <h3>{result.datasetSummary.scopeLabel}</h3>
                <p>
                  Evidence selection, statistics and citations are derived from the
                  qualified RegActions dataset. Generation details are retained in the audit trail below.
                </p>
                <p className="intelligence-dataset-summary__taxonomy">
                  Categorised with the {result.datasetSummary.taxonomy.name} before model use.
                </p>
              </div>
              <dl>
                <div>
                  <dt>Matched</dt>
                  <dd>{result.datasetSummary.matchedActions.toLocaleString("en-GB")} actions</dd>
                </div>
                <div>
                  <dt>Stats sample</dt>
                  <dd>{result.datasetSummary.sampledActions.toLocaleString("en-GB")} actions</dd>
                </div>
                <div>
                  <dt>Evidence selected</dt>
                  <dd>{result.datasetSummary.evidenceActions.toLocaleString("en-GB")} cited records</dd>
                </div>
              </dl>
              <div className="intelligence-dataset-summary__filters">
                {result.datasetSummary.filtersApplied.map((filter) => (
                  <span key={filter}>{filter}</span>
                ))}
              </div>
            </section>

            <section className="intelligence-visuals">
              <article className="intelligence-chart-card intelligence-chart-card--wide">
                <div className="intelligence-chart-card__header">
                  <div>
                    <p className="intelligence-section-kicker">Theme distribution</p>
                    <h3>Top enforcement patterns</h3>
                  </div>
                  <BarChart3 size={18} aria-hidden="true" />
                </div>
                {themeChartData.length ? (
                  <div className="intelligence-chart-frame">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={themeChartData}
                        layout="vertical"
                        margin={{ top: 8, right: 16, left: 12, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={120}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 11, fill: "#475569" }}
                        />
                        <Tooltip
                          cursor={{ fill: "#f8fafc" }}
                          formatter={(value, name) => [
                            name === "actions" ? `${Number(value).toLocaleString("en-GB")} actions` : value,
                            "Actions",
                          ]}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ""}
                        />
                        <Bar dataKey="actions" fill="#0fa77d" radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="intelligence-chart-card__empty">No theme chart for this filter set.</p>
                )}
              </article>

              <article className="intelligence-chart-card">
                <div className="intelligence-chart-card__header">
                  <div>
                    <p className="intelligence-section-kicker">Evidence path</p>
                    <h3>Evidence handling</h3>
                  </div>
                </div>
                <div className="intelligence-funnel">
                  {evidenceFunnel.map((item) => (
                    <div key={item.label}>
                      <span>
                        <strong>{item.label}</strong>
                        <em>{item.value.toLocaleString("en-GB")}</em>
                      </span>
                      <div>
                        <i style={{ width: `${item.width}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="intelligence-chart-card">
                <div className="intelligence-chart-card__header">
                  <div>
                    <p className="intelligence-section-kicker">Repeated names</p>
                    <h3>Top firms in sample</h3>
                  </div>
                </div>
                <div className="intelligence-firm-bars">
                  {topFirmBars.length ? topFirmBars.map((firm) => (
                    <div key={firm.label}>
                      <span>
                        <strong>{firm.label}</strong>
                        <em>{firm.count.toLocaleString("en-GB")}</em>
                      </span>
                      <div>
                        <i style={{ width: `${firm.width}%` }} />
                      </div>
                    </div>
                  )) : (
                    <p className="intelligence-chart-card__empty">No recurring firms in this sample.</p>
                  )}
                </div>
              </article>
            </section>

            <article className="intelligence-briefing">
              <h3>Executive summary</h3>
              <p>{result.briefing.executiveSummary}</p>
            </article>

            <div className="intelligence-columns">
              <section>
                <h3>Key themes</h3>
                <div className="intelligence-list">
                  {result.briefing.keyThemes.map((theme) => (
                    <article key={`${theme.title}-${theme.evidenceIds.join("-")}`}>
                      <h4>{theme.title}</h4>
                      <p>{theme.narrative}</p>
                      <p>{theme.implication}</p>
                      {theme.evidenceIds.length ? (
                        <div className="intelligence-citation-pills">
                          <span className="intelligence-citation-pills__label">Evidence</span>
                          {theme.evidenceIds.map((id) => (
                            <button
                              type="button"
                              key={id}
                              title={`Open evidence ${id}`}
                              onClick={() => {
                                const citation = result.citations.find((item) => item.id === id);
                                if (citation) openCitation(citation);
                              }}
                            >
                              {id}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>

              <section>
                <h3>MLRO watch-points</h3>
                <ul className="intelligence-watchpoints">
                  {result.briefing.mlroWatchPoints.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="intelligence-precedents">
              <div>
                <p className="intelligence-section-kicker">Comparable precedents</p>
                <h3>Cases supporting this briefing</h3>
              </div>
              <div className="intelligence-precedents__grid">
                {result.briefing.notablePrecedents.map((precedent) => {
                  const citation = result.citations.find((item) => item.id === precedent.citationId);
                  return (
                    <button
                      type="button"
                      key={`${precedent.firm}-${precedent.dateIssued}`}
                      disabled={!citation}
                      onClick={() => citation && openCitation(citation)}
                    >
                      <strong>{precedent.firm}</strong>
                      <span>{precedent.regulator} · {formatDate(precedent.dateIssued)}</span>
                      <p>{precedent.reason}</p>
                      {citation ? <em>Open evidence {citation.id}</em> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="intelligence-citations">
              <h3>Evidence citations</h3>
              <div>
                {displayedCitations.map((citation) => (
                  <button
                    type="button"
                    key={citation.id}
                    id={`citation-${citation.id}`}
                    onClick={() => openCitation(citation)}
                  >
                    <span>{citation.id}</span>
                    <strong>{citation.firm}</strong>
                    <em>
                      {citation.regulator} - {formatDate(citation.dateIssued)}
                    </em>
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>

            <details className="intelligence-audit">
              <summary>Generation and evidence audit</summary>
              <div>
                <p>{describeGenerationBoundary(result)}</p>
                <dl>
                  <div><dt>Evidence hash</dt><dd>{result.evidenceHash}</dd></div>
                  <div><dt>Model route</dt><dd>{result.model}</dd></div>
                  <div><dt>Review state</dt><dd>{result.fallbackUsed ? "Deterministic output" : "Language reviewed against citations"}</dd></div>
                  <div><dt>As at</dt><dd>{formatDate(result.generatedAt)}</dd></div>
                </dl>
                {result.briefing.limitations.length ? (
                  <ul>{result.briefing.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
                ) : null}
              </div>
            </details>

            <footer className="intelligence-disclaimer">
              {result.briefing.disclaimer}
            </footer>
          </section>
        ) : null}
      </section>
    </main>
  );
}
