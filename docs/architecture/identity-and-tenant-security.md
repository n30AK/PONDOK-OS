# Identity and tenant security foundation

## Identity provider

PONDOK OS retains the existing Neon Managed Auth identity. The API accepts its EdDSA JWTs and verifies signatures against the branch-specific JWKS URL. The issuer is configured explicitly; neither issuer nor JWKS endpoint is guessed or hard-coded.

## Tenant boundary

The browser must send an organization UUID as a tenant selector, but this value is untrusted input. The API independently resolves an active membership for the verified JWT subject and selected organization. Roles and permission keys are loaded from the core RBAC tables. No client-provided role or permission claim is accepted.

## Failure behavior

- Missing or malformed bearer token: 401.
- Invalid signature, issuer, algorithm, expiry, or subject: 401.
- Missing/invalid organization selector: 400.
- No active membership: 403.
- Missing server configuration: 503.
- Unexpected database errors: generic 500 without exposing SQL or secrets.

## Remaining security work

This slice does not yet add per-operation permission enforcement to academic routes, PostgreSQL RLS policies, campus-level authorization, rate limiting, audit writes for sensitive access, refresh/session lifecycle integration, or production secrets management. Do not describe it as a completed security certification.

## Verification

Automated tests use locally generated Ed25519 keys to verify cryptographic validation and invalid-issuer/invalid-subject rejection. A live sign-in/JWT-to-Neon-DB integration test still requires configured development environment values and a real active membership.
