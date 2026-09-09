import {
  documentJsonUtf8Bytes,
  durableFormatRecordsMatchContract,
  resolveWasmDurableJsonContract,
  type ResolvedWasmDurableJsonContract,
  type WasmDurableJsonContract,
  type WasmDurableMode,
} from "./wasm_document_json.js";
import { snapshotProtectedHandleArray } from "./protected_handle_snapshot.js";

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
 * The mode is never inferred from the payload and a V2/V3 mismatch is never
 * retried as another generation. This helper intentionally returns only a
 * byte count. @internal
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
const MAX_V3_HISTORY_CAPACITY = 100;
const MAX_V3_OPERATIONS_PER_ENTRY = 1_024;
const MAX_V3_AGGREGATE_OPERATIONS = 16_384;
const MAX_V3_RETAINED_PROPERTY_VALUES = 100_000;
const MAX_V3_RETAINED_PROPERTY_STRING_UTF8_BYTES = 64 * 1024 * 1024;
const MAX_PATH_DEPTH = 256;
const MAX_OPERATION_RUNS = 10_000;
const MAX_OPERATION_PARAGRAPHS = 10_000;
const MAX_OPERATION_TEXT_UTF8_BYTES = 1024 * 1024;

interface OwnedHandle {
  readonly value: object;
  readonly free: () => unknown;
}

interface HandleRegistry {
  readonly handles: OwnedHandle[];
  readonly seen: Set<object>;
  invalid: boolean;
}

interface RetainedPropertyLowerBound {
  propertyValues: number;
  propertyStringUtf8Bytes: number;
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
  const binding = resolveWasmDurableJsonContract(contract);
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
  const expectedFormatVersion = durableFormatVersion(binding.mode);
  if (
    envelope === null ||
    envelope["format"] !== "breditor/session-checkpoint" ||
    envelope["formatVersion"] !== expectedFormatVersion ||
    typeof envelope["currentRevision"] !== "string" ||
    !canonicalU64(envelope["currentRevision"])
  ) {
    return null;
  }

