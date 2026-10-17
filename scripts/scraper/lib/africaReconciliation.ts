import type { DbReadyRecord } from './euFineHelpers.js';
import { cleanNgsecDisplayName } from '../scrapeNgsec.js';

export interface AfricaStoredRow {
  id: string;
  regulator: string;
  content_hash: string;
  firm_individual: string;
  date_issued: string;
  final_notice_url: string | null;
  source_url: string | null;
}

const urlKey = (value: string | null) => (value ?? '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
const nameKey = (value: string) => cleanNgsecDisplayName(value)
  .replace(/^(?:illegal operator(?: alert)?|public notice|activities of|disclaimer on activity of|scammer alert)\s*[-–—:]?\s*/i, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

export function planAfricaSuppressions(
  stored: AfricaStoredRow[],
  fresh: DbReadyRecord[],
  blockedUrls: string[],
) {
  const activeHashes = new Set(fresh.map(row => row.contentHash));
  const blocked = new Set(blockedUrls.map(urlKey));
  const fixtures = new Map([
    ['Standard Bank of South Africa Limited|2024-04-18', '25000000'],
    ['FirstRand Bank Limited|2023-11-05', '18000000'],
    ['Absa Bank Limited|2023-08-22', '15000000'],
  ]);
  return stored.flatMap(row => {
    if (row.regulator === 'FSCA' && !row.final_notice_url
      && row.source_url === 'https://www.fsca.co.za/Enforcement/Pages/default.aspx'
      && fixtures.has(`${row.firm_individual}|${row.date_issued}`)) {
      return [{ id: row.id, reason: 'Legacy FSCA test fixture; absent from the official enforcement archive.', replacementId: null as string | null }];
    }
    if (row.regulator !== 'NGSEC' || activeHashes.has(row.content_hash)) return [];
    const evidenceUrl = urlKey(row.final_notice_url || row.source_url);
    if (blocked.has(evidenceUrl)) {
      return [{ id: row.id, reason: 'Official-source loader excludes this compendium or procedural news item from case-level enforcement.', replacementId: null as string | null }];
    }
    if (/^(?:investors alert.*blacklisting|blacklisting|activities of some unregistered|ponzi:)/i.test(row.firm_individual)
      && fresh.some(candidate => urlKey(candidate.finalNoticeUrl || candidate.sourceUrl) === evidenceUrl)) {
      return [{ id: row.id, reason: 'Aggregate notice headline superseded by the affected entities extracted from the same official notice.', replacementId: null as string | null }];
    }
    const survivor = fresh.find(candidate => urlKey(candidate.finalNoticeUrl || candidate.sourceUrl) === evidenceUrl
      && candidate.dateIssued === row.date_issued
      && nameKey(candidate.firmIndividual) === nameKey(row.firm_individual));
    if (!survivor) return [];
    const replacement = stored.find(candidate => candidate.content_hash === survivor.contentHash);
    if (!replacement) return [];
    return [{ id: row.id, reason: 'Superseded name-variant duplicate of the same official notice, party and action date.', replacementId: replacement.id }];
  });
}
