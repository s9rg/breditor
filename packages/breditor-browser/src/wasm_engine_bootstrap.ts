import type { BaseDocumentProjection } from "./projection.js";
import {
  documentJsonUtf8Bytes,
  type WasmDurableJsonContract,
  type WasmDurableMode,
} from "./wasm_document_json.js";
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
  sessionCheckpointJsonMatchesDurableContract,
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
export const BREDITOR_BROWSER_PACKAGE_VERSION = "0.2.0-rc.1" as const;

/** Maximum history capacity admitted by the default Wasm checkpoint policy. */
export const MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY = 100;

/** Maximum UTF-8 bytes admitted before compiled-profile bootstrap. */
export const MAX_WASM_PROFILE_BOOTSTRAP_JSON_BYTES = 8 * 1024 * 1024;

/** Exact schema fingerprint required by the built-in Document V1 profile. */
export const BREDITOR_BASE_SCHEMA_FINGERPRINT =
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

/** Reusable generated compiled-profile owner used only during bootstrap. */
export interface WasmCompiledProfileBootstrapView
  extends WasmProfileCorrelatedView {
  createEngineFromDocumentJson(
    lineageId: string,
    documentJson: string,
    historyCapacity: number,
  ): WasmEngineBootstrapResultView;
  createEngineFromSessionCheckpointJson(
    checkpointJson: string,
  ): WasmEngineBootstrapResultView;
  generation(): WasmProfileGenerationView;
  descriptor(): WasmCompiledProfileDescriptorView;
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
  free(): void;
}

/** One-shot generated result returned by profile compilation. */
export interface WasmCompiledProfileBootstrapResultView {
  readonly status: "profile" | "taken" | "error";
  readonly error: WasmSessionCheckpointErrorView | undefined;
  takeProfile(): WasmCompiledProfileBootstrapView | undefined;
  free(): void;
}

/** Static generated compiled-profile entrypoint exposed by the paired module. */
export interface WasmCompiledProfileBootstrapFactoryView {
  fromBootstrapJson(
    bootstrapJson: string,
  ): WasmCompiledProfileBootstrapResultView;
}

/** Structural generated module namespace with explicit compatibility probes. */
export interface WasmEngineBootstrapModuleView {
  readonly BreditorEngine: WasmEngineBootstrapFactoryView;
  readonly BreditorCompiledProfile?: WasmCompiledProfileBootstrapFactoryView;
  breditorWasmAbiVersion(): string;
  breditorVersion(): string;
}

/** Strict opt-in selector for compiled-profile V2 bootstrap. */
export interface WasmSemanticProfileBootstrapSource {
  readonly bootstrapJson: string;
}

/** Strict request for a history-free Document V1 engine. */
export interface WasmDocumentBootstrapSource {
  readonly kind: "document";
  readonly lineageId: string;
  readonly documentJson: string;
  readonly historyCapacity: number;
  readonly semanticProfile?: WasmSemanticProfileBootstrapSource;
}

/** Strict request for a replay-proved Session Checkpoint V1 engine. */
export interface WasmSessionCheckpointBootstrapSource {
  readonly kind: "sessionCheckpoint";
  readonly checkpointJson: string;
  readonly semanticProfile?: WasmSemanticProfileBootstrapSource;
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
      durableMode: WasmDurableMode;
      profileGeneration: WasmProfileGenerationView;
      profileDescriptor: BrowserCompiledProfileDescriptor;
      observation: WasmCommandObservationView;
      projection: BaseDocumentProjection;
    }>
  | Readonly<{ ok: false; error: BrowserWasmEngineBootstrapError }>;

