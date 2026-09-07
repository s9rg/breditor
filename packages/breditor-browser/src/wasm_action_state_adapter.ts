import {
  wasmProfileGenerationIsLive,
  wasmViewMatchesProfileGeneration,
  type WasmProfileCorrelatedView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

/** Maximum entries admitted by the browser action-state boundary. */
export const MAX_BROWSER_ACTION_STATE_ENTRIES = 512;

/** Maximum UTF-8 bytes admitted for one encoded uniform action-state value. */
export const MAX_BROWSER_ACTION_STATE_VALUE_JSON_BYTES = 524_288;

/** Maximum aggregate encoded uniform-value bytes admitted by one snapshot. */
export const MAX_BROWSER_ACTION_STATE_VALUE_JSON_BATCH_BYTES = 8_388_608;

/** Maximum decoded values retained across one browser action-state snapshot. */
export const MAX_BROWSER_ACTION_STATE_BATCH_VALUE_COUNT = 65_536;

/** Maximum decoded value/key UTF-8 bytes retained across one browser snapshot. */
export const MAX_BROWSER_ACTION_STATE_BATCH_TEXT_BYTES = 1_048_576;

const MAX_ACTION_VALUE_DEPTH = 16;
const MAX_ACTION_VALUE_COUNT = 1_024;
const MAX_ACTION_VALUE_CONTAINER_ENTRIES = 256;
const MAX_ACTION_VALUE_TEXT_BYTES = 65_536;
const MAX_ACTION_VALUE_OBJECT_KEY_BYTES = 128;
const MAX_U64 = 18_446_744_073_709_551_615n;
const INVALID_ACTION_VALUE = Symbol("invalid-action-value");

/** Exact handle-free snapshot identity expected by one guarded Wasm read. */
export interface WasmActionStateExpectedSnapshot {
  readonly lineage: string;
  readonly revision: string;
}

/** Structural subset of a generated Wasm error handle. */
export interface WasmActionStateErrorView {
  readonly code: string;
  readonly message: string;
  free(): void;
}

/** Structural subset of the generated fallible-string result. */
export interface WasmActionStateStringResultView {
  readonly status: "value" | "taken" | "absent" | "error";
  readonly error: WasmActionStateErrorView | undefined;
  takeValue(): string | undefined;
  free(): void;
}

/** Availability variants exposed by one generated snapshot entry. */
export type WasmActionStateEntryStatus =
  | "enabled"
  | "disabled"
  | "blocked"
  | "unhandled"
  | "fault";

/** Activation variants exposed by one generated snapshot entry. */
export type BrowserActionStateActivation =
  | "stateless"
  | "inactive"
  | "active"
  | "mixed";

/** Value-state variants exposed by one generated snapshot entry. */
export type BrowserActionStateValueStatus =
  | "unsupported"
  | "unset"
  | "uniform"
  | "mixed";

/** Structural subset of one owned generated action-state snapshot. */
export interface WasmActionStateSnapshotView extends WasmProfileCorrelatedView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
  readonly snapshotLineage: string;
  readonly snapshotRevision: string;
  readonly entryCount: number;
  readonly changedCount: number;
  entryId(index: number): string | undefined;
  entryStatus(index: number): WasmActionStateEntryStatus | undefined;
  entryActivation(index: number): BrowserActionStateActivation | undefined;
  entryReasonCode(index: number): string | undefined;
  entryValueStatus(index: number): BrowserActionStateValueStatus | undefined;
  entryValueContractName(index: number): string | undefined;
  entryValueContractVersion(index: number): number | undefined;
  entryUniformValueJson(index: number): WasmActionStateStringResultView;
  changedId(index: number): string | undefined;
  free(): void;
}

/** Structural subset of one generated action-state refresh result. */
export interface WasmActionStatesResultView extends WasmProfileCorrelatedView {
  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean;
  readonly status: "full" | "unchanged" | "delta" | "taken" | "error";
  readonly error: WasmActionStateErrorView | undefined;
  takeSnapshot(): WasmActionStateSnapshotView | undefined;
  free(): void;
}

