import { nestedListProjectionsShareProfile, isOwnedNestedListProjection, type NestedListDocumentProjection, type NestedListRootProjection } from "./nested_list_projection.js";
import { exactDataRecord, paragraphsEqual, readExactBoundedArray } from "./projection.js";
import type { BaseProjectionImpact, FullProjectionReason, RootChildRange } from "./projection_update.js";
import { projectionFailure, projectionSuccess, type BrowserProjectionResult } from "./result.js";

/** Proven unchanged whole-root subtrees; nested text coordinates are never root indices. */
export type NestedListUpdatePlan =
  | Readonly<{kind: "reuse"; roots: readonly Readonly<{oldIndex: number; newIndex: number}>[]}>
  | Readonly<{kind: "full"; reason: FullProjectionReason}>;
const TOKEN = Symbol("NestedListProjectionUpdate construction");
const PLANS = new WeakMap<NestedListProjectionUpdate, NestedListUpdatePlan>();

/** Exact, consecutive, profile-bound transition with independently checked impact. */
export class NestedListProjectionUpdate {
  private constructor(token: symbol, readonly base: NestedListDocumentProjection, readonly result: NestedListDocumentProjection,
    readonly impact: BaseProjectionImpact, plan: NestedListUpdatePlan) {
    if (token !== TOKEN) throw new TypeError("Use NestedListProjectionUpdate.create().");
    PLANS.set(this, plan); Object.freeze(this);
  }

  static create(input: unknown): BrowserProjectionResult<NestedListProjectionUpdate> {
    try {
      const record = exactDataRecord(input, ["base", "result", "impact"]);
      if (record === null || !isOwnedNestedListProjection(record["base"]) || !isOwnedNestedListProjection(record["result"])) return projectionFailure("projection.invalid_update");
      const base = record["base"], result = record["result"];
      if (!nestedListProjectionsShareProfile(base, result) || base.snapshot.lineage !== result.snapshot.lineage ||
        BigInt(result.snapshot.revision) !== BigInt(base.snapshot.revision) + 1n) return projectionFailure("projection.invalid_update");
      const verified = verifyImpact(base, result, record["impact"]);
      return verified === null ? projectionFailure("projection.invalid_update") :
        projectionSuccess(new NestedListProjectionUpdate(TOKEN, base, result, verified.impact, verified.plan));
    } catch { return projectionFailure("projection.invalid_update"); }
  }
}

/** @internal */
export function isOwnedNestedListProjectionUpdate(value: unknown): value is NestedListProjectionUpdate {
  return typeof value === "object" && value !== null && PLANS.has(value as NestedListProjectionUpdate);
}
/** @internal */
export function nestedListUpdatePlan(update: NestedListProjectionUpdate): NestedListUpdatePlan | undefined { return PLANS.get(update); }

/** Whole subtree equality includes heading ranks, typed inline properties and numbering. @internal */
export function nestedListRootsEqual(a: NestedListRootProjection, b: NestedListRootProjection): boolean {
  if (a.kind === "textBlock" || b.kind === "textBlock") return a.kind === "textBlock" && b.kind === "textBlock" && paragraphsEqual(a.block, b.block);
  return a.kind === b.kind && (a.kind !== "orderedList" || (b.kind === "orderedList" && a.start === b.start)) &&
    a.items.length === b.items.length && a.items.every((item, index) => b.items[index] !== undefined && paragraphsEqual(item.block, b.items[index]!.block) &&
      item.lists.length === b.items[index]!.lists.length && item.lists.every((list, section) =>
        b.items[index]!.lists[section] !== undefined && nestedListRootsEqual(list, b.items[index]!.lists[section]!)));
}

function verifyImpact(base: NestedListDocumentProjection, result: NestedListDocumentProjection, input: unknown): {impact: BaseProjectionImpact; plan: NestedListUpdatePlan} | null {
  const simple = exactDataRecord(input, ["kind"]);
  const kind = simple?.["kind"];
  if (kind === "root" || kind === "multipleOperations" || kind === "untrusted") return {
    impact: Object.freeze({kind}), plan: Object.freeze({kind: "full", reason: kind}),
  };
  const roots: Array<Readonly<{oldIndex: number; newIndex: number}>> = [];
  const retain = (oldIndex: number, newIndex: number): boolean => {
    const a = base.blocks[oldIndex], b = result.blocks[newIndex];
    if (a === undefined || b === undefined || !nestedListRootsEqual(a, b)) return false;
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

