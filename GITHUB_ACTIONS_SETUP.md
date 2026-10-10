# GitHub Actions database setup

RegActions has one production datastore: the Hetzner PostgreSQL database
`fcafines`. GitHub Actions must never point at Neon, Horizon, or an unpinned
platform database.

Configure these repository secrets with the same Hetzner connection string:

- `REGACTIONS_DATABASE_URL` (preferred)
- `DATABASE_URL` (compatibility for jobs that have not adopted the explicit name)

Configure these repository variables so scraper jobs fail closed if a secret is
misrouted:

- `REGACTIONS_EXPECTED_DB_HOST=89.167.95.173`
- `REGACTIONS_EXPECTED_DB_NAME=fcafines`

Never commit a connection string, password, or token to this repository. See
`docs/ops/hetzner-scrapers.md` for target verification and scheduling.