/** Deeply immutable JSON-compatible value produced by a Rust `ActionValue`. */
export type BrowserActionValue =
  | null
  | boolean
  | number
  | string
  | BrowserActionValueArray
  | BrowserActionValueObject;

/** Immutable array branch of a browser action value. */
export interface BrowserActionValueArray extends ReadonlyArray<BrowserActionValue> {}

/** Immutable object branch of a browser action value. */
export interface BrowserActionValueObject {
  readonly [key: string]: BrowserActionValue;
}

/** Exact versioned contract for a supported state value. */
export interface BrowserActionStateValueContract {
  readonly name: string;
  readonly version: number;
}

/** Orthogonal typed value observation for one resolved action state. */
export type BrowserActionStateValue =
  | Readonly<{ status: "unsupported" }>
  | Readonly<{
      status: "unset" | "mixed";
      contract: BrowserActionStateValueContract;
    }>
  | Readonly<{
      status: "uniform";
      contract: BrowserActionStateValueContract;
      value: BrowserActionValue;
    }>;

/** Toolbar-facing availability copied out of one generated entry. */
export type BrowserActionStateAvailability =
  | "enabled"
  | "disabled"
  | "blocked"
  | "unhandled"
  | "faulted";

/** One complete, bounded, handle-free action-state entry. */
export interface BrowserActionStateEntry {
  readonly id: string;
  readonly availability: BrowserActionStateAvailability;
  readonly activation: BrowserActionStateActivation | undefined;
  readonly reasonCode: string | undefined;
  readonly value: BrowserActionStateValue | undefined;
}

/** Complete immutable action state for one exact semantic snapshot. */
export interface BrowserActionStateSnapshot {
  readonly snapshot: Readonly<{
    readonly lineage: string;
    readonly revision: string;
  }>;
  readonly entries: readonly BrowserActionStateEntry[];
}

/** Payload-redacted adapter failure. */
export type BrowserActionStateReadError =
  | Readonly<{
      kind: "boundary";
      code: "action_state.invalid_wasm_view";
      message: string;
    }>
  | Readonly<{
      kind: "core";
      code: string;
      message: string;
    }>;

/** Validated result of one guarded action-state refresh. */
export type BrowserActionStateReadResult =
  | Readonly<{
      ok: true;
      kind: "full" | "unchanged" | "delta";
      snapshot: BrowserActionStateSnapshot;
      changedIds: readonly string[];
    }>
  | Readonly<{ ok: false; error: BrowserActionStateReadError }>;

/**
 * Handle-free guarded read port issued by the observation-owning adapter.
 *
 * The adapter consumes raw generated handles internally while it can protect
 * its private observation from hostile aliasing. Stores never receive Wasm
 * ownership and accept only results minted by this module.
 */
export interface WasmActionStateReadPort {
  read(): BrowserActionStateReadResult | undefined;
}

const INVALID_VIEW: BrowserActionStateReadError = Object.freeze({
  kind: "boundary",
  code: "action_state.invalid_wasm_view",
  message: "The Wasm action-state view is invalid.",
});

const OWNED_READ_RESULTS = new WeakSet<object>();
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;

interface OwnedHandle {
  readonly value: object;
  readonly free: () => unknown;
}

interface HandleRegistry {
  readonly handles: OwnedHandle[];
  readonly seen: Set<object>;
  invalid: boolean;
}

interface ActionValueBudget {
  count: number;
  textBytes: number;
}

interface ParsedActionValue {
  readonly value: BrowserActionValue;
  readonly valueCount: number;
  readonly textBytes: number;
}

