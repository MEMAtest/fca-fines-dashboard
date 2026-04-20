# Natural Search Hybrid/Vector Plan

## Current state as of 2026-04-19

The live search stack is still a heuristic hybrid:

- PostgreSQL `search_vector` full-text ranking
- phrase and token fallback matching
- hand-authored acronym/theme/category expansion
- strict filters in the API layer
- an early typo-correction path that is improving but still not reliable for all firm misspellings

The production relevance sweep on 2026-04-19 exposed three clear facts:

1. hard low-signal/no-match handling matters and is now working again
2. exact and near-exact firm queries can work well
3. broader natural-language relevance is still inconsistent for typo-heavy and cross-entity AML/theme queries

## Goal

Move from a heuristic-only search feature to a measurable hybrid retrieval system without losing the precision of the current filterable API.

## Phase 1: Data and evaluation foundation

This phase should happen before any embedding rollout.

### 1. Canonical metadata

Normalize and backfill:

- `firm_canonical`
- `firm_aliases`
- `regulator_aliases`
- `country_aliases`
- `topic_aliases`
- `breach_theme_primary`
- `breach_theme_secondary`
- `sector`
- `entity_type`

### 2. Chunking strategy

Current rows mix short summaries with extremely long `breachType` or notice-derived text.

Introduce search chunks:

- one row for entity/title fields
- one row for summary
- one row per large notice section when source text is available

Each chunk should carry:

- `record_id`
- `chunk_id`
- `chunk_type`
- `chunk_text`
- `entity fields`
- `regulator/country/year`
- `breach categories`

### 3. Relevance evaluation set

Use `research/search-relevance-eval-set.json` as the seed file.

Expand it to at least:

- 25 exact-firm queries
- 25 typo/fuzzy queries
- 25 thematic queries
- 25 geography/regulator/theme mixed queries
- 10 explicit no-match / low-signal queries

Use `scripts/evaluateSearchRelevance.ts` as the baseline scorer.

## Phase 2: Retrieval architecture

### Option A: Stay in Postgres first

Recommended first step for this repo:

- keep BM25-like full-text behavior in PostgreSQL
- add `pgvector`
- store embeddings for:
  - `firm_canonical`
  - `summary`
  - `chunk_text`
  - `breach_theme_primary`
- run hybrid retrieval inside the existing database boundary

Why this is the right first step:

- lowest operational overhead
- current API already depends on Postgres
- filters are already expressed there
- easier rollback than introducing a second search infrastructure immediately

### Option B: External search engine later

Use only when Postgres hybrid search is no longer enough.

Candidates:

- OpenSearch / Elasticsearch if we need operationally rich hybrid ranking and faceting
- Weaviate or Pinecone if vector-first workflows dominate
- Typesense / Algolia only if product emphasis shifts to frontend speed and curated relevance over deep backend control

## Phase 3: Query pipeline

The future query pipeline should be:

1. normalize raw query
2. detect low-signal or impossible query
3. extract obvious hard filters:
   - regulator
   - country
   - year
   - amount hints
4. resolve firm/entity aliases and typo candidates
5. run hybrid retrieval:
   - keyword/full-text recall
   - vector recall
6. rerank top 20-50 candidates
7. return explanation metadata:
   - exact firm match
   - regulator hint
   - semantic theme match
   - typo correction applied

## Phase 4: Reranking

Do not rerank the whole corpus.

Rerank only the shortlist from hybrid retrieval using:

- BGE reranker
- Cohere Rerank
- Jina reranker

This is most useful for:

- typo-heavy firm queries
- mixed regulator + entity + theme queries
- broad AML/systems-and-controls queries

## Operational requirements

### Performance

Target:

- under 300 ms p95 for plain keyword/hybrid retrieval
- under 600 ms p95 for reranked natural-language queries

### Monitoring

Track:

- zero-result queries
- top-1 / top-3 pass rate on eval set
- clickless sessions
- most common correction terms
- broad-query failure clusters

### Compliance

Search logs should avoid storing raw user identifiers.

At minimum:

- strip IP-level identity from retained analytics
- avoid logging full session context unless needed
- keep query logs retention-bounded

## Immediate next implementation steps

1. expand the labeled eval set from 12 to 50+ cases
2. run the script against production on every search deploy
3. add canonical alias fields to the source schema
4. prototype `pgvector` on chunked summaries before considering an external engine
