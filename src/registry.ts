/**
 * Kendall Control Plane registry SDK — the shared client every Kendall system
 * (Ops, Foundry, DwellGuide) uses to talk to the ONE cross-system registry:
 * atomic part-number issuing + the shared agent/skill/system registries. This
 * is the seam that collapses each product's local roster into a single source
 * of truth (product code never queries another product's DB — it calls here).
 *
 * Configured via CONTROL_PLANE_URL + CONTROL_PLANE_ANON_KEY (the Control
 * Plane's PUBLISHABLE Supabase key — never the secret service_role key). The
 * RPCs are SECURITY DEFINER, granted to `anon`/`authenticated`, so the
 * publishable key is sufficient and safe to hold in each consumer's env.
 * Every function DEGRADES GRACEFULLY: returns null (never throws) when the env
 * is unset, so a caller can fall back to local-only behavior; it throws only on
 * a real failed call. Pass `owningSystemKey` = your system's `systems.key`
 * (e.g. "ops", "foundry", "dwellguide"). Ported from Foundry
 * packages/db/src/control-plane.ts.
 */

function resolveControlPlaneConfig(
  env: NodeJS.ProcessEnv = process.env,
): { readonly url: string; readonly anonKey: string } | null {
  const url = env.CONTROL_PLANE_URL;
  const anonKey = env.CONTROL_PLANE_ANON_KEY;
  if (!url || !anonKey) {
    return null;
  }
  return { url, anonKey };
}

/**
 * Ask the Control Plane to atomically issue the next part number for a
 * prefix (e.g. "KF-AGT"). Returns null — never throws for "not configured" —
 * when CONTROL_PLANE_URL/CONTROL_PLANE_ANON_KEY are unset, so callers can
 * fall back to manual entry. Throws only on an actual failed call (Control
 * Plane configured but unreachable or erroring), since that should surface
 * as a real error rather than silently falling back.
 */
export async function issuePartNumber(
  prefix: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const controlPlane = resolveControlPlaneConfig(env);
  if (!controlPlane) {
    return null;
  }

  const response = await fetch(`${controlPlane.url}/rest/v1/rpc/issue_part_number`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: controlPlane.anonKey,
      authorization: `Bearer ${controlPlane.anonKey}`,
    },
    body: JSON.stringify({ p_prefix: prefix }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CONTROL_PLANE_ISSUE_PART_NUMBER_FAILED: ${response.status} ${detail}`);
  }

  const issued: unknown = await response.json();
  if (typeof issued !== "string" || issued.length === 0) {
    throw new Error("CONTROL_PLANE_ISSUE_PART_NUMBER_FAILED: empty response");
  }
  return issued;
}

/**
 * Derive the QC agent's part number from the main agent's, per
 * docs/standards/KF-AGT-PKG-0001: main "KF-AGT-0NN" -> QC "KF-AGT-QNN" (same
 * trailing two digits, per the Control Plane's KF-AGT sequence padding).
 */
export function deriveQcPartNumber(mainPartNumber: string): string {
  const match = /^KF-AGT-0(\d{2})$/.exec(mainPartNumber);
  if (!match) {
    throw new Error(`Cannot derive a QC part number from "${mainPartNumber}".`);
  }
  return `KF-AGT-Q${match[1]}`;
}

/** kebab-case slug used as a skill's canonical registry `slug` (mirrors the Skills Builder form's own slug preview). */
export function deriveSkillSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The registry row shape returned by `register_agent` / `register_skill`. */
export interface ControlPlaneRegistryEntry {
  readonly id: string;
  readonly partNumber: string;
  readonly name: string;
  readonly slug: string;
  readonly currentVersion: string;
  readonly status: string;
}

interface RawRegistryRow {
  readonly id: string;
  readonly part_number: string;
  readonly name: string;
  readonly slug: string;
  readonly current_version: string;
  readonly status: string;
}

function toRegistryEntry(row: RawRegistryRow): ControlPlaneRegistryEntry {
  return {
    id: row.id,
    partNumber: row.part_number,
    name: row.name,
    slug: row.slug,
    currentVersion: row.current_version,
    status: row.status,
  };
}

async function callRegistryRpc(
  rpc: "register_agent" | "register_skill" | "register_module",
  body: Record<string, unknown>,
  env: NodeJS.ProcessEnv,
): Promise<ControlPlaneRegistryEntry | null> {
  const controlPlane = resolveControlPlaneConfig(env);
  if (!controlPlane) {
    return null;
  }

  const response = await fetch(`${controlPlane.url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: controlPlane.anonKey,
      authorization: `Bearer ${controlPlane.anonKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CONTROL_PLANE_${rpc.toUpperCase()}_FAILED: ${response.status} ${detail}`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`CONTROL_PLANE_${rpc.toUpperCase()}_FAILED: empty response`);
  }
  return toRegistryEntry(rows[0] as RawRegistryRow);
}

