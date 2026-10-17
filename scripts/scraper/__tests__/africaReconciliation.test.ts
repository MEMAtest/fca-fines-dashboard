import { describe, expect, it } from 'vitest';
import { planAfricaSuppressions, type AfricaStoredRow } from '../lib/africaReconciliation.js';
import type { DbReadyRecord } from '../lib/euFineHelpers.js';

const row = (overrides: Partial<AfricaStoredRow> = {}): AfricaStoredRow => ({
  id: 'old', regulator: 'NGSEC', content_hash: 'old-hash', firm_individual: 'Illegal Operator Alert – Pocket Option',
  date_issued: '2025-07-21', final_notice_url: 'https://www.sec.gov.ng/pocket/', source_url: 'https://www.sec.gov.ng/pocket/', ...overrides,
});
const current = { regulator: 'NGSEC', contentHash: 'current-hash', firmIndividual: 'Pocket Option',
  dateIssued: '2025-07-21', finalNoticeUrl: 'https://www.sec.gov.ng/pocket/', sourceUrl: 'https://www.sec.gov.ng/pocket/' } as DbReadyRecord;

describe('reviewed Africa source reconciliation', () => {
  it('suppresses an old headline variant only when its current party/date/source survivor exists', () => {
    expect(planAfricaSuppressions([row()], [current], [])).toEqual([]);
    const stored = [row(), row({ id: 'survivor', content_hash: 'current-hash', firm_individual: 'Pocket Option' })];
    expect(planAfricaSuppressions(stored, [current], [])).toEqual([{ id: 'old', replacementId: 'survivor', reason: expect.any(String) }]);
    expect(planAfricaSuppressions(stored, [{ ...current, dateIssued: '2024-07-21' }], [])).toEqual([]);
  });
  it('preserves different parties sharing a bulk source document', () => {
    const stored = [row({ firm_individual: 'Another Entity' }), row({ id: 'survivor', content_hash: 'current-hash' })];
    expect(planAfricaSuppressions(stored, [current], [])).toEqual([]);
  });
  it('suppresses only the exact legacy FSCA fixture signatures', () => {
    const fixture = row({ regulator: 'FSCA', firm_individual: 'Absa Bank Limited', date_issued: '2023-08-22', final_notice_url: null, source_url: 'https://www.fsca.co.za/Enforcement/Pages/default.aspx' });
    expect(planAfricaSuppressions([fixture], [], [])).toHaveLength(1);
    expect(planAfricaSuppressions([{ ...fixture, final_notice_url: 'https://www.fsca.co.za/real-case.pdf' }], [], [])).toEqual([]);
  });
});