interface SnapshotMethods {
  readonly entryId: (index: number) => string | undefined;
  readonly entryStatus: (index: number) => WasmActionStateEntryStatus | undefined;
  readonly entryActivation: (index: number) => BrowserActionStateActivation | undefined;
  readonly entryReasonCode: (index: number) => string | undefined;
  readonly entryValueStatus: (index: number) => BrowserActionStateValueStatus | undefined;
  readonly entryValueContractName: (index: number) => string | undefined;
  readonly entryValueContractVersion: (index: number) => number | undefined;
  readonly entryUniformValueJson: (index: number) => WasmActionStateStringResultView;
  readonly changedId: (index: number) => string | undefined;
}

/**
 * Consumes one guarded generated result into a bounded handle-free snapshot.
 *
 * The result, its taken snapshot, every cloned error, and every nested string
 * result are released exactly once on every reachable path. Generated values
 * are treated as hostile raw-JavaScript objects: getters may throw, handles may
 * alias, and scalar fields may violate their documented TypeScript unions.
 */
export function consumeWasmActionStates(
  expected: WasmActionStateExpectedSnapshot,
  view: WasmActionStatesResultView,
  generation: WasmProfileGenerationView,
  protectedHandles: readonly unknown[] = [],
): BrowserActionStateReadResult {
  const registry: HandleRegistry = { handles: [], seen: new Set(), invalid: false };
  let protectedSet: ReadonlySet<object>;
  try {
    protectedSet = objectSet(protectedHandles, generation);
  } catch {
    // The outer view cannot be accepted when a protected alias cannot be
    // ruled out. Ownership therefore remains with the caller on this path.
    return boundaryFailure();
  }
  let provisional: BrowserActionStateReadResult = boundaryFailure();
  try {
    provisional = readWasmActionStates(
      expected,
      view,
      generation,
      registry,
      protectedSet,
    );
  } catch {
    provisional = boundaryFailure();
  }
  return freeHandles(registry) ? boundaryFailure() : provisional;
}

/** Whether a handle-free result was minted by this adapter module. @internal */
export function isOwnedBrowserActionStateReadResult(
  value: unknown,
): value is BrowserActionStateReadResult {
  return objectLike(value) && OWNED_READ_RESULTS.has(value);
}

