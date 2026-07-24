#!/usr/bin/env npx tsx
import { getSqlClient } from "../server/db.js";
import {
  createBoardPackDraft,
  createBoardPackShare,
  deleteBoardPackDraft,
  getBoardPackDraft,
  getBoardPackShare,
  revokeBoardPackShare,
  updateBoardPackDraft,
} from "../server/services/boardPackPersistence.js";
import {
  DEFAULT_BOARD_PACK_SETTINGS,
  DEFAULT_BOARD_PROFILE,
} from "../src/data/boardIntelligence.js";

const sql = getSqlClient();
const payload = {
  schemaVersion: 1 as const,
  label: "Board Pack persistence verification",
  currency: "GBP",
  firmProfile: { ...DEFAULT_BOARD_PROFILE, firmName: "Verification firm" },
  presentationSettings: DEFAULT_BOARD_PACK_SETTINGS,
  analystNote: "Immutable integration check",
  evidenceLocators: [{
    caseId: "b40e17fe-6592-450e-934c-80b4a427f87a",
    regulator: "FCA",
  }],
  assuranceMode: true,
  controlStatuses: { "verification-control": "evidenced" as const },
};

async function expectMissing(operation: () => Promise<unknown>, label: string) {
  try {
    await operation();
    throw new Error(`${label} unexpectedly succeeded`);
  } catch (error) {
    if (Number((error as { statusCode?: number }).statusCode) !== 404) throw error;
  }
}

async function main() {
  const created = await createBoardPackDraft(payload, sql);
  const packId = String(created.id);
  const ownerToken = created.ownerToken;
  try {
    const reopened = await getBoardPackDraft(packId, ownerToken, sql);
    if (Number(reopened.revision) !== 1) throw new Error("New draft revision was not 1");

    const updatedPayload = {
      ...payload,
      label: "Board Pack persistence verification revision 2",
    };
    const updated = await updateBoardPackDraft(packId, ownerToken, 1, updatedPayload, sql);
    if (Number(updated.revision) !== 2) throw new Error("Draft revision did not advance");

    let conflict = false;
    try {
      await updateBoardPackDraft(packId, ownerToken, 1, payload, sql);
    } catch (error) {
      conflict = Number((error as { statusCode?: number }).statusCode) === 409;
    }
    if (!conflict) throw new Error("Stale draft update did not return a conflict");

    const share = await createBoardPackShare(packId, ownerToken, sql);
    const beforeEdit = await getBoardPackShare(share.shareToken, sql);
    const snapshotBefore = JSON.stringify(beforeEdit.snapshot);

    await updateBoardPackDraft(packId, ownerToken, 2, {
      ...updatedPayload,
      label: "Board Pack persistence verification revision 3",
    }, sql);
    const afterEdit = await getBoardPackShare(share.shareToken, sql);
    if (JSON.stringify(afterEdit.snapshot) !== snapshotBefore) {
      throw new Error("Immutable shared snapshot changed after its draft was edited");
    }

    await revokeBoardPackShare(packId, String(share.id), ownerToken, sql);
    await expectMissing(() => getBoardPackShare(share.shareToken, sql), "Revoked share");

    const expiring = await createBoardPackShare(packId, ownerToken, sql);
    await sql(
      "UPDATE public.board_pack_shares SET expires_at = now() - interval '1 minute' WHERE id = $1::uuid",
      [expiring.id],
    );
    await expectMissing(() => getBoardPackShare(expiring.shareToken, sql), "Expired share");

    await deleteBoardPackDraft(packId, ownerToken, sql);
    await expectMissing(() => getBoardPackDraft(packId, ownerToken, sql), "Deleted draft");

    console.log(JSON.stringify({
      created: true,
      reopened: true,
      updated: true,
      conflict409: true,
      shared: true,
      immutableAfterEdit: true,
      revoked: true,
      expired: true,
      deleted: true,
      ownerTokenLength: ownerToken.length,
      shareTokenLength: share.shareToken.length,
    }, null, 2));
  } finally {
    await sql("DELETE FROM public.board_pack_drafts WHERE id = $1::uuid", [packId]).catch(() => undefined);
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
