/**
 * Persona Digest Email Template
 *
 * RegActions weekly briefing for persona-targeted regulatory digests. The
 * markup lives in the shared email kit (./emailTemplates/digests.ts).
 */
import {
  personaDigestEmailDocument,
  type DigestBriefingSummary,
  type DigestItem,
  type PersonaDigestInput,
} from './emailTemplates/digests.js';

export type { DigestBriefingSummary, DigestItem };

export function personaDigestEmail(params: PersonaDigestInput): { subject: string; html: string; text: string } {
  return personaDigestEmailDocument(params);
}
