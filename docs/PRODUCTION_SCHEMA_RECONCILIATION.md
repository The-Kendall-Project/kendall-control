# Kendall Control Production Schema Reconciliation

**Record ID:** KP-CTRL-DB-REC-001  
**Observed:** 2026-08-11  
**Production project:** `vfynyknpqiigfjynomaa` (`kendall-control`)  
**Status:** Contained; repository reconciliation recorded  
**Authority restoration:** Prohibited until KP-AUTH-GW-001 is implemented and verified

## Purpose

This record reconciles the repository with the production facts observed before and after emergency migration `20260811151948_contain_control_registry_write_rpcs`. It is evidence, not permission to restore a public write path.

`sql/0001_control_plane_registry.sql` is an early bootstrap script. It is not an exact production baseline and must not be applied wholesale to production. Future database changes must use ordered migrations and verify production state after deployment.

## Production migration ledger

1. `20260726150421_0000_identity_and_audit`
2. `20260726150726_0001_registries`
3. `20260726151608_0002_rls_and_part_number_fixes`
4. `20260726162717_0003_registration_rpcs`
5. `20260726170609_add_agent_story_and_layer`
6. `20260726170638_add_registry_read_policies`
7. `20260726170901_register_agent_accepts_story`
8. `20260726171503_fix_register_rpcs_column_ambiguity`
9. `20260811151948_contain_control_registry_write_rpcs`

## Deployed registry-write functions

Production contains five `SECURITY DEFINER` signatures:

- `issue_part_number(text, integer)`
- `register_agent(text,text,text,text,text,text,integer,text,text,jsonb)`
- `register_agent(text,text,text,text,text,text,integer,text,text,jsonb,text,text,text)`
- `register_skill(text,text,text,text,text,text,text,text)`
- `register_module(text,text,text,text,text,text,text,text,text)`

After containment, every signature has `EXECUTE` revoked from `PUBLIC`, `anon`, and `authenticated`; `service_role` and the database owner retain execution. Default privileges for new postgres-owned functions in `public` are also restricted to the owner and `service_role`.

## Deployed schema facts absent from the bootstrap script

Production includes authority and audit tables not accurately represented by the bootstrap script:

- `people`
- `role_definitions`
- `memberships`
- `service_accounts`
- structured `audit_events` with human/service-account actors, idempotency, correlation, and result controls

Other material differences include:

- `part_number_sequences` has a UUID primary key, unique prefix, bigint counter, and timestamps.
- `issue_part_number` rejects unknown prefixes instead of silently creating them.
- `agent_registry` contains `supersedes_id`, `agent_story`, `layer`, and `description`.
- Registry status checks currently allow `draft`, `in_review`, `certified`, `deprecated`, and `retired`; recall is not yet modeled.
- Public read policies exist only for `systems` and the three component registries.
- Authority, audit, and sequence tables have RLS enabled with no permissive client policies and are therefore closed to client roles.

## Advisor disposition at containment

The security advisor reported informational `RLS enabled, no policy` notices for `audit_events`, `memberships`, `part_number_sequences`, `people`, `role_definitions`, and `service_accounts`. These remain closed by design pending the gateway authority model; no permissive policy should be added merely to silence the advisor.

The performance advisor reported unindexed foreign keys, unused indexes, and absolute Auth connection allocation. Those are follow-up work and were intentionally excluded from the emergency security migration.

## Reconciliation rules

1. Production migration history and catalog evidence outrank the bootstrap script when they conflict.
2. The containment migration in `sql/0002_contain_control_registry_write_rpcs.sql` is the repository copy of the applied production change.
3. No existing registration function may be regranted to `PUBLIC`, `anon`, or general `authenticated` roles.
4. The legacy functions may be called only behind the Authority Gateway during transition and must not accept caller-selected certification state.
5. A clean ordered baseline must be generated from the full production migration chain before creating another environment; do not infer it from `0001` alone.
6. Every future schema deployment must update this record or supersede it with a named reconciliation record and attach verification evidence.

## Verification evidence

Post-migration catalog inspection confirmed all five deployed signatures report:

```text
PUBLIC execute: false
anon execute: false
authenticated execute: false
service_role execute: true
```

The next permitted write-path change is implementation of `KP-AUTH-GW-001` under the contract in `docs/AUTHORITY_GATEWAY_CONTRACT.md`.


