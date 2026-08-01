/**
 * Agent BoM TEMPLATE — a portable, app-agnostic module for replicating the
 * Bill-of-Materials form across systems (Kendall Ops, DwellGuide, future apps).
 *
 * It depends ONLY on `bomModel.ts` (pure schema + normalizer, no app/DB/UI deps),
 * so this file + bomModel.ts can be copied wholesale into another system — or
 * later published as part of `@kendall/ops-core` — to get the same BoM template.
 *
 * Provides:
 *  • blankBomTemplate(type)   — a complete, empty BoM scaffold for a component type
 *  • blankTemplatesAll()      — one blank template per component type
 *  • bomToJson(bom)           — pretty JSON (machine template / re-import)
 *  • bomToMarkdown(bom)       — the form rendered as a fill-in Markdown document
 */
import {
  type AgentBom,
  type ComponentType,
  COMPONENT_TYPES,
  normalizeBom,
} from "./bomModel";

export const TEMPLATE_ID = "KF-TPL-AGENT-BOM-0001";

/** Component type → the fleet layer that classifies to it (drives normalizeBom). */
const LAYER_FOR: Record<ComponentType, string> = {
  Connector: "access",
  Collector: "capture",
  "Reasoning Agent": "reasoning",
  Advisor: "advisory",
  Actor: "reasoning",
  Checker: "assurance",
};

/** A complete but EMPTY BoM scaffold for one component type — the blank template. */
export function blankBomTemplate(type: ComponentType): AgentBom {
  const bom = normalizeBom(null, {
    id: "",
    name: "",
    owner: "",
    story: "",
    responsibility: "",
    check: "",
    boundary: "",
    readsFrom: "",
    writesTo: "",
    layer: LAYER_FOR[type],
  });
  bom.componentType = type;
  return bom;
}

/** One blank template per component type. */
export function blankTemplatesAll(): Record<ComponentType, AgentBom> {
  return Object.fromEntries(COMPONENT_TYPES.map((t) => [t, blankBomTemplate(t)])) as Record<ComponentType, AgentBom>;
}

/** Pretty JSON — the machine-readable template (re-importable into any editor). */
export function bomToJson(bom: AgentBom): string {
  return JSON.stringify(bom, null, 2);
}

// ── Markdown serializer (the form as a fill-in document) ──
const FILL = "_(fill in)_";
const NONE = "_(none)_";

function field(label: string, value?: string): string {
  return `- **${label}:** ${value && value.trim() ? value.trim() : FILL}`;
}

function bullets<T>(items: T[], fmt: (x: T) => string): string {
  if (!items.length) return NONE;
  return items.map((x) => `- ${fmt(x)}`).join("\n");
}

