# AGENTS.md — kendall-control

Read [`docs/constitution/CONSTITUTION.md`](docs/constitution/CONSTITUTION.md) first.

This repo is **`kendall-order-01`** in the org-wide reading order — see
`control-plane`'s `docs/architecture/target-architecture.md` for the full sequence
(this repo comes right after `control-plane` itself, `kendall-order-00`).

## What this repo owns

- **`@kendall/ops-core`** (`package.json`): the shared, config-driven core imported
  by Kendall Ops, Kendall Foundry, and DwellGuide — Agent BoM model + template
  (`src/bomModel.ts`, `src/bomTemplate.ts`), the canonical 14-part Agent schema +
  Tier-1 conformance gate + generator (`src/agentBuilder.ts`), the Skill Context
  Block model (`src/skillBomModel.ts`, `src/skillBomTemplate.ts`), and the
  cross-system registry SDK (`src/registry.ts`).
- **The one cross-system registry**: part-number issuing (`KF-AGT-*`, `KF-SKL-*`,
  `KF-MOD-*`) and the shared `systems` / `agent_registry` / `skills_registry` /
  `modules_registry` tables, backed by `sql/0001_control_plane_registry.sql`
  (applied to the `kendall-control` Supabase project, not to any consumer's own
  database).
- The certification-lifecycle enum enforced on every registry row:
  `draft → in_review → certified → deprecated → retired`.

## What this repo does not own

- Person-level role definitions (Problem Owner, Context Curator, etc.) — those live
  at the org level (Drive AOS-200 / `kendall-ops` System Context page), not here.
- Any consumer product's own local database — `registry.ts`'s whole design point is
  that "product code never queries another product's DB — it calls here"
  (`sql/0001_control_plane_registry.sql` header comment).
- Audit trail / job-runs contracts and flow renderers — both are on the README's
  roadmap but marked "⬜ not yet built."

## Part identity direction

The Context Warehouse Control Department is the sole issuer for new governed part identities. See [KF-STD-PART-0001](docs/standards/KF-STD-PART-0001-context-warehouse-part-identity.md) and control-plane ADR-012.

Until the hardened Warehouse issuance service is implemented:

- treat `issuePartNumber` as a transitional internal primitive, not a product-level numbering API;
- do not add new direct consumer calls that mint numbers;
- preserve existing numbers and record legacy aliases during migration;
- keep certification separate from issuance.

## Prohibited shortcuts

- **Do not stand up a second registry or certification mechanism elsewhere.** If a
  consumer app (Ops, Foundry, DwellGuide) needs to know whether an agent/skill/module
  is certified, it calls `@kendall/ops-core/registry` (`listRegisteredAgents`, etc.)
  against this repo's Supabase backend — it does not keep its own "is this
  production ready" table or duplicate the `draft/in_review/certified/deprecated/
  retired` status logic locally.
- Do not add a direct table write path (`INSERT`/`UPDATE` grant) to
  `agent_registry` / `skills_registry` / `modules_registry` for `anon`/
  `authenticated` — writes go only through the `SECURITY DEFINER` RPCs
  (`register_agent`, `register_skill`, `register_module`, `issue_part_number`).
- Do not hold or ship the Supabase `service_role` key in a consumer app — only the
  publishable `CONTROL_PLANE_ANON_KEY`.
