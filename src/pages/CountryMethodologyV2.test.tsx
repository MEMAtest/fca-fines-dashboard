import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CountryMethodologyV2 } from "./CountryMethodologyV2.js";

const { useSEO } = vi.hoisted(() => ({ useSEO: vi.fn() }));
vi.mock("../hooks/useSEO.js", () => ({ useSEO }));

describe("CountryMethodologyV2", () => {
  it("keeps the historical route's hydrated SEO metadata explicit", () => {
    render(
      <MemoryRouter initialEntries={["/countries/methodology/v2"]}>
        <CountryMethodologyV2 />
      </MemoryRouter>,
    );
    expect(useSEO).toHaveBeenCalledWith(expect.objectContaining({
      title: "Trusted Country Risk Score v2 Methodology | RegActions",
      canonicalPath: "/countries/methodology/v2",
    }));
  });
});
