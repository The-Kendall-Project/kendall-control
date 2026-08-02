/**
 * Skill BoM TEMPLATE — portable, app-agnostic (depends only on skillBomModel.ts).
 * Emits the skill.bom.yaml manifest (and JSON) so every form field maps to a
 * manifest key and the form + file can't drift. Copy this + skillBomModel.ts
 * into any system, or ship via @kendall/ops-core.
 */
import {
  SKILL_TEMPLATE_ID,
  TAG_CATEGORIES,
  skillNumber,
  skillSlug,
  blankSkillBom,
  type SkillBom,
  type SkillSeed,
} from "./skillBomModel";

export { SKILL_TEMPLATE_ID };

export function blankSkillTemplate(seed: SkillSeed = {}): SkillBom {
  return blankSkillBom(seed);
}

export function skillBomToJson(bom: SkillBom): string {
  return JSON.stringify(bom, null, 2);
}

/** YAML list at an indent: ` []` when empty, else newline-separated `- "…"`. */
function yList(arr: string[], indent: string): string {
  const items = arr.map((v) => v.trim()).filter(Boolean);
  if (!items.length) return " []";
  return "\n" + items.map((v) => `${indent}- "${v.replace(/"/g, '\\"')}"`).join("\n");
}
const q = (s: string) => s.replace(/"/g, '\\"');

/** Render the Skill BoM as skill.bom.yaml (mirrors the Skill Builder's Generate). */
export function skillBomToYaml(bom: SkillBom): string {
  const before = bom.composition.runs.filter((r) => r.rel === "runs before").map((r) => r.skill);
  const after = bom.composition.runs.filter((r) => r.rel === "runs after").map((r) => r.skill);
  const fireWhen = bom.activation.triggers.concat(bom.activation.fireWhen ? [bom.activation.fireWhen] : []);
  const version = bom.identity.version || "v1";

  let y = "";
  y += "skill:\n";
  y += `  id: "${skillNumber(bom)}"\n`;
  y += `  name: "${skillSlug(bom.identity.name)}"\n`;
  y += `  display_name: "${q(bom.identity.name)}"\n`;
  y += `  class: "${bom.identity.cls}"\n`;
  y += `  version: "${version}"\n`;
  y += `  compatible_agents:${yList(bom.identity.compatibleAgents, "    ")}\n`;
  y += `  risk_tier: "${q(bom.identity.riskTier)}"\n`;
  y += `  status: "${bom.identity.status}"\n\n`;

  y += `ownership:\n  context_owner: "${q(bom.ownership.contextOwner)}"\n\n`;

  y += "asset_story:\n";
  y += `  for: "${q(bom.assetStory.for)}"\n`;
  y += `  used_when: "${q(bom.assetStory.usedWhen)}"\n`;
  y += `  produces: "${q(bom.assetStory.produces)}"\n`;
  y += `  so_that: "${q(bom.assetStory.soThat)}"\n\n`;

  y += "activation:\n";
  y += `  fire_when:${yList(fireWhen, "    ")}\n`;
  y += `  do_not_fire_when:${yList(bom.activation.doNotFireWhen ? [bom.activation.doNotFireWhen] : [], "    ")}\n\n`;

  y += "tags:\n";
  for (const c of TAG_CATEGORIES) y += `  "${c}":${yList(bom.tags[c], "    ")}\n`;

  y += `\nrules:${yList(bom.rules, "  ")}\n\n`;

  y += "output_contract:\n";
  y += `  format: "${q(bom.outputContract.format)}"\n`;
  y += `  gold_example: "${q(bom.outputContract.goldExample)}"\n`;
  y += `  acceptance: "${q(bom.outputContract.acceptance)}"\n\n`;

  y += "composition:\n";
  y += `  runs_before:${yList(before, "    ")}\n`;
  y += `  runs_after:${yList(after, "    ")}\n`;
  y += `  depends_on:${yList(bom.composition.dependsOn ? [bom.composition.dependsOn] : [], "    ")}\n`;
  y += `  conflicts_with:${yList(bom.composition.conflictsWith ? [bom.composition.conflictsWith] : [], "    ")}\n\n`;

  y += "provenance:\n";
  y += `  source_of_truth: "${q(bom.provenance.sourceOfTruth)}"\n`;
  y += "  change_log:\n";
  y += `    - version: "${version}"\n`;
  y += `      change: "Initial registration"\n`;
  y += `      drafted_by: "${q(bom.provenance.draftedBy)}"\n`;
  y += `      built_by: "${q(bom.provenance.builtBy)}"\n`;

  return y;
}
