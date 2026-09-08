import {
  documentJsonUtf8Bytes,
  type WasmDurableJsonContract,
  type WasmDurableMode,
  type WasmDurableSchemaBinding,
} from "./wasm_document_json.js";
import {
  snapshotOwnDataArray,
  snapshotProtectedHandleArray,
} from "./protected_handle_snapshot.js";

/** Maximum UTF-8 bytes admitted by the browser checkpoint boundary. */
export const MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES = 16_777_216;

const LEGACY_DURABLE_CONTRACT: WasmDurableJsonContract = Object.freeze({
  mode: "v1",
});

/** Exact engine snapshot associated with one synchronous checkpoint capture. */
export interface WasmSessionCheckpointExpectedSnapshot {
  readonly lineage: string;
  readonly revision: string;
}

interface ValidatedCheckpointEnvelope {
  readonly utf8Bytes: number;
  readonly envelope: Record<string, unknown>;
  readonly historyBase: Record<string, unknown>;
}

function validatedCheckpointBytes(
  value: string,
  expected: Readonly<{ lineage: string; revision: string }>,
  contract: WasmDurableJsonContract,
): number | null {
  const validated = validateCheckpointEnvelope(value, contract);
  if (validated === null) return null;
  const { envelope, historyBase, utf8Bytes } = validated;
  if (
    envelope["currentRevision"] !== expected.revision
  ) {
    return null;
  }
  const historySnapshot = jsonRecord(historyBase?.["snapshot"]);
  if (
    historySnapshot === null ||
    historySnapshot["lineage"] !== expected.lineage ||
    historySnapshot["revision"] !== "0"
  ) {
    return null;
  }
  return utf8Bytes;
}

/**
 * Validates a checkpoint against an already selected durable contract.
 *
 * The mode is never inferred from the payload and a V2 mismatch is not retried
 * as V1. This helper intentionally returns only a byte count. @internal
 */
export function sessionCheckpointJsonMatchesDurableContract(
  value: unknown,
  contract: WasmDurableJsonContract,
): number | null {
  if (typeof value !== "string") return null;
  return validateCheckpointEnvelope(value, contract)?.utf8Bytes ?? null;
}

