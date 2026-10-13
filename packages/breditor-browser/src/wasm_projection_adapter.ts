import {
  BaseDocumentProjection,
  createProfiledDocumentProjection,
  createTextBlockDocumentProjection,
  isHeadingProjectionLevel,
  type HeadingProjectionLevel,
  isOwnedProjection,
  projectionMatchesProfileGeneration as ownedProjectionMatchesProfileGeneration,
  projectionProfileDescriptor,
  type BaseDocumentProjectionInput,
  type InlineFormatProjection,
  type InlineFormatPropertyProjection,
  type ProfiledDocumentProjectionInput,
} from "./projection.js";
import { BaseProjectionUpdate, type BaseProjectionImpact } from "./projection_update.js";
import { createFlatListTextProjection, FlatListDocumentProjection, flatListProjectionDescriptor, flatListProjectionMatchesProfileGeneration, isOwnedFlatListProjection, type FlatListRootShape } from "./flat_list_projection.js";
import { createNestedListTextProjection, NestedListDocumentProjection, isOwnedNestedListProjection, nestedListProjectionDescriptor, nestedListProjectionMatchesProfileGeneration, type NestedListRootShape } from "./nested_list_projection.js";
import type { BrowserProjectionResult } from "./result.js";
import { projectionFailure } from "./result.js";
import { snapshotProtectedHandleArray } from "./protected_handle_snapshot.js";
import { decodeProjectionIntegerWords, decodeProjectionScalarWords } from "./projection_scalar_words.js";
import { snapshotNestedProjectionWordFacade } from "./wasm_projection_word_facade.js";
import { projectionU32sEqual } from "./projection_u32_identity.js";
import {
  browserCompiledProfileDescriptorMatchesGeneration,
  wasmProfileGenerationIsLive,
  wasmViewMatchesProfileGeneration,
  type BrowserCompiledProfileDescriptor,
  type WasmProfileCorrelatedView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

import { FlatListProjectionUpdate } from "./flat_list_projection_update.js";
import { NestedListProjectionUpdate } from "./nested_list_projection_update.js";
type UpdateBase = BaseDocumentProjection | FlatListDocumentProjection | NestedListDocumentProjection | undefined;
type ProjectionUpdate = BaseProjectionUpdate | FlatListProjectionUpdate | NestedListProjectionUpdate;

type TextBlockProjectionFactory = typeof createTextBlockDocumentProjection;
const TEXT_BLOCK_FACTORIES = new WeakMap<BaseDocumentProjection, TextBlockProjectionFactory>();

const PROJECTION_PROFILE_GENERATIONS = new WeakMap<
  BaseDocumentProjection,
  WasmProfileGenerationView
>();
// Updates retain their consumed child through parent cleanup/final admission.
// A standalone projection has no child. Entries are released only by the owner.
const ACTIVE_GENERATED_CONSUMPTIONS = new WeakMap<object, object | undefined>();
const MAX_PROJECTED_PROPERTIES_PER_FORMAT = 32;
const MAX_PROJECTED_PROPERTY_VALUES = 10_000;
const MAX_PROJECTED_PROPERTY_STRING_BYTES = 65_536;
const MAX_PROJECTED_TOTAL_PROPERTY_STRING_BYTES = 1024 * 1024;

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
  /** Returns one text format's canonical property count. */
  formatPropertyCount(index: number, formatOrdinal: number): number | undefined;
  /** Returns one canonical qualified property name. */
  formatPropertyName(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): string | undefined;
  /** Returns one property's closed scalar kind. */
  formatPropertyValueKind(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): "boolean" | "integer" | "string" | undefined;
  /** Returns one Boolean property value and no other property kind. */
  formatPropertyBoolean(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): boolean | undefined;
  /** Returns one exactly representable integer property value. */
  formatPropertyInteger(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): number | undefined;
  /** Returns one string property value and no other property kind. */
  formatPropertyString(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): string | undefined;
  /** Releases the consumed Wasm handle. */
  free(): void;
}

/** Opt-in heading projection surface. */
export interface TextBlockSemanticProjectionView extends SemanticProjectionView {
  headingLevel(index: number): number | undefined;
}

/** Opt-in flat-list surface; metadata is absent on every unrelated node. */
export interface FlatListSemanticProjectionView extends TextBlockSemanticProjectionView {
  listKind(index: number): "bullet" | "ordered" | undefined;
  orderedListStart(index: number): number | undefined;
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
  readonly listKind: FlatListSemanticProjectionView["listKind"] | undefined;
  readonly orderedListStart: FlatListSemanticProjectionView["orderedListStart"] | undefined;
  readonly headingLevel: TextBlockSemanticProjectionView["headingLevel"] | undefined;
  readonly nodeKind: SemanticProjectionView["nodeKind"];
  readonly elementType: SemanticProjectionView["elementType"];
  readonly childCount: SemanticProjectionView["childCount"];
  readonly childAt: SemanticProjectionView["childAt"];
  readonly text: SemanticProjectionView["text"];
  readonly formatCount: SemanticProjectionView["formatCount"];
  readonly formatType: SemanticProjectionView["formatType"];
  readonly formatPropertyCount: SemanticProjectionView["formatPropertyCount"];
  readonly formatPropertyName: SemanticProjectionView["formatPropertyName"];
  readonly formatPropertyValueKind: SemanticProjectionView["formatPropertyValueKind"];
  readonly formatPropertyBoolean: SemanticProjectionView["formatPropertyBoolean"];
  readonly formatPropertyInteger: SemanticProjectionView["formatPropertyInteger"];
  readonly formatPropertyString: SemanticProjectionView["formatPropertyString"];
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
  return consumeProjection(view, generation, expectedProfile, undefined);
}

