import type { BaseDocumentProjection } from "./projection.js";
import type {
  WasmCommandEngineView,
  WasmCommandObservationView,
} from "./wasm_command_adapter.js";
import {
  consumeSemanticProjection,
  type SemanticProjectionView,
} from "./wasm_projection_adapter.js";
import {
  sessionCheckpointJsonUtf8Bytes,
  type WasmSessionCheckpointErrorView,
} from "./wasm_session_checkpoint.js";
import {
  consumeWasmCompiledProfileDescriptorWithCleanup,
  wasmProfileGenerationIsLive,
  wasmViewMatchesProfileGeneration,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileCorrelatedView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

/** JavaScript-visible Wasm transport generation accepted by this bootstrap. */
export const BREDITOR_WASM_ABI_VERSION = "3" as const;

/** Exact official Wasm package version paired with this browser build. */
export const BREDITOR_BROWSER_PACKAGE_VERSION = "0.2.0-alpha.5" as const;

/** Maximum history capacity admitted by the default Wasm checkpoint policy. */
export const MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY = 100;

const BREDITOR_BASE_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";

/** Generated projection-read result consumed during engine bootstrap. */
export interface WasmProjectionReadResultView extends WasmProfileCorrelatedView {
  readonly status: "projection" | "taken" | "error";
  readonly error: WasmSessionCheckpointErrorView | undefined;
  takeProjection(): SemanticProjectionView | undefined;
  free(): void;
}

/** Complete generated engine surface required by browser bootstrap. */
export interface WasmBootstrappedEngineView
  extends WasmCommandEngineView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
  /** Clones this engine's opaque process-local compiled-profile generation. */
  profileGeneration(): WasmProfileGenerationView;
  /** Clones the complete descriptor for this engine's compiled profile. */
  profileDescriptor(): WasmCompiledProfileDescriptorView;
  /** Captures an exact process-local observation of the current session. */
  observation(): WasmCommandObservationView;
  /** Reads the semantic AST for one exact observation. */
  projection(expected: WasmCommandObservationView): WasmProjectionReadResultView;
  /** Releases the generated engine owner. */
  free(): void;
}

/** One-shot generated construction result shared by fresh and restore paths. */
export interface WasmEngineBootstrapResultView {
  readonly status: "engine" | "taken" | "error";
  readonly error: WasmSessionCheckpointErrorView | undefined;
  takeEngine(): WasmBootstrappedEngineView | undefined;
  free(): void;
}

/** Narrow static generated factory exposed by the paired module namespace. */
export interface WasmEngineBootstrapFactoryView {
  fromDocumentJson(
    lineageId: string,
    documentJson: string,
    historyCapacity: number,
  ): WasmEngineBootstrapResultView;
  fromSessionCheckpointJson(
    checkpointJson: string,
  ): WasmEngineBootstrapResultView;
}

/** Structural generated module namespace with explicit compatibility probes. */
export interface WasmEngineBootstrapModuleView {
  readonly BreditorEngine: WasmEngineBootstrapFactoryView;
  breditorWasmAbiVersion(): string;
  breditorVersion(): string;
}

/** Strict request for a history-free Document V1 engine. */
export interface WasmDocumentBootstrapSource {
  readonly kind: "document";
  readonly lineageId: string;
  readonly documentJson: string;
  readonly historyCapacity: number;
}

/** Strict request for a replay-proved Session Checkpoint V1 engine. */
export interface WasmSessionCheckpointBootstrapSource {
  readonly kind: "sessionCheckpoint";
  readonly checkpointJson: string;
}

/** Exactly one supported browser engine bootstrap source. */
export type WasmEngineBootstrapSource =
  | WasmDocumentBootstrapSource
  | WasmSessionCheckpointBootstrapSource;

/** Payload-redacted failure from the browser/Wasm bootstrap boundary. */
export type BrowserWasmEngineBootstrapError =
  | Readonly<{
      kind: "boundary";
      code:
        | "engine_bootstrap.invalid_request"
        | "engine_bootstrap.invalid_wasm_module"
        | "engine_bootstrap.incompatible_wasm_abi"
        | "engine_bootstrap.incompatible_wasm_version"
        | "engine_bootstrap.invalid_wasm_view"
        | "engine_bootstrap.invalid_profile_generation"
        | "engine_bootstrap.invalid_profile_descriptor"
        | "engine_bootstrap.invalid_initial_projection";
      message: string;
    }>
  | Readonly<{
      kind: "core";
      code: string;
      message: "The Rust editor core rejected engine bootstrap.";
    }>;

/** Complete initial state with exactly three generated owners transferred. */
export type BrowserWasmEngineBootstrapResult =
  | Readonly<{
      ok: true;
      engine: WasmBootstrappedEngineView;
      profileGeneration: WasmProfileGenerationView;
      profileDescriptor: BrowserCompiledProfileDescriptor;
      observation: WasmCommandObservationView;
      projection: BaseDocumentProjection;
    }>
  | Readonly<{ ok: false; error: BrowserWasmEngineBootstrapError }>;

