import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  FileWarning,
  Landmark,
  Scale,
  ShoppingBasket,
  X,
} from "lucide-react";
import type { EvidenceCase } from "../utils/evidenceCase.js";
import { useEvidenceBasket } from "../hooks/useEvidenceBasket.js";
import { trackEvent } from "../utils/analytics.js";
import RegulatorMark from "./RegulatorMark.js";
import "../styles/evidence-modal.css";

interface EvidenceModalContextValue {
  openEvidence: (evidence: EvidenceCase) => void;
  closeEvidence: () => void;
}

const EvidenceModalContext = createContext<EvidenceModalContextValue | null>(null);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatAmount(value: number | null | undefined, currency: string) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    return "Non-monetary action";
  }
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toLocaleString("en-GB")}`;
  }
}

function sourceHost(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function sourceStatusCopy(evidence: EvidenceCase) {
  if (evidence.sourceStatus === "verified_publication") {
    return {
      label: "Verified official publication",
      detail: "The evidence link points to an official regulator document or publication.",
      tone: "verified",
    } as const;
  }
  if (evidence.sourceStatus === "verified_detail") {
    return {
      label: "Verified regulator notice",
      detail: "The evidence link points to the regulator's case-level notice.",
      tone: "verified",
    } as const;
  }
  if (evidence.sourceStatus === "official_unverified") {
    return {
      label: "Official source link",
      detail: "This link points to an apparent regulator source but has not yet passed a persisted RegActions source check.",
      tone: "listing",
    } as const;
  }
  if (evidence.sourceStatus === "listing_only") {
    return {
      label: "Regulator source list",
      detail: "A case-level link is not verified. The regulator's official source list is available instead.",
      tone: "listing",
    } as const;
  }
  return {
    label: "Official link pending verification",
    detail: "RegActions has not verified a reliable official link for this case, so no external link is shown.",
    tone: "missing",
  } as const;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function EvidenceModalProvider({ children }: { children: ReactNode }) {
  const evidenceBasket = useEvidenceBasket();
  const [evidence, setEvidence] = useState<EvidenceCase | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const closeEvidence = useCallback(() => setEvidence(null), []);
  const openEvidence = useCallback((nextEvidence: EvidenceCase) => {
    triggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    setCopyStatus(null);
    setEvidence(nextEvidence);
    trackEvent("evidence_modal_opened", {
      regulator: nextEvidence.regulator,
      source_status: nextEvidence.sourceStatus,
      surface: nextEvidence.surface,
    });
  }, []);

  useEffect(() => {
    if (!evidence) return;
    const root = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    root?.setAttribute("aria-hidden", "true");
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeEvidence();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = false;
      root?.removeAttribute("aria-hidden");
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [closeEvidence, evidence]);

  const contextValue = useMemo(
    () => ({ openEvidence, closeEvidence }),
    [closeEvidence, openEvidence],
  );
  const source = evidence?.directSourceUrl ?? evidence?.listingSourceUrl ?? null;
  const sourceCopy = evidence ? sourceStatusCopy(evidence) : null;
  const host = sourceHost(source);

  const handleCopy = async () => {
    if (!evidence || !source) return;
    try {
      await copyText(source);
      setCopyStatus("Source link copied");
      trackEvent("evidence_source_link_copied", {
        regulator: evidence.regulator,
        source_status: evidence.sourceStatus,
        surface: evidence.surface,
      });
    } catch {
      setCopyStatus("Unable to copy the source link");
    }
  };

  const modal = evidence && sourceCopy ? (
    <div className="evidence-modal" data-testid="evidence-modal-layer">
      <button
        type="button"
        className="evidence-modal__scrim"
        onClick={closeEvidence}
        aria-label="Close evidence summary"
      />
      <section
        ref={dialogRef}
        className="evidence-modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="evidence-modal__header">
          <div className="evidence-modal__regulator">
            <RegulatorMark
              regulator={evidence.regulator}
              label={evidence.regulatorFullName ?? evidence.regulator}
              country={evidence.country ?? undefined}
              size="medium"
              surface="light"
              showCode
              decorative={false}
            />
            <span>RegActions evidence summary</span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="evidence-modal__close"
            onClick={closeEvidence}
            aria-label="Close evidence summary"
          >
            <X size={20} />
          </button>
        </header>

        <div className="evidence-modal__body">
          <div className="evidence-modal__title-block">
            <p>Enforcement case</p>
            <h2 id={titleId}>{evidence.entity}</h2>
            <span id={descriptionId}>
              Review the case inside RegActions before choosing whether to open the regulator's website.
            </span>
          </div>

          <div className="evidence-modal__facts" aria-label="Case facts">
            <div><CalendarDays size={16} /><span>Date</span><strong>{formatDate(evidence.dateIssued)}</strong></div>
            <div><Scale size={16} /><span>Amount</span><strong>{evidence.requiresAmountReview ? "Under review" : formatAmount(evidence.amount, evidence.currency)}</strong></div>
            <div><Landmark size={16} /><span>Regulator</span><strong>{evidence.regulatorFullName || evidence.regulator}</strong></div>
          </div>

          <section className="evidence-modal__section">
            <h3>RegActions summary</h3>
            <p>{evidence.summary?.trim() || "A case summary is not currently available. Review the source status below before opening external evidence."}</p>
          </section>

          {(evidence.breachType || evidence.categories.length > 0) ? (
            <section className="evidence-modal__section">
              <h3>Breach themes</h3>
              <div className="evidence-modal__chips">
                {evidence.breachType ? <span>{evidence.breachType}</span> : null}
                {evidence.categories
                  .filter((category) => category !== evidence.breachType)
                  .map((category) => <span key={category}>{category}</span>)}
              </div>
            </section>
          ) : null}

          <section className={`evidence-modal__source evidence-modal__source--${sourceCopy.tone}`}>
            {sourceCopy.tone === "missing" ? <FileWarning size={19} /> : <CheckCircle2 size={19} />}
            <div>
              <strong>{sourceCopy.label}</strong>
              <p>{evidence.sourceWindowNote || sourceCopy.detail}</p>
              {host ? <small>{host}</small> : null}
              {evidence.sourceCheckedAt ? <small>Checked {formatDate(evidence.sourceCheckedAt)}{evidence.sourceHttpStatus ? ` | HTTP ${evidence.sourceHttpStatus}` : ""}</small> : null}
              <small>Case ID {evidence.id}</small>
            </div>
          </section>

          {copyStatus ? <p className="evidence-modal__status" role="status">{copyStatus}</p> : null}
        </div>

        <footer className="evidence-modal__footer">
          <button type="button" className="evidence-modal__secondary" onClick={closeEvidence}>
            Return to results
          </button>
          {source ? (
            <button type="button" className="evidence-modal__secondary" onClick={handleCopy}>
              <Clipboard size={16} /> Copy source link
            </button>
          ) : null}
          <button
            type="button"
            className="evidence-modal__secondary"
            onClick={() => {
              if (evidenceBasket.contains(evidence.id)) {
                evidenceBasket.remove(evidence.id);
                trackEvent("evidence_basket_removed", { regulator: evidence.regulator, surface: evidence.surface });
              } else {
                evidenceBasket.add(evidence);
                trackEvent("evidence_basket_added", { regulator: evidence.regulator, surface: evidence.surface });
              }
            }}
          >
            <ShoppingBasket size={16} />
            {evidenceBasket.contains(evidence.id) ? "Remove from board pack" : "Add to board pack"}
          </button>
          {source ? (
            <a
              className="evidence-modal__primary"
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackEvent("evidence_official_source_opened", {
                regulator: evidence.regulator,
                source_status: evidence.sourceStatus,
                surface: evidence.surface,
              })}
            >
              {evidence.sourceStatus === "listing_only" ? "Open regulator source list" : "Open official source"}
              <ExternalLink size={16} />
            </a>
          ) : null}
        </footer>
      </section>
    </div>
  ) : null;

  return (
    <EvidenceModalContext.Provider value={contextValue}>
      {children}
      {typeof document !== "undefined" && modal ? createPortal(modal, document.body) : null}
    </EvidenceModalContext.Provider>
  );
}

export function useEvidenceModal() {
  const context = useContext(EvidenceModalContext);
  if (!context) {
    throw new Error("useEvidenceModal must be used within EvidenceModalProvider");
  }
  return context;
}