/** Consumes an explicit heading-capable view. */
export function consumeTextBlockSemanticProjection(
  view: TextBlockSemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<BaseDocumentProjection> {
  return consumeProjection(view, generation, expectedProfile, createTextBlockDocumentProjection);
}

/** Consumes and frees one list-capable handle, returning real hierarchical AST paths. */
export function consumeFlatListSemanticProjection(
  view: FlatListSemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<FlatListDocumentProjection> {
  const text = consumeProjection(view, generation, expectedProfile, createFlatListTextProjection);
  return text.ok ? FlatListDocumentProjection.fromValidatedText(text.value) : text;
}

/** Consumes one list-capable handle with recursive shape and exact preorder proof. */
export function consumeNestedListSemanticProjection(
  view: FlatListSemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<NestedListDocumentProjection> {
  const text = consumeProjection(view, generation, expectedProfile, createNestedListTextProjection);
  return text.ok ? NestedListDocumentProjection.fromValidatedText(text.value) : text;
}

function consumeProjection(
  view: SemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  textBlockFactory: TextBlockProjectionFactory | undefined,
): BrowserProjectionResult<BaseDocumentProjection> {
  const identity = objectIdentity(view);
  if (identity === null || ACTIVE_GENERATED_CONSUMPTIONS.has(identity)) {
    return projectionFailure("projection.invalid_shape");
  }
  ACTIVE_GENERATED_CONSUMPTIONS.set(identity, undefined);
  try {
    return consumeSemanticProjectionUnlocked(view, generation, expectedProfile, textBlockFactory);
  } finally {
    releaseGeneratedConsumption(identity);
  }
}

function consumeSemanticProjectionUnlocked(
  view: SemanticProjectionView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  textBlockFactory: TextBlockProjectionFactory | undefined = undefined,
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
      : readProfiledSemanticProjection(view, generation, expectedProfile, textBlockFactory);
  } catch {
    result = projectionFailure("projection.invalid_shape");
  } finally {
    if (!runGeneratedCleanup(cleanup)) {
      result = projectionFailure("projection.invalid_shape");
    }
  }
  // Validate after cleanup too: foreign destructors may retire the generation.
  return result.ok && !wasmProfileGenerationIsLive(generation)
    ? projectionFailure("projection.invalid_shape")
    : result;
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
  return consumeProjectionUpdate(isOwnedProjection(base) ? base : undefined, view, generation, expectedProfile, protectedHandles) as BrowserProjectionResult<BaseProjectionUpdate>;
}

/** Consumes a list update without rereading the outer owner's captured free method. @internal */
export function consumeFlatListSemanticProjectionUpdateWithCleanup(base: FlatListDocumentProjection,
  view: SemanticProjectionUpdateView, cleanup: () => unknown, generation: WasmProfileGenerationView,
  expectedProfile: BrowserCompiledProfileDescriptor, protectedHandles: readonly unknown[] = []): BrowserProjectionResult<FlatListProjectionUpdate> {
  return consumeProjectionUpdateWithCleanup(isOwnedFlatListProjection(base) ? base : undefined, view, cleanup,
    generation, expectedProfile, protectedHandles) as BrowserProjectionResult<FlatListProjectionUpdate>;
}

/** Consumes an exact list update, including its owned result projection. @internal */
export function consumeFlatListSemanticProjectionUpdate(base: FlatListDocumentProjection, view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView, expectedProfile: BrowserCompiledProfileDescriptor, protectedHandles: readonly unknown[] = []): BrowserProjectionResult<FlatListProjectionUpdate> {
  return consumeProjectionUpdate(isOwnedFlatListProjection(base) ? base : undefined, view, generation, expectedProfile, protectedHandles) as BrowserProjectionResult<FlatListProjectionUpdate>;
}

/** Consumes an exact recursive-list update and proves all retained root subtrees. @internal */
export function consumeNestedListSemanticProjectionUpdate(base: NestedListDocumentProjection, view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView, expectedProfile: BrowserCompiledProfileDescriptor, protectedHandles: readonly unknown[] = []): BrowserProjectionResult<NestedListProjectionUpdate> {
  return consumeProjectionUpdate(isOwnedNestedListProjection(base) ? base : undefined, view, generation, expectedProfile, protectedHandles) as BrowserProjectionResult<NestedListProjectionUpdate>;
}

/** Uses the outer owner's captured cleanup without rereading a generated destructor. @internal */
export function consumeNestedListSemanticProjectionUpdateWithCleanup(base: NestedListDocumentProjection,
  view: SemanticProjectionUpdateView, cleanup: () => unknown, generation: WasmProfileGenerationView,
  expectedProfile: BrowserCompiledProfileDescriptor, protectedHandles: readonly unknown[] = []): BrowserProjectionResult<NestedListProjectionUpdate> {
  return consumeProjectionUpdateWithCleanup(isOwnedNestedListProjection(base) ? base : undefined, view, cleanup,
    generation, expectedProfile, protectedHandles) as BrowserProjectionResult<NestedListProjectionUpdate>;
}

function consumeProjectionUpdate(base: UpdateBase, view: SemanticProjectionUpdateView, generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor, protectedHandles: readonly unknown[]): BrowserProjectionResult<ProjectionUpdate> {
  const identity = objectIdentity(view);
  if (identity === null || ACTIVE_GENERATED_CONSUMPTIONS.has(identity)) {
    return projectionFailure("projection.invalid_update");
  }
  ACTIVE_GENERATED_CONSUMPTIONS.set(identity, undefined);
  try {
    return consumeSemanticProjectionUpdateUnlocked(
      base,
      view,
      generation,
      expectedProfile,
      protectedHandles,
    );
  } finally {
    releaseGeneratedConsumption(identity);
  }
}

function consumeSemanticProjectionUpdateUnlocked(
  base: UpdateBase,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[],
): BrowserProjectionResult<ProjectionUpdate> {
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
  return consumeProjectionUpdateWithCleanup(isOwnedProjection(base) ? base : undefined, view, cleanup,
    generation, expectedProfile, protectedHandles) as BrowserProjectionResult<BaseProjectionUpdate>;
}

function consumeProjectionUpdateWithCleanup(base: UpdateBase, view: SemanticProjectionUpdateView, cleanup: () => unknown,
  generation: WasmProfileGenerationView, expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[]): BrowserProjectionResult<ProjectionUpdate> {
  const identity = objectIdentity(view);
  if (identity === null || ACTIVE_GENERATED_CONSUMPTIONS.has(identity)) {
    return projectionFailure("projection.invalid_update");
  }
  ACTIVE_GENERATED_CONSUMPTIONS.set(identity, undefined);
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
    releaseGeneratedConsumption(identity);
  }
}

function consumeSemanticProjectionUpdateWithCleanupUnlocked(
  base: UpdateBase,
  view: SemanticProjectionUpdateView,
  cleanup: () => unknown,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: readonly unknown[],
): BrowserProjectionResult<ProjectionUpdate> {
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

function releaseGeneratedConsumption(identity: object): void {
  const child = ACTIVE_GENERATED_CONSUMPTIONS.get(identity);
  if (child !== undefined) ACTIVE_GENERATED_CONSUMPTIONS.delete(child);
  ACTIVE_GENERATED_CONSUMPTIONS.delete(identity);
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
  base: UpdateBase,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  cleanup: () => unknown,
  protectedHandles: ReadonlySet<object>,
  asynchronous: boolean,
): BrowserProjectionResult<ProjectionUpdate> {
  let result: BrowserProjectionResult<ProjectionUpdate> = projectionFailure(
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
  // Nested projection validation precedes the outer update's cleanup.
  return result.ok && !wasmProfileGenerationIsLive(generation)
    ? projectionFailure("projection.invalid_update")
    : result;
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
  textBlockFactory: TextBlockProjectionFactory | undefined,
): BrowserProjectionResult<BaseDocumentProjection> {
  if (
    (textBlockFactory !== undefined && typeof expectedProfile === "string") ||
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
  const snapshot = snapshotSemanticProjection(view, textBlockFactory !== undefined,
    textBlockFactory === createFlatListTextProjection || textBlockFactory === createNestedListTextProjection,
    textBlockFactory === createNestedListTextProjection);
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
    textBlockFactory,
  );
  if (result.ok && textBlockFactory !== undefined) TEXT_BLOCK_FACTORIES.set(result.value, textBlockFactory);
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
  textBlockFactory: TextBlockProjectionFactory | undefined,
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
    !listMetadataIsAbsent(view, methods, 0) ||
    !headingLevelIsAbsent(view, methods, 0) ||
    invokeGenerated(methods.nodeKind, view, 0) !== "element" ||
    invokeGenerated(methods.elementType, view, 0) !== "breditor/document" ||
    invokeGenerated(methods.text, view, 0) !== undefined ||
    invokeGenerated(methods.formatCount, view, 0) !== undefined ||
    invokeGenerated(methods.formatType, view, 0, 0) !== undefined ||
    !formatPropertyProbeIsAbsent(view, methods, 0, 0, 0)
  ) {
    return projectionFailure("projection.invalid_shape");
  }
  const rootChildCount = invokeGenerated(methods.childCount, view, 0);
  if (
    rootChildCount === undefined ||
    !isIndex(rootChildCount) ||
    rootChildCount === 0 ||
    rootChildCount > 10_000 ||
    rootChildCount > nodeCount - 1
  ) {
    return projectionFailure("projection.invalid_shape");
  }

  const nestedLayout = textBlockFactory === createNestedListTextProjection
    ? readNestedListLayout(view, methods, rootChildCount, nodeCount) : undefined;
  if (nestedLayout === null) return projectionFailure("projection.invalid_shape");
  const flatLayout = textBlockFactory === createFlatListTextProjection
    ? readFlatListLayout(view, methods, rootChildCount, nodeCount) : undefined;
  const layout = nestedLayout ?? flatLayout;
  if (layout === null) return projectionFailure("projection.invalid_shape");
  const paragraphCount = layout?.textBlocks.length ?? rootChildCount;

  const admittedFormats = typeof expectedProfile === "string"
    ? new Set(["breditor/strong"])
    : new Set(expectedProfile.formats.map((format) => format.kind));
  const paragraphs: Array<{
    headingLevel: HeadingProjectionLevel | null;
    runs: Array<{
      text: string;
      strong: boolean;
      formats: string[];
      formatDetails: InlineFormatProjection[];
    }>;
  }> = [];
  let totalPropertyValues = 0;
  let totalPropertyStringBytes = 0;
  let expectedIndex = 1;
  for (let paragraphOrdinal = 0; paragraphOrdinal < paragraphCount; paragraphOrdinal += 1) {
    if (expectedIndex >= nodeCount) {
      return projectionFailure("projection.invalid_shape");
    }
    const plannedBlock = layout?.textBlocks[paragraphOrdinal];
    if (plannedBlock !== undefined) expectedIndex = plannedBlock.index;
    const paragraphIndex = plannedBlock?.index ?? invokeGenerated(
      methods.childAt,
      view,
      0,
      paragraphOrdinal,
    );
    // Admit the index before reading metadata. Keep this as an explicit branch:
    // each admitted block must execute its type getter exactly once.
    if (typeof paragraphIndex !== "number" || !projectionU32sEqual(paragraphIndex, expectedIndex)) {
      return projectionFailure("projection.invalid_shape");
    }
    const blockType = invokeGenerated(methods.elementType, view, paragraphIndex);
    const headingLevel = methods.headingLevel !== undefined
      ? invokeGenerated(methods.headingLevel, view, paragraphIndex) : undefined;
    if (
      !listMetadataIsAbsent(view, methods, paragraphIndex) ||
      invokeGenerated(methods.nodeKind, view, paragraphIndex) !== "element" ||
      (blockType === "breditor/heading"
        ? !isHeadingProjectionLevel(headingLevel)
        : blockType !== "breditor/paragraph" || headingLevel !== undefined) ||
      invokeGenerated(methods.text, view, paragraphIndex) !== undefined ||
      invokeGenerated(methods.formatCount, view, paragraphIndex) !== undefined ||
      invokeGenerated(methods.formatType, view, paragraphIndex, 0) !== undefined ||
      !formatPropertyProbeIsAbsent(view, methods, paragraphIndex, 0, 0)
    ) {
      return projectionFailure("projection.invalid_shape");
    }
    expectedIndex += 1;
    const runCount = invokeGenerated(methods.childCount, view, paragraphIndex);
    if (
      runCount === undefined ||
      !isIndex(runCount) ||
      (plannedBlock !== undefined && !projectionU32sEqual(runCount, plannedBlock.runs)) ||
      runCount > 10_000 ||
      runCount > nodeCount - expectedIndex
    ) {
      return projectionFailure("projection.invalid_shape");
    }
    const runs: Array<{
      text: string;
      strong: boolean;
      formats: string[];
      formatDetails: InlineFormatProjection[];
    }> = [];
    for (let runOrdinal = 0; runOrdinal < runCount; runOrdinal += 1) {
      const runIndex = invokeGenerated(
        methods.childAt,
        view,
        paragraphIndex,
        runOrdinal,
      );
      if (
        typeof runIndex !== "number" || !projectionU32sEqual(runIndex, expectedIndex) ||
        !listMetadataIsAbsent(view, methods, runIndex) ||
        invokeGenerated(methods.nodeKind, view, runIndex) !== "text" ||
        !headingLevelIsAbsent(view, methods, runIndex) ||
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
      const formatDetails: InlineFormatProjection[] = [];
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
        const propertyCount = invokeGenerated(
          methods.formatPropertyCount,
          view,
          runIndex,
          formatIndex,
        );
        if (
          propertyCount === undefined ||
          !isIndex(propertyCount) ||
          propertyCount > MAX_PROJECTED_PROPERTIES_PER_FORMAT ||
          propertyCount > MAX_PROJECTED_PROPERTY_VALUES - totalPropertyValues ||
          (typeof expectedProfile === "string" && propertyCount !== 0)
        ) {
          return projectionFailure("projection.invalid_shape");
        }
        const properties: InlineFormatPropertyProjection[] = [];
        let previousProperty: string | undefined;
        for (
          let propertyIndex = 0;
          propertyIndex < propertyCount;
          propertyIndex += 1
        ) {
          const property = readProjectedFormatProperty(
            view,
            methods,
            runIndex,
            formatIndex,
            propertyIndex,
          );
          if (
            property === null ||
            (previousProperty !== undefined &&
              previousProperty >= property.entry.name) ||
            property.stringBytes >
              MAX_PROJECTED_TOTAL_PROPERTY_STRING_BYTES - totalPropertyStringBytes
          ) {
            return projectionFailure("projection.invalid_shape");
          }
          totalPropertyValues += 1;
          totalPropertyStringBytes += property.stringBytes;
          previousProperty = property.entry.name;
          properties.push(property.entry);
        }
        if (
          !formatPropertyValueProbeIsAbsent(
            view,
            methods,
            runIndex,
            formatIndex,
            propertyCount,
          )
        ) {
          return projectionFailure("projection.invalid_shape");
        }
        formats.push(format);
        formatDetails.push({ kind: format, properties });
        previousFormat = format;
      }
      if (
        invokeGenerated(methods.formatType, view, runIndex, formatCount) !== undefined ||
        !formatPropertyProbeIsAbsent(view, methods, runIndex, formatCount, 0)
      ) {
        return projectionFailure("projection.invalid_shape");
      }
      const strong = formats.includes("breditor/strong");
      if (typeof expectedProfile === "string" && formats.length !== (strong ? 1 : 0)) {
        return projectionFailure("projection.invalid_shape");
      }
      runs.push({ text, strong, formats, formatDetails });
    }
    if (invokeGenerated(methods.childAt, view, paragraphIndex, runCount) !== undefined) {
      return projectionFailure("projection.invalid_shape");
    }
    paragraphs.push({ headingLevel: isHeadingProjectionLevel(headingLevel) ? headingLevel : null, runs });
  }
  if (
    !projectionU32sEqual(expectedIndex, nodeCount) ||
    !listMetadataIsAbsent(view, methods, nodeCount) ||
    !headingLevelIsAbsent(view, methods, nodeCount) ||
    invokeGenerated(methods.childAt, view, 0, rootChildCount) !== undefined ||
    invokeGenerated(methods.nodeKind, view, nodeCount) !== undefined ||
    invokeGenerated(methods.elementType, view, nodeCount) !== undefined ||
    invokeGenerated(methods.childCount, view, nodeCount) !== undefined ||
    invokeGenerated(methods.childAt, view, nodeCount, 0) !== undefined ||
    invokeGenerated(methods.text, view, nodeCount) !== undefined ||
    invokeGenerated(methods.formatCount, view, nodeCount) !== undefined ||
    invokeGenerated(methods.formatType, view, nodeCount, 0) !== undefined ||
    !formatPropertyProbeIsAbsent(view, methods, nodeCount, 0, 0)
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
      ...(methods.headingLevel === undefined ? {} : { headingLevel: paragraph.headingLevel }),
      runs: paragraph.runs.map((run) => ({
        text: run.text,
        formatDetails: run.formatDetails,
      })),
    })),
  };
  if (nestedLayout !== undefined) {
    let offset = 0;
    const build = (shape: NestedListRootShape): unknown => {
      if (shape.kind === "textBlock") return {kind: "textBlock", block: input.paragraphs[offset++]};
      const items = shape.items.map(item => {
        const block = input.paragraphs[offset++];
        return {block, lists: item.lists.map(build)};
      });
      return shape.kind === "bulletList" ? {kind: "bulletList", items} : {kind: "orderedList", start: shape.start, items};
    };
    return createNestedListTextProjection({schema: input.schema, snapshot: input.snapshot,
      blocks: nestedLayout.shapes.map(build)}, generation, expectedProfile);
  }
  if (flatLayout !== undefined && flatLayout !== null) {
    let offset = 0;
    const blocks = flatLayout.shapes.map((shape) => shape.kind === "textBlock"
      ? {kind: "textBlock", block: input.paragraphs[offset++]}
      : {...shape, items: input.paragraphs.slice(offset, offset += shape.items)});
    return createFlatListTextProjection({schema: input.schema, snapshot: input.snapshot, blocks}, generation, expectedProfile);
  }
  return (textBlockFactory ?? createProfiledDocumentProjection)(
    input, generation, expectedProfile);
}