/** Handle-free compiled-profile metadata preflighted before persistence load. */
export type BrowserWasmSemanticProfilePreflightResult =
  | Readonly<{
      ok: true;
      profileDescriptor: BrowserCompiledProfileDescriptor;
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

type ResolvedFactory =
  | Readonly<{
      durableMode: "v1";
      factory: WasmEngineBootstrapFactoryView;
      fromDocumentJson: WasmEngineBootstrapFactoryView["fromDocumentJson"];
      fromSessionCheckpointJson: WasmEngineBootstrapFactoryView["fromSessionCheckpointJson"];
      protectedHandles: ReadonlySet<object>;
    }>
  | Readonly<{
      durableMode: "v2";
      factory: WasmCompiledProfileBootstrapFactoryView;
      fromBootstrapJson: WasmCompiledProfileBootstrapFactoryView["fromBootstrapJson"];
      protectedHandles: ReadonlySet<object>;
    }>;

interface CompiledProfileExpectation {
  readonly profile: WasmCompiledProfileBootstrapView;
  readonly generation: WasmProfileGenerationView;
  readonly descriptor: BrowserCompiledProfileDescriptor;
  readonly durableContract: WasmDurableJsonContract;
  readonly matchesProfileGeneration: WasmCompiledProfileBootstrapView["matchesProfileGeneration"];
  readonly createEngineFromDocumentJson: WasmCompiledProfileBootstrapView["createEngineFromDocumentJson"];
  readonly createEngineFromSessionCheckpointJson: WasmCompiledProfileBootstrapView["createEngineFromSessionCheckpointJson"];
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
  readonly executeNoInputIntent: WasmCommandEngineView["executeNoInputIntent"];
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

  const resolved = resolveFactory(module, request.semanticProfile !== undefined);
  if (!resolved.ok) return failure(resolved.error);

  const registry: GeneratedHandleRegistry = {
    cleanups: new Map(),
    order: [],
    invalid: false,
  };
  let provisional: BrowserWasmEngineBootstrapResult = failure(INVALID_VIEW);
  try {
    if (resolved.value.durableMode === "v1") {
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
    } else {
      const compiled = consumeCompiledProfile(
        request.semanticProfile?.bootstrapJson,
        resolved.value,
        registry,
      );
      if (!compiled.ok) {
        provisional = failure(compiled.error);
      } else if (!sourceMatchesCompiledProfile(request, compiled.value.durableContract)) {
        provisional = failure(INVALID_REQUEST);
      } else {
        const rawResult = request.kind === "document"
          ? Reflect.apply(
              compiled.value.createEngineFromDocumentJson,
              compiled.value.profile,
              [request.lineageId, request.documentJson, request.historyCapacity],
            ) as unknown
          : Reflect.apply(
              compiled.value.createEngineFromSessionCheckpointJson,
              compiled.value.profile,
              [request.checkpointJson],
            ) as unknown;
        provisional = consumeConstructionResult(
          rawResult,
          request,
          registry,
          resolved.value.protectedHandles,
          compiled.value,
        );
      }
    }
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

/**
 * Compiles and consumes one semantic profile solely to expose trusted metadata.
 *
 * Every generated result, profile, descriptor, and generation owner is released
 * before return. The successful descriptor is deeply frozen and handle-free;
 * callers intentionally compile the same bootstrap JSON again for engine
 * construction rather than retaining a generated owner across an async load.
 */
export function preflightWasmSemanticProfile(
  module: WasmEngineBootstrapModuleView,
  source: WasmSemanticProfileBootstrapSource,
): BrowserWasmSemanticProfilePreflightResult {
  const normalized = readSemanticProfile(source);
  if (normalized === null || normalized === undefined) {
    return preflightFailure(INVALID_REQUEST);
  }
  const resolved = resolveFactory(module, true);
  if (!resolved.ok) return preflightFailure(resolved.error);
  if (resolved.value.durableMode !== "v2") {
    return preflightFailure(INVALID_MODULE);
  }

  const registry: GeneratedHandleRegistry = {
    cleanups: new Map(),
    order: [],
    invalid: false,
  };
  let provisional: BrowserWasmSemanticProfilePreflightResult =
    preflightFailure(INVALID_VIEW);
  try {
    const compiled = consumeCompiledProfile(
      normalized.bootstrapJson,
      resolved.value,
      registry,
    );
    provisional = compiled.ok
      ? Object.freeze({
          ok: true as const,
          profileDescriptor: compiled.value.descriptor,
        })
      : preflightFailure(compiled.error);
  } catch {
    provisional = preflightFailure(INVALID_VIEW);
  }
  return releaseGeneratedHandles(registry, EMPTY_OBJECT_SET)
    ? preflightFailure(INVALID_VIEW)
    : provisional;
}

/** Whether a result was minted by this bootstrap module. @internal */
export function isOwnedBrowserWasmEngineBootstrapResult(
  value: unknown,
): value is BrowserWasmEngineBootstrapResult {
  return objectLike(value) && OWNED_BOOTSTRAP_RESULTS.has(value);
}

function consumeCompiledProfile(
  bootstrapJson: unknown,
  resolved: Extract<ResolvedFactory, { durableMode: "v2" }>,
  registry: GeneratedHandleRegistry,
):
  | Readonly<{ ok: true; value: CompiledProfileExpectation }>
  | Readonly<{ ok: false; error: BrowserWasmEngineBootstrapError }> {
  if (typeof bootstrapJson !== "string") {
    return Object.freeze({ ok: false, error: INVALID_REQUEST });
  }
  const rawResult = Reflect.apply(
    resolved.fromBootstrapJson,
    resolved.factory,
    [bootstrapJson],
  ) as unknown;
  if (!claimGeneratedHandle(registry, rawResult, resolved.protectedHandles)) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  const result = rawResult as WasmCompiledProfileBootstrapResultView;
  const status = readScalar(result, "status");
  const takeProfile = readMethod(result, "takeProfile");
  if (status.invalid || takeProfile === null) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  const rawError = readScalar(result, "error");
  if (rawError.invalid) return Object.freeze({ ok: false, error: INVALID_VIEW });
  const error = readOwnedCoreError(
    rawError.value,
    registry,
    resolved.protectedHandles,
  );
  if (registry.invalid) return Object.freeze({ ok: false, error: INVALID_VIEW });

  const rawProfile = Reflect.apply(takeProfile, result, []) as unknown;
  const profilePresent = rawProfile !== undefined;
  if (
    profilePresent &&
    !claimGeneratedHandle(registry, rawProfile, resolved.protectedHandles)
  ) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  if (status.value === "error") {
    return !profilePresent && error !== null && error !== undefined
      ? Object.freeze({ ok: false, error })
      : Object.freeze({ ok: false, error: INVALID_VIEW });
  }
  if (
    status.value !== "profile" ||
    error !== undefined ||
    !objectLike(rawProfile)
  ) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }

  const generation = readMethod(rawProfile, "generation");
  const descriptor = readMethod(rawProfile, "descriptor");
  const matchesProfileGeneration = readMethod(
    rawProfile,
    "matchesProfileGeneration",
  );
  const createEngineFromDocumentJson = readMethod(
    rawProfile,
    "createEngineFromDocumentJson",
  );
  const createEngineFromSessionCheckpointJson = readMethod(
    rawProfile,
    "createEngineFromSessionCheckpointJson",
  );
  if (
    generation === null ||
    descriptor === null ||
    matchesProfileGeneration === null ||
    createEngineFromDocumentJson === null ||
    createEngineFromSessionCheckpointJson === null
  ) {
    return Object.freeze({ ok: false, error: INVALID_VIEW });
  }

  const rawGeneration = Reflect.apply(generation, rawProfile, []) as unknown;
  if (
    !claimGeneratedHandle(registry, rawGeneration, resolved.protectedHandles) ||
    !wasmProfileGenerationIsLive(rawGeneration) ||
    !wasmViewMatchesProfileGeneration(rawProfile, rawGeneration)
  ) {
    return Object.freeze({ ok: false, error: INVALID_GENERATION });
  }
  const rawDescriptor = Reflect.apply(descriptor, rawProfile, []) as unknown;
  if (
    !claimGeneratedHandle(registry, rawDescriptor, resolved.protectedHandles) ||
    !objectLike(rawDescriptor)
  ) {
    return Object.freeze({ ok: false, error: INVALID_DESCRIPTOR });
  }
  const descriptorCleanup = takeGeneratedCleanup(registry, rawDescriptor);
  if (descriptorCleanup === undefined) {
    return Object.freeze({ ok: false, error: INVALID_DESCRIPTOR });
  }
  const descriptorResult = consumeWasmCompiledProfileDescriptorWithCleanup(
    rawGeneration,
    rawDescriptor as WasmCompiledProfileDescriptorView,
    descriptorCleanup,
    [rawProfile, rawGeneration],
  );
  if (!descriptorResult.ok) {
    return Object.freeze({ ok: false, error: INVALID_DESCRIPTOR });
  }
  const durableContract: WasmDurableJsonContract = Object.freeze({
    mode: "v2",
    schema: descriptorResult.descriptor.schema,
    formats: descriptorResult.descriptor.formats,
  });
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      profile: rawProfile as WasmCompiledProfileBootstrapView,
      generation: rawGeneration,
      descriptor: descriptorResult.descriptor,
      durableContract,
      matchesProfileGeneration:
        matchesProfileGeneration as WasmCompiledProfileBootstrapView["matchesProfileGeneration"],
      createEngineFromDocumentJson:
        createEngineFromDocumentJson as WasmCompiledProfileBootstrapView["createEngineFromDocumentJson"],
      createEngineFromSessionCheckpointJson:
        createEngineFromSessionCheckpointJson as WasmCompiledProfileBootstrapView["createEngineFromSessionCheckpointJson"],
    }),
  });
}