const INVALID_REQUEST = boundaryError(
  "engine_bootstrap.invalid_request",
  "The engine bootstrap request is invalid.",
);
const INVALID_MODULE = boundaryError(
  "engine_bootstrap.invalid_wasm_module",
  "The Wasm module does not satisfy the Breditor bootstrap contract.",
);
const INCOMPATIBLE_ABI = boundaryError(
  "engine_bootstrap.incompatible_wasm_abi",
  "The Wasm module uses an incompatible Breditor ABI.",
);
const INCOMPATIBLE_VERSION = boundaryError(
  "engine_bootstrap.incompatible_wasm_version",
  "The Wasm package version does not exactly match the browser package.",
);
const INVALID_VIEW = boundaryError(
  "engine_bootstrap.invalid_wasm_view",
  "A generated Wasm bootstrap view is invalid.",
);
const INVALID_GENERATION = boundaryError(
  "engine_bootstrap.invalid_profile_generation",
  "The Wasm compiled-profile generation is invalid.",
);
const INVALID_DESCRIPTOR = boundaryError(
  "engine_bootstrap.invalid_profile_descriptor",
  "The Wasm compiled-profile descriptor is invalid.",
);
const INVALID_PROJECTION = boundaryError(
  "engine_bootstrap.invalid_initial_projection",
  "The initial semantic projection is invalid.",
);
const CORE_ERROR_MESSAGE = "The Rust editor core rejected engine bootstrap." as const;

const OWNED_BOOTSTRAP_RESULTS = new WeakSet<object>();
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_THEN = Promise.prototype.then;
const IGNORE_SETTLEMENT = (): undefined => undefined;

type GeneratedCleanup = () => unknown;

interface GeneratedHandleRegistry {
  readonly cleanups: Map<object, GeneratedCleanup>;
  readonly order: object[];
  invalid: boolean;
}

interface ResolvedFactory {
  readonly factory: WasmEngineBootstrapFactoryView;
  readonly fromDocumentJson: WasmEngineBootstrapFactoryView["fromDocumentJson"];
  readonly fromSessionCheckpointJson: WasmEngineBootstrapFactoryView["fromSessionCheckpointJson"];
  readonly protectedHandles: ReadonlySet<object>;
}

interface EngineMethodSnapshot {
  readonly raw: WasmBootstrappedEngineView;
  readonly cleanup: GeneratedCleanup;
  readonly actionStates: WasmCommandEngineView["actionStates"];
  readonly sessionCheckpointJson: WasmCommandEngineView["sessionCheckpointJson"];
  readonly documentJson: WasmCommandEngineView["documentJson"];
  readonly clearSelection: WasmCommandEngineView["clearSelection"];
  readonly setRangeSelection: WasmCommandEngineView["setRangeSelection"];
  readonly selection: WasmCommandEngineView["selection"];
  readonly executeNoInputAction: WasmCommandEngineView["executeNoInputAction"];
  readonly executeStringAction: WasmCommandEngineView["executeStringAction"];
  readonly undo: WasmCommandEngineView["undo"];
  readonly redo: WasmCommandEngineView["redo"];
  readonly closeHistoryGroup: WasmCommandEngineView["closeHistoryGroup"];
  readonly matchesProfileGeneration: WasmBootstrappedEngineView["matchesProfileGeneration"];
  readonly profileGeneration: WasmBootstrappedEngineView["profileGeneration"];
  readonly profileDescriptor: WasmBootstrappedEngineView["profileDescriptor"];
  readonly observation: WasmBootstrappedEngineView["observation"];
  readonly projection: WasmBootstrappedEngineView["projection"];
}

interface ObservationSnapshot {
  readonly lineage: string;
  readonly revision: string;
}

/**
 * Constructs one browser-ready generated engine and its exact initial AST.
 *
 * A generated module namespace must report ABI `3` and the exact package
 * version paired with this browser build before its factory is accessed. All generated
 * handles are claimed before `then` or sibling getters are inspected. Result,
 * error, and projection handles are consumed here; only a frozen engine
 * forwarding owner, opaque profile generation, and real generated observation
 * cross the success edge.
 */
export function bootstrapWasmEngine(
  module: WasmEngineBootstrapModuleView,
  source: WasmEngineBootstrapSource,
): BrowserWasmEngineBootstrapResult {
  const request = readSource(source);
  if (request === null) return failure(INVALID_REQUEST);

  const resolved = resolveFactory(module);
  if (!resolved.ok) return failure(resolved.error);

  const registry: GeneratedHandleRegistry = {
    cleanups: new Map(),
    order: [],
    invalid: false,
  };
  let provisional: BrowserWasmEngineBootstrapResult = failure(INVALID_VIEW);
  try {
    const rawResult = request.kind === "document"
      ? Reflect.apply(resolved.value.fromDocumentJson, resolved.value.factory, [
          request.lineageId,
          request.documentJson,
          request.historyCapacity,
        ]) as unknown
      : Reflect.apply(
          resolved.value.fromSessionCheckpointJson,
          resolved.value.factory,
          [request.checkpointJson],
        ) as unknown;
    provisional = consumeConstructionResult(
      rawResult,
      request,
      registry,
      resolved.value.protectedHandles,
    );
  } catch {
    provisional = failure(INVALID_VIEW);
  }

  const transferred = provisional.ok
    ? new Set<object>([
        hiddenEngineOwner(provisional.engine),
        provisional.profileGeneration,
        provisional.observation,
      ])
    : EMPTY_OBJECT_SET;
  const cleanupFailed = releaseGeneratedHandles(registry, transferred);
  const transferredOwnerLost = provisional.ok && (
    !engineOwnerIsLive(provisional.engine) ||
    !profileGenerationOwnerIsLive(provisional.profileGeneration) ||
    !observationOwnerIsLive(provisional.observation)
  );
  if (cleanupFailed || transferredOwnerLost) {
    if (provisional.ok) {
      if (engineOwnerIsLive(provisional.engine)) {
        bestEffortFree(provisional.engine);
      } else {
        discardGeneratedHandle(registry, hiddenEngineOwner(provisional.engine));
      }
      if (observationOwnerIsLive(provisional.observation)) {
        bestEffortRelease(registry, provisional.observation);
      } else {
        discardGeneratedHandle(registry, provisional.observation);
      }
      if (profileGenerationOwnerIsLive(provisional.profileGeneration)) {
        bestEffortRelease(registry, provisional.profileGeneration);
      } else {
        discardGeneratedHandle(registry, provisional.profileGeneration);
      }
    }
    return failure(INVALID_VIEW);
  }
  return provisional;
}

