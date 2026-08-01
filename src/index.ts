// @kendall/ops-core — public API barrel.
// Ships raw TypeScript (no build step); consumers compile via their own toolchain,
// exactly like @kendall/home. Consumed as a GitHub tarball pinned to a commit SHA.

// ── BoM model (pure schema + normalizer, zero deps) ──
export {
  COMPONENT_TYPES,
  AUTHORITY_ACTIONS,
  ORG_DEFAULTS,
  classifyComponentType,
  normalizeBom,
  defaultBomFromAgent,
} from "./bomModel";
export type {
  ComponentType,
  AuthorityAction,
  FlatAgent,
  GlossaryTerm,
  RoleItem,
  SimpleItem,
  RuleItem,
  BoundaryItem,
  ProcessStep,
  ProcessBlock,
  StructRow,
  OutputTemplate,
  SourceItem,
  AuthorityEntry,
  InputContract,
  OutputContract,
  Runtime,
  Failure,
  Trace,
  ConnectorFields,
  AgentBom,
} from "./bomModel";

// ── BoM template (blank scaffolds + JSON/Markdown serializers) ──
export {
  TEMPLATE_ID,
  blankBomTemplate,
  blankTemplatesAll,
  bomToJson,
  bomToMarkdown,
} from "./bomTemplate";
