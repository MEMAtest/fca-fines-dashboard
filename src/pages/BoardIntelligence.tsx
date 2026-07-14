import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { BoardPackDashboard } from "../components/BoardPackDashboard.js";
import {
  BOARD_ARCHETYPES,
  BOARD_ARCHETYPES_BY_ID,
  BOARD_FOCUS_OPTIONS,
  BOARD_THEME_OPTIONS,
  DEFAULT_BOARD_PROFILE,
  type BoardArchetypeId,
  type BoardFirmProfile,
  type BoardFocusId,
  type BoardThemeId,
} from "../data/boardIntelligence.js";
import { LIVE_REGULATOR_NAV_ITEMS } from "../data/regulatorCoverage.js";
import { useLocalStorage } from "../hooks/useLocalStorage.js";
import { useSEO } from "../hooks/useSEO.js";
import { useUnifiedData } from "../hooks/useUnifiedData.js";
import { trackEvent } from "../utils/analytics.js";
import {
  buildBoardPack,
  buildControlChecklist,
  summarizeControlChallenge,
} from "../utils/boardIntelligence.js";
import "../styles/board-intelligence.css";

interface LeadForm {
  name: string;
  email: string;
  organisation: string;
  consent: boolean;
  marketingConsent: boolean;
  website: string;
}

const EMPTY_LEAD: LeadForm = {
  name: "",
  email: "",
  organisation: "",
  consent: false,
  marketingConsent: false,
  website: "",
};