  const historyBase = jsonRecord(envelope["historyBase"]);
  if (
    historyBase === null ||
    historyBase["format"] !== "breditor/editor-state" ||
    historyBase["formatVersion"] !== expectedFormatVersion
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
  if (binding.mode === "v3") {
    const retainedProperties: RetainedPropertyLowerBound = {
      propertyValues: 0,
      propertyStringUtf8Bytes: 0,
    };
    if (
      !observeHistoryBaseDocumentProperties(
        exactHistoryBase["document"],
        binding,
        retainedProperties,
      ) ||
      !validEditorStateV3(exactHistoryBase, binding, retainedProperties) ||
      !validSessionV3History(envelope, binding, retainedProperties)
    ) {
      return null;
    }
  }
  return Object.freeze({
    utf8Bytes,
    envelope,
    historyBase: exactHistoryBase,
  });
}

function durableFormatVersion(mode: WasmDurableMode): number {
  return mode === "v1" ? 1 : mode === "v2" ? 2 : 3;
}

function schemaBindingMatches(
  schemaValue: unknown,
  fingerprint: unknown,
  expected: ResolvedWasmDurableJsonContract["schema"],
): boolean {
  if (
    expected.fingerprint === undefined ||
    fingerprint !== expected.fingerprint
  ) return false;
  const schema = exactJsonRecord(schemaValue, ["name", "version"]);
  return schema !== null &&
    schema["name"] === expected.name &&
    schema["version"] === expected.version;
}

/** Strict bounded preflight for the V3-only editor-value payload generation. */
function validEditorStateV3(
  state: Record<string, unknown>,
  contract: ResolvedWasmDurableJsonContract,
  retainedProperties: RetainedPropertyLowerBound,
): boolean {
  return validSelection(state["selection"]) &&
    validPendingFormats(
      state["pendingFormats"],
      contract,
      retainedProperties,
    );
}

/**
 * Validates V3 history topology and every property-preserving recipe.
 *
 * The browser can exactly enforce static wire limits and a provable lower
 * bound formed by the history-base properties plus every serialized result
 * pending-format set. Result documents are derived rather than serialized, so
 * their retained nodes, text, and properties cannot be counted without
 * executing the recipes. Rust restore remains authoritative for those complete
 * retained-boundary budgets, schema admission, and bidirectional replay.
 */
function validSessionV3History(
  envelope: Record<string, unknown>,
  contract: ResolvedWasmDurableJsonContract,
  retainedProperties: RetainedPropertyLowerBound,
): boolean {
  const historyCapacity = envelope["historyCapacity"];
  const cursor = envelope["cursor"];
  const entries = envelope["entries"];
  const openMergeGroup = envelope["openMergeGroup"];
  if (
    !isU32(historyCapacity) ||
    historyCapacity > MAX_V3_HISTORY_CAPACITY ||
    !isU32(cursor) ||
    !Array.isArray(entries) ||
    entries.length > historyCapacity ||
    cursor > entries.length ||
    !(
      openMergeGroup === null ||
      isQualifiedName(openMergeGroup)
    ) ||
    (openMergeGroup !== null && (cursor === 0 || cursor !== entries.length))
  ) {
    return false;
  }

  let aggregateOperations = 0;
  for (const value of entries) {
    const entry = exactJsonRecord(value, [
      "forwardOperations",
      "resultSelection",
      "resultPendingFormats",
    ]);
    const operations = entry?.["forwardOperations"];
    if (
      entry === null ||
      !Array.isArray(operations) ||
      operations.length === 0 ||
      operations.length > MAX_V3_OPERATIONS_PER_ENTRY
    ) {
      return false;
    }
    aggregateOperations += operations.length;
    if (aggregateOperations > MAX_V3_AGGREGATE_OPERATIONS) return false;
    for (const operation of operations) {
      if (!validOperationV3Payload(operation, contract)) return false;
    }
    if (
      !validSelection(entry["resultSelection"]) ||
      !validPendingFormats(
        entry["resultPendingFormats"],
        contract,
        retainedProperties,
      )
    ) {
      return false;
    }
  }
  return true;
}

function validPendingFormats(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
  retainedProperties: RetainedPropertyLowerBound,
): boolean {
  return value === null ||
    (durableFormatRecordsMatchContract(value, contract) &&
      observeRetainedFormatProperties(value, retainedProperties));
}

/**
 * Counts the one complete document that is present on the wire. Entry-result
 * documents deliberately are not guessed here: only Rust replay can derive
 * them and account for every complete retained boundary without false parity.
 */
function observeHistoryBaseDocumentProperties(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
  retainedProperties: RetainedPropertyLowerBound,
): boolean {
  const document = jsonRecord(value);
  const root = jsonRecord(document?.["root"]);
  const paragraphs = root?.["children"];
  if (!Array.isArray(paragraphs)) return false;
  for (const rawParagraph of paragraphs) {
    const paragraph = jsonRecord(rawParagraph);
    const runs = paragraph?.["children"];
    if (!Array.isArray(runs)) return false;
    for (const rawRun of runs) {
      const run = jsonRecord(rawRun);
      const formats = run?.["formats"];
      if (
        !durableFormatRecordsMatchContract(formats, contract) ||
        !observeRetainedFormatProperties(formats, retainedProperties)
      ) {
        return false;
      }
    }
  }
  return true;
}

function observeRetainedFormatProperties(
  value: unknown,
  retainedProperties: RetainedPropertyLowerBound,
): boolean {
  if (!Array.isArray(value)) return false;
  for (const rawFormat of value) {
    const format = jsonRecord(rawFormat);
    const properties = jsonRecord(format?.["properties"]);
    if (properties === null) return false;
    const propertyNames = Object.keys(properties);
    retainedProperties.propertyValues += propertyNames.length;
    if (
      retainedProperties.propertyValues > MAX_V3_RETAINED_PROPERTY_VALUES
    ) {
      return false;
    }
    for (const name of propertyNames) {
      const propertyValue = properties[name];
      if (typeof propertyValue !== "string") continue;
      const stringBytes = wellFormedUtf8Length(
        propertyValue,
        MAX_V3_RETAINED_PROPERTY_STRING_UTF8_BYTES,
      );
      if (stringBytes === null) return false;
      retainedProperties.propertyStringUtf8Bytes += stringBytes;
      if (
        retainedProperties.propertyStringUtf8Bytes >
          MAX_V3_RETAINED_PROPERTY_STRING_UTF8_BYTES
      ) {
        return false;
      }
    }
  }
  return true;
}

function validSelection(value: unknown): boolean {
  if (value === null) return true;
  const selection = exactJsonRecord(value, ["kind", "anchor", "focus"]);
  return selection !== null &&
    selection["kind"] === "range" &&
    validPoint(selection["anchor"]) &&
    validPoint(selection["focus"]);
}

function validPoint(value: unknown): boolean {
  const text = exactJsonRecord(value, [
    "kind",
    "textPath",
    "utf16Offset",
    "affinity",
  ]);
  if (text !== null) {
    return text["kind"] === "text" &&
      validPath(text["textPath"]) &&
      isU32(text["utf16Offset"]) &&
      validAffinity(text["affinity"]);
  }
  const children = exactJsonRecord(value, [
    "kind",
    "parentPath",
    "childIndex",
    "affinity",
  ]);
  return children !== null &&
    children["kind"] === "children" &&
    validPath(children["parentPath"]) &&
    isU32(children["childIndex"]) &&
    validAffinity(children["affinity"]);
}

function validAffinity(value: unknown): boolean {
  return value === "before" || value === "after";
}

function validOperationV3Payload(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
): boolean {
  const record = jsonRecord(value);
  if (record === null) return false;
  switch (record["kind"]) {
    case "textSplice": {
      const operation = exactJsonRecord(record, [
        "kind",
        "range",
        "expectedRemoved",
        "replacement",
      ]);
      return operation !== null &&
        validTextRange(operation["range"]) &&
        validTextFragment(operation["expectedRemoved"], contract) &&
        validTextFragment(operation["replacement"], contract);
    }
    case "paragraphSplit": {
      const operation = exactJsonRecord(record, [
        "kind",
        "paragraphPath",
        "offset",
        "expected",
      ]);
      return operation !== null &&
        validPath(operation["paragraphPath"]) &&
        isSafeUnsignedInteger(operation["offset"]) &&
        validTextFragment(operation["expected"], contract);
    }
    case "paragraphJoin": {
      const operation = exactJsonRecord(record, [
        "kind",
        "leftPath",
        "expectedLeft",
        "expectedRight",
      ]);
      return operation !== null &&
        validPath(operation["leftPath"]) &&
        validTextFragment(operation["expectedLeft"], contract) &&
        validTextFragment(operation["expectedRight"], contract);
    }
    case "rootTextReplace": {
      const operation = exactJsonRecord(record, [
        "kind",
        "range",
        "expectedParagraphs",
        "replacementParagraphs",
      ]);
      return operation !== null &&
        validRootTextRange(operation["range"]) &&
        validTextFragmentArray(operation["expectedParagraphs"], contract) &&
        validTextFragmentArray(operation["replacementParagraphs"], contract);
    }
    default:
      return false;
  }
}

function validTextRange(value: unknown): boolean {
  const range = exactJsonRecord(value, ["containerPath", "start", "end"]);
  return range !== null &&
    validPath(range["containerPath"]) &&
    isSafeUnsignedInteger(range["start"]) &&
    isSafeUnsignedInteger(range["end"]) &&
    range["start"] <= range["end"];
}

function validRootTextRange(value: unknown): boolean {
  const range = exactJsonRecord(value, ["start", "end"]);
  return range !== null &&
    validRootTextBoundary(range["start"]) &&
    validRootTextBoundary(range["end"]);
}

function validRootTextBoundary(value: unknown): boolean {
  const boundary = exactJsonRecord(value, ["paragraphPath", "offset"]);
  return boundary !== null &&
    validPath(boundary["paragraphPath"]) &&
    isSafeUnsignedInteger(boundary["offset"]);
}

function validTextFragmentArray(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
): boolean {
  return Array.isArray(value) &&
    value.length <= MAX_OPERATION_PARAGRAPHS &&
    value.every((fragment) => validTextFragment(fragment, contract));
}

function validTextFragment(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
): boolean {
  const fragment = exactJsonRecord(value, ["runs"]);
  const runs = fragment?.["runs"];
  if (
    fragment === null ||
    !Array.isArray(runs) ||
    runs.length > MAX_OPERATION_RUNS
  ) {
    return false;
  }
  let previousFormats: string | undefined;
  for (const value of runs) {
    const run = exactJsonRecord(value, ["text", "formats"]);
    if (
      run === null ||
      typeof run["text"] !== "string" ||
      run["text"].length === 0 ||
      wellFormedUtf8Length(
        run["text"],
        MAX_OPERATION_TEXT_UTF8_BYTES,
      ) === null ||
      !durableFormatRecordsMatchContract(run["formats"], contract)
    ) {
      return false;
    }
    const formatKey = Reflect.apply(JSON_STRINGIFY, JSON, [run["formats"]]) as string;
    if (formatKey === previousFormats) return false;
    previousFormats = formatKey;
  }
  return true;
}

function validPath(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length <= MAX_PATH_DEPTH &&
    value.every(isU32);
}

function isU32(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4_294_967_295;
}

function isSafeUnsignedInteger(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0;
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
