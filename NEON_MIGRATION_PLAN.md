# Archived Neon migration plan

This document is intentionally retained only as a tombstone for the former
Supabase-to-Neon migration. It is **superseded**: Neon and Horizon are not
supported RegActions runtime or scraper targets.

The sole production datastore is the Hetzner PostgreSQL database `fcafines`.
Current configuration, target guards, scheduling, backup, and verification
instructions live in [`docs/ops/hetzner-scrapers.md`](docs/ops/hetzner-scrapers.md).

Do not add Neon connection strings, Neon-specific environment variables, or a
secondary database write path back to this repository.
