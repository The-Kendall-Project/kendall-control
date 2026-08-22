# KF-STD-PART-0001 — Kendall Part Identity and Traceability Standard

**Status:** Draft for standards intake

**Owner:** Context Warehouse Control Department

**Approved direction:** control-plane ADR-012

**Applies to:** Every Kendall system, repository, agent, skill, Context Block, context fragment, prompt, workflow, module, source, dataset, evaluation, policy, template, tool, standard, and configuration selected for governance

## 1. Purpose

This standard defines how Kendall materials receive durable identity, revisions, aliases, lifecycle state, and traceability. It converts the owner direction in ADR-012 into a common operating contract.

The Context Warehouse is the identity authority. An owning repository stores the authored material. Kendall Logix publishes a GitHub mirror of the part master. None of those roles may silently substitute for another.

## 2. Normative language

- **Shall** means required.
- **Should** means recommended unless an approved exception exists.
- **May** means permitted.

## 3. Core rules

1. Every new governed part number shall be issued by the Context Warehouse Control Department.
2. Product apps, repositories, builders, scripts, and agents shall not mint local part numbers.
3. A part number shall be immutable after issuance.
4. Revision/version, digest, lifecycle state, and execution identity shall remain separate fields.
5. Issuance shall create a registry record and audit event in the same transaction.
6. Certification shall be a separate decision after issuance.
7. Existing identifiers shall be preserved as canonical grandfathered numbers or aliases; they shall not be silently renumbered.
8. The owning system, client, project, geography, owner, status, and version shall be metadata, not newly encoded semantics.
9. A GitHub catalog shall not determine the next number.
10. A new identifier class shall require Control Department approval and registry configuration.

## 4. Canonical format

New numbers use:

`KF-<CLASS>-<SEQUENCE>`

New class sequences use four digits. The registry stores the formatting rule per class so legacy formats remain resolvable.

| Class | Definition |
| --- | --- |
| AGT | Agent definition |
| SKL | Skill package |
| MOD | Reusable software module |
| CBT | Context Block template/type |
| CBL | Reusable governed Context Block |
| CTX | Context fragment or context asset |
| PRM | Prompt/instruction package |
| WFL | Workflow, Context Chain, or orchestration |
| BOM | Bill of materials/configuration manifest |
| SRC | Governed source or source package |
| DAT | Dataset/index/governed data snapshot |
| EVL | Evaluation suite/test set/rubric |
| POL | Policy/rule/guardrail package |
| STD | Standard/specification |
| SYS | Registered system/application |
| TMP | Reusable template |
| TOL | Tool/connector/API/MCP contract |

## 5. Identifier stack

A conforming registry record contains:

| Field | Meaning | Immutable |
| --- | --- | --- |
| registry_id | Machine identity, normally UUID | Yes |
| part_number | Stable human business identity | Yes |
| class_code | Approved part class | Yes |
| name | Current display name | No |
| slug | Current repository/runtime slug | No |
| revision | Approved design/content state | No |
| content_digest | Hash of exact released content | Per release |
| status | draft, in_review, certified, deprecated, retired | No |
| owning_system | Accountable system | Controlled |
| context_owner | Accountable owner of truth/fitness | Controlled |
| source_ref | Canonical repository path or record reference | Controlled |
| aliases | Prior/local/external identifiers | Append-only |
| supersedes | Replaced identity or revision | Append-only |
| derived_from | Upstream identity relationships | Append-only |
| effectivity | Date/client/jurisdiction/workflow applicability | Controlled |
| created_at/by | Issuance evidence | Yes |
| updated_at/by | Change evidence | Append-only audit |

A run, deployment, submission, or generated output receives a separate instance or run identifier and records the exact part revisions used.

## 6. Identity decision rule

A material shall receive a part number when at least one is true:

- it is reused by more than one workflow, agent, team, client, or repository;
- it controls AI behavior, access, safety, compliance, evaluation, or output;
- it can be revised, approved, certified, deprecated, recalled, or replaced;
- downstream systems must know exactly which governed item they used;
- an owner is accountable for its accuracy or fitness;
- a Bill of Materials or configuration baseline must reference it;
- audit, incident response, licensing, privacy, or records obligations require traceability.

