import {
  BaseDocumentProjection,
  createProfiledDocumentProjection,
  isOwnedProjection,
  projectionMatchesProfileGeneration as ownedProjectionMatchesProfileGeneration,
  projectionProfileDescriptor,
  type BaseDocumentProjectionInput,
  type ProfiledDocumentProjectionInput,
} from "./projection.js";
import { BaseProjectionUpdate, type BaseProjectionImpact } from "./projection_update.js";
import type { BrowserProjectionResult } from "./result.js";
import { projectionFailure } from "./result.js";
import { snapshotProtectedHandleArray } from "./protected_handle_snapshot.js";
import {
  browserCompiledProfileDescriptorMatchesGeneration,
  wasmProfileGenerationIsLive,
  wasmViewMatchesProfileGeneration,
  type BrowserCompiledProfileDescriptor,
  type WasmProfileCorrelatedView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

const PROJECTION_PROFILE_GENERATIONS = new WeakMap<
  BaseDocumentProjection,
  WasmProfileGenerationView
>();
const ACTIVE_GENERATED_CONSUMPTIONS = new WeakSet<object>();

/**
 * Dependency-free structural view of the flattened semantic Wasm projection.
 *
 * Generated Wasm classes satisfy this contract without becoming a package
 * dependency. The view is owned and consumed by this adapter.
 */
export interface SemanticProjectionView extends WasmProfileCorrelatedView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
  /** Validated schema name. */
  readonly schemaName: string;
  /** Validated schema version. */
  readonly schemaVersion: number;
  /** Exact durable fingerprint of the compiled schema. */
  readonly schemaFingerprint: string;
  /** Snapshot lineage. */
  readonly snapshotLineage: string;
  /** Canonical unsigned-decimal snapshot revision. */
  readonly snapshotRevision: string;
  /** Number of entries in the flattened preorder node array. */
  readonly nodeCount: number;
  /** Root entry index. */
  readonly rootIndex: number;
  /** Returns an entry's semantic kind. */
  nodeKind(index: number): "element" | "text" | undefined;
  /** Returns an element's qualified type, or `undefined` for text. */
  elementType(index: number): string | undefined;
  /** Returns an element child count, or `undefined` for text. */
  childCount(index: number): number | undefined;
  /** Returns one element child's flattened index. */
  childAt(index: number, ordinal: number): number | undefined;
  /** Returns a text leaf's contents, or `undefined` for elements. */
  text(index: number): string | undefined;
  /** Returns a text leaf's format count, or `undefined` for elements. */
  formatCount(index: number): number | undefined;
  /** Returns one text format's qualified type. */
  formatType(index: number, ordinal: number): string | undefined;
  /** Releases the consumed Wasm handle. */
  free(): void;
}

/** Semantic invalidation kinds exposed by the Wasm projection update. */
export type SemanticProjectionImpact = "none" | "textContainers" | "rootSplice" | "root";

/**
 * Dependency-free structural view of one owned Wasm projection update.
 *
 * The result projection can be taken exactly once. This adapter consumes both
 * the update and its taken result projection.
 */
export interface SemanticProjectionUpdateView extends WasmProfileCorrelatedView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
  /** Expected base lineage. */
  readonly baseLineage: string;
  /** Expected base revision. */
  readonly baseRevision: string;
  /** Result lineage. */
  readonly resultLineage: string;
  /** Result revision. */
  readonly resultRevision: string;
  /** Core-derived invalidation kind. */
  readonly impact: SemanticProjectionImpact;
  /** Number of exact paragraph indexes for `textContainers`. */
  readonly affectedParagraphCount: number;
  /** Old half-open root child range start for `rootSplice`. */
  readonly oldChildStart: number | undefined;
  /** Old half-open root child range end for `rootSplice`. */
  readonly oldChildEnd: number | undefined;
  /** New half-open root child range start for `rootSplice`. */
  readonly newChildStart: number | undefined;
  /** New half-open root child range end for `rootSplice`. */
  readonly newChildEnd: number | undefined;
  /** Returns one affected paragraph index. */
  affectedParagraphIndex(index: number): number | undefined;
  /** Takes the exact result projection once. */
  takeProjection(): SemanticProjectionView | undefined;
  /** Releases the consumed Wasm handle. */
  free(): void;
}

