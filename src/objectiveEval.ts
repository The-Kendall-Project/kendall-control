/**
 * Objective-to-Eval record — one standard record per major project that states the
 * problems it solves, the objectives and measures that define success, the AI success
 * criteria, the Eval Context Block that tests them, and the outcome measurement plan.
 *
 * Shared by every Kendall admin backend (Kendall Factory, Dwell Guide, Kendall Ops, …) via
 * `@kendall/ops-core/objective-eval`. Pure types and functions only (no I/O) so each app's store, API, workbench, and tests share
 * one definition of completeness, verdicts, readiness flags, and the Markdown export.
 */

export type ObjectiveEvalPhase = "Discovery" | "Build" | "Pilot" | "Scale" | "Closed";
export type MeasureDirection = "reduce" | "increase" | "cap";
export type GraderType = "human" | "code" | "model";
export type CaseSet = "example" | "heldout";

export type ObjectiveEvalProblem = { id: string; statement: string; who: string; impact: string; owner: string };
export type ObjectiveEvalMeasure = { id: string; metric: string; direction: MeasureDirection; baseline: number | null; target: number | null; unit: string; due: string; current: number | null; measuredOn: string; source: string };
export type ObjectiveEvalObjective = { id: string; outcome: string; owner: string; timeframe: string; problems: string[]; measures: ObjectiveEvalMeasure[] };
export type ObjectiveEvalCriterion = { id: string; statement: string; metric: string; threshold: number | null; objectives: string[] };
export type ObjectiveEvalRubricDimension = { dim: string; desc: string; pass: string; grader: GraderType };
export type ObjectiveEvalTestCase = { id: string; name: string; input: string; reference: string; split: CaseSet; grader: GraderType; criteria: string[]; trials: Array<boolean | null> };
export type ObjectiveEvalSpec = { name: string; purpose: string; trials: number; grading: string; trace: string };
export type ObjectiveEvalOutcomePlan = { plan: string; pilotLength: number | null; currentWeek: number | null; cadence: string; decision: string };

export type ObjectiveEvalInput = {
  name: string;
  client: string;
  phase: ObjectiveEvalPhase;
  owner: string;
  contextOwner: string;
  curator: string;
  folder: string;
  linkedOpportunityId: string;
  problems: ObjectiveEvalProblem[];
  objectives: ObjectiveEvalObjective[];
  ai: ObjectiveEvalCriterion[];
  rules: string;
  dod: string;
  evalSpec: ObjectiveEvalSpec;
  rubric: ObjectiveEvalRubricDimension[];
  cases: ObjectiveEvalTestCase[];
  outcome: ObjectiveEvalOutcomePlan;
};

export const objectiveEvalPhases: ObjectiveEvalPhase[] = ["Discovery", "Build", "Pilot", "Scale", "Closed"];
export const measureDirectionLabels: Record<MeasureDirection, string> = { reduce: "Reduce to", increase: "Increase to", cap: "Keep at or below" };

export type Verdict = true | false | "partial" | null;

