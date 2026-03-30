import { describe, expect, it } from "vitest";
import { PUBLIC_REGULATOR_NAV_ITEMS } from "./regulatorCoverage.js";
import { PUBLIC_REGULATOR_SHELL_ITEMS } from "./regulatorShellNav.js";

describe("PUBLIC_REGULATOR_SHELL_ITEMS", () => {
  it("stays aligned with the public regulator registry subset", () => {
    expect(PUBLIC_REGULATOR_SHELL_ITEMS).toEqual(
      PUBLIC_REGULATOR_NAV_ITEMS.map(
        ({
          code,
          fullName,
          country,
          countryCode,
          region,
          flag,
          navOrder,
          overviewPath,
          count,
        }) => ({
          code,
          fullName,
          country,
          countryCode,
          region,
          flag,
          navOrder,
          overviewPath,
          count,
        }),
      ),
    );
  });
});
