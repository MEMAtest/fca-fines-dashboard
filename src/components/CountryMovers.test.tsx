import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import CountryMovers from "./CountryMovers.js";
import { snapshotComparison } from "../data/scoreMovers.js";
import { formatDate } from "../data/countryView.js";

describe("CountryMovers header", () => {
  it("describes the real comparison from the data and never claims a weekly cadence", () => {
    const html = renderToString(<MemoryRouter><CountryMovers /></MemoryRouter>);
    const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&amp;/g, "'");
    const c = snapshotComparison();
    expect(c).not.toBeNull();
    if (c?.previous) expect(text).toContain(`Change since ${formatDate(c.previous)}`);
    expect(text).toContain(formatDate(c!.latest));
    expect(text).not.toMatch(/snapshotted weekly/i);
    expect(text).not.toMatch(/Weekly snapshots/i);
  });
});