/** Render a BoM as a readable, fill-in Markdown template. */
export function bomToMarkdown(bom: AgentBom): string {
  const L: string[] = [];
  const kind = bom.componentType;
  L.push(`# ${kind} — Bill of Materials`);
  L.push(`> Template ${TEMPLATE_ID} · fill every field or mark it inherited/N-A.`);
  L.push("");

  L.push("## Identity");
  L.push(field("Name", bom.identity.name));
  L.push(field("Part #", bom.identity.number));
  L.push(field("Owner", bom.identity.owner));
  L.push(field("Risk tier", bom.identity.riskTier));
  L.push(field("Story (In <X> for <Y>: …)", bom.identity.story));
  L.push("");

  if (kind === "Connector") {
    const c = bom.connector;
    L.push("## Connector BoM (8 sections)");
    L.push("### 1 · Connection");
    L.push(field("Connected system", c.connectedSystem));
    L.push(field("Connection method", c.connectionMethod));
    L.push(field("Credential owner", c.credentialOwner));
    L.push(field("Connection status", c.connectionStatus));
    L.push(field("Auth notes", c.authNotes));
    L.push("### 2 · Purpose");
    L.push(field("Why", c.why));
    L.push(field("Users", c.users));
    L.push("### 3 · Input");
    L.push(field("Starts when", c.startsWhen));
    L.push(field("Required fields", c.requiredFields));
    L.push(field("Missing-input behavior", c.missingInputBehavior));
    L.push("### 4 · Authority");
    L.push(field("Reads", c.reads));
    L.push(field("Writes", c.writes));
    L.push(field("Prohibited", c.prohibited));
    L.push(field("Approval level", c.approvalLevel));
    L.push(field("Requester permissions", c.requesterPermissions));
    L.push("### 5 · Process");
    L.push(field("How", c.how));
    L.push(field("Definition of start", c.defStart));
    L.push(field("Definition of done", c.defDone));
    L.push(field("Timeout", c.timeout));
    L.push(field("Retry", c.retry));
    L.push(field("Failure behavior", c.failureBehavior));
    L.push("### 6 · Output");
    L.push(field("Returned", c.returned));
    L.push(field("Output shape", c.outputShape));
    L.push(field("Write verification", c.writeVerification));
    L.push(field("Success state", c.successState));
    L.push(field("Failure state", c.failureState));
    L.push("### 7 · Assurance");
    L.push(field("Health check", c.healthCheck));
    L.push(field("Audit log", c.auditLog));
    L.push(field("Latency target", c.latencyTarget));
    L.push(field("Test requirements", c.testReqs));
    L.push(field("Review owner", c.reviewOwner));
    L.push("### 8 · Learning");
    L.push(field("Learning", c.learning));
    return L.join("\n");
  }

  // General Agent BoM (10 sections: KACS stack + operational contract)
  L.push("## Agent BoM (10 sections)");
  L.push("### 1 · Glossary");
  L.push(bullets(bom.glossary, (g) => `**${g.term || FILL}** — ${g.def || FILL} _(owner: ${g.owner || "?"})_`));
  L.push("### 2 · Roles");
  L.push(bullets(bom.roles, (r) => `${r.pov || FILL}: ${r.text || FILL} _(owner: ${r.owner || "?"})_`));
  L.push("### 3 · Objectives");
  L.push(bullets(bom.objectives, (o) => `${o.text || FILL} _(owner: ${o.owner || "?"})_`));
  L.push("### 4 · Definition of Start");
  L.push(bullets(bom.defStart, (o) => o.text || FILL));
  L.push("### 5 · Definition of Done");
  L.push(bullets(bom.defDone, (o) => o.text || FILL));
  L.push("### 6 · Rules");
  L.push(bullets(bom.rules, (r) => `${r.text || FILL} _(gates: ${r.gates.join(", ") || "?"} · severity: ${r.severity || "?"})_`));
  L.push("### 7 · Boundary");
  L.push(bullets(bom.boundary, (b) => `[${b.type}] ${b.text || FILL}`));
  L.push("### 8 · Processes");
  L.push(bullets(bom.processes, (p) => `**${p.name || FILL}** — in: ${p.inputs || "?"} → out: ${p.outputs || "?"} (${p.steps.length} steps)`));
  L.push("### 9 · Outputs");
  L.push(bullets(bom.outputs, (o) => `**${o.name || FILL}** → ${o.path || "?"} (binds: ${o.binds || "?"})`));
  L.push("### 10 · Sources");
  L.push(bullets(bom.sources, (s) => `[${s.kind}] ${s.name || FILL} _(${s.rw})_`));
  L.push("");

  L.push("## Operational contract");
  L.push("### Input contract");
  L.push(field("Required inputs", bom.inputContract.requiredInputs));
  L.push(field("Optional inputs", bom.inputContract.optionalInputs));
  L.push(field("Input source", bom.inputContract.inputSource));
  L.push(field("Missing-input behavior", bom.inputContract.missingInputBehavior));
  L.push(field("Input shape", bom.inputContract.inputShape));
  L.push("### Authority (per system + action)");
  L.push(bullets(bom.authority, (a) => `${a.system || FILL} → **${a.action}** ${a.note ? `(${a.note})` : ""}`));
  L.push("### Output contract");
  L.push(field("Description", bom.outputContract.description));
  L.push(field("Schema", bom.outputContract.schema));
  L.push(field("Destination", bom.outputContract.destination));
  L.push(field("Human approval", bom.outputContract.humanApproval));
  L.push(field("Verification", bom.outputContract.verification));
  L.push("### Runtime");
  L.push(field("Execution type", bom.runtime.executionType));
  L.push(field("Model need", bom.runtime.modelNeed));
  L.push(field("Preferred model policy", bom.runtime.preferredModelPolicy));
  L.push(field("Allowed providers", bom.runtime.allowedProviders));
  L.push(field("Fallback policy", bom.runtime.fallbackPolicy));
  L.push("### Failure & escalation");
  L.push(field("Retryable", bom.failure.retryable));
  L.push(field("Missing context", bom.failure.missingContext));
  L.push(field("Permission failure", bom.failure.permissionFailure));
  L.push(field("Invalid output", bom.failure.invalidOutput));
  L.push(field("Human decision", bom.failure.humanDecision));
  L.push(field("Escalation owner", bom.failure.escalationOwner));
  L.push("### Testing");
  L.push(field("QC part #", bom.testing.qcPart));
  L.push(field("QC agent", bom.testing.qcName));
  L.push(bullets(bom.testing.measures, (m) => m.text || FILL));
  L.push("### Learning");
  L.push(field("Learning loop", bom.learning));

  return L.join("\n");
}
