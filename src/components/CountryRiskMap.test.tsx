import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CountryRiskMap } from "./CountryRiskMap.js";

// The map only renders its zoom controls once it has (a) a measured width and
// (b) the vendored topology. jsdom reports clientWidth === 0, so we force a real
// width and serve the actual /world-countries-110m.json through a mocked fetch.
const __dirname = dirname(fileURLToPath(import.meta.url));
const topology = JSON.parse(
  readFileSync(resolve(__dirname, "../../public/world-countries-110m.json"), "utf8"),
);

function renderMap(props: Parameters<typeof CountryRiskMap>[0] = {}) {
  return render(
    <MemoryRouter>
      <CountryRiskMap {...props} />
    </MemoryRouter>,
  );
}

beforeAll(() => {
  // A non-zero measured width so the SVG (and controls) mount.
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 800;
    },
  });
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => topology,
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CountryRiskMap zoom controls", () => {
  it("renders the +/-/reset controls with accessible labels", async () => {
    renderMap();
    const zoomIn = await screen.findByRole("button", { name: /zoom in/i });
    expect(zoomIn).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reset map to world view/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /map zoom controls/i })).toBeInTheDocument();
  });

  it("disables zoom-out and reset at world scale, enables them after zooming in", async () => {
    renderMap();
    const zoomIn = await screen.findByRole("button", { name: /zoom in/i });
    const zoomOut = screen.getByRole("button", { name: /zoom out/i });
    const reset = screen.getByRole("button", { name: /reset map to world view/i });

    expect(zoomOut).toBeDisabled();
    expect(reset).toBeDisabled();
    expect(zoomIn).not.toBeDisabled();

    act(() => {
      fireEvent.click(zoomIn);
    });

    expect(zoomOut).not.toBeDisabled();
    expect(reset).not.toBeDisabled();
  });

  it("applies a scale transform to the country group when zoomed and resets it", async () => {
    const { container } = renderMap();
    const zoomIn = await screen.findByRole("button", { name: /zoom in/i });

    const groupBefore = container.querySelector(".cx-map__svg g");
    expect(groupBefore?.getAttribute("transform")).toContain("scale(1)");

    act(() => {
      fireEvent.click(zoomIn);
    });
    const group = container.querySelector(".cx-map__svg g");
    const t = group?.getAttribute("transform") ?? "";
    const scale = Number(/scale\(([\d.]+)\)/.exec(t)?.[1]);
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThanOrEqual(8);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /reset map to world view/i }));
    });
    expect(container.querySelector(".cx-map__svg g")?.getAttribute("transform")).toContain(
      "scale(1)",
    );
  });

  it("caps the scale at 8x no matter how many times you zoom in", async () => {
    const { container } = renderMap();
    const zoomIn = await screen.findByRole("button", { name: /zoom in/i });
    for (let i = 0; i < 20; i++) {
      act(() => {
        fireEvent.click(zoomIn);
      });
    }
    const t = container.querySelector(".cx-map__svg g")?.getAttribute("transform") ?? "";
    const scale = Number(/scale\(([\d.]+)\)/.exec(t)?.[1]);
    expect(scale).toBeLessThanOrEqual(8);
    expect(scale).toBeGreaterThan(7);
    // zoom-in should now be disabled at the cap
    expect(zoomIn).toBeDisabled();
  });

  it("still fires onSelect when a country is clicked (no accidental pan)", async () => {
    const onSelect = vi.fn();
    const { container } = renderMap({ onSelect });
    await screen.findByRole("button", { name: /zoom in/i });
    await waitFor(() => {
      expect(container.querySelector("path.cx-map__country--live")).toBeTruthy();
    });
    const live = container.querySelector("path.cx-map__country--live")!;
    act(() => {
      fireEvent.click(live);
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatch(/^[A-Z]{2}$/);
  });
});