/** Whether a result was minted by this bootstrap module. @internal */
export function isOwnedBrowserWasmEngineBootstrapResult(
  value: unknown,
): value is BrowserWasmEngineBootstrapResult {
  return objectLike(value) && OWNED_BOOTSTRAP_RESULTS.has(value);
}

function consumeConstructionResult(
  rawResult: unknown,
  request: WasmEngineBootstrapSource,
  registry: GeneratedHandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserWasmEngineBootstrapResult {
  if (!claimGeneratedHandle(registry, rawResult, protectedHandles)) {
    return failure(INVALID_VIEW);
  }
  const result = rawResult as WasmEngineBootstrapResultView;
  const status = readScalar(result, "status");
  const takeEngine = readMethod(result, "takeEngine");
  if (status.invalid || takeEngine === null) return failure(INVALID_VIEW);

  const rawError = readScalar(result, "error");
  if (rawError.invalid) return failure(INVALID_VIEW);
  const error = readOwnedCoreError(
    rawError.value,
    registry,
    protectedHandles,
  );
  if (registry.invalid) return failure(INVALID_VIEW);

  const rawEngine = Reflect.apply(takeEngine, result, []) as unknown;
  const enginePresent = rawEngine !== undefined;
  if (
    enginePresent &&
    !claimGeneratedHandle(registry, rawEngine, protectedHandles)
  ) {
    return failure(INVALID_VIEW);
  }

  if (status.value === "error") {
    return !enginePresent && error !== null && error !== undefined
      ? failure(error)
      : failure(INVALID_VIEW);
  }
  if (
    status.value !== "engine" ||
    error !== undefined ||
    !enginePresent ||
    !objectLike(rawEngine)
  ) {
    return failure(INVALID_VIEW);
  }

  const engineSnapshot = snapshotEngineMethods(rawEngine, registry);
  if (engineSnapshot === null) return failure(INVALID_VIEW);

  const rawGeneration = Reflect.apply(
    engineSnapshot.profileGeneration,
    rawEngine,
    [],
  ) as unknown;
  if (
    !claimGeneratedHandle(registry, rawGeneration, protectedHandles) ||
    !wasmProfileGenerationIsLive(rawGeneration) ||
    !wasmViewMatchesProfileGeneration(rawEngine, rawGeneration)
  ) {
    return failure(INVALID_GENERATION);
  }

  const rawDescriptor = Reflect.apply(
    engineSnapshot.profileDescriptor,
    rawEngine,
    [],
  ) as unknown;
  if (
    !claimGeneratedHandle(registry, rawDescriptor, protectedHandles) ||
    !objectLike(rawDescriptor)
  ) {
    return failure(INVALID_DESCRIPTOR);
  }
  const descriptorCleanup = takeGeneratedCleanup(registry, rawDescriptor);
  if (descriptorCleanup === undefined) return failure(INVALID_DESCRIPTOR);
  const descriptorResult = consumeWasmCompiledProfileDescriptorWithCleanup(
    rawGeneration,
    rawDescriptor as WasmCompiledProfileDescriptorView,
    descriptorCleanup,
    [rawEngine, rawGeneration],
  );
  if (
    !descriptorResult.ok ||
    !isExactBuiltInBaseDescriptor(descriptorResult.descriptor)
  ) {
    return failure(INVALID_DESCRIPTOR);
  }

  const rawObservation = Reflect.apply(
    engineSnapshot.observation,
    rawEngine,
    [],
  ) as unknown;
  if (
    !claimGeneratedHandle(registry, rawObservation, protectedHandles) ||
    !objectLike(rawObservation) ||
    !wasmViewMatchesProfileGeneration(rawObservation, rawGeneration)
  ) {
    return failure(INVALID_VIEW);
  }
  const observationSnapshot = readObservation(rawObservation);
  if (
    observationSnapshot === null ||
    (request.kind === "document" &&
      (observationSnapshot.lineage !== request.lineageId ||
        observationSnapshot.revision !== "0"))
  ) {
    return failure(INVALID_VIEW);
  }

  const projectionRead = Reflect.apply(engineSnapshot.projection, rawEngine, [
    rawObservation,
  ]) as unknown;
  const projectionResult = consumeProjectionRead(
    projectionRead,
    rawEngine,
    rawGeneration,
    rawObservation,
    observationSnapshot,
    descriptorResult.descriptor,
    registry,
    protectedHandles,
  );
  if (!projectionResult.ok) return failure(projectionResult.error);

  if (!installProfileGenerationCleanup(rawGeneration, registry)) {
    return failure(INVALID_GENERATION);
  }
  if (!installObservationCleanup(rawObservation, registry)) {
    return failure(INVALID_VIEW);
  }
  const engine = createEngineOwner(engineSnapshot);
  if (engine === null) return failure(INVALID_VIEW);
  const success = Object.freeze({
    ok: true as const,
    engine,
    profileGeneration: rawGeneration,
    profileDescriptor: descriptorResult.descriptor,
    observation: rawObservation as WasmCommandObservationView,
    projection: projectionResult.projection,
  });
  OWNED_BOOTSTRAP_RESULTS.add(success);
  return success;
}

function consumeProjectionRead(
  rawResult: unknown,
  rawEngine: object,
  rawGeneration: WasmProfileGenerationView,
  rawObservation: object,
  expected: ObservationSnapshot,
  descriptor: BrowserCompiledProfileDescriptor,
  registry: GeneratedHandleRegistry,
  protectedHandles: ReadonlySet<object>,
):
  | Readonly<{ ok: true; projection: BaseDocumentProjection }>
  | Readonly<{ ok: false; error: BrowserWasmEngineBootstrapError }> {
  if (!claimGeneratedHandle(registry, rawResult, protectedHandles)) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  const result = rawResult as WasmProjectionReadResultView;
  if (!wasmViewMatchesProfileGeneration(result, rawGeneration)) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  const status = readScalar(result, "status");
  const takeProjection = readMethod(result, "takeProjection");
  if (status.invalid || takeProjection === null) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }

  const rawError = readScalar(result, "error");
  if (rawError.invalid) return Object.freeze({ ok: false, error: INVALID_VIEW });
  const error = readOwnedCoreError(
    rawError.value,
    registry,
    protectedHandles,
  );
  if (registry.invalid) return Object.freeze({ ok: false, error: INVALID_VIEW });

  const rawProjection = Reflect.apply(takeProjection, result, []) as unknown;
  if (rawProjection !== undefined) {
    if (
      rawProjection === rawEngine ||
      rawProjection === rawGeneration ||
      rawProjection === rawObservation ||
      !claimGeneratedHandle(registry, rawProjection, protectedHandles)
    ) {
      return Object.freeze({ ok: false, error: INVALID_VIEW });
    }
  }

  if (status.value === "error") {
    return rawProjection === undefined && error !== null && error !== undefined
      ? Object.freeze({ ok: false, error })
      : Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  if (
    status.value !== "projection" ||
    error !== undefined ||
    !objectLike(rawProjection) ||
    !wasmViewMatchesProfileGeneration(rawProjection, rawGeneration)
  ) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }

  const facade = snapshotProjectionFacade(rawProjection, registry);
  if (facade === null) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  const consumed = consumeSemanticProjection(
    facade,
    rawGeneration,
    descriptor.schema.fingerprint,
  );
  if (!consumed.ok) {
    return Object.freeze({ ok: false, error: INVALID_PROJECTION });
  }
  if (
    consumed.value.snapshot.lineage !== expected.lineage ||
    consumed.value.snapshot.revision !== expected.revision
  ) {
    return Object.freeze({ ok: false, error: INVALID_PROJECTION });
  }
  return Object.freeze({ ok: true, projection: consumed.value });
}

