/**
 * Agent Bill of Materials model. Two shapes share one stored JSON superset,
 * selected by `componentType`:
 *
 *  • Connector  → deterministic system components (8-section Connector BoM). No
 *    LLM for ordinary read/write/auth/log/validate work.
 *  • Everything else (Collector / Reasoning Agent / Advisor / Actor / Checker) →
 *    the 10-section general Agent BoM (KACS stack + operational fields:
 *    Input/Output Contract, Authority-by-action, Runtime/Model/Budget,
 *    Failure/Escalation, Trace).
 *
 * Stored opaque as `AgentDef.bom`. `normalizeBom` migrates any prior record
 * forward without data loss (idempotent, preserves populated fields, stashes
 * unknown keys under `legacy`). Model requirements are stored as POLICY (need /
 * preference), never a hard-coded provider — so a future model gateway chooses
 * the actual model. No orchestration framework is introduced here.
 */

export type ComponentType =
  | "Connector" | "Collector" | "Reasoning Agent" | "Advisor" | "Actor" | "Checker";

export const COMPONENT_TYPES: ComponentType[] = [
  "Connector", "Collector", "Reasoning Agent", "Advisor", "Actor", "Checker",
];

// ── shared list-item shapes (kept from the KACS model for back-compat) ──
export interface GlossaryTerm { term: string; def: string; owner: string }
export interface RoleItem { pov: string; text: string; owner: string }
export interface SimpleItem { text: string; owner: string }
export interface RuleItem { text: string; gates: string[]; severity: string; owner: string }
export interface BoundaryItem { type: "used" | "not" | "escalate"; text: string; owner: string }
export interface ProcessStep { lead: string; text: string }
export interface ProcessBlock { name: string; cb: string; owner: string; steps: ProcessStep[]; inputs: string; outputs: string }
export interface StructRow { text: string; required: boolean }
export interface OutputTemplate { name: string; binds: string; path: string; structure: StructRow[] }
export interface SourceItem { kind: "glossary" | "text" | "file" | "link" | "api"; name: string; owner: string; rw: string; watch: string }

// ── new operational groups (general Agent BoM) ──
export type AuthorityAction =
  | "read" | "draft" | "recommend" | "queue" | "write-approval" | "write-policy" | "prohibited";
export const AUTHORITY_ACTIONS: AuthorityAction[] = [
  "read", "draft", "recommend", "queue", "write-approval", "write-policy", "prohibited",
];
/** Authority is per action AND system — never a blanket agent-level grant. */
export interface AuthorityEntry { system: string; action: AuthorityAction; note: string }

export interface InputContract {
  requiredInputs: string; optionalInputs: string; inputSource: string;
  missingInputBehavior: string; inputShape: string;
}
export interface OutputContract {
  description: string; schema: string; destination: string;
  humanApproval: string; verification: string;
}
export interface Runtime {
  executionType: string;   // deterministic | AI-assisted | agentic
  modelNeed: string;       // none | fast | balanced | advanced | long-context | private/local
  preferredModelPolicy: string;
  allowedProviders: string;
  fallbackPolicy: string;
  maxExecTime: string;
  tokenBudget: string;
  dollarBudget: string;
  mode: string;            // interactive | background
}
export interface Failure {
  retryable: string; missingContext: string; permissionFailure: string; invalidOutput: string;
  providerUnavailable: string; humanDecision: string; permanentFailure: string; escalationOwner: string;
}
export interface Trace {
  runId: string; version: string; snapshotId: string; modelUsed: string; toolsCalled: string;
  approvalRecord: string; tokensUsed: string; cost: string; stepLatency: string;
  totalActiveTime: string; finalResult: string;
}

