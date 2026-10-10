import crypto from "node:crypto";
import type { DbReadyRecord } from "./euFineHelpers.js";

/**
 * Re-keys a record on a source-document identity instead of the default
 * amount/date-sensitive hash. When an extraction is later corrected (a
 * reconciled amount, a better decision date) the same row is updated in place
 * instead of a second row being inserted next to the first, and two distinct
 * penalties that share a name, date and amount stay distinct because the
 * document identity differs.
 */
export function withStableIdentity(record: DbReadyRecord, identity: string): DbReadyRecord {
  return {
    ...record,
    contentHash: crypto
      .createHash("sha256")
      .update(JSON.stringify({ regulator: record.regulator, identity }))
      .digest("hex"),
  };
}