interface SemanticProjectionMethods {
  readonly nodeKind: SemanticProjectionView["nodeKind"];
  readonly elementType: SemanticProjectionView["elementType"];
  readonly childCount: SemanticProjectionView["childCount"];
  readonly childAt: SemanticProjectionView["childAt"];
  readonly text: SemanticProjectionView["text"];
  readonly formatCount: SemanticProjectionView["formatCount"];
  readonly formatType: SemanticProjectionView["formatType"];
}

interface SemanticProjectionScalars {
  readonly schemaName: unknown;
  readonly schemaVersion: unknown;
  readonly schemaFingerprint: unknown;
  readonly snapshotLineage: unknown;
  readonly snapshotRevision: unknown;
  readonly nodeCount: unknown;
  readonly rootIndex: unknown;
}

interface SemanticProjectionSnapshot extends SemanticProjectionScalars {
  readonly methods: SemanticProjectionMethods;
}

interface SemanticProjectionUpdateMethods {
  readonly affectedParagraphIndex: SemanticProjectionUpdateView["affectedParagraphIndex"];
  readonly takeProjection: SemanticProjectionUpdateView["takeProjection"];
}

interface SemanticProjectionUpdateSnapshot {
  readonly baseLineage: unknown;
  readonly baseRevision: unknown;
  readonly resultLineage: unknown;
  readonly resultRevision: unknown;
  readonly impact: unknown;
  readonly affectedParagraphCount: unknown;
  readonly oldChildStart: unknown;
  readonly oldChildEnd: unknown;
  readonly newChildStart: unknown;
  readonly newChildEnd: unknown;
  readonly methods: SemanticProjectionUpdateMethods;
}

/**
 * Consumes a flattened Wasm semantic view into an owned base projection.
 *
 * The flattened tree must be exact preorder base-schema structure. The view is
 * freed on every path, including malformed raw-JavaScript inputs.
 */
