# Country-risk contextual evidence

Status: research-only. This layer is intentionally outside the Country Risk
v3 headline score.

The export contract covers eight requested context families for every country
page jurisdiction:

- organised crime;
- fraud and cybercrime;
- terrorism and proliferation financing;
- trafficking;
- financial secrecy and offshore exposure;
- tax cooperation;
- political stability and conflict; and
- beneficial ownership.

Only checked-in, provenance-bearing snapshots are returned as available. The
current snapshot supplies descriptive evidence for the Council of the EU
Annex I tax-cooperation list, World Bank WGI political-stability percentile and
Open Ownership register/access map. Candidate official sources for the other
families are recorded in the data contract but are not treated as evidence
until a reviewed, country-comparable snapshot is ingested:

- UNODC data portal for organised crime and trafficking administrative data;
- ITU Global Cybersecurity Index for cyber-capacity context;
- FATF mutual-evaluation material for ML/TF/PF framework context; and
- OECD Global Forum tax-transparency peer-review material for financial-secrecy
  and tax-transparency context.

UNODC detected/reported cases describe administrative visibility and detection
capacity. They must not be translated into prevalence, low risk, or no crime.
Likewise, an offshore classification is not evidence of secrecy or misconduct.

Unavailable values are `null`, not zero. Every row has `scored: false`, and the
export contains a publication guard prohibiting import into headline scoring.

Generate the deterministic research artifacts with:

```bash
npm run country-risk:context
```

This writes `country-risk-context.json` and `country-risk-context.csv` beside
this document. The artifact is suitable for QA and future source-ingestion
work, but has no public route or numeric country-risk index.
