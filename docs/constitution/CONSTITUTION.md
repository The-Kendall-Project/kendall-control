# Kendall Control Constitution

> This is a **static mirror** of the AOS (AI Operating Standard) pattern that Kendall
> is rolling out to every repo in `The-Kendall-Project` org, so architectural and
> organizational knowledge doesn't drift or get lost as work spans many repos. The
> canonical, DB-backed, always-current version of AOS lives on the `/system-context`
> page in the `kendall-ops` repo. The pattern itself — the 9-part BOM, the "core five"
> rule, and the org-wide reading order — is defined once, canonically, in
> `control-plane`'s [`docs/architecture/target-architecture.md`](https://github.com/The-Kendall-Project/control-plane/blob/main/docs/architecture/target-architecture.md)
> under **"AOS — the portable Constitution pattern"**. Read that section first if
> you haven't seen this pattern before. Read this file before `AGENTS.md`.
>
> This repo, `kendall-control`, is **`kendall-order-01`** — the second repo to read
> org-wide, right after `control-plane` (`kendall-order-00`, the architecture map) —
> because `kendall-control` is the registry root every other Kendall system gets
> certified against. See `control-plane`'s target-architecture.md for the full
> reading sequence.

## AOS-100 — Foundations

`kendall-control` ships **`@kendall/ops-core`**: the shared, config-driven core
(Agent BoM model + template, canonical 14-part Agent schema + conformance gate, Skill
Context Block model, and the cross-system registry SDK) that Kendall Ops, Kendall
Foundry, and DwellGuide all import instead of each keeping their own copy. It is
modeled on `@kendall/home`: raw TypeScript, no build step, installed by consumers as
a GitHub tarball pinned to a commit SHA. Person-level org identity, charter, and
glossary live at the org level (Drive AOS-100 / the `kendall-ops` System Context
page), not here.

## AOS-200 — Roles & Relationships (core)

At the system level, `kendall-control` **is** the certification authority: it is the
one cross-system registry (`systems`, `agent_registry`, `skills_registry`,
`modules_registry` — see `sql/0001_control_plane_registry.sql`) that every Kendall
product (`ops`, `foundry`, `dwellguide`, and whichever `systems.key` rows are added
next) reads and writes through instead of keeping a local roster. Concretely:

- **Owning systems** (`systems.key`: `ops`, `foundry`, `dwellguide`, …) each own the
  agents/skills/modules they register (`owning_system_id`, enforced `unique
  (owning_system_id, slug)`), but the registry itself — the shared table of record,
  the part-number sequences, and the lifecycle status on each row — is owned by
  `kendall-control`.
- Writes happen only through the `SECURITY DEFINER` RPCs
  (`issue_part_number`, `register_agent`, `register_skill`, `register_module`); no
  consumer has a direct table-write grant (see `sql/0001_control_plane_registry.sql`,
  "Grants + RLS").
- Reads (`listSystems`, `listRegisteredAgents`, `listRegisteredSkills`,
  `listRegisteredModules` in `src/registry.ts`) are open to `anon`/`authenticated` via
  RLS `SELECT` policies — deliberately excluding `audit_events` and
  `part_number_sequences`, which have no anon read policy by design.

Person-level role definitions (who on the team acts as Problem Owner, Context Curator,
etc.) are not duplicated here — they live at the org level (Drive AOS-200 /
`kendall-ops` System Context page). This file only states the system-level
certification-authority relationship that `kendall-control` implements in code.

## AOS-300 — Problems & AI Use-Cases (core)

**The problem:** without a single certification authority, every Kendall product
could independently declare an agent, skill, or module "production ready," with no
shared bar and no shared audit trail. An agent certified in Foundry would be
invisible — or worse, re-certified under different criteria — in Ops or DwellGuide.

**What this repo solves it with:** one shared registry (`agent_registry`,
`skills_registry`, `modules_registry`) with one status lifecycle
(`draft → in_review → certified → deprecated → retired`, enforced by a `CHECK`
constraint in `sql/0001_control_plane_registry.sql`) and one atomic part-numbering
scheme (`KF-AGT-*`, `KF-SKL-*`, `KF-MOD-*`, issued via `issue_part_number`), so any
system can ask "is this actually certified, and by what part number" and get the same
answer everywhere.

`audit_events` exists in the schema (`sql/0001_control_plane_registry.sql`) as the
place a shared audit trail across systems would be recorded, but per the README's
roadmap ("⬜ Audit + Job Runs contracts") this is not yet wired up from
`@kendall/ops-core` — it is schema-only today.

## AOS-400 — Rules & Policies (core)

Rules actually evidenced in the code:

- **Graceful degradation, never a hard dependency.** Every function in
  `src/registry.ts` returns `null` (or, for `listRegisteredModules`, a tagged
  `{ state: "unconfigured" }`) rather than throwing when `CONTROL_PLANE_URL` /
  `CONTROL_PLANE_ANON_KEY` are unset — "so a caller can fall back to local-only
  behavior." A consumer app must work standalone even if it has never been wired to
  the Control Plane. Functions throw only on a genuine failed call (configured but
  unreachable/erroring), which is meant to surface as a real error rather than a
  silent fallback.
- **Publishable key only, never the service-role key.** `registry.ts`'s module
  doc comment is explicit: consumers hold `CONTROL_PLANE_ANON_KEY`, "the Control
  Plane's PUBLISHABLE Supabase key — never the secret service_role key." The RPCs are
  `SECURITY DEFINER` and granted to `anon`/`authenticated` specifically so the
  publishable key is sufficient.
- **No cross-system database access.** Per `sql/0001_control_plane_registry.sql`'s
  header comment: "product code never queries another product's DB — it calls
  here." Every Kendall system talks to the shared registry through this SDK/RPC
  surface, not by reaching into another product's own database.
