import YAML from "yaml";
import { z } from "zod";

/*
 * Kendall Agent Builder — canonical agent structure, conformance gate, and
 * package generator. Pure logic (no I/O): given the fields a Problem Owner
 * fills in, it produces the normalized, versioned Context Blocks + items and
 * the AI BoM. The DB layer persists what this returns; the web form renders it.
 *
 * Two objectives drive the shape (owner direction):
 *  - Structural identity: every Kendall agent is the SAME 14-part structure.
 *    `checkTier1Conformance` is the enforced gate — a non-conforming agent
 *    cannot be built.
 *  - Traceability: each part is composed of individually addressable, semver'd
 *    items (e.g. `kf-agt-010-rules#R3@0.1.0`) so a build-quality change traces
 *    to the specific rule / definition-of-done item and version.
 *
 * Governed by docs/standards/KF-AGT-PKG-0001 (v0.2 — the 14-part structure).
 */

const nonEmpty = z.string().trim().min(1);
const semver = z.string().regex(/^\d+\.\d+\.\d+$/, "Use semver, e.g. 0.1.0");

/** Kinds of individually-versioned Context Block item (the unit of traceability). */
export const contextBlockItemKindSchema = z.enum([
  "glossary_term",
  "objective_statement",
  "used_when",
  "not_used_when",
  "rule",
  "definition_of_start",
  "definition_of_done",
  "metric",
  "learning_loop",
]);
export type ContextBlockItemKind = z.infer<typeof contextBlockItemKindSchema>;

const namedItem = z.object({ name: nonEmpty, description: nonEmpty });

/** The canonical Kendall Agent — the one structure every agent must match. */
export const agentPackageInputSchema = z.object({
  // 2 — Kendall Agent #
  partNumber: z.string().regex(/^KF-AGT-0\d{2}$/, "Use the form KF-AGT-0## (e.g. KF-AGT-010)"),
  // 1 — Agent Name
  agentName: nonEmpty,
  owner: nonEmpty,
  spoc: nonEmpty.default("Foundry Operator (on rotation)"),
  riskTier: z.union([z.literal(2), z.literal(3)]),
  version: semver.default("0.1.0"),
  // 3 — Agent Context Story
  contextStory: z.object({
    organization: nonEmpty,
    role: nonEmpty,
    tasks: z.array(nonEmpty).min(1),
    soThat: nonEmpty,
    outputAs: nonEmpty,
  }),
  // 4 — Glossary (as needed)
  glossary: z.array(namedItem).default([]),
  // 5 — Objective
  objectives: z.array(nonEmpty).min(1),
  // 6 — Agent Boundary Card
  boundaryCard: z.object({
    usedWhen: z.array(nonEmpty).min(1),
    notUsedWhen: z.array(nonEmpty).min(1),
    // "escalate" boundary (as needed) — conditions where the agent must hand off.
    escalate: z.array(nonEmpty).default([]),
  }),
  // 7 — Rules
  rules: z.array(nonEmpty).min(1),
  // 8 — Definition of Start
  definitionOfStart: z.array(nonEmpty).min(1),
  // 9 — Templates (as needed)
  templates: z.array(namedItem).default([]),
  // 10 — Definition of Done
  definitionOfDone: z.array(nonEmpty).min(1),
  // 11 — Measures
  measures: z.array(namedItem).min(1),
  // 12 — Learning loop
  learningLoop: z.object({ cadence: nonEmpty, description: nonEmpty }),
  // 13 — Quality control agent
  qualityControlAgent: z.object({
    partNumber: z.string().regex(/^KF-AGT-Q\d{2}$/, "Use the form KF-AGT-Q## (e.g. KF-AGT-Q10)"),
    name: nonEmpty,
  }),
  // 14 — API (as needed)
  api: z
    .array(
      z.object({
        system: nonEmpty,
        access: z.enum(["read", "write", "read_write"]),
        description: nonEmpty,
      }),
    )
    .default([]),

  // ── BoM operational items (all "as needed" — not every agent fills them) ──
  // Roles (point-of-view): "As <role>, I need <need>."
  roles: z.array(z.object({ role: nonEmpty, need: nonEmpty })).default([]),
  // Input contract
  inputContract: z
    .object({
      requiredInputs: z.string().default(""),
      optionalInputs: z.string().default(""),
      missingInputBehavior: z.string().default(""),
    })
    .default({ requiredInputs: "", optionalInputs: "", missingInputBehavior: "" }),
  // Output contract
  outputContract: z
    .object({
      description: z.string().default(""),
      destination: z.string().default(""),
      humanApproval: z.string().default(""),
      verification: z.string().default(""),
    })
    .default({ description: "", destination: "", humanApproval: "", verification: "" }),
  // Authority — per system AND action (never a blanket grant)
  authority: z
    .array(
      z.object({
        system: nonEmpty,
        action: z.enum(["read", "draft", "recommend", "queue", "write-approval", "write-policy", "prohibited"]),
        note: z.string().default(""),
      }),
    )
    .default([]),
  // Processes (named process → what it does / steps)
  processes: z.array(z.object({ name: nonEmpty, description: nonEmpty })).default([]),
  // Sources (context inputs beyond API systems)
  sources: z
    .array(
      z.object({
        name: nonEmpty,
        kind: z.enum(["glossary", "text", "file", "link", "api"]).default("api"),
        access: z.enum(["read", "write", "read_write"]).default("read"),
        notes: z.string().default(""),
      }),
    )
    .default([]),
});
export type AgentPackageInput = z.infer<typeof agentPackageInputSchema>;

