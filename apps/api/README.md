# PONDOK OS API

Minimal Node.js 22 HTTP API foundation. This first slice intentionally uses Node's built-in HTTP server so the health endpoint has no external runtime dependency.

## Run locally

```sh
pnpm --filter @pondok-os/api build
PORT=3001 pnpm --filter @pondok-os/api start
```

Check `GET http://localhost:3001/health/live`.

## Scope and limitations

- `/health/live` reports only that the process can answer HTTP requests.
- It does not claim database readiness, authentication, tenant authorization, or business-module availability.
- The endpoint is not a substitute for production observability or readiness checks.
- Authentication, request validation, tenant context, RBAC enforcement, and database-backed readiness are subsequent implementation work.
