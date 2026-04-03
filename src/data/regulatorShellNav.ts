import {
  PUBLIC_REGULATOR_NAV_ITEMS,
  type RegulatorCoverage,
} from "./regulatorCoverage.js";

export type RegulatorShellNavItem = Pick<
  RegulatorCoverage,
  | "code"
  | "fullName"
  | "country"
  | "countryCode"
  | "region"
  | "flag"
  | "navOrder"
  | "overviewPath"
  | "count"
>;

export const PUBLIC_REGULATOR_SHELL_ITEMS: RegulatorShellNavItem[] =
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
  );