function readWasmActionStates(
  expected: WasmActionStateExpectedSnapshot,
  view: WasmActionStatesResultView,
  generation: WasmProfileGenerationView,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserActionStateReadResult {
  const capturedResult = captureHandle(registry, view, protectedHandles);
  const expectedSnapshot = readExpectedSnapshot(expected);
  if (
    expectedSnapshot === null ||
    !capturedResult ||
    !wasmProfileGenerationIsLive(generation) ||
    !wasmViewMatchesProfileGeneration(view, generation)
  ) {
    return boundaryFailure();
  }

  const status = view.status;
  if (valueIsThenable(status)) return boundaryFailure();
  const takeSnapshot = view.takeSnapshot;
  if (valueIsThenable(takeSnapshot) || typeof takeSnapshot !== "function") {
    return boundaryFailure();
  }
  const rawError = view.error;
  const error = readOwnedError(rawError, registry, protectedHandles);
  if (registry.invalid) return boundaryFailure();
  // Register a freshly cloned error before invoking any later generated or
  // hostile method. If taking the snapshot throws, final cleanup must still
  // own and release that error handle.
  const rawSnapshot = Reflect.apply(takeSnapshot, view, []) as unknown;
  const snapshotHandle = captureOptionalHandle(
    registry,
    rawSnapshot,
    protectedHandles,
  );
  if (registry.invalid) return boundaryFailure();

  if (status === "error") {
    return snapshotHandle === undefined && error !== null && error !== undefined
      ? ownedResult(Object.freeze({ ok: false, error }))
      : boundaryFailure();
  }
  if (
    (status !== "full" && status !== "unchanged" && status !== "delta") ||
    error !== undefined ||
    snapshotHandle === undefined
  ) {
    return boundaryFailure();
  }

  const snapshot = readSnapshot(
    expectedSnapshot,
    status,
    rawSnapshot as WasmActionStateSnapshotView,
    generation,
    registry,
    protectedHandles,
  );
  return snapshot === null || registry.invalid
    ? boundaryFailure()
    : ownedResult(
        Object.freeze({
          ok: true,
          kind: status,
          snapshot: snapshot.snapshot,
          changedIds: snapshot.changedIds,
        }),
      );
}

function readSnapshot(
  expected: Readonly<{ lineage: string; revision: string }>,
  kind: "full" | "unchanged" | "delta",
  view: WasmActionStateSnapshotView,
  generation: WasmProfileGenerationView,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): Readonly<{
  snapshot: BrowserActionStateSnapshot;
  changedIds: readonly string[];
}> | null {
  if (!wasmViewMatchesProfileGeneration(view, generation)) return null;
  const methods = readSnapshotMethods(view);
  if (methods === null) return null;

  const lineage = view.snapshotLineage;
  if (valueIsThenable(lineage)) return null;
  const revision = view.snapshotRevision;
  if (valueIsThenable(revision)) return null;
  const entryCount = view.entryCount;
  if (valueIsThenable(entryCount)) return null;
  const changedCount = view.changedCount;
  if (valueIsThenable(changedCount)) return null;
  if (
    lineage !== expected.lineage ||
    revision !== expected.revision ||
    !isIndex(entryCount) ||
    entryCount > MAX_BROWSER_ACTION_STATE_ENTRIES ||
    !isIndex(changedCount) ||
    changedCount > entryCount
  ) {
    return null;
  }

  const entries: BrowserActionStateEntry[] = [];
  const entryIds = new Set<string>();
  let priorId: string | undefined;
  let encodedValueBytes = 0;
  let retainedValueCount = 0;
  let retainedValueTextBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    const id = callScalarIndex(methods.entryId, view, index);
    const rawStatus = callScalarIndex(methods.entryStatus, view, index);
    const activation = callScalarIndex(methods.entryActivation, view, index);
    const reasonCode = callScalarIndex(methods.entryReasonCode, view, index);
    const valueStatus = callScalarIndex(methods.entryValueStatus, view, index);
    const contractName = callScalarIndex(
      methods.entryValueContractName,
      view,
      index,
    );
    const contractVersion = callScalarIndex(
      methods.entryValueContractVersion,
      view,
      index,
    );
    const valueResult = callIndex(methods.entryUniformValueJson, view, index);
    const encoded = consumeOwnedValueResult(
      valueResult,
      registry,
      protectedHandles,
    );
    if (
      typeof id !== "string" ||
      !isQualifiedName(id) ||
      (priorId !== undefined && priorId >= id) ||
      !isEntryStatus(rawStatus) ||
      encoded === null
    ) {
      return null;
    }
    encodedValueBytes += encoded.encodedBytes;
    retainedValueCount += encoded.valueCount;
    retainedValueTextBytes += encoded.textBytes;
    if (encodedValueBytes > MAX_BROWSER_ACTION_STATE_VALUE_JSON_BATCH_BYTES) {
      return null;
    }
    if (
      retainedValueCount > MAX_BROWSER_ACTION_STATE_BATCH_VALUE_COUNT ||
      retainedValueTextBytes > MAX_BROWSER_ACTION_STATE_BATCH_TEXT_BYTES
    ) {
      return null;
    }

    const resolved =
      rawStatus === "enabled" || rawStatus === "disabled" || rawStatus === "blocked";
    if (
      (resolved ? !isActivation(activation) : activation !== undefined) ||
      (rawStatus === "disabled" || rawStatus === "blocked"
        ? typeof reasonCode !== "string" || !isQualifiedName(reasonCode)
        : reasonCode !== undefined)
    ) {
      return null;
    }
    const value = readStateValue(
      resolved,
      valueStatus,
      contractName,
      contractVersion,
      encoded,
    );
    if (value === null) return null;

    const availability: BrowserActionStateAvailability =
      rawStatus === "fault" ? "faulted" : rawStatus;
    entries.push(
      Object.freeze({ id, availability, activation, reasonCode, value }),
    );
    entryIds.add(id);
    priorId = id;
  }

  if (!sentinelFieldsAreAbsent(methods, view, entryCount, registry, protectedHandles)) {
    return null;
  }

  const changedIds: string[] = [];
  let priorChangedId: string | undefined;
  for (let index = 0; index < changedCount; index += 1) {
    const id = callScalarIndex(methods.changedId, view, index);
    if (
      typeof id !== "string" ||
      !entryIds.has(id) ||
      (priorChangedId !== undefined && priorChangedId >= id)
    ) {
      return null;
    }
    changedIds.push(id);
    priorChangedId = id;
  }
  if (callScalarIndex(methods.changedId, view, changedCount) !== undefined) {
    return null;
  }
  if (
    (kind === "full" &&
      (changedIds.length !== entries.length ||
        changedIds.some((id, index) => id !== entries[index]?.id))) ||
    (kind === "unchanged" && changedIds.length !== 0)
  ) {
    return null;
  }

  return Object.freeze({
    snapshot: Object.freeze({
      snapshot: Object.freeze({ lineage, revision }),
      entries: Object.freeze(entries),
    }),
    changedIds: Object.freeze(changedIds),
  });
}