function snapshotProjectionFacade(
  raw: object,
  registry: GeneratedHandleRegistry,
): SemanticProjectionView | null {
  const cleanup = takeGeneratedCleanup(registry, raw);
  if (cleanup === undefined) return null;
  try {
    const view = raw as SemanticProjectionView;
    const schemaName = view.schemaName;
    const schemaVersion = view.schemaVersion;
    const schemaFingerprint = view.schemaFingerprint;
    const snapshotLineage = view.snapshotLineage;
    const snapshotRevision = view.snapshotRevision;
    const nodeCount = view.nodeCount;
    const rootIndex = view.rootIndex;
    const nodeKind = view.nodeKind;
    const elementType = view.elementType;
    const childCount = view.childCount;
    const childAt = view.childAt;
    const text = view.text;
    const formatCount = view.formatCount;
    const formatType = view.formatType;
    const matchesProfileGeneration = view.matchesProfileGeneration;
    const scalars = [
      schemaName,
      schemaVersion,
      schemaFingerprint,
      snapshotLineage,
      snapshotRevision,
      nodeCount,
      rootIndex,
    ];
    const methods = [
      nodeKind,
      elementType,
      childCount,
      childAt,
      text,
      formatCount,
      formatType,
      matchesProfileGeneration,
    ];
    if (
      typeof schemaFingerprint !== "string" ||
      scalars.some(valueIsThenable) ||
      methods.some((method) =>
        typeof method !== "function" || valueIsThenable(method)
      )
    ) {
      bestEffortCleanup(cleanup);
      return null;
    }
    const invoke = (method: Function, args: readonly unknown[]): unknown => {
      const returned = Reflect.apply(method, raw, args) as unknown;
      return valueIsThenable(returned) ? undefined : returned;
    };
    return Object.freeze({
      schemaName,
      schemaVersion,
      schemaFingerprint,
      snapshotLineage,
      snapshotRevision,
      nodeCount,
      rootIndex,
      nodeKind: (index: number) => invoke(nodeKind, [index]) as ReturnType<SemanticProjectionView["nodeKind"]>,
      elementType: (index: number) => invoke(elementType, [index]) as ReturnType<SemanticProjectionView["elementType"]>,
      childCount: (index: number) => invoke(childCount, [index]) as ReturnType<SemanticProjectionView["childCount"]>,
      childAt: (index: number, ordinal: number) => invoke(childAt, [index, ordinal]) as ReturnType<SemanticProjectionView["childAt"]>,
      text: (index: number) => invoke(text, [index]) as ReturnType<SemanticProjectionView["text"]>,
      formatCount: (index: number) => invoke(formatCount, [index]) as ReturnType<SemanticProjectionView["formatCount"]>,
      formatType: (index: number, ordinal: number) => invoke(formatType, [index, ordinal]) as ReturnType<SemanticProjectionView["formatType"]>,
      matchesProfileGeneration: (generation: WasmProfileGenerationView) =>
        invoke(matchesProfileGeneration as Function, [generation]) as boolean,
      free: (() => cleanup()) as () => void,
    });
  } catch {
    bestEffortCleanup(cleanup);
    return null;
  }
}