/**
 * Proves every structural edge before reading inline data. The returned directory
 * skips list/item wrappers, but never invents flattened document coordinates.
 * Exact preorder accounting rejects aliases, gaps, cycles and unreachable nodes.
 */
function readFlatListLayout(
  view: SemanticProjectionView,
  methods: SemanticProjectionMethods,
  rootCount: number,
  nodeCount: number,
): Readonly<{
  shapes: readonly FlatListRootShape[];
  textBlocks: readonly Readonly<{ index: number; runs: number }>[];
}> | null {
  if (methods.listKind === undefined || methods.orderedListStart === undefined) return null;
  const shapes: FlatListRootShape[] = [];
  const textBlocks: Array<{index: number; runs: number}> = [];
  let next = 1;
  const readBlock = (index: number | undefined): boolean => {
    if (index !== next || next >= nodeCount) return false;
    const type = invokeGenerated(methods.elementType, view, index);
    if (type !== "breditor/paragraph" && type !== "breditor/heading") return false;
    const runs = invokeGenerated(methods.childCount, view, index);
    if (runs === undefined || !isIndex(runs) || runs > 10_000 || runs > nodeCount - next - 1) return false;
    textBlocks.push({index, runs});
    next += 1 + runs;
    return true;
  };
  const wrapperIsValid = (index: number, type: string): boolean =>
    invokeGenerated(methods.nodeKind, view, index) === "element" &&
    invokeGenerated(methods.elementType, view, index) === type &&
    headingLevelIsAbsent(view, methods, index) &&
    invokeGenerated(methods.text, view, index) === undefined &&
    invokeGenerated(methods.formatCount, view, index) === undefined &&
    invokeGenerated(methods.formatType, view, index, 0) === undefined &&
    formatPropertyProbeIsAbsent(view, methods, index, 0, 0);
  for (let root = 0; root < rootCount; root += 1) {
    const index = invokeGenerated(methods.childAt, view, 0, root);
    if (index !== next || next >= nodeCount) return null;
    const type = invokeGenerated(methods.elementType, view, index);
    if (type === "breditor/paragraph" || type === "breditor/heading") {
      if (!readBlock(index)) return null;
      shapes.push({kind: "textBlock"});
      continue;
    }
    const kind = type === "breditor/bullet-list" ? "bullet" : type === "breditor/ordered-list" ? "ordered" : null;
    if (kind === null || !wrapperIsValid(index, type as string) ||
        invokeGenerated(methods.listKind, view, index) !== kind) return null;
    const start = invokeGenerated(methods.orderedListStart, view, index);
    const items = invokeGenerated(methods.childCount, view, index);
    if (items === undefined || !isIndex(items) || items < 1 || items > 10_000 ||
        items > Math.floor((nodeCount - next - 1) / 2) ||
        (kind === "bullet" ? start !== undefined :
          typeof start !== "number" || !Number.isSafeInteger(start) || start < 1 || start + items - 1 > 2_147_483_647)) return null;
    shapes.push(kind === "bullet" ? {kind: "bulletList", items} : {kind: "orderedList", start: start as number, items});
    next += 1;
    for (let ordinal = 0; ordinal < items; ordinal += 1) {
      const item = invokeGenerated(methods.childAt, view, index, ordinal);
      if (item !== next || next >= nodeCount || !wrapperIsValid(item, "breditor/list-item") ||
          !listMetadataIsAbsent(view, methods, item) || invokeGenerated(methods.childCount, view, item) !== 1 ||
          invokeGenerated(methods.childAt, view, item, 1) !== undefined) return null;
      next += 1;
      if (!readBlock(invokeGenerated(methods.childAt, view, item, 0))) return null;
    }
    if (invokeGenerated(methods.childAt, view, index, items) !== undefined) return null;
  }
  return next === nodeCount ? {shapes, textBlocks} : null;
}

