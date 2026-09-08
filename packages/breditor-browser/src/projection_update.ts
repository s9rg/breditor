import {
  type BaseDocumentProjection,
  isOwnedProjection,
  paragraphsEqual,
  projectionsShareProfileBinding,
  snapshotsEqual,
} from "./projection.js";
import type { BrowserProjectionResult } from "./result.js";
import { projectionFailure, projectionSuccess } from "./result.js";

/** Half-open direct-root child range used by an exact root-splice impact. */
export interface RootChildRange {
  /** First paragraph index in the range. */
  readonly start: number;
  /** First paragraph index after the range. */
  readonly end: number;
}

/**
 * Renderer invalidation supplied by the semantic projection adapter.
 *
 * `none`, `textContainers`, and `rootSplice` are verified against the owned
 * base and result projections before any DOM identity is reused. Broader or
 * untrusted impacts always request a full projection.
 */
export type BaseProjectionImpact =
  | { readonly kind: "none" }
  | { readonly kind: "textContainers"; readonly paragraphIndexes: readonly number[] }
  | {
      readonly kind: "rootSplice";
      readonly oldRange: RootChildRange;
      readonly newRange: RootChildRange;
    }
  | { readonly kind: "root" }
  | { readonly kind: "multipleOperations" }
  | { readonly kind: "untrusted" };

/** Input accepted by {@link BaseProjectionUpdate.create}. */
export interface BaseProjectionUpdateInput {
  /** Exact currently rendered projection. */
  readonly base: BaseDocumentProjection;
  /** Exact post-publication projection to install. */
  readonly result: BaseDocumentProjection;
  /** Typed renderer invalidation derived from the published core event. */
  readonly impact: BaseProjectionImpact;
}

/** Why an otherwise valid update deliberately chose a full projection. */
export type FullProjectionReason = "root" | "multipleOperations" | "untrusted";

/** @internal */
export interface ParagraphReuse {
  readonly oldIndex: number;
  readonly newIndex: number;
  readonly content: "preserve" | "refresh";
}

/** @internal */
export type VerifiedUpdatePlan =
  | { readonly kind: "reuse"; readonly paragraphs: readonly ParagraphReuse[] }
  | { readonly kind: "full"; readonly reason: FullProjectionReason };

const CONSTRUCTION_TOKEN = Symbol("BaseProjectionUpdate construction");
const OWNED_UPDATES = new WeakSet<BaseProjectionUpdate>();
const VERIFIED_PLANS = new WeakMap<BaseProjectionUpdate, VerifiedUpdatePlan>();

/** A validated, immutable base/result projection transition. */
export class BaseProjectionUpdate {
  /** Exact currently rendered projection. */
  readonly base: BaseDocumentProjection;
  /** Exact result projection. */
  readonly result: BaseDocumentProjection;
  /** Frozen public invalidation description. */
  readonly impact: BaseProjectionImpact;

  private constructor(
    token: symbol,
    base: BaseDocumentProjection,
    result: BaseDocumentProjection,
    impact: BaseProjectionImpact,
    plan: VerifiedUpdatePlan,
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new TypeError("Use BaseProjectionUpdate.create().");
    }
    this.base = base;
    this.result = result;
    this.impact = impact;
    OWNED_UPDATES.add(this);
    VERIFIED_PLANS.set(this, plan);
    Object.freeze(this);
  }

  /**
   * Checks the exact base/result snapshot relationship and claimed impact.
   *
   * A false narrow-impact claim is rejected instead of silently mutating the
   * DOM. Explicit `root`, `multipleOperations`, and `untrusted` impacts remain
   * valid but carry a mandatory full-render plan.
   */
  static create(input: unknown): BrowserProjectionResult<BaseProjectionUpdate> {
    try {
      const record = exactDataRecord(input, ["base", "result", "impact"]);
      if (
        record === null ||
        !isOwnedProjection(record["base"]) ||
        !isOwnedProjection(record["result"])
      ) {
        return projectionFailure("projection.invalid_update");
      }
      const base = record["base"];
      const result = record["result"];
      if (
        base.schema.name !== result.schema.name ||
        base.schema.version !== result.schema.version ||
        base.schema.fingerprint !== result.schema.fingerprint ||
        !projectionsShareProfileBinding(base, result) ||
        base.snapshot.lineage !== result.snapshot.lineage ||
        snapshotsEqual(base.snapshot, result.snapshot) ||
        BigInt(base.snapshot.revision) === 18_446_744_073_709_551_615n ||
        BigInt(result.snapshot.revision) !== BigInt(base.snapshot.revision) + 1n
      ) {
        return projectionFailure("projection.invalid_update");
      }
      const verified = verifyImpact(base, result, record["impact"]);
      if (verified === null) {
        return projectionFailure("projection.invalid_update");
      }
      return projectionSuccess(
        new BaseProjectionUpdate(
          CONSTRUCTION_TOKEN,
          base,
          result,
          verified.impact,
          verified.plan,
        ),
      );
    } catch {
      return projectionFailure("projection.invalid_update");
    }
  }
}

