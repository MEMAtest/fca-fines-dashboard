# Natural Search Phase 2 Decision

## Date

2026-04-20

## What was added in phase 2

- expanded labeled relevance set in `research/search-relevance-eval-set.json`
- category-aware evaluator in `scripts/evaluateSearchRelevance.ts`
- bounded search telemetry in `search_query_analytics`
- reporting and retention scripts:
  - `npm run search:analytics:migrate`
  - `npm run search:analytics:report`
  - `npm run search:analytics:prune`

## Current decision

Do **not** add an external vector engine or a reranker yet.

The next retrieval step for this repo should be:

1. keep the current PostgreSQL hybrid stack live
2. collect real query telemetry for at least 14 days
3. review zero-result clusters, broad ambiguous queries, and correction patterns
4. only then prototype `pgvector` inside Postgres

## Why this is the right call now

The search stack now has:

- exact and typo-heavy entity recovery working well
- live labeled eval coverage beyond the original seed file
- bounded analytics for zero-result and low-signal queries
- no operational evidence yet that a second search system is justified

Adding Pinecone, Weaviate, OpenSearch, or a hosted reranker now would increase:

- infrastructure surface area
- operational cost
- debugging complexity
- latency variance

without enough live query evidence to prove the lift is necessary.

## Trigger conditions for `pgvector`

Prototype `pgvector` in Postgres when all of these are true:

1. at least 2,000 production search queries have been logged
2. non-low-signal zero-result rate remains above 8%
3. broad mixed-intent queries remain the dominant failure cluster in the analytics report
4. exact-firm and typo-firm categories stay above 90% pass rate, meaning the remaining problem is semantic recall rather than lexical precision

## Trigger conditions for reranking

Add reranking only after a `pgvector` prototype exists and these remain true:

1. exact and typo queries are already strong
2. hybrid retrieval recall is acceptable, but top-3 ordering on thematic or mixed-intent queries still underperforms
3. p95 latency can tolerate an extra shortlist rerank step

If those conditions are met, rerank only the top 20-50 retrieved candidates.

## Recommended sequence

### Step 1

Run:

`npm run search:analytics:migrate`

### Step 2

Let analytics accumulate, then review:

`npm run search:analytics:report -- 14 15`

### Step 3

If the trigger conditions are met, prototype:

- Postgres `pgvector`
- chunked summary embeddings
- hybrid recall inside the current database boundary

### Step 4

Only consider reranking after the `pgvector` prototype has measured recall lift but still weak ordering on broad queries.

## What not to do yet

- do not add an external vector database first
- do not rerank the whole corpus
- do not replace the current keyword/full-text path
- do not use telemetry that stores user identifiers

## Success criteria for the next review

- category pass rates stay green on deploy-time eval
- zero-result queries are explainable and bounded
- broad ambiguous queries are visible in the analytics report
- the decision to add embeddings is based on measured production behavior rather than intuition