function readExpectedSnapshot(
  value: WasmSessionCheckpointExpectedSnapshot,
): Readonly<{ lineage: string; revision: string }> | null {
  try {
    const lineage = value.lineage;
    if (valueIsThenable(lineage)) return null;
    const revision = value.revision;
    if (valueIsThenable(revision)) return null;
    if (
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

function readOwnedError(
  value: unknown,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
): BrowserSessionCheckpointReadError | null | undefined {
  if (value === undefined) return undefined;
  if (objectLike(value) && protectedHandles.has(value)) {
    registry.invalid = true;
    return null;
  }
  const captured = captureHandle(registry, value, protectedHandles);
  if (!captured) {
    return null;
  }
  try {
    const error = value as WasmSessionCheckpointErrorView;
    const code = error.code;
    if (valueIsThenable(code)) return null;
    const message = error.message;
    if (valueIsThenable(message)) return null;
    if (
      typeof code !== "string" ||
      !isStableCode(code) ||
      typeof message !== "string" ||
      message.length === 0 ||
      message.length > 256
    ) {
      return null;
    }
    return Object.freeze({ kind: "core", code, message });
  } catch {
    return null;
  }
}

/** Structural subset of one generated Wasm error clone. */
export interface WasmSessionCheckpointErrorView {
  readonly code: string;
  readonly message: string;
  free(): void;
}

/** Structural subset of the generated fallible-string result. */
export interface WasmSessionCheckpointStringResultView {
  readonly status: "value" | "taken" | "absent" | "error";
  readonly error: WasmSessionCheckpointErrorView | undefined;
  takeValue(): string | undefined;
  free(): void;
}

/** Bounded, handle-free mode-selected checkpoint bytes and exact snapshot. */
export interface BrowserSessionCheckpoint {
  readonly checkpointJson: string;
  readonly checkpointUtf8Bytes: number;
  readonly snapshot: Readonly<{
    readonly lineage: string;
    readonly revision: string;
  }>;
}

/** Payload-redacted failure from a synchronous checkpoint capture. */
export type BrowserSessionCheckpointReadError =
  | Readonly<{
      kind: "boundary";
      code: "session_checkpoint.invalid_wasm_view";
      message: "The Wasm session-checkpoint view is invalid.";
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "session_checkpoint.adapter_unavailable";
      message: "The Wasm session-checkpoint reader is permanently unavailable.";
    }>
  | Readonly<{
      kind: "core";
      code: string;
      message: string;
    }>;

/** Validated result of one synchronous checkpoint capture. */
export type BrowserSessionCheckpointReadResult =
  | Readonly<{ ok: true; checkpoint: BrowserSessionCheckpoint }>
  | Readonly<{ ok: false; error: BrowserSessionCheckpointReadError }>;

/**
 * Handle-free checkpoint reader issued by the observation-owning adapter.
 *
 * `undefined` means the adapter cannot synchronously capture at this instant.
 * Permanent lifecycle loss is an explicit failure, so callers must never turn
 * either outcome into an empty or replacement checkpoint.
 */
export interface WasmSessionCheckpointReadPort {
  read(): BrowserSessionCheckpointReadResult | undefined;
}

/** Validates browser-to-Wasm string representation and returns UTF-8 bytes. @internal */
export function sessionCheckpointJsonUtf8Bytes(value: unknown): number | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES
  ) {
    return null;
  }
  return wellFormedUtf8Length(
    value,
    MAX_BROWSER_SESSION_CHECKPOINT_JSON_BYTES,
  );
}

const INVALID_VIEW: BrowserSessionCheckpointReadError = Object.freeze({
  kind: "boundary",
  code: "session_checkpoint.invalid_wasm_view",
  message: "The Wasm session-checkpoint view is invalid.",
});

const ADAPTER_UNAVAILABLE: BrowserSessionCheckpointReadError = Object.freeze({
  kind: "lifecycle",
  code: "session_checkpoint.adapter_unavailable",
  message: "The Wasm session-checkpoint reader is permanently unavailable.",
});

const OWNED_READ_RESULTS = new WeakSet<object>();
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;
const MAX_PROFILE_FORMATS = 256;

interface OwnedHandle {
  readonly value: object;
  readonly free: () => unknown;
}

interface HandleRegistry {
  readonly handles: OwnedHandle[];
  readonly seen: Set<object>;
  invalid: boolean;
}

/**
 * Consumes one generated string result into exact bounded checkpoint bytes.
 *
 * Once the protected-owner list is successfully snapshotted, this function
 * accepts the outer result and frees it plus any cloned error exactly once on
 * every path. If that caller-owned list cannot be captured as a bounded dense
 * own-data array, ownership of `view` remains with the caller because a
 * protected alias cannot be ruled out.
 * Raw generated objects are hostile: accessors may throw, nested handles may
 * alias protected owners, and synchronous methods may return thenables.
 */
export function consumeWasmSessionCheckpoint(
  expected: WasmSessionCheckpointExpectedSnapshot,
  view: WasmSessionCheckpointStringResultView,
  protectedHandles: readonly unknown[] = [],
  contract: WasmDurableJsonContract = LEGACY_DURABLE_CONTRACT,
): BrowserSessionCheckpointReadResult {
  const registry: HandleRegistry = { handles: [], seen: new Set(), invalid: false };
  let protectedSet: ReadonlySet<object>;
  try {
    protectedSet = objectSet(protectedHandles);
  } catch {
    return boundaryFailure();
  }
  let provisional: BrowserSessionCheckpointReadResult = boundaryFailure();
  try {
    provisional = readCheckpoint(expected, view, registry, protectedSet, contract);
  } catch {
    provisional = boundaryFailure();
  }
  return freeHandles(registry) ? boundaryFailure() : provisional;
}

/** Whether a handle-free result was minted by this adapter module. @internal */
export function isOwnedBrowserSessionCheckpointReadResult(
  value: unknown,
): value is BrowserSessionCheckpointReadResult {
  return objectLike(value) && OWNED_READ_RESULTS.has(value);
}

/** Mints a handle-free failure for a permanently unavailable adapter. @internal */
export function unavailableWasmSessionCheckpointReadResult(): BrowserSessionCheckpointReadResult {
  return ownedResult(Object.freeze({ ok: false, error: ADAPTER_UNAVAILABLE }));
}

/** Mints a handle-free failure when engine invocation cannot yield a view. @internal */
export function invalidWasmSessionCheckpointReadResult(): BrowserSessionCheckpointReadResult {
  return boundaryFailure();
}

function readCheckpoint(
  expected: WasmSessionCheckpointExpectedSnapshot,
  view: WasmSessionCheckpointStringResultView,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
  contract: WasmDurableJsonContract,
): BrowserSessionCheckpointReadResult {
  const captured = captureHandle(registry, view, protectedHandles);
  if (!captured) {
    return boundaryFailure();
  }
  const snapshot = readExpectedSnapshot(expected);
  if (snapshot === null) return boundaryFailure();

  const status = view.status;
  if (valueIsThenable(status)) return boundaryFailure();
  const takeValue = view.takeValue;
  if (valueIsThenable(takeValue) || typeof takeValue !== "function") {
    return boundaryFailure();
  }

  // Error getters clone generated handles. Register the clone before calling
  // `takeValue`, which may throw or return a hostile synchronous impostor.
  const rawError = view.error;
  const error = readOwnedError(rawError, registry, protectedHandles);
  if (registry.invalid) return boundaryFailure();

  const rawValue = Reflect.apply(takeValue, view, []) as unknown;
  if (valueIsThenable(rawValue)) return boundaryFailure();

  if (status === "error") {
    return rawValue === undefined && error !== null && error !== undefined
      ? ownedResult(Object.freeze({ ok: false, error }))
      : boundaryFailure();
  }
  if (status !== "value" || error !== undefined || typeof rawValue !== "string") {
    return boundaryFailure();
  }

  const checkpointUtf8Bytes = validatedCheckpointBytes(
    rawValue,
    snapshot,
    contract,
  );
  if (checkpointUtf8Bytes === null) return boundaryFailure();
  const checkpoint: BrowserSessionCheckpoint = Object.freeze({
    checkpointJson: rawValue,
    checkpointUtf8Bytes,
    snapshot,
  });
  return ownedResult(Object.freeze({ ok: true, checkpoint }));
}

function captureHandle(
  registry: HandleRegistry,
  value: unknown,
  protectedHandles: ReadonlySet<object>,
): value is object {
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
      const returned = Reflect.apply(handle.free, handle.value, []) as unknown;
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

function objectSet(values: readonly unknown[]): ReadonlySet<object> {
  const result = snapshotProtectedHandleArray(values);
  if (result === null) throw new TypeError("invalid protected-handle list");
  return result;
}

function ownedResult<T extends BrowserSessionCheckpointReadResult>(value: T): T {
  OWNED_READ_RESULTS.add(value);
  return value;
}

function boundaryFailure(): BrowserSessionCheckpointReadResult {
  return ownedResult(Object.freeze({ ok: false, error: INVALID_VIEW }));
}

function validateCheckpointEnvelope(
  value: string,
  contract: WasmDurableJsonContract,
): ValidatedCheckpointEnvelope | null {
  const utf8Bytes = sessionCheckpointJsonUtf8Bytes(value);
  if (utf8Bytes === null) return null;

  let parsed: unknown;
  try {
    parsed = Reflect.apply(JSON_PARSE, JSON, [value]) as unknown;
  } catch {
    return null;
  }
  const binding = readDurableBinding(contract);
  if (binding === null) return null;

  const envelopeKeys = binding.mode === "v1"
    ? [
        "format",
        "formatVersion",
        "historyBase",
        "currentRevision",
        "historyCapacity",
        "cursor",
        "entries",
        "openMergeGroup",
      ]
    : [
        "format",
        "formatVersion",
        "schema",
        "schemaFingerprint",
        "historyBase",
        "currentRevision",
        "historyCapacity",
        "cursor",
        "entries",
        "openMergeGroup",
      ];
  const envelope = exactJsonRecord(parsed, envelopeKeys);
  if (
    envelope === null ||
    envelope["format"] !== "breditor/session-checkpoint" ||
    envelope["formatVersion"] !== (binding.mode === "v1" ? 1 : 2) ||
    typeof envelope["currentRevision"] !== "string" ||
    !canonicalU64(envelope["currentRevision"])
  ) {
    return null;
  }

  const historyBase = jsonRecord(envelope["historyBase"]);
  if (
    historyBase === null ||
    historyBase["format"] !== "breditor/editor-state" ||
    historyBase["formatVersion"] !== (binding.mode === "v1" ? 1 : 2)
  ) {
    return null;
  }
  if (binding.mode === "v1") {
    return Object.freeze({ utf8Bytes, envelope, historyBase });
  }

  if (
    Reflect.apply(JSON_STRINGIFY, JSON, [parsed]) !== value ||
    !schemaBindingMatches(
      envelope["schema"],
      envelope["schemaFingerprint"],
      binding.schema,
    )
  ) {
    return null;
  }
  const exactHistoryBase = exactJsonRecord(historyBase, [
    "format",
    "formatVersion",
    "schema",
    "schemaFingerprint",
    "snapshot",
    "document",
    "selection",
    "pendingFormats",
  ]);
  if (
    exactHistoryBase === null ||
    !schemaBindingMatches(
      exactHistoryBase["schema"],
      exactHistoryBase["schemaFingerprint"],
      binding.schema,
    )
  ) {
    return null;
  }
  const snapshot = exactJsonRecord(exactHistoryBase["snapshot"], [
    "lineage",
    "revision",
  ]);
  if (
    snapshot === null ||
    !validLineage(snapshot["lineage"]) ||
    snapshot["revision"] !== "0"
  ) {
    return null;
  }
  let documentJson: unknown;
  try {
    documentJson = Reflect.apply(JSON_STRINGIFY, JSON, [
      exactHistoryBase["document"],
    ]) as unknown;
  } catch {
    return null;
  }
  if (
    typeof documentJson !== "string" ||
    documentJsonUtf8Bytes(documentJson, contract) === null
  ) {
    return null;
  }
  return Object.freeze({
    utf8Bytes,
    envelope,
    historyBase: exactHistoryBase,
  });
}

function readDurableBinding(
  contract: WasmDurableJsonContract,
): Readonly<{
  mode: WasmDurableMode;
  schema: WasmDurableSchemaBinding | undefined;
}> | null {
  try {
    const v1 = exactJsonRecord(contract, ["mode"]);
    if (v1 !== null && v1["mode"] === "v1") {
      return Object.freeze({ mode: "v1", schema: undefined });
    }
    const v2 = exactJsonRecord(contract, ["mode", "schema", "formats"]);
    if (v2 === null || v2["mode"] !== "v2") {
      return null;
    }
    const formats = snapshotOwnDataArray(v2["formats"], MAX_PROFILE_FORMATS);
    const schema = exactJsonRecord(v2["schema"], [
      "name",
      "version",
      "fingerprint",
    ]);
    if (
      formats === null ||
      schema === null ||
      !isQualifiedName(schema["name"]) ||
      !isPositiveU32(schema["version"]) ||
      !isSchemaFingerprint(schema["fingerprint"])
    ) {
      return null;
    }
    return Object.freeze({
      mode: "v2",
      schema: Object.freeze({
        name: schema["name"],
        version: schema["version"],
        fingerprint: schema["fingerprint"],
      }),
    });
  } catch {
    return null;
  }
}

function schemaBindingMatches(
  schemaValue: unknown,
  fingerprint: unknown,
  expected: WasmDurableSchemaBinding | undefined,
): boolean {
  if (expected === undefined || fingerprint !== expected.fingerprint) return false;
  const schema = exactJsonRecord(schemaValue, ["name", "version"]);
  return schema !== null &&
    schema["name"] === expected.name &&
    schema["version"] === expected.version;
}

function validLineage(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);
}

function isQualifiedName(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function isPositiveU32(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 4_294_967_295;
}

function isSchemaFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function exactJsonRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | null {
  const record = jsonRecord(value);
  if (record === null) return null;
  const keys = Object.keys(record);
  if (keys.length !== expectedKeys.length) return null;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const expected = expectedKeys[index];
    if (
      expected === undefined ||
      keys[index] !== expected ||
      !Object.hasOwn(record, expected)
    ) {
      return null;
    }
  }
  return record;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

function valueIsThenable(value: unknown): boolean {
  return objectLike(value) && containThenable(value);
}

function objectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function canonicalU64(value: string): boolean {
  if (!/^(?:0|[1-9][0-9]{0,19})$/u.test(value)) return false;
  try {
    return BigInt(value) <= 18_446_744_073_709_551_615n;
  } catch {
    return false;
  }
}

function isStableCode(value: string): boolean {
  return (
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*(?:\/[a-z][a-z0-9._-]*)?$/u.test(value)
  );
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
