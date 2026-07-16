import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { EvidenceCase } from "../utils/evidenceCase.js";
import { useEvidenceModal } from "./EvidenceModalProvider.js";

interface EvidenceTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  evidence: EvidenceCase;
  children: ReactNode;
}

export function EvidenceTrigger({ evidence, children, type = "button", ...props }: EvidenceTriggerProps) {
  const { openEvidence } = useEvidenceModal();
  return (
    <button type={type} onClick={() => openEvidence(evidence)} {...props}>
      {children}
    </button>
  );
}
