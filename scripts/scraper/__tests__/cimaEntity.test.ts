import { describe, expect, it } from "vitest";
import { extractCimaEntity } from "../lib/cimaEntity.js";

/**
 * Every headline below was taken verbatim from cima.ky on 2026-08-18
 * (/administrative-fines and /enforcement-notices).
 */
describe("extractCimaEntity — fines listing", () => {
  it("pulls the party out of a fine headline and drops the amount", () => {
    expect(
      extractCimaEntity(
        "Cayman Islands Monetary Authority Fines Blacktower (Cayman) Ltd. CI$85,043.84",
      ),
    ).toBe("Blacktower (Cayman) Ltd");
  });

  it("handles a truncated amount suffix", () => {
    expect(
      extractCimaEntity(
        "Cayman Islands Monetary Authority Fines Blacktower Financial Management (International) Limited CI$2",
      ),
    ).toBe("Blacktower Financial Management (International) Limited");
  });

  it("handles the Artex headline", () => {
    expect(
      extractCimaEntity(
        "Cayman Islands Monetary Authority Fines Artex Risk Solutions (Cayman) Limited CI$95,409.11",
      ),
    ).toBe("Artex Risk Solutions (Cayman) Limited");
  });

  it("reads the party after 'Against'", () => {
    expect(
      extractCimaEntity(
        "CIMA Withdraws Fines Against Sterling Asset Management International",
      ),
    ).toBe("Sterling Asset Management International");
  });
});

describe("extractCimaEntity — enforcement notices", () => {
  it("takes the left side of 'party - action'", () => {
    expect(extractCimaEntity("OneTRADEx Ltd. – In Official Liquidation")).toBe(
      "OneTRADEx Ltd",
    );
    expect(
      extractCimaEntity("Premier Assurance Group SPC Ltd. – In Official Liquidation"),
    ).toBe("Premier Assurance Group SPC Ltd");
  });

  it("keeps a parenthetical status inside the party name", () => {
    expect(
      extractCimaEntity(
        "Global Fidelity Bank, Ltd. (In Official Liquidation) - Licence Revoked",
      ),
    ).toBe("Global Fidelity Bank, Ltd. (In Official Liquidation)");
  });

  it("takes the right side when the left is an action phrase", () => {
    expect(extractCimaEntity("Provisional Liquidation - ONETRADEX LTD")).toBe(
      "ONETRADEX LTD",
    );
    expect(
      extractCimaEntity("Appointment of Controllers - Premier Assurance Group SPC Ltd"),
    ).toBe("Premier Assurance Group SPC Ltd");
    expect(extractCimaEntity("Controllership - ONETRADEX LTD")).toBe(
      "ONETRADEX LTD",
    );
  });

  it("handles a trailing action with no separator", () => {
    expect(extractCimaEntity("Beechwood Re Official Liquidation")).toBe(
      "Beechwood Re",
    );
  });

  it("handles a long multi-clause action", () => {
    expect(
      extractCimaEntity(
        "Motor & General Insurance Company Limited – Controllership ends and Licence Revoked",
      ),
    ).toBe("Motor & General Insurance Company Limited");
  });
});

/**
 * These shapes were NOT in the first sample — they surfaced only when the
 * parser was swept across all 171 live headlines. Kept as regressions.
 */
describe("extractCimaEntity — shapes found by the full-listing sweep", () => {
  it("reads the party after 'Imposes ... Fine ... on'", () => {
    expect(
      extractCimaEntity(
        "Cayman Islands Monetary Authority Imposes Administrative Fine of CI$72,800 on Star Insurance",
      ),
    ).toBe("Star Insurance");
  });

  it("reads the party after 'Cancelled/Revoked for'", () => {
    expect(
      extractCimaEntity(
        "Mutual Fund Registration Cancelled for Praesidium Investment Fund",
      ),
    ).toBe("Praesidium Investment Fund");
    expect(
      extractCimaEntity("Banking Licence Revoked for Trade and Commerce Bank"),
    ).toBe("Trade and Commerce Bank");
    expect(
      extractCimaEntity(
        "Virtual Asset Service Provider Registration Cancelled for AC Holding Limited",
      ),
    ).toBe("AC Holding Limited");
  });

  it("takes the party from an EXTRACT/Decision Notice headline", () => {
    expect(
      extractCimaEntity(
        "EXTRACT- Decision Notice - Delphin Caribbean Resilience Fund",
      ),
    ).toBe("Delphin Caribbean Resilience Fund");
  });

  it("keeps legitimate multi-entity party names intact", () => {
    expect(
      extractCimaEntity(
        "Titan Asia Volatility Fund Ltd. and Titan Asia Volatility Fund L.P",
      ),
    ).toBe("Titan Asia Volatility Fund Ltd. and Titan Asia Volatility Fund L.P");
  });
});

describe("extractCimaEntity — notices with no party", () => {
  it("returns null for bulk struck/dissolved sweeps rather than inventing a name", () => {
    for (const headline of [
      "Termination of Struck or Dissolved Entities",
      "Struck and Dissolved Entities",
      "TERMINATION OF STRUCK OR DISSOLVED ENTITIES",
      "Struck or Dissolved Entities",
      "Termination of Struck or Dissolved Insurance Entities",
      "Termination of Struck or Dissolved Investments Entities",
    ]) {
      expect(extractCimaEntity(headline)).toBeNull();
    }
  });

  it("returns null on empty or whitespace input", () => {
    expect(extractCimaEntity("")).toBeNull();
    expect(extractCimaEntity("   ")).toBeNull();
  });

  it("does not return a bare action phrase as a party", () => {
    expect(extractCimaEntity("Licence Revoked")).toBeNull();
    expect(extractCimaEntity("In Official Liquidation")).toBeNull();
  });
});