function snapshotEngineMethods(
  raw: object,
  registry: GeneratedHandleRegistry,
): EngineMethodSnapshot | null {
  const cleanup = registry.cleanups.get(raw);
  if (cleanup === undefined) return null;
  try {
    const engine = raw as WasmBootstrappedEngineView;
    const snapshot: EngineMethodSnapshot = {
      raw: engine,
      cleanup,
      actionStates: engine.actionStates,
      sessionCheckpointJson: engine.sessionCheckpointJson,
      documentJson: engine.documentJson,
      clearSelection: engine.clearSelection,
      setRangeSelection: engine.setRangeSelection,
      selection: engine.selection,
      executeNoInputAction: engine.executeNoInputAction,
      executeStringAction: engine.executeStringAction,
      undo: engine.undo,
      redo: engine.redo,
      closeHistoryGroup: engine.closeHistoryGroup,
      matchesProfileGeneration: engine.matchesProfileGeneration,
      profileGeneration: engine.profileGeneration,
      profileDescriptor: engine.profileDescriptor,
      observation: engine.observation,
      projection: engine.projection,
    };
    const methods: readonly unknown[] = [
      snapshot.actionStates,
      snapshot.sessionCheckpointJson,
      snapshot.documentJson,
      snapshot.clearSelection,
      snapshot.setRangeSelection,
      snapshot.selection,
      snapshot.executeNoInputAction,
      snapshot.executeStringAction,
      snapshot.undo,
      snapshot.redo,
      snapshot.closeHistoryGroup,
      snapshot.matchesProfileGeneration,
      snapshot.profileGeneration,
      snapshot.profileDescriptor,
      snapshot.observation,
      snapshot.projection,
    ];
    for (const method of methods) {
      if (typeof method !== "function" || valueIsThenable(method)) return null;
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

const HIDDEN_ENGINE_OWNER = new WeakMap<WasmBootstrappedEngineView, object>();
const ENGINE_OWNER_LIVENESS = new WeakMap<WasmBootstrappedEngineView, () => boolean>();
const PROFILE_GENERATION_OWNER_LIVENESS = new WeakMap<object, () => boolean>();
const OBSERVATION_OWNER_LIVENESS = new WeakMap<object, () => boolean>();

function createEngineOwner(
  snapshot: EngineMethodSnapshot,
): WasmBootstrappedEngineView | null {
  const raw = snapshot.raw;
  let live = true;
  const invoke = <T>(method: Function, args: readonly unknown[]): T => {
    if (!live) throw new TypeError("Wasm engine owner is disposed");
    const result = Reflect.apply(method, raw, args) as unknown;
    if (result === raw) {
      throw new TypeError("generated engine returned its private owner");
    }
    return result as T;
  };
  const stableFree = (): void => {
    if (!live) return;
    live = false;
    const returned = snapshot.cleanup();
    if (returned !== undefined) {
      containSettlement(returned);
      throw new TypeError("generated engine cleanup returned a value");
    }
  };
  try {
    const installed = Reflect.defineProperty(raw, "free", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: stableFree,
    });
    const descriptor = Reflect.getOwnPropertyDescriptor(raw, "free");
    if (
      !installed ||
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.value !== stableFree ||
      descriptor.configurable !== false ||
      descriptor.writable !== false
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const owner: WasmBootstrappedEngineView = {
    actionStates: (expected) => invoke(snapshot.actionStates, [expected]),
    sessionCheckpointJson: () => invoke(snapshot.sessionCheckpointJson, []),
    documentJson: (expected) => invoke(snapshot.documentJson, [expected]),
    clearSelection: (expected) => invoke(snapshot.clearSelection, [expected]),
    setRangeSelection: (
      expected,
      anchorKind,
      anchorNodeIndex,
      anchorOffset,
      anchorAffinity,
      focusKind,
      focusNodeIndex,
      focusOffset,
      focusAffinity,
    ) => invoke(snapshot.setRangeSelection, [
      expected,
      anchorKind,
      anchorNodeIndex,
      anchorOffset,
      anchorAffinity,
      focusKind,
      focusNodeIndex,
      focusOffset,
      focusAffinity,
    ]),
    selection: (expected) => invoke(snapshot.selection, [expected]),
    executeNoInputAction: (expected, actionId) =>
      invoke(snapshot.executeNoInputAction, [expected, actionId]),
    executeStringAction: (expected, actionId, value) =>
      invoke(snapshot.executeStringAction, [expected, actionId, value]),
    undo: (expected) => invoke(snapshot.undo, [expected]),
    redo: (expected) => invoke(snapshot.redo, [expected]),
    closeHistoryGroup: (expected) =>
      invoke(snapshot.closeHistoryGroup, [expected]),
    matchesProfileGeneration: (generation) =>
      invoke(snapshot.matchesProfileGeneration, [generation]),
    profileGeneration: () => invoke(snapshot.profileGeneration, []),
    profileDescriptor: () => invoke(snapshot.profileDescriptor, []),
    observation: () => invoke(snapshot.observation, []),
    projection: (expected) => invoke(snapshot.projection, [expected]),
    free: stableFree,
  };
  Object.freeze(owner);
  HIDDEN_ENGINE_OWNER.set(owner, raw);
  ENGINE_OWNER_LIVENESS.set(owner, () => live);
  return owner;
}

function installObservationCleanup(
  observation: object,
  registry: GeneratedHandleRegistry,
): boolean {
  const cleanup = registry.cleanups.get(observation);
  if (cleanup === undefined) return false;
  let live = true;
  const stableFree = (): void => {
    if (!live) return;
    live = false;
    const returned = cleanup();
    if (returned !== undefined) {
      containSettlement(returned);
      throw new TypeError("generated observation cleanup returned a value");
    }
  };
  try {
    const installed = Reflect.defineProperty(observation, "free", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: stableFree,
    });
    const descriptor = Reflect.getOwnPropertyDescriptor(observation, "free");
    const valid = (
      installed &&
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.value === stableFree &&
      descriptor.configurable === false &&
      descriptor.writable === false
    );
    if (valid) OBSERVATION_OWNER_LIVENESS.set(observation, () => live);
    return valid;
  } catch {
    return false;
  }
}

function installProfileGenerationCleanup(
  generation: WasmProfileGenerationView,
  registry: GeneratedHandleRegistry,
): boolean {
  const cleanup = registry.cleanups.get(generation);
  if (cleanup === undefined) return false;
  let live = true;
  const stableFree = (): void => {
    if (!live) return;
    live = false;
    const returned = cleanup();
    if (returned !== undefined) {
      containSettlement(returned);
      throw new TypeError("generated profile-generation cleanup returned a value");
    }
  };
  try {
    const installed = Reflect.defineProperty(generation, "free", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: stableFree,
    });
    const descriptor = Reflect.getOwnPropertyDescriptor(generation, "free");
    const valid = installed &&
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.value === stableFree &&
      descriptor.configurable === false &&
      descriptor.writable === false;
    if (valid) PROFILE_GENERATION_OWNER_LIVENESS.set(generation, () => live);
    return valid;
  } catch {
    return false;
  }
}

function hiddenEngineOwner(owner: WasmBootstrappedEngineView): object {
  return HIDDEN_ENGINE_OWNER.get(owner) ?? owner;
}

function engineOwnerIsLive(owner: WasmBootstrappedEngineView): boolean {
  return ENGINE_OWNER_LIVENESS.get(owner)?.() === true;
}

function observationOwnerIsLive(owner: WasmCommandObservationView): boolean {
  return OBSERVATION_OWNER_LIVENESS.get(owner)?.() === true;
}

function profileGenerationOwnerIsLive(owner: WasmProfileGenerationView): boolean {
  return PROFILE_GENERATION_OWNER_LIVENESS.get(owner)?.() === true;
}

function resolveFactory(
  value: unknown,
):
  | Readonly<{ ok: true; value: ResolvedFactory }>
  | Readonly<{ ok: false; error: BrowserWasmEngineBootstrapError }> {
  if (!objectLike(value) || containThenable(value)) {
    return Object.freeze({ ok: false, error: INVALID_MODULE });
  }
  try {
    const candidate = value as Partial<WasmEngineBootstrapModuleView>;
    // Compatibility probes are captured and called before the generated
    // factory property is touched. A mismatched package therefore cannot run a
    // hostile or simply incompatible factory getter as part of rejection.
    const abiProbe = Reflect.get(candidate, "breditorWasmAbiVersion", candidate) as unknown;
    const versionProbe = Reflect.get(candidate, "breditorVersion", candidate) as unknown;
    if (
      typeof abiProbe !== "function" ||
      valueIsThenable(abiProbe) ||
      typeof versionProbe !== "function" ||
      valueIsThenable(versionProbe)
    ) {
      return Object.freeze({ ok: false, error: INVALID_MODULE });
    }
    const abi = Reflect.apply(abiProbe, value, []) as unknown;
    if (valueIsThenable(abi) || abi !== BREDITOR_WASM_ABI_VERSION) {
      return Object.freeze({ ok: false, error: INCOMPATIBLE_ABI });
    }
    const version = Reflect.apply(versionProbe, value, []) as unknown;
    if (valueIsThenable(version) || version !== BREDITOR_BROWSER_PACKAGE_VERSION) {
      return Object.freeze({ ok: false, error: INCOMPATIBLE_VERSION });
    }

    const factory = Reflect.get(candidate, "BreditorEngine", candidate) as unknown;
    if (!objectLike(factory) || containThenable(factory)) {
      return Object.freeze({ ok: false, error: INVALID_MODULE });
    }
    const structural = factory as WasmEngineBootstrapFactoryView;
    const fromDocumentJson = structural.fromDocumentJson;
    const fromSessionCheckpointJson = structural.fromSessionCheckpointJson;
    if (
      typeof fromDocumentJson !== "function" ||
      valueIsThenable(fromDocumentJson) ||
      typeof fromSessionCheckpointJson !== "function" ||
      valueIsThenable(fromSessionCheckpointJson)
    ) {
      return Object.freeze({ ok: false, error: INVALID_MODULE });
    }
    const protectedHandles = new Set<object>([value, factory]);
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        factory: structural,
        fromDocumentJson,
        fromSessionCheckpointJson,
        protectedHandles,
      }),
    });
  } catch {
    return Object.freeze({ ok: false, error: INVALID_MODULE });
  }
}