Temporary drafts and runtime instances may use provisional IDs until they cross a governance gate. They may not receive a locally invented canonical part number.

## 7. New part versus new revision

Create a **new part** when purpose, responsibility, interchangeability, operating contract, or selection behavior changes enough that a consumer must deliberately choose between the old and new object.

Create a **new revision** when the same object is corrected or improved and remains the intended replacement for its earlier revision.

Examples:

- Clarifying a skill step without changing its output contract: new revision.
- Splitting one skill into independently selected capabilities: new parts.
- Correcting a Context Block source citation: new revision.
- Changing a rule so the block applies to a different jurisdiction or decision: new part or controlled variant, based on effectivity review.
- Renaming a file or moving repositories: neither; update location metadata.
- Exact byte change in a certified release: new digest and normally a new revision.

## 8. Issuance process

1. Submit request with proposed name, class, description, owner, owning system, source reference, and intended reuse.
2. Assign a provisional request ID.
3. Search exact identities, aliases, names, semantic duplicates, and forks.
4. Decide reuse, revise, alias, fork, or new part.
5. Validate the class and required metadata.
6. Atomically allocate the sequence and create the draft registry row.
7. Write the issuance audit event.
8. Return registry ID and part number.
9. Publish the record in the next Logix mirror export.
10. Continue through review and certification separately.

Rejected or withdrawn requests remain auditable but do not recycle an issued number.

## 9. Legacy migration

The migration process shall inventory repositories, databases, BoMs, manifests, filenames, folder names, and runtime configuration.

For each observed identifier, record:

- observed value;
- source repository/path;
- material type;
- owner if known;
- current revision/status if known;
- collision/duplication findings;
- disposition: grandfather, alias, merge, fork, reject, or pending;
- canonical registry ID and part number when resolved.

Existing references must continue resolving. A migration shall not mass-replace numbers until where-used analysis and rollback evidence exist.

## 10. Part-master publication

The Warehouse registry is authoritative. Kendall Logix stores:

- a machine-readable schema;
- a generated part-master snapshot;
- export timestamp;
- source registry revision or export ID;
- digest of the exported file;
- migration queue for unresolved legacy identifiers.

The Logix copy is read-only from an identity perspective. Pull requests may correct the export process or document a discrepancy, but may not allocate a number by editing the file.

## 11. Required runtime changes

The current registry implementation is transitional. Conformance requires the following changes before the system can claim centralized operational issuance:

- whitelist prefixes/classes; reject arbitrary prefixes;
- make issuance authenticated and authorized for the Warehouse Control Department;
- stop exposing direct issuance to ordinary consumer products;
- combine issue-and-register in one server transaction;
- prevent register/upsert operations from replacing a part number;
- implement Context Block and additional material registries;
- implement aliases and relationship records;
- implement lifecycle transition RPCs with permitted-transition checks;
- write audit events from every issuance and lifecycle action;
- generate the Logix part master from the registry;
- add CI checks for unauthorized new part-shaped strings.

## 12. Current known nonconformities

As of 2026-08-22:

- `issue_part_number` accepts an arbitrary prefix.
- The SQL formatter emits three digits for all prefixes.
- repository identifiers mix three digits, four digits, and system infixes.
- register RPCs accept caller-supplied numbers and overwrite the number on upsert.
- `part_number_sequences` and `audit_events` are hidden from anonymous reads, but issuance is still executable with the publishable key.
- the documented `context_block_registry` does not exist in `sql/0001_control_plane_registry.sql`.
- the Context Warehouse Manager is read-only and has no issuance workflow.
- Logix's `KB-*` block codes are local catalog identities that have not been reconciled through the Warehouse.

These are migration inputs, not permission to destroy or renumber existing records.

## 13. Definition of done

The standard is operational when:

- every new identifier is issued through one authenticated Warehouse workflow;
- issued part numbers cannot be changed;
- every part resolves to owner, source, revision, lifecycle, aliases, and relationships;
- every configuration can list exact part revisions and digests;
- legacy identifiers remain resolvable;
- Logix publishes a generated, verifiable mirror;
- unauthorized local numbering fails CI or release review;
- where-used analysis supports change assessment, recall, and deprecation.
