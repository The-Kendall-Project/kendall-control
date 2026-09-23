/**
 * AOS Pack sync — the PURE, store-agnostic half of the sync contract every
 * Kendall app's adapter implements. An app supplies its current rows and
 * executes the returned operations against its own data layer (Prisma in
 * kendall-ops, Drizzle in Foundry/DwellGuide, Supabase SQL in Capability);
 * the decision table here is shared so every system converges identically.
 *
 * Semantics:
 *   - manifest fast-path: run the sync once per pack version+hash (store the
 *     manifest under AOS_PACK_MANIFEST_KEY), so a page load costs one read.
 *   - missing block         → create, seedHash = contentHash(content).
 *   - present, un-edited    → update to the new canon (hash(content) == seedHash).
 *   - present, human-edited → never touched (hash mismatch, or seedHash null on
 *                             hand-authored rows). Edits always win.
 *   - tombstoned            → never resurrected (deletedAt set — deletions stick).
 *   - pack `removed` keys   → tombstone if un-edited; edited rows are kept.
 */
import { createHash } from "node:crypto";
// Type-only import (erased at compile) — this module keeps ZERO runtime
// relative imports so it compiles under every consumer's module resolution
// (bundler in the Next apps, nodenext in Foundry's packages/db).
import type { AosPack, PackBlock } from "./aos.js";

/** Natural key of a pack block — mirrors aos.ts blockKey (kept local so this
 *  module has no runtime relative import). */
const blockKey = (b: { kind: string; category: string; title: string }): string =>
  `${b.kind}/${b.category}/${b.title}`;

export const AOS_PACK_MANIFEST_KEY = "aos-pack";

/** Hash of a block's content — written to seedHash at seed time; a later
 *  mismatch means a human edited the block, so sync must leave it alone. */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The columns an adapter must read from its KendallBlock store. */
export interface ExistingRow {
  kind: string;
  category: string;
  title: string;
  content: string;
  seedHash: string | null;
  deletedAt: Date | null;
}

export type SyncOp =
  | { op: "create"; block: PackBlock; seedHash: string }
  | { op: "update"; key: { kind: string; category: string; title: string }; content: string; seedHash: string }
  | { op: "adopt"; key: { kind: string; category: string; title: string }; seedHash: string }
  | { op: "tombstone"; key: { kind: string; category: string; title: string } };

const isUnedited = (r: ExistingRow): boolean =>
  r.seedHash !== null && contentHash(r.content) === r.seedHash;

/** Pure: the full sync decision table — pack + current rows → operations. */
export function planSync(pack: AosPack, existing: ExistingRow[]): SyncOp[] {
  const byKey = new Map(existing.map((r) => [blockKey(r), r]));
  const ops: SyncOp[] = [];

  for (const b of pack.blocks) {
    const row = byKey.get(blockKey(b));
    if (!row) {
      ops.push({ op: "create", block: b, seedHash: contentHash(b.content) });
      continue;
    }
    if (row.deletedAt) continue; // tombstoned — deletions stick
    if (row.seedHash === null && row.content === b.content) {
      // Pre-pack seeded row identical to the canon — claim it (seedHash backfill)
      // so future version bumps can update it instead of treating it as edited.
      ops.push({
        op: "adopt",
        key: { kind: b.kind, category: b.category, title: b.title },
        seedHash: contentHash(b.content),
      });
      continue;
    }
    if (!isUnedited(row)) continue; // human-edited or hand-authored — edits win
    if (row.content === b.content) continue; // already current canon
    ops.push({
      op: "update",
      key: { kind: b.kind, category: b.category, title: b.title },
      content: b.content,
      seedHash: contentHash(b.content),
    });
  }

  for (const key of pack.removed) {
    const row = byKey.get(key);
    if (!row || row.deletedAt || !isUnedited(row)) continue;
    ops.push({ op: "tombstone", key: { kind: row.kind, category: row.category, title: row.title } });
  }

  return ops;
}