/** Required parts (labels used by the conformance gate). "As needed" parts are omitted. */
const REQUIRED_PART_LABELS: Record<string, string> = {
  partNumber: "Kendall Agent # (KF-AGT-0##)",
  agentName: "Agent Name",
  owner: "Owner",
  riskTier: "Risk tier (2 or 3)",
  contextStory: "Agent Context Story",
  objectives: "Objective (at least one)",
  boundaryCard: "Agent Boundary Card (used-when and not-used-when)",
  rules: "Rules (at least one)",
  definitionOfStart: "Definition of Start (at least one)",
  definitionOfDone: "Definition of Done (at least one)",
  measures: "Measures (at least one)",
  learningLoop: "Learning loop",
  qualityControlAgent: "Quality control agent (KF-AGT-Q##)",
};

export interface ConformanceResult {
  readonly ok: boolean;
  /** Human-readable labels of required parts that are missing or invalid. */
  readonly missing: readonly string[];
}

/**
 * Tier-1 conformance: is every required part of the canonical structure present
 * and valid? This is the structural-identity gate — the builder refuses to
 * register an agent that does not match the one canonical shape.
 */
export function checkTier1Conformance(candidate: unknown): ConformanceResult {
  const parsed = agentPackageInputSchema.safeParse(candidate);

  if (parsed.success) {
    return { ok: true, missing: [] };
  }

  const missingKeys = new Set<string>();
  for (const issue of parsed.error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : "";
    if (key in REQUIRED_PART_LABELS) {
      missingKeys.add(key);
    }
  }

  const missing = [...missingKeys].map((key) => REQUIRED_PART_LABELS[key] ?? key);
  return { ok: false, missing: missing.length > 0 ? missing : ["Invalid input"] };
}

export interface BuiltContextBlockItem {
  /** Stable within-block id, e.g. "R3", "DOD2". */
  readonly itemId: string;
  readonly kind: ContextBlockItemKind;
  readonly ordinal: number;
  readonly text: string;
  readonly version: string;
}

export interface BuiltContextBlock {
  /** Stable block id, e.g. "kf-agt-010-rules". */
  readonly cbId: string;
  /** KF-DEC-019 block type. */
  readonly type: string;
  readonly slug: string;
  readonly title: string;
  readonly path: string;
  readonly owner: string;
  readonly reviewState: "draft";
  readonly version: string;
  readonly bodyMarkdown: string;
  readonly items: readonly BuiltContextBlockItem[];
}

export interface BuiltAgentPackage {
  readonly manifest: Record<string, unknown>;
  readonly blocks: readonly BuiltContextBlock[];
}

export interface AgentPackageFile {
  readonly path: string;
  readonly contents: string;
}

function slugSuffix(partNumber: string): string {
  return partNumber.toLowerCase();
}

function buildItems(
  kind: ContextBlockItemKind,
  prefix: string,
  version: string,
  texts: readonly string[],
): BuiltContextBlockItem[] {
  return texts.map((text, index) => ({
    itemId: `${prefix}${index + 1}`,
    kind,
    ordinal: index + 1,
    text,
    version,
  }));
}

