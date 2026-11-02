# PONDOK OS API

Minimal Node.js 22 HTTP API foundation.

## Runtime configuration

- PORT: optional, defaults to 3001.
- DATABASE_URL: PostgreSQL connection string for the same Neon development branch.
- NEON_AUTH_BASE_URL: exact Managed Auth issuer/base URL for that branch.
- NEON_AUTH_JWKS_URL: JWKS URL supplied by Neon for that branch.

Never commit real connection strings or auth URLs containing credentials. Do not point development code at the production branch.

## Endpoints

- GET /health/live reports process liveness only.
- GET /v1/tenant/context requires a Managed Auth bearer JWT, an x-organization-id UUID, and an active membership in that organization. It returns the caller's roles and permission keys for that tenant.

The tenant context is resolved server-side from core.organization_memberships, core.membership_roles, core.roles, and core.role_permissions. Client-supplied role or permission claims are never trusted.

## Security boundaries

- JWT verification uses the configured Neon JWKS, requires EdDSA, validates issuer and standard time claims, and requires a UUID subject.
- A valid identity token alone does not grant tenant access. An active database membership is mandatory.
- Tenant context is not an implementation of every module's permission checks. Each protected business operation must call the server-side permission guard before reading or mutating data.
- The API fails closed when auth configuration, database configuration, bearer credentials, or active membership is missing.
- No Neon Auth schema or auth configuration is modified by this API package.
- No production database branch is used by this implementation.