/** Exact preorder traversal bounds recursion and rejects aliases and unreachable wrappers. */
function readNestedListLayout(view: SemanticProjectionView, methods: SemanticProjectionMethods,
  rootCount: number, nodeCount: number): Readonly<{
    shapes: readonly NestedListRootShape[];
    textBlocks: readonly Readonly<{index: number; runs: number}>[];
  }> | null {
  if (methods.listKind === undefined || methods.orderedListStart === undefined) return null;
  type ListShape = Exclude<NestedListRootShape, Readonly<{kind: "textBlock"}>>;
  const textBlocks: Array<{index: number; runs: number}> = [];
  let next = 1;
  const wrapper = (index: number, type: string): boolean =>
    invokeGenerated(methods.nodeKind, view, index) === "element" &&
    invokeGenerated(methods.elementType, view, index) === type &&
    headingLevelIsAbsent(view, methods, index) &&
    invokeGenerated(methods.text, view, index) === undefined &&
    invokeGenerated(methods.formatCount, view, index) === undefined &&
    invokeGenerated(methods.formatType, view, index, 0) === undefined &&
    formatPropertyProbeIsAbsent(view, methods, index, 0, 0);
  const block = (index: number | undefined): boolean => {
    if (index !== next || next >= nodeCount) return false;
    const type = invokeGenerated(methods.elementType, view, index);
    if (type !== "breditor/paragraph" && type !== "breditor/heading") return false;
    const runs = invokeGenerated(methods.childCount, view, index);
    if (runs === undefined || !isIndex(runs) || runs > 10_000 || runs > nodeCount - next - 1) return false;
    textBlocks.push({index, runs}); next += 1 + runs; return true;
  };
  const list = (index: number | undefined, depth: number): ListShape | null => {
    if (depth + 3 > 64 || index !== next || next >= nodeCount) return null;
    const type = invokeGenerated(methods.elementType, view, index);
    const kind = type === "breditor/bullet-list" ? "bullet" : type === "breditor/ordered-list" ? "ordered" : null;
    if (kind === null || !wrapper(index, type as string) || invokeGenerated(methods.listKind!, view, index) !== kind) return null;
    const start = invokeGenerated(methods.orderedListStart!, view, index);
    const count = invokeGenerated(methods.childCount, view, index);
    if (count === undefined || !isIndex(count) || count < 1 || count > 10_000 ||
        count > Math.floor((nodeCount - next - 1) / 2) ||
        (kind === "bullet" ? start !== undefined : typeof start !== "number" || !Number.isSafeInteger(start) || start < 1 || start + count - 1 > 2_147_483_647)) return null;
    next++;
    const items: Array<{lists: ListShape[]}> = [];
    for (let ordinal = 0; ordinal < count; ordinal++) {
      const item = invokeGenerated(methods.childAt, view, index, ordinal);
      if (item !== next || next >= nodeCount || !wrapper(item, "breditor/list-item") || !listMetadataIsAbsent(view, methods, item)) return null;
      const children = invokeGenerated(methods.childCount, view, item);
      if (children === undefined || !isIndex(children) || children < 1 || children > 10_000 || children > nodeCount - next - 1) return null;
      next++;
      if (!block(invokeGenerated(methods.childAt, view, item, 0))) return null;
      const lists: ListShape[] = [];
      for (let section = 1; section < children; section++) {
        const child = list(invokeGenerated(methods.childAt, view, item, section), depth + 2);
        if (child === null) return null;
        lists.push(child);
      }
      if (invokeGenerated(methods.childAt, view, item, children) !== undefined) return null;
      items.push({lists});
    }
    if (invokeGenerated(methods.childAt, view, index, count) !== undefined) return null;
    return kind === "bullet" ? {kind: "bulletList", items} : {kind: "orderedList", start: start as number, items};
  };
  const shapes: NestedListRootShape[] = [];
  for (let root = 0; root < rootCount; root++) {
    const index = invokeGenerated(methods.childAt, view, 0, root);
    if (index !== next || next >= nodeCount) return null;
    const type = invokeGenerated(methods.elementType, view, index);
    if (type === "breditor/paragraph" || type === "breditor/heading") {
      if (!block(index)) return null;
      shapes.push({kind: "textBlock"});
    } else {
      const shape = list(index, 1);
      if (shape === null) return null;
      shapes.push(shape);
    }
  }
  return next === nodeCount ? {shapes, textBlocks} : null;
}

