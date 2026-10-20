export interface SecEntityRepair {
  id: string;
  contentHash: string;
  date: string;
  sourceUrl: string;
  noticeUrl: string;
  title: string;
  amount: string;
  replacementFirm: string;
  replacementCategory: string;
}

export interface SecEntityRepairRow {
  id: string;
  contentHash: string;
  regulator: string;
  firm_individual: string;
  firm_category: string | null;
  date_issued: string;
  source_url: string | null;
  final_notice_url: string | null;
  raw_title: string | null;
  amount: string | null;
}

export type SecEntityRepairState = "pending" | "already_applied";

export async function runSecEntityRepairApply<T>(steps: {
  lock: () => Promise<unknown>;
  snapshot: () => Promise<T[]>;
  mutate: () => Promise<void>;
  refresh: () => Promise<unknown>;
  commit: () => Promise<unknown>;
  rollback: () => Promise<unknown>;
}): Promise<T[]> {
  try {
    await steps.lock();
    const before = await steps.snapshot();
    await steps.mutate();
    await steps.refresh();
    const after = await steps.snapshot();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error("Canonical public_case_id inventory changed; repair transaction rolled back.");
    }
    await steps.commit();
    return after;
  } catch (error) {
    await steps.rollback();
    throw error;
  }
}

export function verifySecEntityRepairManifest(items: SecEntityRepair[]) {
  if (items.length !== 2 || new Set(items.map((item) => item.id)).size !== 2) {
    throw new Error("Expected exactly two unique reviewed SEC eToro rows in the repair manifest.");
  }
  for (const item of items) {
    if (!/^[0-9a-f-]{36}$/i.test(item.id) || !/^[0-9a-f]{64}$/i.test(item.contentHash)
      || item.date !== "2024-09-12" || item.sourceUrl !== "https://www.sec.gov/newsroom/press-releases/2024-125"
      || item.noticeUrl !== "https://www.sec.gov/files/litigation/admin/2024/34-101001.pdf"
      || item.title !== "eToro Reaches Settlement with SEC and Will Cease Trading Activity in Nearly All Crypto Assets"
      || item.amount !== "1500000.00" || item.replacementFirm !== "eToro USA LLC"
      || item.replacementCategory !== "Firm or Individual") {
      throw new Error(`Malformed or out-of-scope SEC eToro repair manifest entry: ${item.id}`);
    }
  }
}

export function assessSecEntityRepairRows(
  rows: SecEntityRepairRow[],
  items: SecEntityRepair[],
): SecEntityRepairState {
  verifySecEntityRepairManifest(items);
  if (rows.length !== items.length) {
    throw new Error(`Expected exactly ${items.length} stored rows; found ${rows.length}.`);
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const states = items.map((item) => {
    const row = byId.get(item.id);
    if (!row || row.regulator !== "SEC" || row.contentHash !== item.contentHash
      || row.date_issued !== item.date || row.source_url !== item.sourceUrl
      || row.final_notice_url !== item.noticeUrl || row.raw_title !== item.title
      || row.amount !== item.amount) {
      throw new Error(`SEC eToro repair preflight mismatch for ${item.id}; refusing all changes.`);
    }
    if (row.firm_individual === "Unnamed party (SEC)" && row.firm_category === "Unnamed party") return "pending";
    if (row.firm_individual === item.replacementFirm && row.firm_category === item.replacementCategory) return "already_applied";
    throw new Error(`SEC eToro repair row ${item.id} is in an unexpected or partially repaired state.`);
  });
  if (new Set(states).size !== 1) throw new Error("SEC eToro repair rows are mixed between original and repaired states.");
  return states[0] as SecEntityRepairState;
}