function readSource(value: unknown): WasmEngineBootstrapSource | null {
  const kind = exactRecord(value, ["kind", "lineageId", "documentJson", "historyCapacity"]);
  if (kind !== null && kind["kind"] === "document") {
    const lineageId = kind["lineageId"];
    const documentJson = kind["documentJson"];
    const historyCapacity = kind["historyCapacity"];
    if (
      typeof lineageId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(lineageId) &&
      lineageId.length <= 128 &&
      typeof documentJson === "string" &&
      sessionCheckpointJsonUtf8Bytes(documentJson) !== null &&
      typeof historyCapacity === "number" &&
      Number.isSafeInteger(historyCapacity) &&
      historyCapacity >= 0 &&
      historyCapacity <= MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY
    ) {
      return Object.freeze({
        kind: "document",
        lineageId,
        documentJson,
        historyCapacity,
      });
    }
    return null;
  }
  const checkpoint = exactRecord(value, ["kind", "checkpointJson"]);
  if (
    checkpoint !== null &&
    checkpoint["kind"] === "sessionCheckpoint" &&
    sessionCheckpointJsonUtf8Bytes(checkpoint["checkpointJson"]) !== null
  ) {
    return Object.freeze({
      kind: "sessionCheckpoint",
      checkpointJson: checkpoint["checkpointJson"] as string,
    });
  }
  return null;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (!objectLike(value) || Array.isArray(value)) return null;
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) return null;
      record[key] = descriptor.value as unknown;
    }
    return record;
  } catch {
    return null;
  }
}

