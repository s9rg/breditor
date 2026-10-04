import { flatListProjectionsShareProfile, isOwnedFlatListProjection, type FlatListDocumentProjection, type FlatListRootProjection } from "./flat_list_projection.js";
import { exactDataRecord, paragraphsEqual, readExactBoundedArray } from "./projection.js";
import type { BaseProjectionImpact, FullProjectionReason, RootChildRange } from "./projection_update.js";
import { projectionFailure, projectionSuccess, type BrowserProjectionResult } from "./result.js";

/** Proven unchanged whole-root subtrees; nested text coordinates are never root indices. */
export type FlatListUpdatePlan =
  | Readonly<{kind: "reuse"; roots: readonly Readonly<{oldIndex: number; newIndex: number}>[]}>
  | Readonly<{kind: "full"; reason: FullProjectionReason}>;
const TOKEN = Symbol("FlatListProjectionUpdate construction");
const PLANS = new WeakMap<FlatListProjectionUpdate, FlatListUpdatePlan>();

/** Exact, consecutive, profile-bound transition with independently checked impact. */
export class FlatListProjectionUpdate {
  private constructor(token: symbol, readonly base: FlatListDocumentProjection, readonly result: FlatListDocumentProjection,
    readonly impact: BaseProjectionImpact, plan: FlatListUpdatePlan) {
    if (token !== TOKEN) throw new TypeError("Use FlatListProjectionUpdate.create().");
    PLANS.set(this, plan); Object.freeze(this);
  }

  static create(input: unknown): BrowserProjectionResult<FlatListProjectionUpdate> {
    try {
      const record = exactDataRecord(input, ["base", "result", "impact"]);
      if (record === null || !isOwnedFlatListProjection(record["base"]) || !isOwnedFlatListProjection(record["result"])) return projectionFailure("projection.invalid_update");
      const base = record["base"], result = record["result"];
      if (!flatListProjectionsShareProfile(base, result) || base.snapshot.lineage !== result.snapshot.lineage ||
        BigInt(result.snapshot.revision) !== BigInt(base.snapshot.revision) + 1n) return projectionFailure("projection.invalid_update");
      const verified = verifyImpact(base, result, record["impact"]);
      return verified === null ? projectionFailure("projection.invalid_update") :
        projectionSuccess(new FlatListProjectionUpdate(TOKEN, base, result, verified.impact, verified.plan));
    } catch { return projectionFailure("projection.invalid_update"); }
  }
}

/** @internal */
export function isOwnedFlatListProjectionUpdate(value: unknown): value is FlatListProjectionUpdate {
  return typeof value === "object" && value !== null && PLANS.has(value as FlatListProjectionUpdate);
}
/** @internal */
export function flatListUpdatePlan(update: FlatListProjectionUpdate): FlatListUpdatePlan | undefined { return PLANS.get(update); }

/** Whole subtree equality includes heading ranks, typed inline properties and numbering. @internal */
export function flatListRootsEqual(a: FlatListRootProjection, b: FlatListRootProjection): boolean {
  if (a.kind === "textBlock" || b.kind === "textBlock") return a.kind === "textBlock" && b.kind === "textBlock" && paragraphsEqual(a.block, b.block);
  return a.kind === b.kind && (a.kind !== "orderedList" || (b.kind === "orderedList" && a.start === b.start)) &&
    a.items.length === b.items.length && a.items.every((item, index) => b.items[index] !== undefined && paragraphsEqual(item, b.items[index]!));
}

function verifyImpact(base: FlatListDocumentProjection, result: FlatListDocumentProjection, input: unknown): {impact: BaseProjectionImpact; plan: FlatListUpdatePlan} | null {
  const simple = exactDataRecord(input, ["kind"]);
  const kind = simple?.["kind"];
  if (kind === "root" || kind === "multipleOperations" || kind === "untrusted") return {
    impact: Object.freeze({kind}), plan: Object.freeze({kind: "full", reason: kind}),
  };
  const roots: Array<Readonly<{oldIndex: number; newIndex: number}>> = [];
  const retain = (oldIndex: number, newIndex: number): boolean => {
    const a = base.blocks[oldIndex], b = result.blocks[newIndex];
    if (a === undefined || b === undefined || !flatListRootsEqual(a, b)) return false;
    roots.push(Object.freeze({oldIndex, newIndex})); return true;
  };
  let impact: BaseProjectionImpact;
  if (kind === "none") {
    if (base.blocks.length !== result.blocks.length) return null;
    for (let i = 0; i < base.blocks.length; i += 1) if (!retain(i, i)) return null;
    impact = Object.freeze({kind: "none"});
  } else {
    const text = exactDataRecord(input, ["kind", "paragraphIndexes"]);
    if (text?.["kind"] === "textContainers") {
      const indexes = readExactBoundedArray(text["paragraphIndexes"], base.blocks.length);
      if (!indexes.ok || indexes.values.length === 0 || base.blocks.length !== result.blocks.length) return null;
      let previous = -1;
      const affected = new Set<number>();
      for (const index of indexes.values) {
        if (typeof index !== "number" || !Number.isSafeInteger(index) || index <= previous || index >= base.blocks.length ||
          base.blocks[index]?.kind !== "textBlock" || result.blocks[index]?.kind !== "textBlock") return null;
        affected.add(index); previous = index;
      }
      for (let i = 0; i < base.blocks.length; i += 1) if (!affected.has(i) && !retain(i, i)) return null;
      impact = Object.freeze({kind: "textContainers", paragraphIndexes: Object.freeze([...affected])});
    } else {
      const splice = exactDataRecord(input, ["kind", "oldRange", "newRange"]);
      if (splice?.["kind"] !== "rootSplice") return null;
      const oldRange = range(splice["oldRange"], base.blocks.length), newRange = range(splice["newRange"], result.blocks.length);
      if (oldRange === null || newRange === null || oldRange.start !== newRange.start ||
        base.blocks.length - oldRange.end !== result.blocks.length - newRange.end) return null;
      for (let i = 0; i < oldRange.start; i += 1) if (!retain(i, i)) return null;
      for (let i = 0; i < base.blocks.length - oldRange.end; i += 1) if (!retain(oldRange.end + i, newRange.end + i)) return null;
      impact = Object.freeze({kind: "rootSplice", oldRange, newRange});
    }
  }
  return {impact, plan: Object.freeze({kind: "reuse", roots: Object.freeze(roots)})};
}

function range(input: unknown, count: number): RootChildRange | null {
  const record = exactDataRecord(input, ["start", "end"]);
  if (record === null) return null;
  const start = record["start"], end = record["end"];
  return typeof start === "number" && typeof end === "number" && Number.isSafeInteger(start) && Number.isSafeInteger(end) &&
    start >= 0 && start <= end && end <= count ? Object.freeze({start, end}) : null;
}