/** Connector-specific field-set (deterministic system component). */
export interface ConnectorFields {
  connectedSystem: string; connectionMethod: string; credentialOwner: string;
  connectionStatus: string; authNotes: string;
  why: string; users: string;
  startsWhen: string; requiredFields: string; missingInputBehavior: string;
  reads: string; writes: string; prohibited: string; approvalLevel: string; requesterPermissions: string;
  how: string; defStart: string; defDone: string; timeout: string; retry: string; failureBehavior: string;
  returned: string; outputShape: string; writeVerification: string; successState: string; failureState: string;
  healthCheck: string; auditLog: string; latencyTarget: string; testReqs: string; reviewOwner: string; learning: string;
}

export interface AgentBom {
  componentType: ComponentType;
  identity: { name: string; number: string; owner: string; riskTier: string; story: string };
  // General Agent BoM sections
  glossary: GlossaryTerm[];
  roles: RoleItem[];
  objectives: SimpleItem[];
  defStart: SimpleItem[];
  defDone: SimpleItem[];
  rules: RuleItem[];
  boundary: BoundaryItem[];
  processes: ProcessBlock[];
  outputs: OutputTemplate[];
  sources: SourceItem[];
  testing: { qcPart: string; qcName: string; measures: SimpleItem[] };
  inputContract: InputContract;
  authority: AuthorityEntry[];
  outputContract: OutputContract;
  runtime: Runtime;
  failure: Failure;
  trace: Trace;
  learning: string;
  // Connector BoM field-set
  connector: ConnectorFields;
  // which fields are currently taking an inherited org/type default (label + override)
  inherited: Record<string, boolean>;
  // anything from an older record we didn't recognize — kept, never dropped
  legacy: Record<string, unknown>;
}

/** Organization / component-type standards a BoM field can inherit (then override). */
export const ORG_DEFAULTS: Record<string, string> = {
  riskTier: "2 — moderate",
  retry: "3 attempts · exponential backoff",
  auditRequirements: "every call logged with caller + timestamp",
  modelPolicy: "balanced",
  tokenBudget: "50k tokens / run",
  approvalRule: "human approval required for any external write",
};

export type FlatAgent = {
  id: string; name: string; owner: string; story: string;
  responsibility: string; check: string; boundary: string;
  readsFrom: string; writesTo: string; layer?: string;
};

/** Classify an existing agent → component type (connectors are the access layer). */
export function classifyComponentType(a: FlatAgent): ComponentType {
  switch (a.layer) {
    case "access": return "Connector";
    case "capture": return "Collector";
    case "advisory": return "Advisor";
    case "assurance": return "Checker";
    default: return "Reasoning Agent"; // reasoning / processing / business
  }
}

function parts(s: string): string[] {
  return (s || "").split(/[,;]|\band\b/gi).map((x) => x.trim()).filter(Boolean);
}

function emptyConnector(): ConnectorFields {
  return {
    connectedSystem: "", connectionMethod: "", credentialOwner: "", connectionStatus: "", authNotes: "",
    why: "", users: "", startsWhen: "", requiredFields: "", missingInputBehavior: "",
    reads: "", writes: "", prohibited: "", approvalLevel: "", requesterPermissions: "",
    how: "", defStart: "", defDone: "", timeout: "", retry: "", failureBehavior: "",
    returned: "", outputShape: "", writeVerification: "", successState: "", failureState: "",
    healthCheck: "", auditLog: "", latencyTarget: "", testReqs: "", reviewOwner: "", learning: "",
  };
}

const KNOWN_KEYS = new Set<string>([
  "componentType", "identity", "glossary", "roles", "objectives", "defStart", "defDone", "rules",
  "boundary", "processes", "outputs", "sources", "testing", "inputContract", "authority",
  "outputContract", "runtime", "failure", "trace", "learning", "connector", "inherited", "legacy",
]);

/**
 * Migrate/normalize a raw stored BoM (or null) into the full current shape.
 * Idempotent. Preserves every populated field; only fills gaps with defaults;
 * keeps unknown keys under `legacy`. Never overwrites a populated field.
 */