function readSnapshotMethods(view: WasmActionStateSnapshotView): SnapshotMethods | null {
  try {
    const entryId = readSnapshotMethod(view, "entryId");
    if (entryId === null) return null;
    const entryStatus = readSnapshotMethod(view, "entryStatus");
    if (entryStatus === null) return null;
    const entryActivation = readSnapshotMethod(view, "entryActivation");
    if (entryActivation === null) return null;
    const entryReasonCode = readSnapshotMethod(view, "entryReasonCode");
    if (entryReasonCode === null) return null;
    const entryValueStatus = readSnapshotMethod(view, "entryValueStatus");
    if (entryValueStatus === null) return null;
    const entryValueContractName = readSnapshotMethod(
      view,
      "entryValueContractName",
    );
    if (entryValueContractName === null) return null;
    const entryValueContractVersion = readSnapshotMethod(
      view,
      "entryValueContractVersion",
    );
    if (entryValueContractVersion === null) return null;
    const entryUniformValueJson = readSnapshotMethod(
      view,
      "entryUniformValueJson",
    );
    if (entryUniformValueJson === null) return null;
    const changedId = readSnapshotMethod(view, "changedId");
    if (changedId === null) return null;
    const methods: SnapshotMethods = {
      entryId,
      entryStatus,
      entryActivation,
      entryReasonCode,
      entryValueStatus,
      entryValueContractName,
      entryValueContractVersion,
      entryUniformValueJson,
      changedId,
    };
    return methods;
  } catch {
    return null;
  }
}

function readSnapshotMethod<TKey extends keyof SnapshotMethods>(
  view: WasmActionStateSnapshotView,
  key: TKey,
): SnapshotMethods[TKey] | null {
  const method = Reflect.get(view, key, view) as unknown;
  return !valueIsThenable(method) && typeof method === "function"
    ? (method as SnapshotMethods[TKey])
    : null;
}

function sentinelFieldsAreAbsent(
  methods: SnapshotMethods,
  view: WasmActionStateSnapshotView,
  index: number,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): boolean {
  const valueResult = callIndex(methods.entryUniformValueJson, view, index);
  const encoded = consumeOwnedValueResult(valueResult, registry, protectedHandles);
  return (
    callScalarIndex(methods.entryId, view, index) === undefined &&
    callScalarIndex(methods.entryStatus, view, index) === undefined &&
    callScalarIndex(methods.entryActivation, view, index) === undefined &&
    callScalarIndex(methods.entryReasonCode, view, index) === undefined &&
    callScalarIndex(methods.entryValueStatus, view, index) === undefined &&
    callScalarIndex(methods.entryValueContractName, view, index) === undefined &&
    callScalarIndex(methods.entryValueContractVersion, view, index) === undefined &&
    encoded !== null &&
    encoded.value === undefined
  );
}

