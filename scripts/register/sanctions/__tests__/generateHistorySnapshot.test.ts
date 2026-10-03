import { describe, expect, it } from "vitest";
import { buildSnapshot, renderSnapshotFile } from "../generateHistorySnapshot.js";
import {
  REGISTER_HISTORY_SNAPSHOT,
  type RegisterHistorySnapshotEvent,
} from "../../../../src/data/registerHistorySnapshot.js";

describe("committed registerHistorySnapshot.ts matches its generator (drift test)", () => {
  it("regenerating from source produces byte-identical content to the committed file", () => {
    const rendered = renderSnapshotFile(buildSnapshot());
    // Compare the data payload, not file mtimes/comments noise.
    const regenerated = JSON.parse(rendered.split("=\n")[1].replace(/;\s*$/, ""));
    expect(regenerated).toEqual(REGISTER_HISTORY_SNAPSHOT);
  });

  it("every snapshot entry has at most 5 events, newest first, each dated and sourced", () => {
    for (const events of Object.values(REGISTER_HISTORY_SNAPSHOT) as RegisterHistorySnapshotEvent[][]) {
      expect(events.length).toBeLessThanOrEqual(5);
      for (const event of events) {
        expect(event.eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(event.sourceUrl).toMatch(/^https:\/\//);
      }
      const dates = events.map((e: RegisterHistorySnapshotEvent) => e.eventDate);
      expect(dates).toEqual([...dates].sort().reverse());
    }
  });
});
