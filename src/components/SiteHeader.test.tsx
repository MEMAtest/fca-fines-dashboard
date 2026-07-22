import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader.js";

describe("SiteHeader research navigation", () => {
  it("folds topics into Research and provides a Research breadcrumb", () => {
    render(<MemoryRouter initialEntries={["/topics"]}><SiteHeader /></MemoryRouter>);

    const mainNavigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(mainNavigation).queryByRole("link", { name: "Insights" })).not.toBeInTheDocument();
    expect(within(mainNavigation).getByRole("link", { name: "Research" })).toHaveClass("site-header__link--active");

    const breadcrumbResearch = screen
      .getAllByRole("link", { name: "Research" })
      .find((link) => link.closest(".site-header__breadcrumbs"));
    expect(breadcrumbResearch).toHaveAttribute("href", "/blog");
    expect(screen.getByText("Topics", { selector: ".site-header__crumb-current" })).toBeInTheDocument();
  });

  it("uses product labels that describe each destination", () => {
    render(<MemoryRouter initialEntries={["/fines"]}><SiteHeader /></MemoryRouter>);
    const mainNavigation = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(mainNavigation).getByRole("link", { name: "Fines" })).toHaveAttribute("href", "/fines");
    expect(within(mainNavigation).getByRole("link", { name: "Enforcement Explorer" })).toHaveAttribute("href", "/search");
    expect(within(mainNavigation).getByRole("link", { name: "Enforcement Briefing" })).toHaveAttribute("href", "/intelligence");
  });

  it("leaves individual FCA case breadcrumbs to the evidence page", () => {
    render(
      <MemoryRouter initialEntries={[
        "/fca-fines/2026/example-firm/b40e17fe-6592-450e-934c-80b4a427f87a",
      ]}>
        <SiteHeader />
      </MemoryRouter>,
    );

    expect(document.querySelector(".site-header__breadcrumbs")).not.toBeInTheDocument();
    expect(screen.queryByText(/b40e17fe/i)).not.toBeInTheDocument();
  });
});
