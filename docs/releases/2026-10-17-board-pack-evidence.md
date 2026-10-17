# Board Pack evidence and public-data reconciliation

## Scope

- Replace the browser's newest-5,000 global record download with a server-scoped, keyset-paginated complete canonical evidence perimeter. Regulator and region constraints intersect; no global fallback is permitted.
- Preserve local profiles, selected case baskets and unassessed controls; add local committee ownership, deadlines, status, decision notes and scope-matched comparison snapshots. Local committee notes are included in the direct PDF, not remote shared drafts.
- Include all live regulators and regions in the selector, including Africa and Latin America.
- Repair enforcement search's missing amount-review columns and use the reviewed trusted evidence view.
- Deduplicate concurrent public aggregate reads with a short successful-response cache.
- Retain strict production runtime log acceptance using the supported Vercel query syntax and a pinned CLI.

## Reviewed production reconciliation

The guarded official-source reconciliation on 17 October 2026 retained all original stored rows and excluded 37 reviewed rows from the public trusted view: three legacy FSCA fixtures and 34 superseded NGSEC name variants, aggregate headlines or non-case archive items. Reconciled public counts were FSCA 579, CBN 90 and NGSEC 41. All 41 valid records from the current NGSEC loader already existed in storage.

The `regulatory_case_suppressions` table records each source row, reason and replacement where applicable. Removing the corresponding suppression restores visibility; this release does not delete source records or rewrite canonical case IDs. Use `scripts/corrections/reconcileAfricaArchive.ts` in default dry-run mode before any later guarded application.

## Verification boundaries

Local focused tests, Chromium E2E, a production-data build, real scoped API calls and a six-page direct PDF were checked before release. Independent Terra review and primary production acceptance are additional gates, not implied by a build. Record the final PR, deployment SHA and production acceptance workflow in the release handoff.

## Production acceptance and release state — 17 October 2026

- PR #352 is merged at `e9677c8`. The production-ready deployment alias is `14w09zjaw`.
- Primary production acceptance run `39034058572` passed: browser journey, direct PDF and runtime-log gate (no matching error logs). The generated six-page PDF included the saved action owners and committee notes; the 390px mobile check had no horizontal overflow.
- Scoped production POST checks returned HTTP 200 and matched the server-side perimeter: FCA + UK considered 772 records and matched 213 relevant actions; FCA + Africa considered 0 and matched 0, correctly showing insufficient evidence; FSCA + Africa considered 579 and matched 36 relevant actions, but had 0 verified cases, so evidence sufficiency remained false and the exposure band stayed insufficient.
- PR #353 is a draft and its source QA is still pending; it is not applied to production and is not part of this acceptance. Terra source QA remains pending. Two scheduled monitoring cycles have not yet completed, so ongoing operational promotion is not claimed.

Country-risk source changes require their own evidence review. FSS's explicit freshness warning must not be silenced by extending its contract without official-source evidence. Low-frequency watches remain watches unless their own contract is breached. No additional email is sent to test delivery.