- **Writes go only through `SECURITY DEFINER` RPCs.** There is no direct
  `INSERT`/`UPDATE` grant on `agent_registry`, `skills_registry`, or
  `modules_registry` for `anon`/`authenticated` — only `EXECUTE` on the register
  RPCs (see the "Grants + RLS" section of `sql/0001_control_plane_registry.sql`).
- **Certification lifecycle is a closed enum, not free text.** `status` on every
  registry table is constrained by `CHECK (status = any (array['draft','in_review',
  'certified','deprecated','retired']))`. A row cannot be marked certified (or any
  other state) outside that fixed vocabulary.
- **One natural key per owning system.** `unique (owning_system_id, slug)` on each
  registry table is the upsert key the register RPCs use (`on conflict
  (owning_system_id, slug) do update …`) — a system can update its own
  agent/skill/module in place by re-registering the same slug, but can't collide
  with another system's slug of the same name.
- **`audit_events` and `part_number_sequences` are not anon-readable, by design**
  (explicit in both the SQL header comment and the "Read side" comment block in
  `src/registry.ts`) — there are deliberately no `list*` read functions for them.

## AOS-500 — Operating Processes (core)

The real registration/certification flow, as implemented in `src/registry.ts` +
`sql/0001_control_plane_registry.sql`:

1. **Issue a part number.** A consumer calls `issuePartNumber(prefix)` (e.g.
   `"KF-AGT"`) → the `issue_part_number` RPC atomically increments
   `part_number_sequences` and returns `"<prefix>-<3-digit-padded>"` (e.g.
   `KF-AGT-001`). Returns `null` if the Control Plane isn't configured.
2. **Register.** The consumer calls `registerAgent` / `registerSkill` /
   `registerModule` with the part number, name, slug, and `owningSystemKey` (must
   match a `systems.key` row — `ops` | `foundry` | `dwellguide` today). This upserts
   the row (`on conflict (owning_system_id, slug)`) via the matching `register_*`
   RPC, starting at `status = 'draft'` by default.
3. **Move through the lifecycle.** A row's `status` progresses
   `draft → in_review → certified → deprecated → retired` (enforced by the `CHECK`
   constraint). The SDK exposes `register_*` for creating/upserting rows with a given
   status; nothing in this repo yet exposes a dedicated "advance lifecycle" RPC
   distinct from re-calling `register_*` with a new `status` — **not yet
   authored/verified beyond that; needs input from whoever owns this repo if a
   separate transition RPC is planned.**
4. **Everyone reads the same answer.** Any system (or a governance console, per the
   `src/registry.ts` comment "powers the Control Plane governance console in
   Foundry") calls `listSystems` / `listRegisteredAgents` / `listRegisteredSkills` /
   `listRegisteredModules` to see the current certified/draft/deprecated state
   across every owning system, each row resolved with its owning system's key/name.
5. **Derive dependent identifiers.** `deriveQcPartNumber` and `deriveSkillSlug` are
   pure helper functions consumers use alongside the above (e.g. deriving a QC
   agent's part number from its main agent's, per
   `docs/standards/KF-AGT-PKG-0001` — that standards doc is referenced but not
   present in this repo; **not yet authored here** if it's meant to live in this
   repo too).

Per the README's roadmap, steps for **Audit events / Job Runs** (step 5) and **Flow
renderers** (step 6) are marked "⬜" — not yet built — so any audit trail on top of
`audit_events` is a placeholder today, not an implemented process.

## AOS-600 — Products, Solutions & Deliverables (core)

What ships from this repo: the **`@kendall/ops-core`** npm-shaped package (raw
TypeScript, no build step; `main`/`types` point at `src/index.ts`), installed by
consumers as a GitHub tarball pinned to a commit SHA. Per `package.json` and
`README.md`, its subpaths are:

| Subpath | Module | What it ships |
| --- | --- | --- |
| `.` | `bomModel` + `bomTemplate` | Agent BoM schema/normalizer + blank scaffolds/serializers (zero deps) |
| `/agent-builder` | `agentBuilder` | Canonical 14-part Agent schema, `checkTier1Conformance` gate, `buildAgentBom` generator (deps: `zod`, `yaml`) |
| `/skill` + `/skill-template` | `skillBomModel` + `skillBomTemplate` | Skill Context Block model (`KF-SKL-OPS-001`) + `skill.bom.yaml` serializer |
| `/registry` | `registry` | The cross-system registry SDK described in AOS-200/400/500 above |

The registry's **backend** deliverable is `sql/0001_control_plane_registry.sql` —
the Postgres/Supabase schema (tables, RPCs, RLS policies) that this SDK talks to,
applied to the `kendall-control` Supabase project (ref `vfynyknpqiigfjynomaa` per the
SQL file's header comment) — not to any consuming product's own database.

Not yet shipped (README roadmap, marked "⬜"): Audit + Job Runs contracts, and Flow
renderers (`AgentFlowchart`, `WorkflowMap`, `workflows`).

## AOS-700 / AOS-800 / AOS-900 — not applicable here

- **AOS-700 (Assets & Sources)** — no dedicated asset/source inventory beyond the
  registry tables themselves (which are AOS-600 deliverables, not source assets).
  Not added.
- **AOS-800 (AI Applications)** — this repo is infrastructure/schema for governing AI
  agents and skills elsewhere; it does not itself run an AI application. Not added.
- **AOS-900 (Governance & Auditing)** — the `audit_events` table exists as a
  placeholder (see AOS-300/500 above) but is not yet a working governance/audit
  process from this repo's code. Not added as its own section; tracked instead as an
  open item under AOS-500's roadmap note.
