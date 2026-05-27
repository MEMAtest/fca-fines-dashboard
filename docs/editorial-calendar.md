# RegActions Editorial Calendar — Jun–Nov 2026

**Owner:** Ademola
**Last updated:** 2026-05-20
**Cadence:** 4 articles/month
- Week 1 — Recurring monthly FCA fines list
- Week 2 — Thematic deep-dive
- Week 3 — Persona / sector piece
- Week 4 — Comparison or forensic case study

**Primary audience (in order):**
1. Heads of Compliance / MLROs at regulated firms
2. Compliance consultants & law firms (citability matters)
3. Board members / NEDs (use Board Guide framing in schema)

**Framing rules for every article:**
- Lead with a 1-sentence board-readable headline finding
- Include a "What this means for [persona]" callout block
- Source-link every stat (consultants will quote you)
- Use the `boardQuestions` field on the structured article — fill it
- Keep `keywords` aligned with category for SEO

---

## Calendar

| # | Publish | Pillar | Title | Slug | Category | Status |
|---|---------|--------|-------|------|----------|--------|
| 1 | 2026-06-01 | Recurring | FCA Enforcement April 2026: No Fines, 11 Supervisory Actions | `fca-fines-april-2026` | FCA Fines 2026 | scheduled |
| 2 | 2026-06-09 | Thematic | DORA at 18 Months: Why Enforcement Hasn't Started — and What's Coming | `dora-enforcement-18-months` | Thematic Analysis | scheduled |
| 3 | 2026-06-16 | Persona | FCA Payments Enforcement: Why It's Permissions, Not Fines | `payments-firms-fca-aml-enforcement` | Sector Analysis | scheduled |
| 4 | 2026-06-23 | Comparison | FCA vs SEC Enforcement: 5 Differences That Actually Matter | `fca-vs-sec-enforcement-differences` | Thematic Analysis | scheduled |
| 5 | 2026-07-01 | Recurring | FCA Fines May 2026: Individual Accountability Returns to the Docket | `fca-fines-may-2026` | FCA Fines 2026 | scheduled |
| 6 | 2026-07-14 | Thematic | Consumer Duty Three Years In: Why the FCA Hasn't Fined Anyone | `consumer-duty-three-years-enforcement` | Thematic Analysis | scheduled |
| 7 | 2026-07-21 | Persona | Wealth Managers: How Consumer Duty Is Shaping Enforcement | `wealth-managers-consumer-duty-enforcement` | Sector Analysis | planned |
| 8 | 2026-07-28 | Forensic | Anatomy of H1 2026's Biggest Fine *(picked at publish)* | `biggest-fine-h1-2026-forensic` | Case Study | planned |
| 9 | 2026-08-04 | H1 special | H1 2026 Global Enforcement Halftime: 10 Things We Learned | `h1-2026-enforcement-halftime` | Trends Analysis | planned |
| 10 | 2026-08-11 | Thematic | OFSI, OFAC & EU Sanctions: A Side-by-Side Enforcement Map | `sanctions-enforcement-ofsi-ofac-eu` | Thematic Analysis | planned |
| 11 | 2026-08-18 | Persona | Crypto Firms Under MiCA, FCA & MAS: What Enforcement Looks Like Now | `crypto-firms-global-enforcement-mica-fca-mas` | Sector Analysis | planned |
| 12 | 2026-08-25 | Comparison | BaFin vs FCA: What UK Firms with German Subsidiaries Need to Know | `bafin-vs-fca-uk-german-firms` | Regional Benchmark | planned |
| 13 | 2026-09-01 | Recurring | FCA Fines July 2026: Complete Monthly List | `fca-fines-july-2026` | FCA Fines 2026 | planned |
| 14 | 2026-09-09 | Thematic | Greenwashing Enforcement 2026: Who's Actually Fining? | `greenwashing-enforcement-2026` | Thematic Analysis | planned |
| 15 | 2026-09-16 | Persona | Insurance: Conduct Failures in 2026 Enforcement Data | `insurance-conduct-failures-2026` | Sector Analysis | planned |
| 16 | 2026-09-23 | Forensic | Anatomy of 2026's Biggest Greenwashing Fine *(picked)* | `biggest-greenwashing-fine-2026-forensic` | Case Study | planned |
| 17 | 2026-10-01 | Recurring | FCA Fines August 2026: Complete Monthly List | `fca-fines-august-2026` | FCA Fines 2026 | planned |
| 18 | 2026-10-07 | Thematic | Whistleblower-Driven Enforcement: SEC, FCA & Beyond | `whistleblower-driven-enforcement-global` | Thematic Analysis | planned |
| 19 | 2026-10-14 | Persona | Investment Firms: Market Abuse Across FCA, SEC, AMF & SFC | `investment-firms-market-abuse-global` | Sector Analysis | planned |
| 20 | 2026-10-21 | Comparison | FINMA vs MAS: Wealth & Private Banking Enforcement Compared | `finma-vs-mas-wealth-enforcement` | Regional Benchmark | planned |
| 21 | 2026-11-03 | Recurring | FCA Fines September 2026: Complete Monthly List | `fca-fines-september-2026` | FCA Fines 2026 | planned |
| 22 | 2026-11-10 | Thematic | AI & Automated Decisioning: First Wave of Enforcement | `ai-automated-decisioning-enforcement` | Thematic Analysis | planned |
| 23 | 2026-11-17 | Persona | Banking & Operational Resilience: DORA-Era Enforcement Map | `banking-operational-resilience-dora-enforcement` | Sector Analysis | planned |
| 24 | 2026-11-24 | Forensic | Anatomy of 2026's Largest AML Fine *(picked)* | `biggest-aml-fine-2026-forensic` | Case Study | planned |

**Status values:** `planned` → `drafting` → `in-review` → `scheduled` → `published`. Mirror to `status` field in `blogArticles.ts` once `drafting` or beyond.

---

## Gap-list backlog (not yet calendared)

If a slot opens up or an article gets pulled, pick from here:

- "How to Prepare for an FCA s166 Skilled Persons Review" — decision-stage content for MLROs
- "Director Disqualification in 2026: The Data Behind SM&CR" — pairs with personal accountability
- "Pre-Enforcement Playbook: Responding to a Section 165 Notice"
- "Embeddable Charts: How Trade Press Uses RegActions Data" — product-led + PR
- "Q4 2026 Regulatory Diary: What's in Consultation Across 10 Regulators"
- "Whistleblower Awards 2026: What Did the SEC Pay Out?"
- "How RegActions Watchlists Work" — product-led
- "FCA Annual Public Meeting 2026: What the Numbers Actually Said"
- "ESMA Common Supervisory Action 2026: What It Means for EU Asset Managers"
- "OCC vs FRB vs FDIC: How US Bank Regulators Divide the Work"

---

## New categories to add when first article in each lands

- `Case Study` — first use Jul 28 (article #8)

Update Blog.tsx category filter when the first article in the new category is published.

---

## Notes on schema field reuse

The `BlogArticleMeta` interface already supports rich structure. For every article, fill at minimum:
- `structuredArticle.executiveSummary` (3–5 bullets)
- `structuredArticle.metrics` (at least 3)
- `structuredArticle.boardQuestions` (3–5 — this is the NED hook)
- `structuredArticle.takeaways` (3–5)
- `structuredArticle.sourceLinks` (every stat sourced)
- `structuredArticle.faqs` (covers SEO + voice search)

For sector/persona pieces, add a sector-specific section in `structuredArticle.sections` titled "What this means for [persona]".
