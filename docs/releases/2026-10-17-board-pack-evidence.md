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

## Subsequent FSCA production acceptance — 17 October, 13:12 UTC

PR #353 subsequently merged at `b1b21424abea36116de8607697c0f3196d361c56`. Its production deployment is READY and production acceptance run `39035474230` passed. Terra reported no remaining FSCA source-level blocker after the suppression-preserving migration correction; primary review confirmed the actual official Steinhoff order, page 2, section 5.

The affected registry, alias, override and suppression tables were backed up and restored into an isolated local PostgreSQL database before application. The temporary restore database was removed afterwards; the backup was retained. The additive public-ID migration preserved all 37 reviewed suppressions. Exactly one production amount override was applied: Steinhoff's payable amount is ZAR53m, including investigation costs, rather than its gross ZAR1.5bn headline. The original source row/content hash remain intact. Its public case ID `d025f27a1060629054c6a65f80a7584c` is preserved and both old/new canonical aliases resolve. Tongaat Hulett was already correct at ZAR20m and was not changed.

Live public search returned Steinhoff at ZAR53m / GBP2.279m and Tongaat at ZAR20m / GBP860k, using the existing normalization rates. Live Board Pack selection resolved Steinhoff's original public ID with GBP2.279m. FSCA/Africa remained 579 considered / 36 matched with an insufficient-evidence band; correcting a penalty amount does not itself verify the source-link assessment.

FSS is separate: draft PR #354 contains the gated Korean source, reviewed legacy-announcement manifest and manual-only read-only preflight. Its workflow becomes dispatchable only after the PR is merged to the default branch; post-merge source QA must run and preserve its complete archive artifact. No FSS production migration, load, suppression or scheduled workflow activation is approved by either Board Pack or FSCA production sign-off. Full durable source evidence, independent final QA, controlled activation and two clean scheduled production cycles remain its release gates.
