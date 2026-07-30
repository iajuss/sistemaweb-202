# Task 3 report — WIP checkpoint

## RED evidence: tenant isolation

Before the repository guard existed, the isolation test failed with:

```text
expected { id: 'observation-a', tenantId: 'tenant-a', ... } to be null
```

The same unguarded path also allowed a write using tenant B context for a
tenant A record. This RED was observed before the guard implementation; it is
preserved here because tenant A data must never be readable or writable through
tenant B context.

## Current state

The tenant-context repository guard is implemented in the WIP worktree.
Remaining work is to complete and verify the AEAD cipher boundary with
`tenant_id` plus `debtor_id` associated data, the separate-secret HMAC boundary
and its rotation/reindexing handling, and PostgreSQL RLS policy/wrapper
validation.

Docker/PostgreSQL is unavailable on this host. Real RLS validation is therefore
recorded as pending verification, never as a reduced policy: production RLS,
transaction-local `SET LOCAL app.tenant_id`, and no application `BYPASSRLS`
remain required by ADR 020.

## Pause

Work stopped at user request before final verification, review or completion.