export function normalizeBom(raw: unknown, a: FlatAgent): AgentBom {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Partial<AgentBom> & Record<string, unknown>;

  const componentType: ComponentType =
    (typeof r.componentType === "string" && COMPONENT_TYPES.includes(r.componentType as ComponentType))
      ? (r.componentType as ComponentType)
      : classifyComponentType(a);

  const identity = {
    name: r.identity?.name ?? a.name,
    number: r.identity?.number ?? a.id,
    owner: r.identity?.owner ?? a.owner,
    riskTier: r.identity?.riskTier ?? ORG_DEFAULTS.riskTier,
    story: r.identity?.story ?? a.story,
  };

  const connector = { ...emptyConnector(), ...(r.connector ?? {}) } as ConnectorFields;
  // Seed connector fields for a connector that has never been authored.
  if (componentType === "Connector") {
    if (!connector.connectedSystem) connector.connectedSystem = parts(a.readsFrom)[0] ?? "";
    if (!connector.credentialOwner) connector.credentialOwner = a.owner || "";
    if (!connector.reads && a.readsFrom) connector.reads = a.readsFrom;
    if (!connector.writes && a.writesTo) connector.writes = a.writesTo;
    if (!connector.auditLog) connector.auditLog = ORG_DEFAULTS.auditRequirements;
  }

  const legacy: Record<string, unknown> = { ...(r.legacy && typeof r.legacy === "object" ? (r.legacy as Record<string, unknown>) : {}) };
  for (const k of Object.keys(r)) if (!KNOWN_KEYS.has(k)) legacy[k] = r[k];

  return {
    componentType,
    identity,
    glossary: r.glossary ?? [],
    roles: r.roles ?? [],
    objectives: r.objectives ?? (a.responsibility ? [{ text: a.responsibility, owner: "" }] : []),
    defStart: r.defStart ?? [],
    defDone: r.defDone ?? [],
    rules: r.rules ?? [],
    boundary: r.boundary ?? (a.boundary ? [{ type: "used", text: a.boundary, owner: "" }] : []),
    processes: r.processes ?? [],
    outputs: r.outputs ?? [],
    sources: r.sources ?? [
      ...parts(a.readsFrom).map((name): SourceItem => ({ kind: "api", name, owner: "", rw: "read", watch: "" })),
      ...parts(a.writesTo).map((name): SourceItem => ({ kind: "api", name, owner: "", rw: "write", watch: "" })),
    ],
    testing: r.testing ?? { qcPart: "", qcName: "", measures: a.check ? [{ text: a.check, owner: "" }] : [] },
    inputContract: { requiredInputs: "", optionalInputs: "", inputSource: "", missingInputBehavior: "", inputShape: "", ...(r.inputContract ?? {}) },
    authority: r.authority ?? [],
    outputContract: { description: "", schema: "", destination: "", humanApproval: "", verification: "", ...(r.outputContract ?? {}) },
    runtime: {
      executionType: "", modelNeed: "", preferredModelPolicy: "", allowedProviders: "", fallbackPolicy: "",
      maxExecTime: "", tokenBudget: "", dollarBudget: "", mode: "", ...(r.runtime ?? {}),
    },
    failure: {
      retryable: "", missingContext: "", permissionFailure: "", invalidOutput: "", providerUnavailable: "",
      humanDecision: "", permanentFailure: "", escalationOwner: "", ...(r.failure ?? {}),
    },
    trace: {
      runId: "", version: "", snapshotId: "", modelUsed: "", toolsCalled: "", approvalRecord: "",
      tokensUsed: "", cost: "", stepLatency: "", totalActiveTime: "", finalResult: "", ...(r.trace ?? {}),
    },
    learning: r.learning ?? "",
    connector,
    inherited: (r.inherited as Record<string, boolean>) ?? {},
    legacy,
  };
}

/** Build a fresh BoM for an agent from its flat fields (used when none exists). */
export function defaultBomFromAgent(a: FlatAgent): AgentBom {
  return normalizeBom(null, a);
}