const str = (value: unknown, max = 4000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const num = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const ids = (value: unknown, allowed: Set<string>) => [...new Set((Array.isArray(value) ? value : []).map((item) => str(item, 40)).filter((item) => allowed.has(item)))];
const listOf = <T>(value: unknown, max: number, map: (item: Record<string, unknown>, index: number) => T) => (Array.isArray(value) ? value : []).slice(0, max).map((item, index) => map((item && typeof item === "object" ? item : {}) as Record<string, unknown>, index));
const grader = (value: unknown): GraderType => (value === "code" || value === "model" ? value : "human");

export function blankObjectiveEvalInput(owner = ""): ObjectiveEvalInput {
  return {
    name: "", client: "", phase: "Discovery", owner, contextOwner: "", curator: "", folder: "", linkedOpportunityId: "",
    problems: [{ id: "P1", statement: "", who: "", impact: "", owner: "" }],
    objectives: [{ id: "O1", outcome: "", owner, timeframe: "", problems: ["P1"], measures: [blankMeasure("M1")] }],
    ai: [{ id: "C1", statement: "", metric: "", threshold: null, objectives: ["O1"] }],
    rules: "", dod: "",
    evalSpec: { name: "", purpose: "", trials: 3, grading: "", trace: "" },
    rubric: [{ dim: "", desc: "", pass: "", grader: "human" }],
    cases: [{ id: "T01", name: "", input: "", reference: "", split: "heldout", grader: "human", criteria: [], trials: [null, null, null] }],
    outcome: { plan: "", pilotLength: null, currentWeek: null, cadence: "", decision: "" },
  };
}

export function blankMeasure(id: string): ObjectiveEvalMeasure {
  return { id, metric: "", direction: "reduce", baseline: null, target: null, unit: "", due: "", current: null, measuredOn: "", source: "" };
}

/** Cleans untrusted input into a well-formed record body. Returns an error message instead of throwing. */
export function normalizeObjectiveEvalInput(raw: unknown): { ok: true; value: ObjectiveEvalInput } | { ok: false; message: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = str(input.name, 160);
  if (!name) return { ok: false, message: "A project name is required." };
  const phase = objectiveEvalPhases.includes(input.phase as ObjectiveEvalPhase) ? (input.phase as ObjectiveEvalPhase) : "Discovery";
  const problems = listOf(input.problems, 50, (p, i) => ({ id: str(p.id, 40) || `P${i + 1}`, statement: str(p.statement), who: str(p.who, 400), impact: str(p.impact, 400), owner: str(p.owner, 200) }));
  const problemIds = new Set(problems.map((p) => p.id));
  if (problemIds.size !== problems.length) return { ok: false, message: "Each problem needs a unique ID." };
  const objectives = listOf(input.objectives, 50, (o, i) => ({
    id: str(o.id, 40) || `O${i + 1}`, outcome: str(o.outcome), owner: str(o.owner, 200), timeframe: str(o.timeframe, 200), problems: ids(o.problems, problemIds),
    measures: listOf(o.measures, 30, (m, j) => ({ id: str(m.id, 40) || `M${i + 1}.${j + 1}`, metric: str(m.metric, 300), direction: (["reduce", "increase", "cap"] as const).includes(m.direction as MeasureDirection) ? (m.direction as MeasureDirection) : "reduce", baseline: num(m.baseline), target: num(m.target), unit: str(m.unit, 60), due: str(m.due, 80), current: num(m.current), measuredOn: str(m.measuredOn, 80), source: str(m.source, 400) })),
  }));
  const objectiveIds = new Set(objectives.map((o) => o.id));
  if (objectiveIds.size !== objectives.length) return { ok: false, message: "Each objective needs a unique ID." };
  const measureIds = objectives.flatMap((o) => o.measures.map((m) => m.id));
  if (new Set(measureIds).size !== measureIds.length) return { ok: false, message: "Each measure needs a unique ID." };
  const ai = listOf(input.ai, 50, (c, i) => ({ id: str(c.id, 40) || `C${i + 1}`, statement: str(c.statement), metric: str(c.metric, 300), threshold: num(c.threshold), objectives: ids(c.objectives, objectiveIds) }));
  const criterionIds = new Set(ai.map((c) => c.id));
  if (criterionIds.size !== ai.length) return { ok: false, message: "Each AI criterion needs a unique ID." };
  if (ai.some((c) => c.threshold !== null && (c.threshold < 0 || c.threshold > 100))) return { ok: false, message: "AI criterion thresholds must be between 0 and 100 percent." };
  const specIn = (input.evalSpec && typeof input.evalSpec === "object" ? input.evalSpec : {}) as Record<string, unknown>;
  const trials = Math.max(1, Math.min(10, Math.round(num(specIn.trials) ?? 3)));
  const evalSpec = { name: str(specIn.name, 200), purpose: str(specIn.purpose), trials, grading: str(specIn.grading), trace: str(specIn.trace, 800) };
  const rubric = listOf(input.rubric, 30, (r) => ({ dim: str(r.dim, 200), desc: str(r.desc, 800), pass: str(r.pass, 800), grader: grader(r.grader) }));
  const cases = listOf(input.cases, 200, (t, i) => {
    const raw = Array.isArray(t.trials) ? t.trials : [];
    const trialValues = Array.from({ length: trials }, (_, k) => (raw[k] === true ? true : raw[k] === false ? false : null));
    return { id: str(t.id, 40) || `T${String(i + 1).padStart(2, "0")}`, name: str(t.name, 300), input: str(t.input, 2000), reference: str(t.reference), split: (t.split === "example" ? "example" : "heldout") as CaseSet, grader: grader(t.grader), criteria: ids(t.criteria, criterionIds), trials: trialValues };
  });
  if (new Set(cases.map((c) => c.id)).size !== cases.length) return { ok: false, message: "Each test case needs a unique ID." };
  const outIn = (input.outcome && typeof input.outcome === "object" ? input.outcome : {}) as Record<string, unknown>;
  const outcome = { plan: str(outIn.plan), pilotLength: num(outIn.pilotLength), currentWeek: num(outIn.currentWeek), cadence: str(outIn.cadence, 300), decision: str(outIn.decision, 1000) };
  return { ok: true, value: { name, client: str(input.client, 200), phase, owner: str(input.owner, 200), contextOwner: str(input.contextOwner, 200), curator: str(input.curator, 200), folder: str(input.folder, 500), linkedOpportunityId: str(input.linkedOpportunityId, 60), problems, objectives, ai, rules: str(input.rules), dod: str(input.dod), evalSpec, rubric, cases, outcome } };
}

/* ---------- computation ---------- */

const has = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
const text = (value: string | undefined) => Boolean(value && value.trim());

export function caseStats(testCase: ObjectiveEvalTestCase) {
  const run = testCase.trials.filter((t): t is boolean => t !== null);
  const passed = run.filter(Boolean).length;
  return { run: run.length, passed, rate: run.length ? passed / run.length : null, allPassed: run.length > 0 && passed === run.length && run.length === testCase.trials.length };
}

export function criterionStats(record: ObjectiveEvalInput, criterion: ObjectiveEvalCriterion) {
  let run = 0; let passed = 0; let cases = 0;
  for (const testCase of record.cases) {
    if (!testCase.criteria.includes(criterion.id)) continue;
    cases++;
    for (const trial of testCase.trials) if (trial !== null) { run++; if (trial) passed++; }
  }
  const rate = run ? passed / run : null;
  const met = rate === null || !has(criterion.threshold) ? null : rate * 100 >= criterion.threshold;
  return { run, passed, rate, cases, met };
}

export function setPassRate(record: ObjectiveEvalInput, split: CaseSet) {
  let run = 0; let passed = 0;
  for (const testCase of record.cases) if (testCase.split === split) for (const trial of testCase.trials) if (trial !== null) { run++; if (trial) passed++; }
  return run ? passed / run : null;
}

export function measureStats(measure: ObjectiveEvalMeasure): { met: boolean | null; progress: number | null } {
  const { baseline, target, current } = measure;
  if (!has(baseline) || !has(target) || !has(current)) return { met: null, progress: null };
  let met: boolean; let progress: number;
  if (measure.direction === "reduce") { met = current <= target; progress = baseline === target ? (met ? 1 : 0) : (baseline - current) / (baseline - target); }
  else if (measure.direction === "increase") { met = current >= target; progress = baseline === target ? (met ? 1 : 0) : (current - baseline) / (target - baseline); }
  else { met = current <= target; progress = met ? 1 : 0; }
  return { met, progress: Math.max(0, Math.min(1, progress)) };
}

export function combineVerdicts(values: Array<boolean | null | "partial">): Verdict {
  if (!values.length || values.every((v) => v === null)) return null;
  if (values.some((v) => v === false)) return false;
  if (values.some((v) => v === null || v === "partial")) return "partial";
  return true;
}

export const objectiveVerdict = (objective: ObjectiveEvalObjective) => combineVerdicts(objective.measures.map((m) => measureStats(m).met));
export const aiVerdict = (record: ObjectiveEvalInput) => combineVerdicts(record.ai.map((c) => criterionStats(record, c).met));
export const outcomeVerdict = (record: ObjectiveEvalInput) => combineVerdicts(record.objectives.map(objectiveVerdict));

export type ProblemStatus = "addressed" | "open" | "unlinked";
export function problemStatus(record: ObjectiveEvalInput, problem: ObjectiveEvalProblem): ProblemStatus {
  const solving = record.objectives.filter((o) => o.problems.includes(problem.id));
  if (!solving.length) return "unlinked";
  return solving.every((o) => objectiveVerdict(o) === true) ? "addressed" : "open";
}

export function recordChecks(record: ObjectiveEvalInput) {
  const checks: Array<{ label: string; ok: boolean }> = [];
  const add = (label: string, ok: boolean) => checks.push({ label, ok });
  add("Project has an accountable owner", text(record.owner));
  add("Context Owner named", text(record.contextOwner));
  add("At least one problem is stated", record.problems.some((p) => text(p.statement)));
  add("Every problem has a Problem Owner", record.problems.length > 0 && record.problems.every((p) => text(p.owner)));
  add("Every problem is solved by an objective", record.problems.length > 0 && record.problems.every((p) => problemStatus(record, p) !== "unlinked"));
  add("Every objective has an outcome, owner, and timeframe", record.objectives.length > 0 && record.objectives.every((o) => text(o.outcome) && text(o.owner) && text(o.timeframe)));
  add("Every objective has a measure with baseline, target, and due date", record.objectives.length > 0 && record.objectives.every((o) => o.measures.length > 0 && o.measures.every((m) => text(m.metric) && has(m.baseline) && has(m.target) && text(m.due))));
  add("Every objective is supported by an AI criterion", record.objectives.length > 0 && record.objectives.every((o) => record.ai.some((c) => c.objectives.includes(o.id))));
  add("Every AI criterion has a threshold", record.ai.length > 0 && record.ai.every((c) => text(c.statement) && has(c.threshold)));
  add("Every AI criterion is tested by a test case", record.ai.length > 0 && record.ai.every((c) => criterionStats(record, c).cases > 0));
  add("Held-out cases exist (golden set)", record.cases.some((c) => c.split === "heldout"));
  add("Every test case has a reference answer", record.cases.length > 0 && record.cases.every((c) => text(c.reference)));
  add("Rubric has pass conditions", record.rubric.some((r) => text(r.dim) && text(r.pass)));
  add("Rules stated", text(record.rules));
  add("Definition of Done stated", text(record.dod));
  add("Outcome measurement plan stated", text(record.outcome.plan));
  return checks;
}

export const recordCompleteness = (record: ObjectiveEvalInput) => { const checks = recordChecks(record); return checks.filter((c) => c.ok).length / checks.length; };

export type ReadinessFlag = { severity: "problem" | "note"; message: string };
export function readinessFlags(record: ObjectiveEvalInput): ReadinessFlag[] {
  const flags: ReadinessFlag[] = [];
  const problem = (message: string) => flags.push({ severity: "problem", message });
  const note = (message: string) => flags.push({ severity: "note", message });
  for (const p of record.problems) if (problemStatus(record, p) === "unlinked") problem(`${p.id} is not solved by any objective.`);
  for (const o of record.objectives) {
    if (!o.problems.length) note(`${o.id} is not linked to a problem. Problems fuel AI; an objective without one is a solution looking for a reason.`);
    if (!record.ai.some((c) => c.objectives.includes(o.id))) note(`${o.id} has no AI criterion supporting it.`);
    if (!o.measures.length) problem(`${o.id} has no measure. An objective without a measure cannot be evaluated.`);
    for (const m of o.measures) {
      const missing = [!text(m.metric) && "metric name", !has(m.baseline) && "baseline", !has(m.target) && "target", !text(m.due) && "due date"].filter(Boolean);
      if (missing.length) problem(`${o.id} / ${m.id} is missing ${missing.join(", ")}.`);
    }
  }
  for (const c of record.ai) {
    if (!has(c.threshold)) problem(`${c.id} has no threshold, so the eval cannot pass or fail it.`);
    if (criterionStats(record, c).cases === 0) problem(`${c.id} is not tested by any test case.`);
  }
  for (const t of record.cases) {
    if (!text(t.reference)) problem(`${t.id} has no reference answer. Without a basis for judging, it is an example, not a test case.`);
    if (!t.criteria.length) note(`${t.id} is not linked to any AI criterion.`);
  }
  if (!record.cases.some((t) => t.split === "heldout")) problem("No held-out cases. Passing familiar examples does not establish performance on new work.");
  if (record.evalSpec.trials < 2) note("One trial per case cannot reveal variability. Use at least 3.");
  const exampleRate = setPassRate(record, "example"); const heldoutRate = setPassRate(record, "heldout");
  if (exampleRate !== null && heldoutRate !== null && exampleRate - heldoutRate > 0.15) problem(`Held-out pass rate (${percent(heldoutRate)}) trails example pass rate (${percent(exampleRate)}) by more than 15 points. Possible overfitting to examples.`);
  const inconsistent = record.cases.filter((t) => { const s = caseStats(t); return s.run > 0 && s.passed > 0 && s.passed < s.run; });
  if (inconsistent.length) note(`Inconsistent results across trials on ${inconsistent.map((t) => t.id).join(", ")}. Inspect the traces.`);
  const ai = aiVerdict(record); const outcome = outcomeVerdict(record);
  if (ai === true && outcome === null) note("Eval passes but no outcome data yet. Passing the eval does not establish the business objective.");
  if (outcome === true && ai === false) problem("Objectives met while AI criteria fail. Results may be concealing failures the eval catches.");
  const { currentWeek, pilotLength } = record.outcome;
  if (has(currentWeek) && has(pilotLength) && currentWeek < pilotLength) note(`Pilot in progress: week ${currentWeek} of ${pilotLength}. Outcome results are interim.`);
  return flags;
}

export function quadrant(record: ObjectiveEvalInput) {
  const ai = aiVerdict(record) === true; const outcome = outcomeVerdict(record) === true;
  if (ai && outcome) return { key: "delivering", label: "Delivering value", guidance: "System evidence and outcome evidence both support the objectives. Decide on scale." } as const;
  if (ai) return { key: "unproven", label: "System performs, value not proven", guidance: "Check review effort, workflow fit, and adoption. A passing eval is not the business result." } as const;
  if (outcome) return { key: "hidden-risk", label: "Outcome may hide risk", guidance: "Results can conceal failures the eval catches. Fix failing criteria before scaling." } as const;
  return { key: "not-ready", label: "Not ready", guidance: "Bring AI criteria to threshold, then keep measuring objectives against baseline." } as const;
}

export function summarizeObjectiveEval(record: ObjectiveEvalInput) {
  const flags = readinessFlags(record);
  return {
    completeness: recordCompleteness(record),
    problemsAddressed: record.problems.filter((p) => problemStatus(record, p) === "addressed").length,
    problemCount: record.problems.length,
    objectivesMet: record.objectives.filter((o) => objectiveVerdict(o) === true).length,
    objectiveCount: record.objectives.length,
    aiVerdict: aiVerdict(record),
    outcomeVerdict: outcomeVerdict(record),
    quadrant: quadrant(record).label,
    openProblems: flags.filter((f) => f.severity === "problem").length,
    notes: flags.filter((f) => f.severity === "note").length,
  };
}

export const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);
const fmt = (value: number | null) => (value === null ? "–" : String(Math.round(value * 100) / 100));
const cell = (value: unknown) => String(value ?? "").replace(/\|/g, "/").replace(/\n/g, " ") || "–";
const verdictText = (value: Verdict, labels: [string, string, string, string]) => (value === true ? labels[0] : value === false ? labels[1] : value === "partial" ? labels[2] : labels[3]);