/** @internal */
export function isOwnedProjectionUpdate(value: unknown): value is BaseProjectionUpdate {
  return typeof value === "object" && value !== null && OWNED_UPDATES.has(value as BaseProjectionUpdate);
}

/** @internal */
export function verifiedUpdatePlan(update: BaseProjectionUpdate): VerifiedUpdatePlan | undefined {
  return VERIFIED_PLANS.get(update);
}

interface VerifiedImpact {
  readonly impact: BaseProjectionImpact;
  readonly plan: VerifiedUpdatePlan;
}

function verifyImpact(
  base: BaseDocumentProjection,
  result: BaseDocumentProjection,
  input: unknown,
): VerifiedImpact | null {
  const kind = readImpactKind(input);
  switch (kind) {
    case "none":
      return verifyNone(base, result, input);
    case "textContainers":
      return verifyTextContainers(base, result, input);
    case "rootSplice":
      return verifyRootSplice(base, result, input);
    case "root":
    case "multipleOperations":
    case "untrusted": {
      if (exactDataRecord(input, ["kind"]) === null) {
        return null;
      }
      const impact = Object.freeze({ kind }) as BaseProjectionImpact;
      return {
        impact,
        plan: Object.freeze({ kind: "full", reason: kind }),
      };
    }
    default:
      return null;
  }
}

function verifyNone(
  base: BaseDocumentProjection,
  result: BaseDocumentProjection,
  input: unknown,
): VerifiedImpact | null {
  if (
    exactDataRecord(input, ["kind"]) === null ||
    base.paragraphs.length !== result.paragraphs.length
  ) {
    return null;
  }
  const reuse: ParagraphReuse[] = [];
  for (let index = 0; index < base.paragraphs.length; index += 1) {
    if (!paragraphsAtIndexesEqual(base, index, result, index)) {
      return null;
    }
    reuse.push(Object.freeze({ oldIndex: index, newIndex: index, content: "preserve" }));
  }
  return {
    impact: Object.freeze({ kind: "none" }),
    plan: freezeReusePlan(reuse),
  };
}

function verifyTextContainers(
  base: BaseDocumentProjection,
  result: BaseDocumentProjection,
  input: unknown,
): VerifiedImpact | null {
  const record = exactDataRecord(input, ["kind", "paragraphIndexes"]);
  if (
    record === null ||
    !Array.isArray(record["paragraphIndexes"]) ||
    record["paragraphIndexes"].length === 0 ||
    !Number.isSafeInteger(record["paragraphIndexes"].length) ||
    record["paragraphIndexes"].length > base.paragraphs.length ||
    base.paragraphs.length !== result.paragraphs.length
  ) {
    return null;
  }
  const affected: number[] = [];
  let prior = -1;
  for (let ordinal = 0; ordinal < record["paragraphIndexes"].length; ordinal += 1) {
    const index = record["paragraphIndexes"][ordinal];
    if (
      typeof index !== "number" ||
      !Number.isSafeInteger(index) ||
      index <= prior ||
      index < 0 ||
      index >= base.paragraphs.length
    ) {
      return null;
    }
    affected.push(index);
    prior = index;
  }
  const affectedSet = new Set(affected);
  const reuse: ParagraphReuse[] = [];
  for (let index = 0; index < base.paragraphs.length; index += 1) {
    if (affectedSet.has(index)) {
      reuse.push(Object.freeze({ oldIndex: index, newIndex: index, content: "refresh" }));
      continue;
    }
    if (!paragraphsAtIndexesEqual(base, index, result, index)) {
      return null;
    }
    reuse.push(Object.freeze({ oldIndex: index, newIndex: index, content: "preserve" }));
  }
  return {
    impact: Object.freeze({
      kind: "textContainers",
      paragraphIndexes: Object.freeze(affected),
    }),
    plan: freezeReusePlan(reuse),
  };
}