function readOwnedCoreError(
  value: unknown,
  registry: GeneratedHandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserWasmEngineBootstrapError | null | undefined {
  if (value === undefined) return undefined;
  if (!claimGeneratedHandle(registry, value, protectedHandles)) return null;
  try {
    const code = (value as WasmSessionCheckpointErrorView).code;
    const message = (value as WasmSessionCheckpointErrorView).message;
    if (
      valueIsThenable(code) ||
      valueIsThenable(message) ||
      typeof code !== "string" ||
      !stableCode(code) ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 256
    ) {
      registry.invalid = true;
      return null;
    }
    return Object.freeze({ kind: "core", code, message: CORE_ERROR_MESSAGE });
  } catch {
    registry.invalid = true;
    return null;
  }
}

function readObservation(value: object): ObservationSnapshot | null {
  try {
    const observation = value as WasmCommandObservationView;
    const lineage = observation.snapshotLineage;
    const revision = observation.snapshotRevision;
    if (
      valueIsThenable(lineage) ||
      valueIsThenable(revision) ||
      typeof lineage !== "string" ||
      lineage.length === 0 ||
      lineage.length > 128 ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(lineage) ||
      typeof revision !== "string" ||
      !canonicalU64(revision)
    ) {
      return null;
    }
    return Object.freeze({ lineage, revision });
  } catch {
    return null;
  }
}

function isExactBuiltInBaseDescriptor(
  descriptor: BrowserCompiledProfileDescriptor,
): boolean {
  const { schema, formats, intents, actionStates } = descriptor;
  return schema.name === "breditor/base" &&
    schema.version === 1 &&
    schema.fingerprint === BREDITOR_BASE_SCHEMA_FINGERPRINT &&
    formats.length === 1 &&
    formats[0]?.kind === "breditor/strong" &&
    formats[0]?.revision === 1 &&
    intents.length === 0 &&
    actionStates.length === 3 &&
    actionStateMatches(
      actionStates[0],
      "breditor/control-bold",
      "direct",
      "breditor/toggle-strong",
      "tracked",
    ) &&
    actionStateMatches(
      actionStates[1],
      "breditor/control-redo",
      "history",
      "redo",
      "stateless",
    ) &&
    actionStateMatches(
      actionStates[2],
      "breditor/control-undo",
      "history",
      "undo",
      "stateless",
    );
}

function actionStateMatches(
  state: BrowserCompiledProfileDescriptor["actionStates"][number] | undefined,
  id: string,
  sourceKind: "direct" | "history",
  sourceIdentity: string,
  activation: "stateless" | "tracked",
): boolean {
  if (
    state === undefined ||
    state.id !== id ||
    state.source.kind !== sourceKind ||
    state.state.activation !== activation ||
    state.state.value !== undefined
  ) {
    return false;
  }
  return state.source.kind === "direct"
    ? state.source.actionId === sourceIdentity
    : state.source.direction === sourceIdentity;
}

function readScalar(
  value: object,
  key: string,
): Readonly<{ invalid: boolean; value: unknown }> {
  try {
    const result = Reflect.get(value, key, value) as unknown;
    return Object.freeze({ invalid: valueIsThenable(result), value: result });
  } catch {
    return Object.freeze({ invalid: true, value: undefined });
  }
}

function readMethod(value: object, key: string): Function | null {
  try {
    const method = Reflect.get(value, key, value) as unknown;
    return typeof method === "function" && !valueIsThenable(method)
      ? method
      : null;
  } catch {
    return null;
  }
}

function claimGeneratedHandle(
  registry: GeneratedHandleRegistry,
  value: unknown,
  protectedHandles: ReadonlySet<object>,
): value is object {
  if (
    !objectLike(value) ||
    protectedHandles.has(value) ||
    registry.cleanups.has(value)
  ) {
    registry.invalid = true;
    return false;
  }
  let free: unknown;
  try {
    free = (value as { free?: unknown }).free;
  } catch {
    containThenable(value);
    registry.invalid = true;
    return false;
  }
  if (typeof free !== "function") {
    valueIsThenable(free);
    containThenable(value);
    registry.invalid = true;
    return false;
  }
  registry.cleanups.set(value, () => Reflect.apply(free, value, []) as unknown);
  registry.order.push(value);
  if (valueIsThenable(free) || containThenable(value)) {
    registry.invalid = true;
    return false;
  }
  return true;
}

function takeGeneratedCleanup(
  registry: GeneratedHandleRegistry,
  value: object,
): GeneratedCleanup | undefined {
  const cleanup = registry.cleanups.get(value);
  if (cleanup !== undefined) registry.cleanups.delete(value);
  return cleanup;
}

function releaseGeneratedHandles(
  registry: GeneratedHandleRegistry,
  transferred: ReadonlySet<object>,
): boolean {
  let failed = registry.invalid;
  for (let index = registry.order.length - 1; index >= 0; index -= 1) {
    const value = registry.order[index];
    if (value === undefined || transferred.has(value)) continue;
    const cleanup = registry.cleanups.get(value);
    if (cleanup === undefined) continue;
    registry.cleanups.delete(value);
    if (!runCleanup(cleanup)) failed = true;
  }
  return failed;
}

function bestEffortRelease(
  registry: GeneratedHandleRegistry,
  value: object,
): void {
  const cleanup = registry.cleanups.get(value);
  registry.cleanups.delete(value);
  if (cleanup !== undefined) bestEffortCleanup(cleanup);
}

function discardGeneratedHandle(
  registry: GeneratedHandleRegistry,
  value: object,
): void {
  registry.cleanups.delete(value);
}

function bestEffortFree(value: { free(): void }): void {
  try {
    const returned = value.free() as unknown;
    if (returned !== undefined) containSettlement(returned);
  } catch {
    // The primary boundary failure is already fixed and payload-redacted.
  }
}

function bestEffortCleanup(cleanup: GeneratedCleanup): void {
  try {
    const returned = cleanup();
    if (returned !== undefined) containSettlement(returned);
  } catch {
    // The caller records a boundary failure independently.
  }
}

function runCleanup(cleanup: GeneratedCleanup): boolean {
  try {
    const returned = cleanup();
    if (returned === undefined) return true;
    containSettlement(returned);
    return false;
  } catch {
    return false;
  }
}

function containThenable(value: object): boolean {
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  containSettlement(value);
  return true;
}

function containSettlement(value: unknown): void {
  if (!objectLike(value)) return;
  try {
    const assimilated = PROMISE_RESOLVE(value);
    Reflect.apply(PROMISE_THEN, assimilated, [
      IGNORE_SETTLEMENT,
      IGNORE_SETTLEMENT,
    ]);
  } catch {
    // The value remains invalid when hostile thenable assimilation fails.
  }
}

function valueIsThenable(value: unknown): boolean {
  return objectLike(value) && containThenable(value);
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function stableCode(value: string): boolean {
  return (
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?$/u.test(value)
  );
}

function canonicalU64(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) return false;
  try {
    return BigInt(value) <= 18_446_744_073_709_551_615n;
  } catch {
    return false;
  }
}

function boundaryError(
  code: Extract<BrowserWasmEngineBootstrapError, { kind: "boundary" }>["code"],
  message: string,
): BrowserWasmEngineBootstrapError {
  return Object.freeze({ kind: "boundary", code, message });
}

function failure(
  error: BrowserWasmEngineBootstrapError,
): BrowserWasmEngineBootstrapResult {
  const result = Object.freeze({ ok: false as const, error });
  OWNED_BOOTSTRAP_RESULTS.add(result);
  return result;
}

const EMPTY_OBJECT_SET: ReadonlySet<object> = new Set<object>();
