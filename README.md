# kendall-control — `@kendall/ops-core`

The **control plane** beneath every Kendall app: the single, config-driven core that
Kendall Ops, Kendall Foundry, and DwellGuide all import instead of each keeping their
own copy of the Bill-of-Materials model, templates, agent schema, and flow.

Modeled on [`@kendall/home`](https://github.com/kendallproject/kendall-home): it ships
**raw TypeScript** (no build step — `main`/`types` point straight at `src/index.ts`),
and consumers install it as a GitHub tarball pinned to a commit SHA.

## Install (in a consumer app)

```jsonc
// package.json
"@kendall/ops-core": "https://github.com/kendallproject/kendall-control/archive/<sha>.tar.gz"
```

Bump `<sha>` to adopt a new version. Keep every consumer on the same SHA to stay in lockstep.

## Usage

The Agent BoM core is the default export; the agent-builder and skill modules are
subpaths (so their names can't collide with the BoM core's).

```ts
// Agent BoM core
import { normalizeBom, blankBomTemplate, bomToMarkdown } from "@kendall/ops-core";
import type { AgentBom, ComponentType } from "@kendall/ops-core";

// Canonical 14-part Agent schema + conformance gate + generator (from Foundry)
import { agentPackageInputSchema, checkTier1Conformance, buildAgentBom } from "@kendall/ops-core/agent-builder";

// Skill BoM ("Skill Context Block", KF-SKL-OPS-001)
import { normalizeSkillBom, checkSkillConformance, TAG_CATEGORIES } from "@kendall/ops-core/skill";
import { skillBomToYaml } from "@kendall/ops-core/skill-template";

// Cross-system registry SDK (part numbers + shared agent/skill/system registry)
import { issuePartNumber, registerAgent, listRegisteredAgents } from "@kendall/ops-core/registry";
// Set CONTROL_PLANE_URL + CONTROL_PLANE_ANON_KEY; all fns return null when unset.
```

## What's inside

| Subpath | Module | Exports | Notes |
| --- | --- | --- | --- |
| `.` | `bomModel` | `normalizeBom`, `classifyComponentType`, `AgentBom`, `ComponentType`, … | Pure schema + normalizer, zero deps |
| `.` | `bomTemplate` | `blankBomTemplate`, `bomToJson`, `bomToMarkdown`, `TEMPLATE_ID` | Blank scaffolds + serializers |
| `/agent-builder` | `agentBuilder` | `agentPackageInputSchema`, `checkTier1Conformance`, `buildAgentBom`, `renderAgentPackageFiles` | Canonical 14-part agent + AI-BoM generator (deps: `zod`, `yaml`) |
| `/skill` | `skillBomModel` | `normalizeSkillBom`, `checkSkillConformance`, `skillNumber`, `TAG_CATEGORIES`, `SkillBom`, … | Skill Context Block schema, zero deps |
| `/skill-template` | `skillBomTemplate` | `skillBomToYaml`, `skillBomToJson`, `blankSkillTemplate` | skill.bom.yaml serializer |
| `/registry` | `registry` | `issuePartNumber`, `deriveQcPartNumber`, `deriveSkillSlug`, `controlPlaneConfigured`, `registerAgent`/`registerSkill`/`registerModule`, `listSystems`/`listRegisteredAgents`/`listRegisteredSkills`/`listRegisteredModules` | Cross-system registry SDK — agents + skills + software modules (KF-MOD). Fetch-only, graceful-degrade; `CONTROL_PLANE_URL`/`ANON_KEY` |

## Part identity governance

The accepted target is defined by [KF-STD-PART-0001](docs/standards/KF-STD-PART-0001-context-warehouse-part-identity.md) and control-plane ADR-012. The Context Warehouse Control Department is the sole issuer for new governed part numbers.

The existing `issuePartNumber` SDK/RPC is transitional. Consumer products should not add new direct calls to it. The next registry work package must provide authenticated, class-whitelisted, atomic issue-and-register behavior, immutable part numbers, audit events, legacy aliases, and a generated part-master export for Kendall Logix.

Existing issued numbers remain valid until reconciled. Do not renumber them by editing repositories.

## Roadmap

Migrate the rest of the shared core here, in dependency order:

1. ✅ **BoM core** — `bomModel` + `bomTemplate`
2. ✅ **Agent Builder schema + generator** — from Foundry `packages/domain/src/agent-builder`
   (Zod schema, conformance gate, `buildAgentBom`) → `/agent-builder`
3. ✅ **Skill BoM core** — Skill Context Block (KF-SKL-OPS-001) → `/skill` + `/skill-template`
4. ✅ **Registry SDK + part-number issuing** — the typed client to the kendall-control
   Supabase backend (agents/skills/systems registry, `issuePartNumber`, `registerAgent`/
   `registerSkill`), from Foundry `packages/db/src/control-plane.ts` → `/registry`
5. ⬜ **Audit + Job Runs contracts** — the observability spine (from kendall-ops `src/ops/activity.ts`)
6. ⬜ **Flow renderers** — `AgentFlowchart`, `WorkflowMap`, `workflows` (React peer dep)

Prove each module round-trips through one consumer (SHA-pinned install → app compiles)
before migrating the next.