export function objectiveEvalFileBase(name: string) {
  return `${(name || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project"}-objective-to-eval-record`;
}

/** The standard project-folder record. */
export function renderObjectiveEvalMarkdown(record: ObjectiveEvalInput & { id?: string; version?: number }, exportedOn = new Date().toISOString().slice(0, 10)) {
  const lines: string[] = []; const w = (line = "") => lines.push(line);
  const summary = summarizeObjectiveEval(record);
  w(`# Objective-to-Eval Record: ${record.name}`); w();
  if (record.id) w(`**Record:** ${record.id}${record.version ? ` · v${record.version}` : ""}  `);
  w(`**Client or business unit:** ${record.client || "–"}  `); w(`**Phase:** ${record.phase}  `);
  w(`**Accountable owner:** ${record.owner || "–"}  `); w(`**Context Owner:** ${record.contextOwner || "–"}  `); w(`**Context Curator:** ${record.curator || "–"}  `);
  if (record.linkedOpportunityId) w(`**Factory opportunity:** ${record.linkedOpportunityId}  `);
  w(`**Exported:** ${exportedOn}  `);
  w(`**Status:** AI criteria ${verdictText(summary.aiVerdict, ["met", "not met", "incomplete", "not run"])} · Objectives ${verdictText(summary.outcomeVerdict, ["met", "not met", "partly measured", "not measured"])} · ${summary.quadrant} · Record ${percent(summary.completeness)} complete`); w();
  w("## 1. Problem Context Blocks"); w("| ID | Problem | Who experiences it | Impact | Problem Owner | Status |"); w("|---|---|---|---|---|---|");
  for (const p of record.problems) w(`| ${p.id} | ${cell(p.statement)} | ${cell(p.who)} | ${cell(p.impact)} | ${cell(p.owner)} | ${({ addressed: "Addressed", open: "Open", unlinked: "No objective" })[problemStatus(record, p)]} |`);
  w(); w("## 2. Objective Context Blocks");
  for (const o of record.objectives) {
    w(`### ${o.id}. ${o.outcome || "Untitled objective"}`);
    w(`**Accountable owner:** ${o.owner || "–"} · **Timeframe:** ${o.timeframe || "–"} · **Solves:** ${o.problems.join(", ") || "–"} · **Supported by:** ${record.ai.filter((c) => c.objectives.includes(o.id)).map((c) => c.id).join(", ") || "–"}`); w();
    w("| ID | Measure | Direction | Baseline | Target | Unit | Due | Current | Measured on | Source | Status |"); w("|---|---|---|---|---|---|---|---|---|---|---|");
    for (const m of o.measures) { const s = measureStats(m); w(`| ${m.id} | ${cell(m.metric)} | ${measureDirectionLabels[m.direction]} | ${fmt(m.baseline)} | ${fmt(m.target)} | ${cell(m.unit)} | ${cell(m.due)} | ${fmt(m.current)} | ${cell(m.measuredOn)} | ${cell(m.source)} | ${s.met === true ? "Met" : s.met === false ? "Not met" : "Not measured"} |`); }
    w();
  }
  w("## 3. AI success criteria"); w("| ID | Criterion | Metric | Threshold | Supports |"); w("|---|---|---|---|---|");
  for (const c of record.ai) w(`| ${c.id} | ${cell(c.statement)} | ${cell(c.metric)} | ${has(c.threshold) ? `${c.threshold}%` : "–"} | ${c.objectives.join(", ") || "–"} |`);
  w(); w("### Rules Context Block"); w(record.rules || "–"); w(); w("### Definition of Done"); w(record.dod || "–"); w();
  const spec = record.evalSpec;
  w(`## 4. Eval Context Block (specification): ${spec.name || "–"}`);
  w(`**What this eval tests:** ${spec.purpose || "–"}  `); w(`**Grading method:** ${spec.grading || "–"}  `); w(`**Trials per case:** ${spec.trials}  `); w(`**Trace captured:** ${spec.trace || "–"}`); w();
  w("### Rubric"); w("| Dimension | Rating description | Pass condition | Grader |"); w("|---|---|---|---|");
  for (const r of record.rubric) w(`| ${cell(r.dim)} | ${cell(r.desc)} | ${cell(r.pass)} | ${r.grader} |`);
  w(); w("### Test cases"); w("| ID | Scenario | Set | Input material | Reference answer | Criteria | Grader |"); w("|---|---|---|---|---|---|---|");
  for (const t of record.cases) w(`| ${t.id} | ${cell(t.name)} | ${t.split === "heldout" ? "Held-out (golden)" : "Example"} | ${cell(t.input)} | ${cell(t.reference)} | ${t.criteria.join(", ") || "–"} | ${t.grader} |`);
  w(); w("## 5. Outcome Measurement Plan"); w(`${record.outcome.plan || "–"}  `);
  w(`**Pilot length:** ${fmt(record.outcome.pilotLength)} weeks · **Current week:** ${fmt(record.outcome.currentWeek)} · **Review cadence:** ${record.outcome.cadence || "–"}  `); w(`**Decision rule:** ${record.outcome.decision || "–"}`); w();
  w(`## 6. Evaluation results (as of ${exportedOn})`);
  w(`Held-out pass rate: ${percent(setPassRate(record, "heldout"))} · Example pass rate: ${percent(setPassRate(record, "example"))} · Cases passing every trial: ${record.cases.filter((t) => caseStats(t).allPassed).length}/${record.cases.length}`); w();
  w("| Criterion | Pass rate | Threshold | Status |"); w("|---|---|---|---|");
  for (const c of record.ai) { const s = criterionStats(record, c); w(`| ${c.id} ${cell(c.metric)} | ${percent(s.rate)} | ${has(c.threshold) ? `${c.threshold}%` : "–"} | ${s.met === true ? "Met" : s.met === false ? "Not met" : "No data"} |`); }
  w(); w("| Case | Trials | Pass rate |"); w("|---|---|---|");
  for (const t of record.cases) w(`| ${t.id} ${cell(t.name)} | ${t.trials.map((v) => (v === true ? "P" : v === false ? "F" : "–")).join(" ")} | ${percent(caseStats(t).rate)} |`);
  w(); w("## 7. Record standard and readiness flags");
  for (const c of recordChecks(record)) w(`- [${c.ok ? "x" : " "}] ${c.label}`);
  w(); for (const f of readinessFlags(record)) w(`- **${f.severity === "problem" ? "Problem" : "Note"}:** ${f.message}`);
  w(); w("---"); w("Copyright © Kendall Project LLC | www.kendallai.org");
  return lines.join("\n");
}