export function consumeSemanticProjection(
  view: SemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<BaseDocumentProjection> {
  const identity = objectIdentity(view);
  if (identity === null || ACTIVE_GENERATED_CONSUMPTIONS.has(identity)) {
    return projectionFailure("projection.invalid_shape");
  }
  ACTIVE_GENERATED_CONSUMPTIONS.add(identity);
  try {
    return consumeSemanticProjectionUnlocked(view, generation, expectedProfile);
  } finally {
    ACTIVE_GENERATED_CONSUMPTIONS.delete(identity);
  }
}

function consumeSemanticProjectionUnlocked(
  view: SemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<BaseDocumentProjection> {
  if ((view as unknown) === generation) {
    return projectionFailure("projection.invalid_shape");
  }
  const cleanup = snapshotGeneratedCleanup(view);
  const asynchronous = containGeneratedThenable(view);
  if (cleanup === null) {
    return projectionFailure("projection.invalid_shape");
  }
  let result: BrowserProjectionResult<BaseDocumentProjection> = projectionFailure(
    "projection.invalid_shape",
  );
  try {
    result = asynchronous
      ? projectionFailure("projection.invalid_shape")
      : readProfiledSemanticProjection(view, generation, expectedProfile);
  } catch {
    result = projectionFailure("projection.invalid_shape");
  } finally {
    if (!runGeneratedCleanup(cleanup)) {
      result = projectionFailure("projection.invalid_shape");
    }
  }
  return result;
}

/**
 * Consumes a Wasm update against one exact owned browser projection.
 *
 * The adapter verifies duplicated base/result snapshot fields, maps the closed
 * impact enum, takes and consumes the result projection, and then lets
 * {@link BaseProjectionUpdate.create} prove every claimed reusable paragraph.
 * Owning adapters may supply outer generated handles as identity-only guards;
 * a nested alias is rejected without reading or freeing the protected owner.
 */
export function consumeSemanticProjectionUpdate(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[] = [],
): BrowserProjectionResult<BaseProjectionUpdate> {
  const identity = objectIdentity(view);
  if (identity === null || ACTIVE_GENERATED_CONSUMPTIONS.has(identity)) {
    return projectionFailure("projection.invalid_update");
  }
  ACTIVE_GENERATED_CONSUMPTIONS.add(identity);
  try {
    return consumeSemanticProjectionUpdateUnlocked(
      base,
      view,
      generation,
      expectedProfile,
      protectedHandles,
    );
  } finally {
    ACTIVE_GENERATED_CONSUMPTIONS.delete(identity);
  }
}

function consumeSemanticProjectionUpdateUnlocked(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[],
): BrowserProjectionResult<BaseProjectionUpdate> {
  const protectedSet = snapshotProtectedHandleArray(protectedHandles, generation);
  if (protectedSet === null || protectedSet.has(view)) {
    return projectionFailure("projection.invalid_update");
  }
  const cleanup = snapshotGeneratedCleanup(view);
  const asynchronous = containGeneratedThenable(view);
  if (cleanup === null) {
    return projectionFailure("projection.invalid_update");
  }
  return consumeClaimedSemanticProjectionUpdate(
    base,
    view,
    generation,
    expectedProfile,
    cleanup,
    protectedSet,
    asynchronous,
  );
}

/** Consumes an update using cleanup captured by its outer owner. @internal */
export function consumeSemanticProjectionUpdateWithCleanup(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  cleanup: () => unknown,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[] = [],
): BrowserProjectionResult<BaseProjectionUpdate> {
  const identity = objectIdentity(view);
  if (identity === null || ACTIVE_GENERATED_CONSUMPTIONS.has(identity)) {
    return projectionFailure("projection.invalid_update");
  }
  ACTIVE_GENERATED_CONSUMPTIONS.add(identity);
  try {
    return consumeSemanticProjectionUpdateWithCleanupUnlocked(
      base,
      view,
      cleanup,
      generation,
      expectedProfile,
      protectedHandles,
    );
  } finally {
    ACTIVE_GENERATED_CONSUMPTIONS.delete(identity);
  }
}

function consumeSemanticProjectionUpdateWithCleanupUnlocked(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  cleanup: () => unknown,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[],
): BrowserProjectionResult<BaseProjectionUpdate> {
  const protectedSet = snapshotProtectedHandleArray(protectedHandles, generation);
  if (protectedSet === null || protectedSet.has(view)) {
    return projectionFailure("projection.invalid_update");
  }
  return consumeClaimedSemanticProjectionUpdate(
    base,
    view,
    generation,
    expectedProfile,
    cleanup,
    protectedSet,
    containGeneratedThenable(view),
  );
}

function objectIdentity(value: unknown): object | null {
  return (typeof value === "object" && value !== null) || typeof value === "function"
    ? value as object
    : null;
}

/** Whether a consumed projection belongs to one exact process-local profile. @internal */
export function projectionMatchesProfileGeneration(
  projection: BaseDocumentProjection,
  generation: WasmProfileGenerationView,
): boolean {
  return ownedProjectionMatchesProfileGeneration(projection, generation) ||
    PROJECTION_PROFILE_GENERATIONS.get(projection) === generation;
}

/** Associates an already validated browser projection with an opaque profile. @internal */
export function associateProjectionWithProfileGeneration(
  projection: BaseDocumentProjection,
  generation: WasmProfileGenerationView,
): void {
  if (!isOwnedProjection(projection) || !wasmProfileGenerationIsLive(generation)) {
    throw new TypeError("projection profile association is invalid");
  }
  const prior = PROJECTION_PROFILE_GENERATIONS.get(projection);
  if (projectionProfileDescriptor(projection) !== undefined) {
    throw new TypeError("profiled projection owns its generation binding");
  }
  if (prior !== undefined && prior !== generation) {
    throw new TypeError("projection already belongs to another profile generation");
  }
  PROJECTION_PROFILE_GENERATIONS.set(projection, generation);
}

function consumeClaimedSemanticProjectionUpdate(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  cleanup: () => unknown,
  protectedHandles: ReadonlySet<object>,
  asynchronous: boolean,
): BrowserProjectionResult<BaseProjectionUpdate> {
  let result: BrowserProjectionResult<BaseProjectionUpdate> = projectionFailure(
    "projection.invalid_update",
  );
  try {
    result = asynchronous
      ? projectionFailure("projection.invalid_update")
      : readProfiledSemanticProjectionUpdate(
          base,
          view,
          generation,
          expectedProfile,
          protectedHandles,
        );
  } catch {
    result = projectionFailure("projection.invalid_update");
  } finally {
    if (!runGeneratedCleanup(cleanup)) {
      result = projectionFailure("projection.invalid_update");
    }
  }
  return result;
}

function runGeneratedCleanup(cleanup: () => unknown): boolean {
  try {
    const returned = cleanup();
    if (returned === undefined) return true;
    containGeneratedSettlement(returned);
    return false;
  } catch {
    return false;
  }
}

function snapshotGeneratedCleanup(value: unknown): (() => unknown) | null {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return null;
  }
  try {
    const free = (value as { free?: unknown }).free;
    if (typeof free !== "function") return null;
    const receiver = value;
    return () => Reflect.apply(free, receiver, []) as unknown;
  } catch {
    return null;
  }
}

function containGeneratedThenable(value: unknown): boolean {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false;
  }
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  containGeneratedSettlement(value);
  return true;
}

