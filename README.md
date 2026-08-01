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

```ts
import { normalizeBom, blankBomTemplate, bomToMarkdown } from "@kendall/ops-core";
import type { AgentBom, ComponentType } from "@kendall/ops-core";
```

## What's inside

| Module | Exports | Notes |
| --- | --- | --- |
| `bomModel` | `normalizeBom`, `classifyComponentType`, `defaultBomFromAgent`, `AgentBom`, `ComponentType`, `AuthorityAction`, … | Pure schema + normalizer, zero runtime deps |
| `bomTemplate` | `blankBomTemplate`, `blankTemplatesAll`, `bomToJson`, `bomToMarkdown`, `TEMPLATE_ID` | Blank scaffolds + JSON/Markdown serializers |

## Roadmap

Migrate the rest of the shared core here, in dependency order:

1. ✅ **BoM core** — `bomModel` + `bomTemplate`
2. ⬜ **Agent Builder schema + generator** — from Foundry `packages/domain/src/agent-builder`
   (Zod schema, conformance gate, `buildAgentBom`)
3. ⬜ **Flow renderers** — `AgentFlowchart`, `WorkflowMap`, `workflows` (React; add a
   `react` peer dependency when these land)

Prove each module round-trips through one consumer (SHA-pinned install → app compiles)
before migrating the next.
