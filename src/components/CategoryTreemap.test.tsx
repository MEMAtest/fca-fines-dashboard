import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CategoryTreemap } from "./CategoryTreemap.js";

describe("CategoryTreemap", () => {
  const data = [
    { name: "AML", size: 12_000_000, count: 5 },
    { name: "Governance", size: 4_000_000, count: 2 },
  ];

  it("applies the selected category when a tile is clicked", () => {
    const onSelectCategory = vi.fn();
    render(
      <CategoryTreemap
        data={data}
        year={0}
        onSelectCategory={onSelectCategory}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Filter dashboard by AML" }),
    );

    expect(onSelectCategory).toHaveBeenCalledWith("AML");
  });

  it("switches the visible metric to action count", () => {
    render(<CategoryTreemap data={data} year={0} />);

    fireEvent.click(screen.getByRole("button", { name: "Action count" }));

    expect(screen.getByText("5 notices")).toBeInTheDocument();
    expect(screen.getByText("2 notices")).toBeInTheDocument();
  });

  it("keeps notice drill-through as a separate action", () => {
    const onSelectCategory = vi.fn();
    const onDrilldown = vi.fn();
    render(
      <CategoryTreemap
        data={data}
        year={0}
        onSelectCategory={onSelectCategory}
        onDrilldown={onDrilldown}
      />,
    );

    fireEvent.click(screen.getAllByText(/^View notices/i)[0]);

    expect(onDrilldown).toHaveBeenCalledWith("AML");
    expect(onSelectCategory).not.toHaveBeenCalled();
  });
});