function readStateValue(
  resolved: boolean,
  status: unknown,
  contractName: unknown,
  contractVersion: unknown,
  encoded: Readonly<{
    value: BrowserActionValue | undefined;
    encodedBytes: number;
    valueCount: number;
    textBytes: number;
  }>,
): BrowserActionStateValue | undefined | null {
  if (!resolved) {
    return status === undefined &&
      contractName === undefined &&
      contractVersion === undefined &&
      encoded.value === undefined
      ? undefined
      : null;
  }
  if (!isValueStatus(status)) return null;
  if (status === "unsupported") {
    return contractName === undefined &&
      contractVersion === undefined &&
      encoded.value === undefined
      ? Object.freeze({ status: "unsupported" })
      : null;
  }
  if (
    typeof contractName !== "string" ||
    !isQualifiedName(contractName) ||
    !isNonzeroU32(contractVersion)
  ) {
    return null;
  }
  const contract = Object.freeze({ name: contractName, version: contractVersion });
  if (status === "uniform") {
    return encoded.value === undefined
      ? null
      : Object.freeze({ status, contract, value: encoded.value });
  }
  return encoded.value === undefined ? Object.freeze({ status, contract }) : null;
}

function consumeOwnedValueResult(
  value: unknown,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): Readonly<{
  value: BrowserActionValue | undefined;
  encodedBytes: number;
  valueCount: number;
  textBytes: number;
}> | null {
  if (!captureHandle(registry, value, protectedHandles)) return null;
  const result = value as WasmActionStateStringResultView;
  try {
    const status = result.status;
    if (valueIsThenable(status)) return null;
    const takeValue = result.takeValue;
    if (valueIsThenable(takeValue) || typeof takeValue !== "function") {
      return null;
    }
    const rawError = result.error;
    const error = readOwnedError(rawError, registry, protectedHandles);
    if (registry.invalid) return null;
    // Error getters clone Wasm handles. Capture the clone before a later
    // takeValue call can throw, so the outer registry remains exhaustive.
    const rawValue = Reflect.apply(takeValue, result, []) as unknown;
    if (valueIsThenable(rawValue)) return null;
    if (status === "value") {
      if (error !== undefined || typeof rawValue !== "string") return null;
      if (rawValue.length > MAX_BROWSER_ACTION_STATE_VALUE_JSON_BYTES) return null;
      const encodedBytes = utf8Length(
        rawValue,
        MAX_BROWSER_ACTION_STATE_VALUE_JSON_BYTES,
      );
      if (
        encodedBytes === null ||
        encodedBytes > MAX_BROWSER_ACTION_STATE_VALUE_JSON_BYTES
      ) {
        return null;
      }
      const parsed = parseCanonicalActionValue(rawValue);
      return parsed === INVALID_ACTION_VALUE
        ? null
        : Object.freeze({
            value: parsed.value,
            encodedBytes,
            valueCount: parsed.valueCount,
            textBytes: parsed.textBytes,
          });
    }
    if (status === "absent") {
      return error === undefined && rawValue === undefined
        ? Object.freeze({
            value: undefined,
            encodedBytes: 0,
            valueCount: 0,
            textBytes: 0,
          })
        : null;
    }
    // A taken result is caller misuse; an encoding error invalidates the whole
    // publication rather than installing a partial toolbar snapshot.
    return null;
  } catch {
    return null;
  }
}

function parseCanonicalActionValue(
  json: string,
): ParsedActionValue | typeof INVALID_ACTION_VALUE {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
    if (JSON.stringify(parsed) !== json) return INVALID_ACTION_VALUE;
  } catch {
    return INVALID_ACTION_VALUE;
  }
  const budget: ActionValueBudget = { count: 0, textBytes: 0 };
  const value = copyActionValue(parsed, 0, budget);
  return value === INVALID_ACTION_VALUE
    ? value
    : Object.freeze({ value, valueCount: budget.count, textBytes: budget.textBytes });
}