function toggle<T>(items: T[], item: T) {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

export function BoardIntelligence() {
  useSEO({
    title: "Quick Board Pack | RegActions",
    description: "Create and download a concise, source-linked regulatory enforcement board pack without an account.",
  });

  const [profile, setProfile] = useLocalStorage<BoardFirmProfile>(
    "regactions-board-pack-profile-v2",
    DEFAULT_BOARD_PROFILE,
  );
  const [leadOpen, setLeadOpen] = useState(false);
  const [lead, setLead] = useState<LeadForm>(EMPTY_LEAD);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const { fines, loading, error } = useUnifiedData({ regulator: "All", country: "All", year: 0, currency: "GBP" });

  const safeProfile = useMemo(() => ({
    ...profile,
    firmName: profile.firmName.trim() || "Your organisation",
  }), [profile]);
  const pack = useMemo(() => buildBoardPack(fines, safeProfile), [fines, safeProfile]);
  const controls = useMemo(() => buildControlChecklist(pack), [pack]);
  const controlSummary = useMemo(() => summarizeControlChallenge(controls, {}), [controls]);
  const generatedLabel = useMemo(() => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date()), []);
  const archetype = BOARD_ARCHETYPES_BY_ID[profile.archetypeId];
  const boardFocus = BOARD_FOCUS_OPTIONS.find((item) => item.id === profile.boardFocus)!;
  const lowerConfidenceCodes = profile.priorityRegulators.filter((code) => LIVE_REGULATOR_NAV_ITEMS.find((item) => item.code === code)?.operationalConfidence === "lower");

  const updateArchetype = (archetypeId: BoardArchetypeId) => {
    const next = BOARD_ARCHETYPES_BY_ID[archetypeId];
    setProfile({
      ...profile,
      archetypeId,
      priorityRegulators: next.suggestedRegulators.slice(0, 5),
      focusRegions: next.suggestedRegions,
      priorityThemeIds: next.defaultThemes,
    });
  };

  const startDownload = () => {
    setStatus(null);
    if (!profile.firmName.trim()) {
      setStatus("Enter the organisation name before creating the pack.");
      document.getElementById("board-firm-name")?.focus();
      return;
    }
    setLeadOpen(true);
  };

  const submitAndDownload = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    if (!lead.consent) {
      setStatus("Please acknowledge the privacy notice before downloading the board pack.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/board-pack/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current },
        body: JSON.stringify({
          ...lead,
          idempotencyKey: idempotencyKey.current,
          profile: safeProfile,
          generatedAt: new Date().toISOString(),
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.persisted) {
        throw new Error(result.error || "We could not record the download request. Please try again.");
      }

      const [{ pdf }, documentModule] = await Promise.all([
        import("@react-pdf/renderer"),
        import("../components/BoardPackPdfDocument.js"),
      ]);
      const PdfDocument = documentModule.BoardPackPdfDocument;
      const blob = await pdf(
        <PdfDocument
          pack={pack}
          profile={safeProfile}
          generatedLabel={generatedLabel}
          controlSummary={controlSummary}
          controlChecklist={controls}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeProfile.firmName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-regactions-board-pack.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      trackEvent("board_pack_pdf_downloaded", { archetype: profile.archetypeId, notificationStatus: result.notificationStatus ?? "unknown" });
      setLeadOpen(false);
      setLead(EMPTY_LEAD);
      idempotencyKey.current = crypto.randomUUID();
      setStatus(result.notificationStatus === "sent" ? "Your board pack has downloaded." : "Your board pack has downloaded. The advisory notification is queued.");
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Unable to create the PDF. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="board-quick">
      <section className="board-quick__hero">
        <div>
          <span className="board-quick__eyebrow"><Sparkles size={15}/> Quick Board Pack</span>
          <h1>Create a committee-ready regulatory board pack</h1>
          <p>Choose the firm profile and risk lens, preview the analysis, then download a structured PDF. No account is required.</p>
          <div className="board-quick__assurance"><span><CheckCircle2 size={14}/> Public enforcement evidence</span><span><CheckCircle2 size={14}/> UK professional wording</span><span><CheckCircle2 size={14}/> Direct PDF download</span></div>
        </div>
        <button type="button" className="board-quick__download" onClick={startDownload} disabled={loading}><Download size={18}/> Create and download PDF</button>
      </section>

      <section className="board-quick__builder">
        <aside className="board-quick__form">
          <div className="board-quick__form-heading"><Settings2 size={17}/><div><h2>Build your pack</h2><p>About two minutes. Your settings stay on this device.</p></div></div>
          <label>Organisation name<input id="board-firm-name" value={profile.firmName === "Your organisation" ? "" : profile.firmName} onChange={(event) => setProfile({...profile,firmName:event.target.value})} placeholder="e.g. Acme Payments Ltd"/></label>
          <label>Firm type<select value={profile.archetypeId} onChange={(event)=>updateArchetype(event.target.value as BoardArchetypeId)}>{BOARD_ARCHETYPES.map((item)=><option value={item.id} key={item.id}>{item.label}</option>)}</select><small>{archetype.description}</small></label>
          <fieldset><legend>Committee lens</legend><div className="board-quick__choice-grid">{BOARD_FOCUS_OPTIONS.map((item)=><button type="button" key={item.id} className={profile.boardFocus===item.id?"is-selected":""} onClick={()=>setProfile({...profile,boardFocus:item.id as BoardFocusId})}><strong>{item.label}</strong><span>{item.description}</span></button>)}</div></fieldset>
          <fieldset><legend>Priority themes</legend><div className="board-quick__chips">{BOARD_THEME_OPTIONS.map((item)=><button type="button" key={item.id} className={profile.priorityThemeIds.includes(item.id)?"is-selected":""} onClick={()=>setProfile({...profile,priorityThemeIds:toggle(profile.priorityThemeIds,item.id as BoardThemeId).slice(-5)})}>{item.shortLabel}</button>)}</div><small>Select up to five.</small></fieldset>
          <fieldset><legend>Priority regulators</legend><div className="board-quick__chips">{LIVE_REGULATOR_NAV_ITEMS.filter((item)=>item.dashboardEnabled).slice(0,20).map((item)=><button type="button" key={item.code} className={profile.priorityRegulators.includes(item.code)?"is-selected":""} onClick={()=>setProfile({...profile,priorityRegulators:toggle(profile.priorityRegulators,item.code).slice(-5)})}>{item.code}</button>)}</div><small>Select up to five. The PDF links supporting cases to official evidence.</small></fieldset>
          {status && <div className="board-quick__status" role="status">{status}</div>}
          <button type="button" className="board-quick__download board-quick__download--full" onClick={startDownload} disabled={loading}>{loading?<LoaderCircle className="spin" size={18}/>:<FileText size={18}/>} Create board pack <ArrowRight size={17}/></button>
        </aside>

        <div className="board-quick__preview">
          <div className="board-quick__preview-heading"><div><span>Live preview</span><h2>{safeProfile.firmName}</h2></div><span>{fines.length.toLocaleString("en-GB")} source records considered</span></div>
          {error ? <div className="board-quick__empty">The live data could not be loaded. Please refresh before creating a pack.</div> : loading ? <div className="board-quick__empty"><LoaderCircle className="spin"/> Building the evidence view...</div> : <BoardPackDashboard pack={pack} profileSummary={`${archetype.label} under a ${boardFocus.label.toLowerCase()} lens.`} archetypeLabel={archetype.label} boardFocusLabel={boardFocus.label} generatedLabel={generatedLabel} confidentialityLabel="Board / Risk Committee Use" clientLabel="" analystNote="" workingMode={false} lowerConfidenceCodes={lowerConfidenceCodes} controlSummary={controlSummary} controlChecklist={controls} controlStatuses={{}} onControlStatusChange={()=>{}}/>}
        </div>
      </section>

      <footer className="board-quick__footer"><span>Generated by RegActions from public regulatory evidence.</span><span>Need a tailored board advisory pack? <a href="https://memaconsultants.com" target="_blank" rel="noreferrer">MEMA Consultants</a></span></footer>

      {leadOpen && <div className="board-lead" role="dialog" aria-modal="true" aria-labelledby="board-lead-title"><button className="board-lead__scrim" type="button" onClick={()=>!submitting&&setLeadOpen(false)} aria-label="Close download form"/><form className="board-lead__panel" onSubmit={submitAndDownload}><header><div><span>One final step</span><h2 id="board-lead-title">Download your board pack</h2><p>Enter your work details so RegActions can provide the pack and notify the MEMA board advisory team of your request.</p></div><button type="button" onClick={()=>setLeadOpen(false)} disabled={submitting} aria-label="Close"><X/></button></header><div className="board-lead__fields"><label>Your name<input required autoComplete="name" value={lead.name} onChange={(event)=>setLead({...lead,name:event.target.value})}/></label><label>Work email<input required type="email" autoComplete="email" value={lead.email} onChange={(event)=>setLead({...lead,email:event.target.value})}/></label><label>Organisation<input required autoComplete="organization" value={lead.organisation} onChange={(event)=>setLead({...lead,organisation:event.target.value})}/></label><label className="board-lead__honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={lead.website} onChange={(event)=>setLead({...lead,website:event.target.value})}/></label><label className="board-lead__consent"><input required type="checkbox" checked={lead.consent} onChange={(event)=>setLead({...lead,consent:event.target.checked})}/><span>I have read the privacy notice and agree to RegActions and MEMA Consultants processing these details to provide the pack and record this board advisory request.</span></label><label className="board-lead__consent"><input type="checkbox" checked={lead.marketingConsent} onChange={(event)=>setLead({...lead,marketingConsent:event.target.checked})}/><span>RegActions and MEMA Consultants may contact me by email about relevant board advisory services. This is optional and I can withdraw consent at any time.</span></label><p className="board-lead__privacy"><LockKeyhole size={13}/> Your details are not placed in the PDF or share URLs. See our <Link to="/privacy">privacy notice</Link>.</p>{status&&<div className="board-quick__status" role="alert">{status}</div>}<button className="board-quick__download board-quick__download--full" type="submit" disabled={submitting}>{submitting?<LoaderCircle className="spin" size={18}/>:<Download size={18}/>} {submitting?"Preparing your PDF...":"Download PDF"}</button></div></form></div>}
    </div>
  );
}