function verifyRootSplice(
  base: BaseDocumentProjection,
  result: BaseDocumentProjection,
  input: unknown,
): VerifiedImpact | null {
  const record = exactDataRecord(input, ["kind", "oldRange", "newRange"]);
  if (record === null) {
    return null;
  }
  const oldRange = readRange(record["oldRange"], base.paragraphs.length);
  const newRange = readRange(record["newRange"], result.paragraphs.length);
  if (
    oldRange === null ||
    newRange === null ||
    oldRange.start !== newRange.start ||
    base.paragraphs.length - oldRange.end !== result.paragraphs.length - newRange.end
  ) {
    return null;
  }

  const reuse: ParagraphReuse[] = [];
  for (let index = 0; index < oldRange.start; index += 1) {
    if (!paragraphsAtIndexesEqual(base, index, result, index)) {
      return null;
    }
    reuse.push(Object.freeze({ oldIndex: index, newIndex: index, content: "preserve" }));
  }
  const suffixLength = base.paragraphs.length - oldRange.end;
  for (let offset = 0; offset < suffixLength; offset += 1) {
    const oldIndex = oldRange.end + offset;
    const newIndex = newRange.end + offset;
    if (!paragraphsAtIndexesEqual(base, oldIndex, result, newIndex)) {
      return null;
    }
    reuse.push(Object.freeze({ oldIndex, newIndex, content: "preserve" }));
  }

  const frozenOldRange = Object.freeze(oldRange);
  const frozenNewRange = Object.freeze(newRange);
  return {
    impact: Object.freeze({
      kind: "rootSplice",
      oldRange: frozenOldRange,
      newRange: frozenNewRange,
    }),
    plan: freezeReusePlan(reuse),
  };
}

function readRange(input: unknown, paragraphCount: number): RootChildRange | null {
  const range = exactDataRecord(input, ["start", "end"]);
  if (
    range === null ||
    typeof range["start"] !== "number" ||
    typeof range["end"] !== "number" ||
    !Number.isSafeInteger(range["start"]) ||
    !Number.isSafeInteger(range["end"]) ||
    range["start"] < 0 ||
    range["start"] > range["end"] ||
    range["end"] > paragraphCount
  ) {
    return null;
  }
  return { start: range["start"], end: range["end"] };
}

function paragraphsAtIndexesEqual(
  base: BaseDocumentProjection,
  baseIndex: number,
  result: BaseDocumentProjection,
  resultIndex: number,
): boolean {
  const baseParagraph = base.paragraphs[baseIndex];
  const resultParagraph = result.paragraphs[resultIndex];
  return (
    baseParagraph !== undefined &&
    resultParagraph !== undefined &&
    paragraphsEqual(baseParagraph, resultParagraph)
  );
}

function freezeReusePlan(paragraphs: ParagraphReuse[]): VerifiedUpdatePlan {
  return Object.freeze({ kind: "reuse", paragraphs: Object.freeze(paragraphs) });
}

function readImpactKind(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(input, "kind");
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string")) {
    return null;
  }
  const record = input as Record<string, unknown>;
  for (const expectedKey of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, expectedKey);
    if (descriptor === undefined || !("value" in descriptor)) {
      return null;
    }
  }
  if (keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    return null;
  }
  return record;
}