function frontMatter(block: {
  cbId: string;
  type: string;
  owner: string;
  version: string;
}): string {
  return [
    "---",
    `id: ${block.cbId}`,
    `type: ${block.type}`,
    `owner: ${block.owner}`,
    "review_state: draft",
    `version: ${block.version}`,
    "sources: []",
    "---",
    "",
  ].join("\n");
}

function itemLines(items: readonly BuiltContextBlockItem[]): string {
  return items.map((item) => `- [${item.itemId} @${item.version}] ${item.text}`).join("\n");
}

/**
 * Build the normalized, versioned Context Blocks + the AI BoM manifest from a
 * validated input. Throws (via safeParse) only on truly invalid input — callers
 * gate with `checkTier1Conformance` first.
 */
export function buildAgentBom(rawInput: AgentPackageInput): BuiltAgentPackage {
  const input = agentPackageInputSchema.parse(rawInput);
  const v = input.version;
  const suffix = slugSuffix(input.partNumber);
  const owner = input.owner;

  const blocks: BuiltContextBlock[] = [];
  const push = (
    slug: string,
    type: string,
    title: string,
    items: readonly BuiltContextBlockItem[],
    body: string,
  ): void => {
    const cbId = `${suffix}-${slug}`;
    blocks.push({
      cbId,
      type,
      slug,
      title,
      path: `context-blocks/${slug}/${slug}.md`,
      owner,
      reviewState: "draft",
      version: v,
      bodyMarkdown: `${frontMatter({ cbId, type, owner, version: v })}# ${title}\n\n${body}\n`,
      items,
    });
  };

  // 3 — Context Story (narrative)
  const story = `In **${input.contextStory.organization}**, for the role of **${input.contextStory.role}**, this agent performs: ${input.contextStory.tasks
    .map((t) => `\n- ${t}`)
    .join(
      "",
    )}\n\nSo that: ${input.contextStory.soThat}\n\nWith output as: ${input.contextStory.outputAs}`;
  push("context-story", "narrative", "Agent Context Story", [], story);

  // 4 — Glossary (as needed)
  if (input.glossary.length > 0) {
    const items = buildItems(
      "glossary_term",
      "G",
      v,
      input.glossary.map((g) => `**${g.name}** — ${g.description}`),
    );
    push("glossary", "glossary", "Glossary", items, itemLines(items));
  }

  // 5 — Objective
  const objectiveItems = buildItems("objective_statement", "OBJ", v, input.objectives);
  push("objective", "objective", "Objective", objectiveItems, itemLines(objectiveItems));

  // 6 — Boundary Card
  const usedWhen = buildItems("used_when", "UW", v, input.boundaryCard.usedWhen);
  const notUsedWhen = buildItems("not_used_when", "NUW", v, input.boundaryCard.notUsedWhen);
  push(
    "boundary-card",
    "spec",
    "Agent Boundary Card",
    [...usedWhen, ...notUsedWhen],
    `## This agent is used when\n\n${itemLines(usedWhen)}\n\n## This agent is not used when\n\n${itemLines(notUsedWhen)}`,
  );

  // 7 — Rules
  const ruleItems = buildItems("rule", "R", v, input.rules);
  push("rules", "rule", "Rules", ruleItems, itemLines(ruleItems));

  // 8 — Definition of Start
  const dosItems = buildItems("definition_of_start", "DOS", v, input.definitionOfStart);
  push("definition-of-start", "spec", "Definition of Start", dosItems, itemLines(dosItems));

  // 10 — Definition of Done
  const dodItems = buildItems("definition_of_done", "DOD", v, input.definitionOfDone);
  push("definition-of-done", "spec", "Definition of Done", dodItems, itemLines(dodItems));

  // 11 — Measures
  const measureItems = buildItems(
    "metric",
    "M",
    v,
    input.measures.map((m) => `**${m.name}** — ${m.description}`),
  );
  push("measures", "spec", "Measures", measureItems, itemLines(measureItems));

  // 12 — Learning loop
  const loopItems = buildItems("learning_loop", "LL", v, [
    `Review cadence: ${input.learningLoop.cadence}. ${input.learningLoop.description}`,
  ]);
  push("learning-loop", "process", "Learning loop", loopItems, itemLines(loopItems));

  // ── BoM operational sections (as needed — emitted only when populated) ──
  if (input.roles.length > 0) {
    push("roles", "narrative", "Roles", [], input.roles.map((r) => `- **As ${r.role}:** ${r.need}`).join("\n"));
  }
  if (input.boundaryCard.escalate.length > 0) {
    push("escalation", "spec", "Escalation boundary", [], input.boundaryCard.escalate.map((e) => `- ${e}`).join("\n"));
  }
  const ic = input.inputContract;
  if (ic.requiredInputs || ic.optionalInputs || ic.missingInputBehavior) {
    push("input-contract", "spec", "Input Contract", [], `- Required inputs: ${ic.requiredInputs || "—"}\n- Optional inputs: ${ic.optionalInputs || "—"}\n- Missing-input behavior: ${ic.missingInputBehavior || "—"}`);
  }
  const oc = input.outputContract;
  if (oc.description || oc.destination || oc.humanApproval || oc.verification) {
    push("output-contract", "spec", "Output Contract", [], `- Description: ${oc.description || "—"}\n- Destination: ${oc.destination || "—"}\n- Human approval: ${oc.humanApproval || "—"}\n- Verification: ${oc.verification || "—"}`);
  }
  if (input.authority.length > 0) {
    push("authority", "spec", "Authority (per system + action)", [], input.authority.map((a) => `- **${a.system}** → ${a.action}${a.note ? ` (${a.note})` : ""}`).join("\n"));
  }
  if (input.processes.length > 0) {
    push("processes", "process", "Processes", [], input.processes.map((p) => `- **${p.name}** — ${p.description}`).join("\n"));
  }
  if (input.sources.length > 0) {
    push("sources", "spec", "Sources", [], input.sources.map((s) => `- [${s.kind}] **${s.name}** (${s.access})${s.notes ? ` — ${s.notes}` : ""}`).join("\n"));
  }

  const manifest: Record<string, unknown> = {
    agent: {
      part_number: input.partNumber,
      name: input.agentName,
      version: v,
      owner,
      spoc: input.spoc,
      risk_tier: input.riskTier,
      status: "draft",
      checked_by: input.qualityControlAgent.partNumber,
    },
    context_story: {
      organization: input.contextStory.organization,
      role: input.contextStory.role,
      tasks: input.contextStory.tasks,
      so_that: input.contextStory.soThat,
      output_as: input.contextStory.outputAs,
    },
    context_blocks: blocks.map((b) => ({
      type: b.type,
      id: b.cbId,
      path: b.path,
      owner: b.owner,
      review_state: b.reviewState,
      version: b.version,
      items: b.items.map((i) => ({ item_id: i.itemId, kind: i.kind, version: i.version })),
    })),
    templates: input.templates.map((t) => ({ name: t.name, description: t.description })),
    api: input.api.map((a) => ({ system: a.system, access: a.access, description: a.description })),
    roles: input.roles.map((r) => ({ role: r.role, need: r.need })),
    escalate: input.boundaryCard.escalate,
    input_contract: input.inputContract,
    output_contract: input.outputContract,
    authority: input.authority.map((a) => ({ system: a.system, action: a.action, note: a.note })),
    processes: input.processes.map((p) => ({ name: p.name, description: p.description })),
    sources: input.sources.map((s) => ({ name: s.name, kind: s.kind, access: s.access, notes: s.notes })),
    quality_control_agent: {
      part_number: input.qualityControlAgent.partNumber,
      name: input.qualityControlAgent.name,
    },
    change_control: [
      "rules, definition-of-done, or quality-gate items",
      "lens set or lens weights",
      "source rights classification",
      "model routing that raises cost or risk",
      "part number or QC pairing",
    ],
  };

  return { manifest, blocks };
}

/** Render the committable file package (ai-bom.yaml + Context Block markdowns + README). */
export function renderAgentPackageFiles(input: AgentPackageInput): readonly AgentPackageFile[] {
  const { manifest, blocks } = buildAgentBom(input);
  const files: AgentPackageFile[] = [
    {
      path: "ai-bom.yaml",
      contents: `# AI Bill of Materials — ${input.agentName}\n# Generated by the Kendall Agent Builder. Governed by docs/standards/KF-AGT-PKG-0001.\n${YAML.stringify(manifest)}`,
    },
    {
      path: "README.md",
      contents: `# ${input.partNumber} — ${input.agentName}\n\nGenerated Kendall Agent package (KF-AGT-PKG-0001). QC agent: ${input.qualityControlAgent.partNumber} (${input.qualityControlAgent.name}).\n\nEvery Context Block item carries a stable id and semver so build-quality changes trace to the exact item.\n`,
    },
  ];

  for (const block of blocks) {
    files.push({ path: block.path, contents: block.bodyMarkdown });
  }

  return files;
}