/**
 * Record an agent into the Control Plane's shared `agent_registry` so every
 * Kendall system (Ops, DwellGuide) can see it, not just Foundry's local
 * database. Best-effort from the caller's point of view — returns null (never
 * throws for "not configured") when Control Plane env vars are unset, so a
 * local agent can still be created without Control Plane. `owningSystemKey`
 * must match a `systems.key` row in Control Plane (e.g. "foundry", "ops",
 * "dwellguide").
 */
export async function registerAgent(
  args: {
    readonly partNumber: string;
    readonly name: string;
    readonly slug: string;
    readonly owningSystemKey: string;
    readonly currentVersion?: string;
    readonly status?: string;
    readonly riskTier?: number;
    readonly repoUrl?: string;
    readonly specRef?: string;
    readonly bom?: Record<string, unknown>;
    /** KACS Instruction Stack position 1 — the narrative the registry views lead with. */
    readonly agentStory?: string;
    /** Free-text operating layer/mode, e.g. "Reasoning · propose only". */
    readonly layer?: string;
    readonly description?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ControlPlaneRegistryEntry | null> {
  return callRegistryRpc(
    "register_agent",
    {
      p_part_number: args.partNumber,
      p_name: args.name,
      p_slug: args.slug,
      p_owning_system_key: args.owningSystemKey,
      p_current_version: args.currentVersion ?? "0.1.0",
      p_status: args.status ?? "draft",
      p_risk_tier: args.riskTier ?? null,
      p_repo_url: args.repoUrl ?? null,
      p_spec_ref: args.specRef ?? null,
      p_bom: args.bom ?? {},
      // Always sent so the call resolves to the richer register_agent overload;
      // an empty story is coalesced server-side and never clobbers an existing one.
      p_agent_story: args.agentStory ?? "",
      p_layer: args.layer ?? null,
      p_description: args.description ?? null,
    },
    env,
  );
}

/**
 * Record a skill into the Control Plane's shared `skills_registry`. Same
 * best-effort/graceful-degrade contract as `registerAgent`.
 */
export async function registerSkill(
  args: {
    readonly partNumber: string;
    readonly name: string;
    readonly slug: string;
    readonly owningSystemKey: string;
    readonly currentVersion?: string;
    readonly status?: string;
    readonly repoUrl?: string;
    readonly specRef?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ControlPlaneRegistryEntry | null> {
  return callRegistryRpc(
    "register_skill",
    {
      p_part_number: args.partNumber,
      p_name: args.name,
      p_slug: args.slug,
      p_owning_system_key: args.owningSystemKey,
      p_current_version: args.currentVersion ?? "0.1.0",
      p_status: args.status ?? "draft",
      p_repo_url: args.repoUrl ?? null,
      p_spec_ref: args.specRef ?? null,
    },
    env,
  );
}

/* ------------------------------------------------------------------ *
 * Read side — powers the Control Plane governance console in Foundry. *
 * ------------------------------------------------------------------ *
 * These are plain PostgREST GET selects against the Control Plane's
 * shared tables, allowed by its `anon`/`authenticated` SELECT policies
 * on `systems`, `agent_registry`, and `skills_registry`. Same
 * graceful-degrade contract as the write side: return `null` (never
 * throw) when Control Plane env vars are unset so a governance page can
 * render a "not configured" state instead of crashing; throw only on a
 * real failed call. NOTE: `audit_events` and `part_number_sequences`
 * have no anon read policy by design, so there are deliberately no read
 * functions for them here.
 */

/** GET a PostgREST resource path (e.g. "systems?select=*"). Returns the raw row array, or null when Control Plane is unconfigured. */
async function selectFromControlPlane(
  path: string,
  env: NodeJS.ProcessEnv,
): Promise<readonly unknown[] | null> {
  const controlPlane = resolveControlPlaneConfig(env);
  if (!controlPlane) {
    return null;
  }

  const response = await fetch(`${controlPlane.url}/rest/v1/${path}`, {
    headers: {
      apikey: controlPlane.anonKey,
      authorization: `Bearer ${controlPlane.anonKey}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`CONTROL_PLANE_SELECT_FAILED: ${response.status} ${detail}`);
  }

  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error("CONTROL_PLANE_SELECT_FAILED: expected an array response");
  }
  return rows as readonly unknown[];
}

/** A system of record from the Control Plane's shared `systems` table. */
export interface ControlPlaneSystem {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly createdAt: string;
}

interface RawSystemRow {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly kind: string;
  readonly status: string;
  readonly created_at: string;
}

function toSystem(row: RawSystemRow): ControlPlaneSystem {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** PostgREST embeds a many-to-one relation as an object (sometimes wrapped in a one-element array). */
interface RawEmbeddedSystem {
  readonly key: string;
  readonly name: string;
}
function embeddedSystem(value: unknown): RawEmbeddedSystem | null {
  if (Array.isArray(value)) {
    return (value[0] as RawEmbeddedSystem | undefined) ?? null;
  }
  if (value && typeof value === "object") {
    return value as RawEmbeddedSystem;
  }
  return null;
}

/** An agent as recorded in the Control Plane's shared `agent_registry`, with its owning system resolved. */
export interface ControlPlaneAgent {
  readonly id: string;
  readonly partNumber: string;
  readonly name: string;
  readonly slug: string;
  readonly currentVersion: string;
  readonly status: string;
  readonly riskTier: number | null;
  /** KACS Instruction Stack position 1 — the narrative surfaced at the top of every registry view. */
  readonly agentStory: string;
  readonly layer: string | null;
  readonly description: string | null;
  readonly owningSystemKey: string | null;
  readonly owningSystemName: string | null;
  readonly createdAt: string;
}

interface RawAgentRow {
  readonly id: string;
  readonly part_number: string;
  readonly name: string;
  readonly slug: string;
  readonly current_version: string;
  readonly status: string;
  readonly risk_tier: number | null;
  readonly agent_story: string | null;
  readonly layer: string | null;
  readonly description: string | null;
  readonly created_at: string;
  readonly owning_system: unknown;
}

function toAgent(row: RawAgentRow): ControlPlaneAgent {
  const system = embeddedSystem(row.owning_system);
  return {
    id: row.id,
    partNumber: row.part_number,
    name: row.name,
    slug: row.slug,
    currentVersion: row.current_version,
    status: row.status,
    riskTier: row.risk_tier,
    agentStory: row.agent_story ?? "",
    layer: row.layer,
    description: row.description,
    owningSystemKey: system?.key ?? null,
    owningSystemName: system?.name ?? null,
    createdAt: row.created_at,
  };
}

/** A skill as recorded in the Control Plane's shared `skills_registry`, with its owning system resolved. */
export interface ControlPlaneSkill {
  readonly id: string;
  readonly partNumber: string;
  readonly name: string;
  readonly slug: string;
  readonly currentVersion: string;
  readonly status: string;
  readonly description: string | null;
  readonly owningSystemKey: string | null;
  readonly owningSystemName: string | null;
  readonly createdAt: string;
}

interface RawSkillRow {
  readonly id: string;
  readonly part_number: string;
  readonly name: string;
  readonly slug: string;
  readonly current_version: string;
  readonly status: string;
  readonly description: string | null;
  readonly created_at: string;
  readonly owning_system: unknown;
}

function toSkill(row: RawSkillRow): ControlPlaneSkill {
  const system = embeddedSystem(row.owning_system);
  return {
    id: row.id,
    partNumber: row.part_number,
    name: row.name,
    slug: row.slug,
    currentVersion: row.current_version,
    status: row.status,
    description: row.description,
    owningSystemKey: system?.key ?? null,
    owningSystemName: system?.name ?? null,
    createdAt: row.created_at,
  };
}

/** List every system of record, oldest first. Null when Control Plane is unconfigured. */
export async function listSystems(
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly ControlPlaneSystem[] | null> {
  const rows = await selectFromControlPlane(
    "systems?select=id,key,name,kind,status,created_at&order=created_at.asc",
    env,
  );
  return rows ? rows.map((row) => toSystem(row as RawSystemRow)) : null;
}

/** List every registered agent, keyed by part number, with its owning system. Null when Control Plane is unconfigured. */
export async function listRegisteredAgents(
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly ControlPlaneAgent[] | null> {
  const rows = await selectFromControlPlane(
    "agent_registry?select=id,part_number,name,slug,current_version,status,risk_tier,agent_story,layer,description,created_at,owning_system:systems(key,name)&order=part_number.asc",
    env,
  );
  return rows ? rows.map((row) => toAgent(row as RawAgentRow)) : null;
}

/** List every registered skill, keyed by part number, with its owning system. Null when Control Plane is unconfigured. */
export async function listRegisteredSkills(
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly ControlPlaneSkill[] | null> {
  const rows = await selectFromControlPlane(
    "skills_registry?select=id,part_number,name,slug,current_version,status,description,created_at,owning_system:systems(key,name)&order=part_number.asc",
    env,
  );
  return rows ? rows.map((row) => toSkill(row as RawSkillRow)) : null;
}

/** True when the Control Plane env is configured (for callers to branch on before fetching). */
export function controlPlaneConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveControlPlaneConfig(env) !== null;
}

/* ------------------------------------------------------------------ *
 * Software modules (KF-MOD) — reusable code packages (e.g. this one) *
 * as first-class registry items alongside agents + skills.          *
 * ------------------------------------------------------------------ */

/** A software module recorded in the Control Plane's `modules_registry`. */
export interface ControlPlaneModule {
  readonly id: string;
  readonly partNumber: string;
  readonly name: string;
  readonly slug: string;
  readonly currentVersion: string;
  readonly status: string;
  readonly description: string | null;
  readonly repoUrl: string | null;
  readonly owningSystemKey: string | null;
  readonly owningSystemName: string | null;
  readonly createdAt: string;
}

interface RawModuleRow {
  readonly id: string;
  readonly part_number: string;
  readonly name: string;
  readonly slug: string;
  readonly current_version: string;
  readonly status: string;
  readonly description: string | null;
  readonly repo_url: string | null;
  readonly created_at: string;
  readonly owning_system: unknown;
}

function toModule(row: RawModuleRow): ControlPlaneModule {
  const system = embeddedSystem(row.owning_system);
  return {
    id: row.id,
    partNumber: row.part_number,
    name: row.name,
    slug: row.slug,
    currentVersion: row.current_version,
    status: row.status,
    description: row.description,
    repoUrl: row.repo_url,
    owningSystemKey: system?.key ?? null,
    owningSystemName: system?.name ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Reading modules distinguishes "unconfigured" (env unset) from "pending"
 * (modules_registry not migrated yet — PostgREST 404) so a UI can prompt for the
 * right fix, rather than collapsing both to null like the agent/skill reads.
 */
export type ModulesResult =
  | { readonly state: "unconfigured" }
  | { readonly state: "pending" }
  | { readonly state: "ok"; readonly modules: readonly ControlPlaneModule[] };

export async function listRegisteredModules(env: NodeJS.ProcessEnv = process.env): Promise<ModulesResult> {
  const controlPlane = resolveControlPlaneConfig(env);
  if (!controlPlane) return { state: "unconfigured" };

  const response = await fetch(
    `${controlPlane.url}/rest/v1/modules_registry?select=id,part_number,name,slug,current_version,status,description,repo_url,created_at,owning_system:systems(key,name)&order=part_number.asc`,
    { headers: { apikey: controlPlane.anonKey, authorization: `Bearer ${controlPlane.anonKey}` } },
  );

  if (!response.ok) {
    const detail = await response.text();
    // A not-yet-created table (modules_registry before its migration) is a known,
    // recoverable state — surface it as "pending" rather than an error.
    if (response.status === 404 || detail.includes("PGRST205") || detail.includes("42P01")) {
      return { state: "pending" };
    }
    throw new Error(`CONTROL_PLANE_SELECT_FAILED: ${response.status} ${detail}`);
  }
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error("CONTROL_PLANE_SELECT_FAILED: expected an array response");
  return { state: "ok", modules: rows.map((row) => toModule(row as RawModuleRow)) };
}

/**
 * Register (upsert) a software module into the shared `modules_registry`. Same
 * best-effort/graceful-degrade contract as registerAgent/registerSkill. The
 * server RPC upserts on (owning_system_id, slug).
 */
export async function registerModule(
  args: {
    readonly partNumber: string;
    readonly name: string;
    readonly slug: string;
    readonly owningSystemKey: string;
    readonly currentVersion?: string;
    readonly status?: string;
    readonly repoUrl?: string;
    readonly specRef?: string;
    readonly description?: string;
  },
  env: NodeJS.ProcessEnv = process.env,
): Promise<ControlPlaneRegistryEntry | null> {
  return callRegistryRpc(
    "register_module",
    {
      p_part_number: args.partNumber,
      p_name: args.name,
      p_slug: args.slug,
      p_owning_system_key: args.owningSystemKey,
      p_current_version: args.currentVersion ?? "0.1.0",
      p_status: args.status ?? "draft",
      p_repo_url: args.repoUrl ?? null,
      p_spec_ref: args.specRef ?? null,
      p_description: args.description ?? null,
    },
    env,
  );
}