function listMetadataIsAbsent(view: SemanticProjectionView, methods: SemanticProjectionMethods, index: number): boolean {
  return (methods.listKind === undefined || invokeGenerated(methods.listKind, view, index) === undefined) &&
    (methods.orderedListStart === undefined || invokeGenerated(methods.orderedListStart, view, index) === undefined);
}

function headingLevelIsAbsent(
  view: SemanticProjectionView,
  methods: SemanticProjectionMethods,
  index: number,
): boolean {
  return methods.headingLevel === undefined || invokeGenerated(methods.headingLevel, view, index) === undefined;
}

interface ReadProjectedFormatProperty {
  readonly entry: InlineFormatPropertyProjection;
  readonly stringBytes: number;
}

function readProjectedFormatProperty(
  view: SemanticProjectionView,
  methods: SemanticProjectionMethods,
  nodeIndex: number,
  formatIndex: number,
  propertyIndex: number,
): ReadProjectedFormatProperty | null {
  // Keep heterogeneous scalar returns in separate, auditable locals. Retained
  // WebKit reproductions showed a changed integer result during collection;
  // its precise call-boundary cause remains under investigation. Preserve order
  // and single invocation;
  // no retry, coercion or weakened wrong-kind/absence validation is permitted.
  const name = invokeGenerated(methods.formatPropertyName, view, nodeIndex, formatIndex, propertyIndex);
  const kind = invokeGenerated(methods.formatPropertyValueKind, view, nodeIndex, formatIndex, propertyIndex);
  const booleanValue = invokeGenerated(methods.formatPropertyBoolean, view, nodeIndex, formatIndex, propertyIndex);
  const integerValue = invokeGenerated(methods.formatPropertyInteger, view, nodeIndex, formatIndex, propertyIndex);
  const stringValue = invokeGenerated(methods.formatPropertyString, view, nodeIndex, formatIndex, propertyIndex);
  if (!isQualifiedName(name)) return null;

  switch (kind) {
    case "boolean":
      return typeof booleanValue === "boolean" &&
          integerValue === undefined &&
          stringValue === undefined
        ? { entry: { name, value: booleanValue }, stringBytes: 0 }
        : null;
    case "integer":
      return booleanValue === undefined &&
          typeof integerValue === "number" &&
          Number.isSafeInteger(integerValue) &&
          !Object.is(integerValue, -0) &&
          stringValue === undefined
        ? { entry: { name, value: integerValue }, stringBytes: 0 }
        : null;
    case "string": {
      if (
        booleanValue !== undefined ||
        integerValue !== undefined ||
        typeof stringValue !== "string" ||
        stringValue.length > MAX_PROJECTED_PROPERTY_STRING_BYTES
      ) {
        return null;
      }
      const stringBytes = unicodeScalarUtf8Length(stringValue);
      return stringBytes !== null &&
          stringBytes <= MAX_PROJECTED_PROPERTY_STRING_BYTES
        ? { entry: { name, value: stringValue }, stringBytes }
        : null;
    }
    default:
      return null;
  }
}

