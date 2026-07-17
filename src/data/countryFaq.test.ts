import { describe, it, expect } from "vitest";
import { getCountryByIso2 } from "./countries.js";
import { buildCountryView } from "./countryView.js";
import { buildCountryFaqs, generateCountryFaqSchema } from "./countryFaq.js";

/** Build FAQs for an ISO2, failing loudly if the fixture country is missing. */
function faqsFor(iso2: string) {
  const country = getCountryByIso2(iso2);
  expect(country, `country ${iso2} exists`).toBeTruthy();
  return buildCountryFaqs(buildCountryView(country!));
}

describe("buildCountryFaqs", () => {
  it("produces 4-5 deterministic Q&As for a country with enforcement coverage (China)", () => {
    const faqs = faqsFor("CN");
    expect(faqs.length).toBeGreaterThanOrEqual(4);
    expect(faqs.length).toBeLessThanOrEqual(5);
    expect(faqs[0].question).toBe("Is China on the FATF grey list?");
    expect(faqs[1].question).toBe("Is China subject to sanctions?");
    expect(faqs[2].question).toBe("What is China's AML risk rating?");
    expect(faqs[3].question).toBe("What due diligence applies to China?");
    for (const faq of faqs) {
      expect(faq.question.length).toBeGreaterThan(0);
      expect(faq.answer.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic (same input -> identical output)", () => {
    expect(faqsFor("US")).toEqual(faqsFor("US"));
  });

  it("reflects a grey-listed jurisdiction in the FATF answer", () => {
    // Bulgaria is on the FATF grey list in the current dataset.
    const faqs = faqsFor("BG");
    expect(faqs[0].answer).toContain("Yes.");
    expect(faqs[0].answer).toContain("FATF grey list");
  });

  it("reflects a black-listed jurisdiction in the FATF answer (Iran)", () => {
    const faqs = faqsFor("IR");
    expect(faqs[0].answer).toContain("FATF black list");
  });

  it("honours the sanctions coverage caveat (does not falsely assert 'not sanctioned')", () => {
    const faqs = faqsFor("FR");
    // While coverage is fail-closed, the sanctions answer must not claim confirmation.
    expect(faqs[1].answer).not.toMatch(/^No\./);
  });

  it("withholds the AML score honestly when governance data is unavailable", () => {
    const view = buildCountryView(getCountryByIso2("US")!);
    const faqs = buildCountryFaqs(view);
    const amlFaq = faqs.find((f) => f.question.includes("AML risk rating"));
    expect(amlFaq).toBeTruthy();
    if (view.riskScore.hasGovernance) {
      expect(amlFaq!.answer).toContain("/10");
    } else {
      expect(amlFaq!.answer.toLowerCase()).toContain("withhold");
    }
  });

  it("Google requirement: JSON-LD answer text matches the visible FAQ answer verbatim", () => {
    for (const iso2 of ["CN", "US", "FR", "NG", "IR"]) {
      const country = getCountryByIso2(iso2);
      if (!country) continue;
      const faqs = buildCountryFaqs(buildCountryView(country));
      const schema = generateCountryFaqSchema(faqs);
      expect(schema["@type"]).toBe("FAQPage");
      expect(schema.mainEntity).toHaveLength(faqs.length);
      schema.mainEntity.forEach((node, i) => {
        expect(node.name).toBe(faqs[i].question);
        expect(node.acceptedAnswer.text).toBe(faqs[i].answer);
      });
    }
  });
});
