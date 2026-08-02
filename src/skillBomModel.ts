/**
 * Skill Context Block model (v2, template KF-SKL-OPS-001) — the shape behind the
 * Skill Builder form and the skill.bom.yaml it emits. A skill is a Context Block:
 * a plain-language "asset story" + activation + the eight universal tag
 * categories + an output contract, with governance (rules, composition,
 * provenance) tucked behind a details panel.
 *
 * Pure schema + normalizer — NO app/DB/UI deps — so this file is portable into
 * kendall-control or shippable via @kendall/ops-core. Stored opaquely in
 * SkillDef.bom; the Drive-alignment fields (folderSlug/priorityTier/…) live on
 * the row and are owned by scripts/skills-sync.ts, not by this model.
 */

export const SKILL_TEMPLATE_ID = "KF-SKL-OPS-001";

export type SkillClass = "KP" | "KF" | "UTIL";
/** The skill's authoring lifecycle (distinct from the registry row status). */
export type SkillLifecycle = "Author" | "Scaffolded" | "Validated" | "Certified" | "Archived";
/** Registry row status (Drive/packageStatus-driven) — kept for the row, not the BoM. */
export type SkillStatus = "draft" | "active" | "archived";

/** The eight universal Context Block tag categories. */
export const TAG_CATEGORIES = [
  "Locations / Markets",
  "Roles / Stakeholders",
  "Processes / Tasks",
  "Tools / Systems",
  "Data / Media",
  "Constraints / Rules",
  "Measures / KPIs",
  "Open tags",
] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];
export type SkillTags = Record<TagCategory, string[]>;

export type RunRel = "runs before" | "runs after";
export interface RunLink {
  rel: RunRel;
  skill: string;
}

export interface SkillIdentity {
  name: string; // display name, e.g. "Context Controller"
  cls: SkillClass; // KP | KF | UTIL
  version: string; // "v1"
  riskTier: string; // "" | "1 low" | "2 moderate" | "3 high"
  status: SkillLifecycle;
  compatibleAgents: string[]; // ["claude", "codex", …]
}
export interface AssetStory {
  for: string; // the roles who use it
  usedWhen: string; // the workflow / moment
  produces: string; // the output or capability
  soThat: string; // the business / mission outcome
}
export interface SkillActivation {
  triggers: string[]; // phrases / conditions that load the skill
  fireWhen: string;
  doNotFireWhen: string;
}
export interface SkillOutputContract {
  format: string; // Markdown | DOCX | HTML | .pptx
  goldExample: string; // path to a good one
  acceptance: string; // the checks a reviewer runs
}
export interface SkillComposition {
  runs: RunLink[]; // connect skills — run before / after this one
  dependsOn: string;
  conflictsWith: string;
}
export interface SkillProvenance {
  sourceOfTruth: string; // Kendall Control ID / URL
  draftedBy: string; // human — role
  builtBy: string;
}

export interface SkillBom {
  templateId: string; // SKILL_TEMPLATE_ID
  identity: SkillIdentity;
  ownership: { contextOwner: string };
  assetStory: AssetStory;
  activation: SkillActivation;
  tags: SkillTags;
  rules: string[];
  outputContract: SkillOutputContract;
  composition: SkillComposition;
  provenance: SkillProvenance;
  legacy: Record<string, unknown>;
}

/** Seed fields a registry row carries (used to prefill a fresh or edited BoM). */
export interface SkillSeed {
  id?: string;
  name?: string;
  owner?: string;
  riskTier?: string;
  story?: string;
  status?: SkillStatus;
  cls?: SkillClass;
}