function formatPropertyProbeIsAbsent(
  view: SemanticProjectionView,
  methods: SemanticProjectionMethods,
  nodeIndex: number,
  formatIndex: number,
  propertyIndex: number,
): boolean {
  return invokeGenerated(
    methods.formatPropertyCount,
    view,
    nodeIndex,
    formatIndex,
  ) === undefined && formatPropertyValueProbeIsAbsent(
    view,
    methods,
    nodeIndex,
    formatIndex,
    propertyIndex,
  );
}

function formatPropertyValueProbeIsAbsent(
  view: SemanticProjectionView,
  methods: SemanticProjectionMethods,
  nodeIndex: number,
  formatIndex: number,
  propertyIndex: number,
): boolean {
  return [
    methods.formatPropertyName, methods.formatPropertyValueKind, methods.formatPropertyBoolean,
    methods.formatPropertyInteger, methods.formatPropertyString,
  ].every((method) => invokeGenerated(method as (...indexes: number[]) => unknown,
    view, nodeIndex, formatIndex, propertyIndex) === undefined);
}

function readProfiledSemanticProjectionUpdate(
  base: UpdateBase,
  view: SemanticProjectionUpdateView,
  generation: WasmProfileGenerationView,
  expectedProfile: string | BrowserCompiledProfileDescriptor,
  protectedHandles: ReadonlySet<object>,
): BrowserProjectionResult<ProjectionUpdate> {
  if (base === undefined) return projectionFailure("projection.invalid_update");
  const flat = isOwnedFlatListProjection(base);
  const nested = isOwnedNestedListProjection(base);
  const descriptor = nested ? nestedListProjectionDescriptor(base) : flat ? flatListProjectionDescriptor(base) : projectionProfileDescriptor(base);
  if (
    !wasmProfileGenerationIsLive(generation) ||
    !(nested ? nestedListProjectionMatchesProfileGeneration(base, generation) : flat ? flatListProjectionMatchesProfileGeneration(base, generation) : projectionMatchesProfileGeneration(base, generation)) ||
    (typeof expectedProfile === "string"
      ? nested || flat || descriptor !== undefined
      : descriptor !== expectedProfile ||
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
  const child = objectIdentity(resultView);
  if (child === null || protectedHandles.has(child) || ACTIVE_GENERATED_CONSUMPTIONS.has(child)) {
    return projectionFailure("projection.invalid_update");
  }
  // Claim before the child's first getter. Keep this claim after its own free:
  // parent cleanup and final generation checks can still reenter the adapter.
  ACTIVE_GENERATED_CONSUMPTIONS.set(child, undefined);
  ACTIVE_GENERATED_CONSUMPTIONS.set(view, child);
  const projectionResult = consumeSemanticProjectionUnlocked(
    resultView,
    generation,
    expectedProfile,
    nested ? createNestedListTextProjection : flat ? createFlatListTextProjection : TEXT_BLOCK_FACTORIES.get(base),
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
  if (nested) {
    const list = NestedListDocumentProjection.fromValidatedText(projection);
    return list.ok ? NestedListProjectionUpdate.create({base, result: list.value, impact}) : projectionFailure("projection.invalid_update");
  }
  if (flat) {
    const list = FlatListDocumentProjection.fromValidatedText(projection);
    return list.ok ? FlatListProjectionUpdate.create({base, result: list.value, impact}) : projectionFailure("projection.invalid_update");
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

function isQualifiedName(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function unicodeScalarUtf8Length(text: string): number | null {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = text.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
  }
  return bytes;
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
  textBlocks: boolean,
  flatLists: boolean,
  nestedLists: boolean,
): SemanticProjectionSnapshot | null {
  try {
    const headingLevel = textBlocks ? readGeneratedScalar(view, "headingLevel") : undefined;
    if (textBlocks && typeof headingLevel !== "function") return null;
    const listKind = flatLists ? readGeneratedScalar(view, "listKind") : undefined;
    const orderedListStart = flatLists ? readGeneratedScalar(view, "orderedListStart") : undefined;
    if (flatLists && (typeof listKind !== "function" || typeof orderedListStart !== "function")) return null;
    const names = [
      "nodeKind", "elementType", "childCount", "childAt", "text", "formatCount",
      "formatType", "formatPropertyCount", "formatPropertyName", "formatPropertyValueKind",
      "formatPropertyBoolean", "formatPropertyInteger", "formatPropertyString",
    ] as const;
    const methods: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    let valid = true;
    for (const name of names) {
      const method = readGeneratedMethod(view, name);
      if (method === null) valid = false;
      methods[name] = method;
    }
    if (!valid) return null;
    methods["headingLevel"] = headingLevel;
    methods["listKind"] = listKind;
    methods["orderedListStart"] = orderedListStart;
    // Only the opt-in nested adapter recognizes this versioned word ABI.
    // Legacy requires the complete capability to be absent, not just markers.
    // Share startup/restore admission so partial/unknown word ABIs always fail.
    // Never mutate generated prototypes or retry a scalar getter after failure.
    if (nestedLists) {
      const wordFacade = snapshotNestedProjectionWordFacade(view, containGeneratedThenable);
      if (wordFacade === null) return null;
      const version = wordFacade["projectionScalarWordsVersion"];
      if (version !== undefined) {
        if (version !== 1) return null;
        for (const [name, wordName, arity] of [
          ["childCount", "childCountWords", 1], ["childAt", "childAtWords", 2],
          ["formatCount", "formatCountWords", 1], ["formatPropertyCount", "formatPropertyCountWords", 2],
          ["headingLevel", "headingLevelWords", 1], ["orderedListStart", "orderedListStartWords", 1],
        ] as const) {
          const word = wordFacade[wordName];
          if (typeof word !== "function") return null;
          methods[name] = arity === 1
            ? function(this: object, index: number) {
                return decodeProjectionScalarWords(invokeGenerated(word as (index: number) => unknown, this, index));
              }
            : function(this: object, index: number, ordinal: number) {
                return decodeProjectionScalarWords(invokeGenerated(word as (index: number, ordinal: number) => unknown, this, index, ordinal));
              };
        }
      }
      const integerVersion = wordFacade["projectionIntegerWordsVersion"];
      if (integerVersion !== undefined) {
        if (integerVersion !== 1 || version !== 1) return null;
        const word = wordFacade["formatPropertyIntegerWords"];
        if (typeof word !== "function") return null;
        methods["formatPropertyInteger"] = function(this: object, index: number, ordinal: number, property: number) {
          return decodeProjectionIntegerWords(invokeGenerated(
            word as (index: number, ordinal: number, property: number) => unknown, this, index, ordinal, property));
        };
      }
    }
    return {
      ...readGeneratedScalars(view, [
        "schemaName", "schemaVersion", "schemaFingerprint", "snapshotLineage",
        "snapshotRevision", "nodeCount", "rootIndex",
      ]),
      methods: methods as unknown as SemanticProjectionMethods,
    };
  } catch {
    return null;
  }
}

function readGeneratedMethod<TView extends object, TKey extends keyof TView>(
  view: TView, key: TKey,
): TView[TKey] | null {
  const method = Reflect.get(view, key, view) as unknown;
  return typeof method === "function" && !containGeneratedThenable(method)
    ? method as TView[TKey] : null;
}

function readGeneratedScalars<TKey extends string>(
  view: object, keys: readonly TKey[],
): Record<TKey, unknown> {
  const result = Object.create(null) as Record<TKey, unknown>;
  for (const key of keys) result[key] = readGeneratedScalar(view, key);
  return result;
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
    const affectedParagraphIndex = readGeneratedMethod(
      view,
      "affectedParagraphIndex",
    );
    const takeProjection = readGeneratedMethod(view, "takeProjection");
    if (affectedParagraphIndex === null || takeProjection === null) return null;
    return {
      ...readGeneratedScalars(view, [
        "baseLineage", "baseRevision", "resultLineage", "resultRevision", "impact",
        "affectedParagraphCount", "oldChildStart", "oldChildEnd", "newChildStart", "newChildEnd",
      ]),
      methods: { affectedParagraphIndex, takeProjection },
    };
  } catch {
    return null;
  }
}