const GENERATED_PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const GENERATED_PROMISE_THEN = Promise.prototype.then;
const IGNORE_GENERATED_SETTLEMENT = (): undefined => undefined;

function containGeneratedSettlement(value: unknown): void {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return;
  }
  try {
    const settled = GENERATED_PROMISE_RESOLVE(value);
    Reflect.apply(GENERATED_PROMISE_THEN, settled, [
      IGNORE_GENERATED_SETTLEMENT,
      IGNORE_GENERATED_SETTLEMENT,
    ]);
  } catch {
    // The value is still rejected as an asynchronous generated handle.
  }
}

function readProfiledSemanticProjection(
  view: SemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<BaseDocumentProjection> {
  if (
    !wasmProfileGenerationIsLive(generation) ||
    (typeof expectedProfile !== "string" &&
      !browserCompiledProfileDescriptorMatchesGeneration(
        expectedProfile,
        generation,
      )) ||
    !wasmViewMatchesProfileGeneration(view, generation) ||
    !wasmProfileGenerationIsLive(generation)
  ) {
    return projectionFailure("projection.invalid_shape");
  }
  const expectedSchemaFingerprint = typeof expectedProfile === "string"
    ? expectedProfile
    : expectedProfile.schema.fingerprint;
  if (
    !isSchemaFingerprint(expectedSchemaFingerprint)
  ) {
    return projectionFailure("projection.invalid_shape");
  }
  const snapshot = snapshotSemanticProjection(view);
  if (
    snapshot === null ||
    snapshot.schemaFingerprint !== expectedSchemaFingerprint
  ) {
    return projectionFailure("projection.invalid_shape");
  }
  const result = readSemanticProjection(
    view,
    snapshot,
    generation,
    expectedProfile,
  );
  if (result.ok && typeof expectedProfile === "string") {
    PROJECTION_PROFILE_GENERATIONS.set(result.value, generation);
  }
  return result;
}

function readSemanticProjection(
  view: SemanticProjectionView,
  snapshot: SemanticProjectionSnapshot,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<BaseDocumentProjection> {
  const {
    schemaName,
    schemaVersion,
    snapshotLineage,
    snapshotRevision,
    nodeCount,
    rootIndex,
    methods,
  } = snapshot;
  if (
    !schemaMatchesExpectedProfile(schemaName, schemaVersion, expectedProfile) ||
    typeof schemaName !== "string" ||
    typeof schemaVersion !== "number" ||
    typeof snapshotLineage !== "string" ||
    typeof snapshotRevision !== "string" ||
    typeof nodeCount !== "number" ||
    !isIndex(nodeCount) ||
    nodeCount < 2 ||
    nodeCount > 100_000 ||
    rootIndex !== 0 ||
    invokeGenerated(methods.nodeKind, view, 0) !== "element" ||
    invokeGenerated(methods.elementType, view, 0) !== "breditor/document" ||
    invokeGenerated(methods.text, view, 0) !== undefined ||
    invokeGenerated(methods.formatCount, view, 0) !== undefined ||
    invokeGenerated(methods.formatType, view, 0, 0) !== undefined
  ) {
    return projectionFailure("projection.invalid_shape");
  }
  const paragraphCount = invokeGenerated(methods.childCount, view, 0);
  if (
    paragraphCount === undefined ||
    !isIndex(paragraphCount) ||
    paragraphCount === 0 ||
    paragraphCount > 10_000 ||
    paragraphCount > nodeCount - 1
  ) {
    return projectionFailure("projection.invalid_shape");
  }

  const admittedFormats = typeof expectedProfile === "string"
    ? new Set(["breditor/strong"])
    : new Set(expectedProfile.formats.map((format) => format.kind));
  const paragraphs: Array<{
    runs: Array<{ text: string; strong: boolean; formats: string[] }>;
  }> = [];
  let expectedIndex = 1;
  for (let paragraphOrdinal = 0; paragraphOrdinal < paragraphCount; paragraphOrdinal += 1) {
    if (expectedIndex >= nodeCount) {
      return projectionFailure("projection.invalid_shape");
    }
    const paragraphIndex = invokeGenerated(
      methods.childAt,
      view,
      0,
      paragraphOrdinal,
    );
    if (
      paragraphIndex !== expectedIndex ||
      invokeGenerated(methods.nodeKind, view, paragraphIndex) !== "element" ||
      invokeGenerated(methods.elementType, view, paragraphIndex) !== "breditor/paragraph" ||
      invokeGenerated(methods.text, view, paragraphIndex) !== undefined ||
      invokeGenerated(methods.formatCount, view, paragraphIndex) !== undefined ||
      invokeGenerated(methods.formatType, view, paragraphIndex, 0) !== undefined
    ) {
      return projectionFailure("projection.invalid_shape");
    }
    expectedIndex += 1;
    const runCount = invokeGenerated(methods.childCount, view, paragraphIndex);
    if (
      runCount === undefined ||
      !isIndex(runCount) ||
      runCount > 10_000 ||
      runCount > nodeCount - expectedIndex
    ) {
      return projectionFailure("projection.invalid_shape");
    }
    const runs: Array<{ text: string; strong: boolean; formats: string[] }> = [];
    for (let runOrdinal = 0; runOrdinal < runCount; runOrdinal += 1) {
      const runIndex = invokeGenerated(
        methods.childAt,
        view,
        paragraphIndex,
        runOrdinal,
      );
      if (
        runIndex !== expectedIndex ||
        invokeGenerated(methods.nodeKind, view, runIndex) !== "text" ||
        invokeGenerated(methods.elementType, view, runIndex) !== undefined ||
        invokeGenerated(methods.childCount, view, runIndex) !== undefined ||
        invokeGenerated(methods.childAt, view, runIndex, 0) !== undefined
      ) {
        return projectionFailure("projection.invalid_shape");
      }
      expectedIndex += 1;
      const text = invokeGenerated(methods.text, view, runIndex);
      const formatCount = invokeGenerated(methods.formatCount, view, runIndex);
      if (
        typeof text !== "string" ||
        formatCount === undefined ||
        !isIndex(formatCount) ||
        formatCount > 32
      ) {
        return projectionFailure("projection.invalid_shape");
      }
      const formats: string[] = [];
      let previousFormat: string | undefined;
      for (let formatIndex = 0; formatIndex < formatCount; formatIndex += 1) {
        const format = invokeGenerated(
          methods.formatType,
          view,
          runIndex,
          formatIndex,
        );
        if (
          typeof format !== "string" ||
          !admittedFormats.has(format) ||
          (previousFormat !== undefined && previousFormat >= format)
        ) {
          return projectionFailure("projection.invalid_shape");
        }
        formats.push(format);
        previousFormat = format;
      }
      if (invokeGenerated(methods.formatType, view, runIndex, formatCount) !== undefined) {
        return projectionFailure("projection.invalid_shape");
      }
      const strong = formats.includes("breditor/strong");
      if (typeof expectedProfile === "string" && formats.length !== (strong ? 1 : 0)) {
        return projectionFailure("projection.invalid_shape");
      }
      runs.push({ text, strong, formats });
    }
    if (invokeGenerated(methods.childAt, view, paragraphIndex, runCount) !== undefined) {
      return projectionFailure("projection.invalid_shape");
    }
    paragraphs.push({ runs });
  }
  if (
    expectedIndex !== nodeCount ||
    invokeGenerated(methods.childAt, view, 0, paragraphCount) !== undefined ||
    invokeGenerated(methods.nodeKind, view, nodeCount) !== undefined ||
    invokeGenerated(methods.elementType, view, nodeCount) !== undefined ||
    invokeGenerated(methods.childCount, view, nodeCount) !== undefined ||
    invokeGenerated(methods.childAt, view, nodeCount, 0) !== undefined ||
    invokeGenerated(methods.text, view, nodeCount) !== undefined ||
    invokeGenerated(methods.formatCount, view, nodeCount) !== undefined ||
    invokeGenerated(methods.formatType, view, nodeCount, 0) !== undefined
  ) {
    return projectionFailure("projection.invalid_shape");
  }

  if (typeof expectedProfile === "string") {
    const input: BaseDocumentProjectionInput = {
      schema: { name: schemaName, version: schemaVersion },
      snapshot: { lineage: snapshotLineage, revision: snapshotRevision },
      paragraphs: paragraphs.map((paragraph) => ({
        runs: paragraph.runs.map((run) => ({ text: run.text, strong: run.strong })),
      })),
    };
    return BaseDocumentProjection.create(input);
  }
  const input: ProfiledDocumentProjectionInput = {
    schema: {
      name: schemaName,
      version: schemaVersion,
      fingerprint: expectedProfile.schema.fingerprint,
    },
    snapshot: { lineage: snapshotLineage, revision: snapshotRevision },
    paragraphs: paragraphs.map((paragraph) => ({
      runs: paragraph.runs.map((run) => ({ text: run.text, formats: run.formats })),
    })),
  };
  return createProfiledDocumentProjection(input, generation, expectedProfile);
}

function readProfiledSemanticProjectionUpdate(
  base: BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: ReadonlySet<object>,
): BrowserProjectionResult<BaseProjectionUpdate> {
  if (
    !wasmProfileGenerationIsLive(generation) ||
    !projectionMatchesProfileGeneration(base, generation) ||
    (typeof expectedProfile === "string"
      ? projectionProfileDescriptor(base) !== undefined
      : projectionProfileDescriptor(base) !== expectedProfile ||
        !browserCompiledProfileDescriptorMatchesGeneration(
          expectedProfile,
          generation,
        )) ||
    !wasmViewMatchesProfileGeneration(view, generation) ||
    !wasmProfileGenerationIsLive(generation)
  ) {
    return projectionFailure("projection.invalid_update");
  }
  const snapshot = snapshotSemanticProjectionUpdate(view);
  if (snapshot === null) {
    return projectionFailure("projection.invalid_update");
  }
  const { affectedParagraphCount } = snapshot;
  if (
    snapshot.baseLineage !== base.snapshot.lineage ||
    snapshot.baseRevision !== base.snapshot.revision ||
    typeof affectedParagraphCount !== "number" ||
    !isIndex(affectedParagraphCount) ||
    affectedParagraphCount > 10_000
  ) {
    return projectionFailure("projection.invalid_update");
  }
  const impact = readSemanticImpact(view, snapshot, affectedParagraphCount);
  if (impact === null) {
    return projectionFailure("projection.invalid_update");
  }
  const resultView = invokeGenerated(snapshot.methods.takeProjection, view);
  if (resultView === undefined) {
    return projectionFailure("projection.invalid_update");
  }
  // `takeProjection` crosses a second generated-handle boundary. A hostile or
  // corrupted wrapper must not smuggle an outer owner into the projection
  // consumer, whose normal contract is to free the value it receives.
  if (
    (resultView as unknown) === view ||
    protectedHandles.has(resultView)
  ) {
    return projectionFailure("projection.invalid_update");
  }
  const projectionResult = consumeSemanticProjection(
    resultView,
    generation,
    expectedProfile,
  );
  if (!projectionResult.ok) {
    return projectionFailure("projection.invalid_update");
  }
  const projection = projectionResult.value;
  if (
    projection.snapshot.lineage !== snapshot.resultLineage ||
    projection.snapshot.revision !== snapshot.resultRevision
  ) {
    return projectionFailure("projection.invalid_update");
  }
  return BaseProjectionUpdate.create({ base, result: projection, impact });
}

function readSemanticImpact(
  view: SemanticProjectionUpdateView,
  snapshot: SemanticProjectionUpdateSnapshot,
  affectedParagraphCount: number,
): BaseProjectionImpact | null {
  switch (snapshot.impact) {
    case "none":
      return noRangesAndNoParagraphs(view, snapshot, affectedParagraphCount)
        ? { kind: "none" }
        : null;
    case "textContainers": {
      if (!rangesAbsent(snapshot) || affectedParagraphCount === 0) {
        return null;
      }
      const paragraphIndexes: number[] = [];
      for (let ordinal = 0; ordinal < affectedParagraphCount; ordinal += 1) {
        const paragraphIndex = invokeGenerated(
          snapshot.methods.affectedParagraphIndex,
          view,
          ordinal,
        );
        if (paragraphIndex === undefined || !isIndex(paragraphIndex)) {
          return null;
        }
        paragraphIndexes.push(paragraphIndex);
      }
      if (
        invokeGenerated(
          snapshot.methods.affectedParagraphIndex,
          view,
          affectedParagraphCount,
        ) !== undefined
      ) {
        return null;
      }
      return { kind: "textContainers", paragraphIndexes };
    }
    case "rootSplice": {
      if (
        affectedParagraphCount !== 0 ||
        invokeGenerated(snapshot.methods.affectedParagraphIndex, view, 0) !== undefined
      ) {
        return null;
      }
      const { oldChildStart, oldChildEnd, newChildStart, newChildEnd } = snapshot;
      if (
        typeof oldChildStart !== "number" ||
        typeof oldChildEnd !== "number" ||
        typeof newChildStart !== "number" ||
        typeof newChildEnd !== "number"
      ) {
        return null;
      }
      return {
        kind: "rootSplice",
        oldRange: { start: oldChildStart, end: oldChildEnd },
        newRange: { start: newChildStart, end: newChildEnd },
      };
    }
    case "root":
      return noRangesAndNoParagraphs(view, snapshot, affectedParagraphCount)
        ? { kind: "root" }
        : null;
    default:
      return null;
  }
}

function noRangesAndNoParagraphs(
  view: SemanticProjectionUpdateView,
  snapshot: SemanticProjectionUpdateSnapshot,
  affectedParagraphCount: number,
): boolean {
  return (
    affectedParagraphCount === 0 &&
    invokeGenerated(snapshot.methods.affectedParagraphIndex, view, 0) === undefined &&
    rangesAbsent(snapshot)
  );
}

function rangesAbsent(snapshot: SemanticProjectionUpdateSnapshot): boolean {
  return (
    snapshot.oldChildStart === undefined &&
    snapshot.oldChildEnd === undefined &&
    snapshot.newChildStart === undefined &&
    snapshot.newChildEnd === undefined
  );
}

function isIndex(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isSchemaFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function schemaMatchesExpectedProfile(
  name: unknown,
  version: unknown,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
): boolean {
  return typeof expectedProfile === "string"
    ? name === "breditor/base" && version === 1
    : name === expectedProfile.schema.name &&
        version === expectedProfile.schema.version;
}

function snapshotSemanticProjection(
  view: SemanticProjectionView,
): SemanticProjectionSnapshot | null {
  try {
    const nodeKind = readProjectionMethod(view, "nodeKind");
    const elementType = readProjectionMethod(view, "elementType");
    const childCount = readProjectionMethod(view, "childCount");
    const childAt = readProjectionMethod(view, "childAt");
    const text = readProjectionMethod(view, "text");
    const formatCount = readProjectionMethod(view, "formatCount");
    const formatType = readProjectionMethod(view, "formatType");
    if (
      nodeKind === null ||
      elementType === null ||
      childCount === null ||
      childAt === null ||
      text === null ||
      formatCount === null ||
      formatType === null
    ) {
      return null;
    }
    return {
      schemaName: readGeneratedScalar(view, "schemaName"),
      schemaVersion: readGeneratedScalar(view, "schemaVersion"),
      schemaFingerprint: readGeneratedScalar(view, "schemaFingerprint"),
      snapshotLineage: readGeneratedScalar(view, "snapshotLineage"),
      snapshotRevision: readGeneratedScalar(view, "snapshotRevision"),
      nodeCount: readGeneratedScalar(view, "nodeCount"),
      rootIndex: readGeneratedScalar(view, "rootIndex"),
      methods: {
        nodeKind,
        elementType,
        childCount,
        childAt,
        text,
        formatCount,
        formatType,
      },
    };
  } catch {
    return null;
  }
}

function readProjectionMethod<TKey extends keyof SemanticProjectionMethods>(
  view: SemanticProjectionView,
  key: TKey,
): SemanticProjectionMethods[TKey] | null {
  const method = Reflect.get(view, key, view) as unknown;
  return typeof method === "function" && !containGeneratedThenable(method)
    ? method as SemanticProjectionMethods[TKey]
    : null;
}

function readGeneratedScalar(view: object, key: string): unknown {
  const value = Reflect.get(view, key, view);
  if (containGeneratedThenable(value)) {
    throw new TypeError("generated scalar getter returned a thenable");
  }
  return value;
}

function invokeGenerated<TArgs extends unknown[], TResult>(
  method: (...args: TArgs) => TResult,
  receiver: object,
  ...args: TArgs
): TResult {
  const value = Reflect.apply(method, receiver, args) as TResult;
  if (containGeneratedThenable(value)) {
    throw new TypeError("generated scalar method returned a thenable");
  }
  return value;
}

function snapshotSemanticProjectionUpdate(
  view: SemanticProjectionUpdateView,
): SemanticProjectionUpdateSnapshot | null {
  try {
    const affectedParagraphIndex = readUpdateMethod(
      view,
      "affectedParagraphIndex",
    );
    const takeProjection = readUpdateMethod(view, "takeProjection");
    if (affectedParagraphIndex === null || takeProjection === null) return null;
    return {
      baseLineage: readGeneratedScalar(view, "baseLineage"),
      baseRevision: readGeneratedScalar(view, "baseRevision"),
      resultLineage: readGeneratedScalar(view, "resultLineage"),
      resultRevision: readGeneratedScalar(view, "resultRevision"),
      impact: readGeneratedScalar(view, "impact"),
      affectedParagraphCount: readGeneratedScalar(view, "affectedParagraphCount"),
      oldChildStart: readGeneratedScalar(view, "oldChildStart"),
      oldChildEnd: readGeneratedScalar(view, "oldChildEnd"),
      newChildStart: readGeneratedScalar(view, "newChildStart"),
      newChildEnd: readGeneratedScalar(view, "newChildEnd"),
      methods: { affectedParagraphIndex, takeProjection },
    };
  } catch {
    return null;
  }
}

function readUpdateMethod<TKey extends keyof SemanticProjectionUpdateMethods>(
  view: SemanticProjectionUpdateView,
  key: TKey,
): SemanticProjectionUpdateMethods[TKey] | null {
  const method = Reflect.get(view, key, view) as unknown;
  return typeof method === "function" && !containGeneratedThenable(method)
    ? method as SemanticProjectionUpdateMethods[TKey]
    : null;
}