function copyActionValue(
  value: unknown,
  depth: number,
  budget: ActionValueBudget,
): BrowserActionValue | typeof INVALID_ACTION_VALUE {
  budget.count += 1;
  if (budget.count > MAX_ACTION_VALUE_COUNT || depth > MAX_ACTION_VALUE_DEPTH) {
    return INVALID_ACTION_VALUE;
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && !Object.is(value, -0)
      ? value
      : INVALID_ACTION_VALUE;
  }
  if (typeof value === "string") {
    const bytes = utf8Length(value);
    if (bytes === null) return INVALID_ACTION_VALUE;
    budget.textBytes += bytes;
    return budget.textBytes <= MAX_ACTION_VALUE_TEXT_BYTES
      ? value
      : INVALID_ACTION_VALUE;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ACTION_VALUE_CONTAINER_ENTRIES) return INVALID_ACTION_VALUE;
    const output: BrowserActionValue[] = [];
    for (const item of value) {
      const child = copyActionValue(item, depth + 1, budget);
      if (child === INVALID_ACTION_VALUE) return INVALID_ACTION_VALUE;
      output.push(child);
    }
    return Object.freeze(output);
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    return INVALID_ACTION_VALUE;
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_ACTION_VALUE_CONTAINER_ENTRIES) return INVALID_ACTION_VALUE;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (
      key === undefined ||
      !isActionValueKey(key) ||
      (index > 0 && (keys[index - 1] as string) >= key)
    ) {
      return INVALID_ACTION_VALUE;
    }
    const keyBytes = utf8Length(key);
    if (keyBytes === null) return INVALID_ACTION_VALUE;
    budget.textBytes += keyBytes;
    if (budget.textBytes > MAX_ACTION_VALUE_TEXT_BYTES) return INVALID_ACTION_VALUE;
  }
  const output = Object.create(null) as Record<string, BrowserActionValue>;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const child = copyActionValue(record[key], depth + 1, budget);
    if (child === INVALID_ACTION_VALUE) return INVALID_ACTION_VALUE;
    Object.defineProperty(output, key, {
      value: child,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(output);
}

function readExpectedSnapshot(
  value: WasmActionStateExpectedSnapshot,
): Readonly<{ lineage: string; revision: string }> | null {
  try {
    const lineage = value.lineage;
    if (valueIsThenable(lineage)) return null;
    const revision = value.revision;
    if (valueIsThenable(revision)) return null;
    return typeof lineage === "string" &&
      isLineage(lineage) &&
      typeof revision === "string" &&
      canonicalU64(revision)
      ? Object.freeze({ lineage, revision })
      : null;
  } catch {
    return null;
  }
}

function readOwnedError(
  value: unknown,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserActionStateReadError | undefined | null {
  if (value === undefined) return undefined;
  if (!captureHandle(registry, value, protectedHandles)) return null;
  try {
    const error = value as WasmActionStateErrorView;
    const code = error.code;
    if (valueIsThenable(code)) return null;
    const message = error.message;
    if (valueIsThenable(message)) return null;
    return typeof code === "string" &&
      isStableCode(code) &&
      typeof message === "string" &&
      message.length > 0 &&
      message.length <= 256
      ? Object.freeze({ kind: "core", code, message })
      : null;
  } catch {
    return null;
  }
}

function captureOptionalHandle(
  registry: HandleRegistry,
  value: unknown,
  protectedHandles: ReadonlySet<object>,
): OwnedHandle | undefined {
  if (value === undefined) return undefined;
  return captureHandle(registry, value, protectedHandles)
    ? registry.handles[registry.handles.length - 1]
    : undefined;
}

function captureHandle(
  registry: HandleRegistry,
  value: unknown,
  protectedHandles: ReadonlySet<object>,
): boolean {
  if (!objectLike(value) || protectedHandles.has(value) || registry.seen.has(value)) {
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
  registry.seen.add(value);
  registry.handles.push({
    value,
    free: () => Reflect.apply(free, value, []),
  });
  const freeIsThenable = valueIsThenable(free);
  const handleIsThenable = containThenable(value);
  if (freeIsThenable || handleIsThenable) {
    registry.invalid = true;
    return false;
  }
  return true;
}

function freeHandles(registry: HandleRegistry): boolean {
  let failed = registry.invalid;
  for (let index = registry.handles.length - 1; index >= 0; index -= 1) {
    const handle = registry.handles[index];
    if (handle === undefined) {
      failed = true;
      continue;
    }
    try {
      const returned = handle.free();
      if (returned !== undefined) {
        if (objectLike(returned)) containThenable(returned);
        failed = true;
      }
    } catch {
      failed = true;
    }
  }
  return failed;
}

function objectSet(
  values: readonly unknown[],
  required?: unknown,
): ReadonlySet<object> {
  if (!Array.isArray(values) || values.length > 64) {
    throw new TypeError("invalid protected-handle list");
  }
  const output = new Set<object>();
  if (objectLike(required)) output.add(required);
  for (let index = 0; index < values.length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(values, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError("invalid protected-handle entry");
    }
    const value = descriptor.value as unknown;
    if (objectLike(value)) output.add(value);
  }
  return output;
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function callIndex<T>(
  method: (index: number) => T,
  receiver: WasmActionStateSnapshotView,
  index: number,
): T {
  return Reflect.apply(method, receiver, [index]) as T;
}

function callScalarIndex<T>(
  method: (index: number) => T,
  receiver: WasmActionStateSnapshotView,
  index: number,
): T {
  const value = callIndex(method, receiver, index);
  if (valueIsThenable(value)) {
    throw new TypeError("generated scalar getter returned a thenable");
  }
  return value;
}

function valueIsThenable(value: unknown): boolean {
  return objectLike(value) && containThenable(value);
}

function containThenable(value: object): boolean {
  let then: unknown;
  try {
    then = (value as { then?: unknown }).then;
  } catch {
    return true;
  }
  if (then === undefined) return false;
  try {
    const assimilated = PROMISE_RESOLVE(value);
    Reflect.apply(PROMISE_CATCH, assimilated, [IGNORE_SETTLEMENT]);
  } catch {
    // The value remains invalid even if rejection containment itself fails.
  }
  return true;
}

function boundaryFailure(): BrowserActionStateReadResult {
  return ownedResult(Object.freeze({ ok: false, error: INVALID_VIEW }));
}

function ownedResult<T extends BrowserActionStateReadResult>(value: T): T {
  OWNED_READ_RESULTS.add(value);
  return value;
}

function isIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isNonzeroU32(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4_294_967_295
  );
}

function isEntryStatus(value: unknown): value is WasmActionStateEntryStatus {
  return (
    value === "enabled" ||
    value === "disabled" ||
    value === "blocked" ||
    value === "unhandled" ||
    value === "fault"
  );
}

function isActivation(value: unknown): value is BrowserActionStateActivation {
  return (
    value === "stateless" ||
    value === "inactive" ||
    value === "active" ||
    value === "mixed"
  );
}

function isValueStatus(value: unknown): value is BrowserActionStateValueStatus {
  return (
    value === "unsupported" ||
    value === "unset" ||
    value === "uniform" ||
    value === "mixed"
  );
}

function isQualifiedName(value: string): boolean {
  return value.length <= 128 && /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function isStableCode(value: string): boolean {
  return (
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?$/u.test(value)
  );
}

function isLineage(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value)
  );
}

function canonicalU64(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) return false;
  try {
    return BigInt(value) <= MAX_U64;
  } catch {
    return false;
  }
}

function isActionValueKey(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_ACTION_VALUE_OBJECT_KEY_BYTES &&
    /^[A-Za-z_][A-Za-z0-9._-]*$/u.test(value)
  );
}

function utf8Length(
  value: string,
  maximum: number = Number.MAX_SAFE_INTEGER,
): number | null {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low < 0xdc00 || low > 0xdfff) return null;
      bytes += 4;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return null;
    } else {
      bytes += 3;
    }
    if (bytes > maximum) return null;
  }
  return bytes;
}
