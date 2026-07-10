# RegActions Editorial Engine

The Editorial Engine is an evidence-first publishing pipeline for RegActions analysis. AI output is treated as a draft until every independent review and deterministic gate passes for the same content hash.

## Publishing sequence

1. The Research and Drafting Agent selects source records and creates structured copy.
2. The Regulatory Verifier checks material claims against the source ledger and official public sources.
3. The Copy Editor revises only presentation, using UK English and the RegActions house style.
4. The Regulatory Verifier checks the final post-copy text against the verified claim ledger.
5. The Visual Editor approves every chart and image ID. AI illustrations are generated as review candidates and inspected as images before approval.
6. Deterministic gates check evidence IDs, official-source provenance, action type, amounts, UK spelling, em dashes, charts and image accessibility.
7. The Head Editorial Agent makes the final decision. It cannot waive a failed gate.
8. The Publisher Agent verifies the current content and asset hashes, materialises approved visuals, archives the audit artifact and publishes.

An AI article is invisible to blog selectors, prerendering, RSS and the sitemap unless it has matching Head Editorial Agent and Publisher Agent manifests.

## Editorial standard

- Voice: 60 per cent senior-regulator restraint and 40 per cent strategy-consulting clarity.
- Language: UK English.
- Punctuation: no em dashes.
- Evidence: factual claims require an official regulatory source and a valid source record ID.
- Monetary claims: an amount is publishable only when official-source language identifies it as a penalty. Reviews, examinations, tax receivables, redress estimates, turnover and assets are excluded.
- Charts: required for monthly, comparison, forensic and trend articles. Chart data must come from verified penalty record IDs.
- Images: every published article receives branded hero, Open Graph, square and portrait assets. AI illustration is selective, non-factual and cannot contain words, numbers, logos or official-looking material.

## Commands

```bash
npm run generate:due
npm run editorial:review -- <slug>
npm run editorial:publish -- <slug>
```

The scheduled GitHub workflow runs the complete chain and publishes automatically only after Head Editorial Agent approval. A rejected draft is retained as a blocked audit artifact and the workflow reports a failure.

## Required secrets

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `VERCEL_DEPLOY_HOOK_URL` if deploy hooks are used
- Email and AWS SES values if review notifications remain enabled

`OPENROUTER_API_KEY` is a drafting fallback only. Independent review and final approval require the OpenAI key.

## Audit artifacts

- Drafts: `scripts/data/drafts/<slug>.json`
- Published records: `scripts/data/published/<slug>.json`
- Generated chart fallbacks: `public/blog/charts/`
- Article artwork: generated into `dist/blog/images/` during the production build

The published JSON artifact retains the source ledger, claim ledger, review results, content hash, visual specifications and publication manifest.

## DekaBank safeguard

The BaFin parser separates a monetary reference from a monetary sanction. The June 2026 DekaBank page mentioned a EUR 478 million tax receivable in an accounting examination. It did not announce a fine. The correction script nulls the penalty fields for the exact record and refreshes the unified view:

```bash
npm run editorial:correct:dekabank
```

The script is transactional and stops unless exactly one matching database row is found.
Use `npm run editorial:correct:dekabank -- --check` to inspect the exact target without changing it.