function sourceMatchesCompiledProfile(
  source: WasmEngineBootstrapSource,
  contract: WasmDurableJsonContract,
): boolean {
  return source.kind === "document"
    ? documentJsonUtf8Bytes(source.documentJson, contract) !== null
    : sessionCheckpointJsonMatchesDurableContract(
        source.checkpointJson,
        contract,
      ) !== null;
}

function consumeConstructionResult(
  rawResult: unknown,
  request: WasmEngineBootstrapSource,
  registry: GeneratedHandleRegistry,
  protectedHandles: ReadonlySet<object>,
  compiledProfile?: CompiledProfileExpectation,
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
    !wasmViewMatchesProfileGeneration(rawEngine, rawGeneration) ||
    (compiledProfile !== undefined &&
      !compiledProfileMatchesEngine(
        compiledProfile,
        engineSnapshot,
        rawGeneration,
      ))
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
  if (!descriptorResult.ok) {
    return failure(INVALID_DESCRIPTOR);
  }
  if (
    compiledProfile === undefined
      ? !isExactBuiltInBaseDescriptor(descriptorResult.descriptor)
      : !compiledProfileDescriptorsEqual(
          descriptorResult.descriptor,
          compiledProfile.descriptor,
        )
  ) {
    return failure(INVALID_DESCRIPTOR);
  }

  const activeGeneration = compiledProfile?.generation ?? rawGeneration;
  const activeDescriptor = compiledProfile?.descriptor ?? descriptorResult.descriptor;

  const rawObservation = Reflect.apply(
    engineSnapshot.observation,
    rawEngine,
    [],
  ) as unknown;
  if (
    !claimGeneratedHandle(registry, rawObservation, protectedHandles) ||
    !objectLike(rawObservation) ||
    !wasmViewMatchesProfileGeneration(rawObservation, activeGeneration)
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
    activeGeneration,
    rawObservation,
    observationSnapshot,
    compiledProfile === undefined
      ? BREDITOR_BASE_SCHEMA_FINGERPRINT
      : activeDescriptor,
    registry,
    protectedHandles,
  );
  if (!projectionResult.ok) return failure(projectionResult.error);

  if (!installProfileGenerationCleanup(activeGeneration, registry)) {
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
    durableMode: compiledProfile === undefined ? "v1" as const : "v2" as const,
    profileGeneration: activeGeneration,
    profileDescriptor: activeDescriptor,
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
  profile: string | BrowserCompiledProfileDescriptor,
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
    profile,
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
      executeNoInputIntent: engine.executeNoInputIntent,
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
      snapshot.executeNoInputIntent,
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
    executeNoInputIntent: (expected, intentId) =>
      invoke(snapshot.executeNoInputIntent, [expected, intentId]),
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
  compiledProfile: boolean,
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

    const factoryKey = compiledProfile
      ? "BreditorCompiledProfile"
      : "BreditorEngine";
    const factory = Reflect.get(candidate, factoryKey, candidate) as unknown;
    if (!objectLike(factory) || containThenable(factory)) {
      return Object.freeze({ ok: false, error: INVALID_MODULE });
    }
    const protectedHandles = new Set<object>([value, factory]);
    if (compiledProfile) {
      const structural = factory as WasmCompiledProfileBootstrapFactoryView;
      const fromBootstrapJson = structural.fromBootstrapJson;
      if (
        typeof fromBootstrapJson !== "function" ||
        valueIsThenable(fromBootstrapJson)
      ) {
        return Object.freeze({ ok: false, error: INVALID_MODULE });
      }
      return Object.freeze({
        ok: true,
        value: Object.freeze({
          durableMode: "v2" as const,
          factory: structural,
          fromBootstrapJson,
          protectedHandles,
        }),
      });
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
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        durableMode: "v1" as const,
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
  const document = exactRecord(value, [
    "kind",
    "lineageId",
    "documentJson",
    "historyCapacity",
  ]) ?? exactRecord(value, [
    "kind",
    "lineageId",
    "documentJson",
    "historyCapacity",
    "semanticProfile",
  ]);
  if (document !== null && document["kind"] === "document") {
    const lineageId = document["lineageId"];
    const documentJson = document["documentJson"];
    const historyCapacity = document["historyCapacity"];
    const semanticProfile = readSemanticProfile(document["semanticProfile"]);
    const hasSemanticProfile = Object.hasOwn(document, "semanticProfile");
    if (
      typeof lineageId === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(lineageId) &&
      lineageId.length <= 128 &&
      typeof documentJson === "string" &&
      sessionCheckpointJsonUtf8Bytes(documentJson) !== null &&
      typeof historyCapacity === "number" &&
      Number.isSafeInteger(historyCapacity) &&
      historyCapacity >= 0 &&
      historyCapacity <= MAX_WASM_BOOTSTRAP_HISTORY_CAPACITY &&
      (hasSemanticProfile
        ? semanticProfile !== null && semanticProfile !== undefined
        : semanticProfile === undefined)
    ) {
      if (semanticProfile === null) return null;
      return semanticProfile === undefined
        ? Object.freeze({
            kind: "document",
            lineageId,
            documentJson,
            historyCapacity,
          })
        : Object.freeze({
            kind: "document",
            lineageId,
            documentJson,
            historyCapacity,
            semanticProfile,
          });
    }
    return null;
  }
  const checkpoint = exactRecord(value, ["kind", "checkpointJson"]) ??
    exactRecord(value, ["kind", "checkpointJson", "semanticProfile"]);
  if (
    checkpoint !== null &&
    checkpoint["kind"] === "sessionCheckpoint" &&
    sessionCheckpointJsonUtf8Bytes(checkpoint["checkpointJson"]) !== null
  ) {
    const semanticProfile = readSemanticProfile(checkpoint["semanticProfile"]);
    const hasSemanticProfile = Object.hasOwn(checkpoint, "semanticProfile");
    if (
      hasSemanticProfile
        ? semanticProfile === null || semanticProfile === undefined
        : semanticProfile !== undefined
    ) {
      return null;
    }
    if (semanticProfile === null) return null;
    return semanticProfile === undefined
      ? Object.freeze({
          kind: "sessionCheckpoint",
          checkpointJson: checkpoint["checkpointJson"] as string,
        })
      : Object.freeze({
          kind: "sessionCheckpoint",
          checkpointJson: checkpoint["checkpointJson"] as string,
          semanticProfile,
        });
  }
  return null;
}

function readSemanticProfile(
  value: unknown,
): WasmSemanticProfileBootstrapSource | null | undefined {
  if (value === undefined) return undefined;
  const record = exactRecord(value, ["bootstrapJson"]);
  if (record === null) return null;
  const bootstrapJson = record["bootstrapJson"];
  if (
    typeof bootstrapJson !== "string" ||
    bootstrapJson.length === 0 ||
    bootstrapJson.length > MAX_WASM_PROFILE_BOOTSTRAP_JSON_BYTES ||
    wellFormedUtf8Length(
      bootstrapJson,
      MAX_WASM_PROFILE_BOOTSTRAP_JSON_BYTES,
    ) === null
  ) {
    return null;
  }
  return Object.freeze({ bootstrapJson });
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

function compiledProfileMatchesEngine(
  compiled: CompiledProfileExpectation,
  engine: EngineMethodSnapshot,
  engineGeneration: WasmProfileGenerationView,
): boolean {
  if (!wasmProfileGenerationIsLive(compiled.generation)) return false;
  try {
    const engineMatched = Reflect.apply(
      engine.matchesProfileGeneration,
      engine.raw,
      [compiled.generation],
    ) as unknown;
    const profileMatched = Reflect.apply(
      compiled.matchesProfileGeneration,
      compiled.profile,
      [engineGeneration],
    ) as unknown;
    const engineGenerationMatches = generationMatches(
      engineGeneration,
      compiled.generation,
    );
    const compiledGenerationMatches = generationMatches(
      compiled.generation,
      engineGeneration,
    );
    return !valueIsThenable(engineMatched) && engineMatched === true &&
      !valueIsThenable(profileMatched) && profileMatched === true &&
      engineGenerationMatches && compiledGenerationMatches;
  } catch {
    return false;
  }
}

function generationMatches(
  receiver: WasmProfileGenerationView,
  other: WasmProfileGenerationView,
): boolean {
  const method = readMethod(receiver, "matches");
  if (method === null) return false;
  try {
    const matched = Reflect.apply(method, receiver, [other]) as unknown;
    return !valueIsThenable(matched) && matched === true;
  } catch {
    return false;
  }
}

function compiledProfileDescriptorsEqual(
  left: BrowserCompiledProfileDescriptor,
  right: BrowserCompiledProfileDescriptor,
): boolean {
  return left.schema.name === right.schema.name &&
    left.schema.version === right.schema.version &&
    left.schema.fingerprint === right.schema.fingerprint &&
    sameArray(left.formats, right.formats, (a, b) =>
      a.kind === b.kind && a.revision === b.revision) &&
    sameArray(left.intents, right.intents, (a, b) =>
      a.id === b.id &&
      a.input.kind === b.input.kind &&
      (a.input.kind === "none"
        ? b.input.kind === "none"
        : b.input.kind === "typed" &&
          valueContractsEqual(a.input.contract, b.input.contract)) &&
      stateContractsEqual(a.state, b.state)) &&
    sameArray(left.actionStates, right.actionStates, (a, b) =>
      a.id === b.id &&
      actionStateSourcesEqual(a.source, b.source) &&
      stateContractsEqual(a.state, b.state));
}

function sameArray<T>(
  left: readonly T[],
  right: readonly T[],
  equal: (left: T, right: T) => boolean,
): boolean {
  return left.length === right.length &&
    left.every((value, index) => {
      const other = right[index];
      return other !== undefined && equal(value, other);
    });
}

function valueContractsEqual(
  left: Readonly<{ name: string; version: number }> | undefined,
  right: Readonly<{ name: string; version: number }> | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined &&
      left.name === right.name &&
      left.version === right.version;
}

function stateContractsEqual(
  left: BrowserCompiledProfileDescriptor["intents"][number]["state"],
  right: BrowserCompiledProfileDescriptor["intents"][number]["state"],
): boolean {
  return left.activation === right.activation &&
    valueContractsEqual(left.value, right.value);
}

function actionStateSourcesEqual(
  left: BrowserCompiledProfileDescriptor["actionStates"][number]["source"],
  right: BrowserCompiledProfileDescriptor["actionStates"][number]["source"],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "direct") {
    return right.kind === "direct" && left.actionId === right.actionId;
  }
  if (left.kind === "routed") {
    return right.kind === "routed" && left.intentId === right.intentId;
  }
  return right.kind === "history" && left.direction === right.direction;
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
    intents.length === 1 &&
    intents[0]?.id === "breditor/format-strong" &&
    intents[0]?.input.kind === "none" &&
    intents[0]?.state.activation === "tracked" &&
    intents[0]?.state.value === undefined &&
    actionStates.length === 3 &&
    actionStateMatches(
      actionStates[0],
      "breditor/control-bold",
      "routed",
      "breditor/format-strong",
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
  sourceKind: "direct" | "routed" | "history",
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
    : state.source.kind === "routed"
      ? state.source.intentId === sourceIdentity
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

function wellFormedUtf8Length(value: string, maximum: number): number | null {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first <= 0x7f) {
      bytes += 1;
    } else if (first <= 0x7ff) {
      bytes += 2;
    } else if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
    if (bytes > maximum) return null;
  }
  return bytes;
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

function preflightFailure(
  error: BrowserWasmEngineBootstrapError,
): BrowserWasmSemanticProfilePreflightResult {
  return Object.freeze({ ok: false as const, error });
}

const EMPTY_OBJECT_SET: ReadonlySet<object> = new Set<object>();