function arr<T>(v: unknown, fallback: T[] = []): T[] {
  return Array.isArray(v) ? (v as T[]) : fallback;
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function emptyTags(): SkillTags {
  const t = {} as SkillTags;
  for (const c of TAG_CATEGORIES) t[c] = [];
  return t;
}

/** Normalize a raw stored Skill BoM (or null) into the full current shape. Idempotent. */
export function normalizeSkillBom(raw: unknown, seed: SkillSeed = {}): SkillBom {
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const identity = (r.identity ?? {}) as Record<string, unknown>;
  const ownership = (r.ownership ?? {}) as Record<string, unknown>;
  const story = (r.assetStory ?? {}) as Record<string, unknown>;
  const activation = (r.activation ?? {}) as Record<string, unknown>;
  const output = (r.outputContract ?? {}) as Record<string, unknown>;
  const composition = (r.composition ?? {}) as Record<string, unknown>;
  const provenance = (r.provenance ?? {}) as Record<string, unknown>;
  const tagsIn = (r.tags ?? {}) as Record<string, unknown>;

  const tags = emptyTags();
  for (const c of TAG_CATEGORIES) tags[c] = arr<string>(tagsIn[c]);

  const clsRaw = str(identity.cls, seed.cls ?? "KP");
  const cls: SkillClass = clsRaw === "KF" || clsRaw === "UTIL" ? clsRaw : "KP";

  return {
    templateId: SKILL_TEMPLATE_ID,
    identity: {
      name: str(identity.name, seed.name ?? ""),
      cls,
      version: str(identity.version, "v1"),
      riskTier: str(identity.riskTier, seed.riskTier ?? ""),
      status: (str(identity.status, "Author") as SkillLifecycle) || "Author",
      compatibleAgents: arr<string>(identity.compatibleAgents, ["claude"]),
    },
    ownership: { contextOwner: str(ownership.contextOwner, seed.owner ?? "") },
    assetStory: {
      for: str(story.for),
      usedWhen: str(story.usedWhen),
      produces: str(story.produces),
      soThat: str(story.soThat),
    },
    activation: {
      triggers: arr<string>(activation.triggers),
      fireWhen: str(activation.fireWhen),
      doNotFireWhen: str(activation.doNotFireWhen),
    },
    tags,
    rules: arr<string>(r.rules),
    outputContract: {
      format: str(output.format),
      goldExample: str(output.goldExample),
      acceptance: str(output.acceptance),
    },
    composition: {
      runs: arr<RunLink>(composition.runs),
      dependsOn: str(composition.dependsOn),
      conflictsWith: str(composition.conflictsWith),
    },
    provenance: {
      sourceOfTruth: str(provenance.sourceOfTruth),
      draftedBy: str(provenance.draftedBy),
      builtBy: str(provenance.builtBy, "Claude (Cowork)"),
    },
    legacy: (r.legacy as Record<string, unknown>) ?? {},
  };
}

/** A complete but empty Skill BoM scaffold. */
export function blankSkillBom(seed: SkillSeed = {}): SkillBom {
  return normalizeSkillBom(null, seed);
}

export function skillSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** The auto-issued skill number, e.g. "SKL-KP-context-controller-v1". */
export function skillNumber(bom: SkillBom): string {
  const s = skillSlug(bom.identity.name);
  return `SKL-${bom.identity.cls}-${s || "________"}-${bom.identity.version || "v1"}`;
}

/** A one-line story from the asset story, for the registry card preview. */
export function skillStoryLine(a: AssetStory): string {
  const parts: string[] = [];
  if (a.for.trim()) parts.push(`For ${a.for.trim()}`);
  if (a.usedWhen.trim()) parts.push(`used when ${a.usedWhen.trim()}`);
  if (a.produces.trim()) parts.push(`produces ${a.produces.trim()}`);
  if (a.soThat.trim()) parts.push(`so that ${a.soThat.trim()}`);
  return parts.join(", ");
}

/** Map the authoring lifecycle onto the registry row status. */
export function registryStatusFor(s: SkillLifecycle): SkillStatus {
  if (s === "Archived") return "archived";
  if (s === "Validated" || s === "Certified") return "active";
  return "draft";
}

/**
 * Conformance gate — the accuracy-critical fields. On a blank form this returns
 * exactly the six "to complete" the Skill Context Block asks for.
 */
export function checkSkillConformance(bom: SkillBom): { ok: boolean; missing: string[] } {
  const has = (s?: string) => !!(s && s.trim());
  const missing: string[] = [];
  const a = bom.assetStory;
  if (!(has(a.for) && has(a.produces) && has(a.soThat))) missing.push("Asset story");
  if (bom.activation.triggers.filter(has).length === 0 && !has(bom.activation.fireWhen)) missing.push("Fire-when");
  if (!has(bom.activation.doNotFireWhen)) missing.push("Do-not-fire");
  if (TAG_CATEGORIES.every((c) => bom.tags[c].filter(has).length === 0)) missing.push("Tags");
  if (!has(bom.outputContract.format)) missing.push("Output contract");
  if (!has(bom.outputContract.acceptance)) missing.push("Verification");
  return { ok: missing.length === 0, missing };
}
