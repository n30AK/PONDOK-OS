# PONDOK OS 14-day institution trial

## Trial lifecycle

1. A prospect opens the marketing-site trial CTA and lands on the application registration form.
2. The account holder registers and verifies the account email.
3. The verified account submits the existing Central Command institution activation request.
4. A PONDOK OS company administrator reviews and approves the request.
5. The applicant redeems the one-time, user-bound activation token.
6. Tenant creation, owner membership, campus creation, and issuance of the trial license occur in the same database transaction.

The trial clock starts at token redemption, not at registration or request submission. A trial lasts exactly 14 days (336 hours) from its starts_at timestamp.

## Entitlements

- The tenant receives the institution-owner role and no module-level trial restrictions.
- All menus and functions that are implemented and available to the tenant can be used during the trial.
- Roadmap items remain roadmap items; trial access does not imply that unfinished features are implemented.
- A single verified account can receive at most one trial entitlement.

## Expiry and data

- The API checks the tenant license inside every tenant-scoped database transaction.
- Trial and active licenses are accepted only while their ends_at is in the future (or is null for a non-expiring active license).
- A tenant with an expired, suspended, cancelled, or otherwise inactive license cannot perform tenant-scoped operations.
- Expiry does not delete tenant data. Access can be restored by the company through a separately approved license/contract process.
- Existing tenants without a license row retain legacy access until they are assigned a license.

## Security

- Trial activation requires a verified, non-banned Neon Auth account and an approved activation token bound to that account.
- Each tenant remains isolated through the existing membership and forced Row-Level Security controls.
- The tenant runtime can read only its own license row; company administrators retain the platform license registry view.
- The Development migration is 0031_tenant_trial_entitlements.sql. Production rollout requires a separate explicit approval and is not part of this change.
