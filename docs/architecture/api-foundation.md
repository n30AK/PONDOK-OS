# API foundation

The first API slice is deliberately small and dependency-light. It establishes a runnable HTTP process and a process-liveness endpoint only.

## API conventions

- Runtime: Node.js 22 or newer.
- Transport: HTTP JSON.
- Health: `GET /health/live` checks process liveness only.
- Unknown routes return a stable JSON 404.
- Unsupported methods return JSON 405 and an `Allow` header.
- Responses disable caching and include baseline content/referrer headers.

## Explicitly not implemented yet

No login, JWT validation, database connection, tenant context, authorization, rate limiting, request schema validation, or business endpoints are implied by this foundation. These are required before exposing operational data or deploying the API publicly.

## Database migration ledger

`core.schema_migrations` is introduced as an append-only record of applied migration versions and SHA-256 checksums. The deployment/migration runner must verify checksums and refuse modified historical migrations. The ledger bootstrap migration is additive and must be applied independently to development before any production rollout.
