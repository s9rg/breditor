import {
  isOwnedProjection,
  type BaseDocumentProjection,
} from "./projection.js";
import {
  snapshotOwnDataArray,
  snapshotProtectedHandleArray,
} from "./protected_handle_snapshot.js";

/** Maximum UTF-8 bytes admitted by the browser Document V1 export boundary. */
export const MAX_BROWSER_DOCUMENT_JSON_BYTES = 16_777_216;

/** Explicit durable codec selected before any document payload is inspected. */
export type WasmDurableMode = "v1" | "v2";

/** Exact schema selector and fingerprint required by a V2 durable codec. */
export interface WasmDurableSchemaBinding {
  readonly name: string;
  readonly version: number;
  readonly fingerprint: string;
}

/** One property-free inline format admitted by a compiled profile. */
export interface WasmDurableFormatBinding {
  readonly kind: string;
  readonly revision: number;
}

/**
 * Browser-side durable contract selected independently of payload contents.
 *
 * V1 is the exact built-in base contract. V2 requires the complete selector,
 * fingerprint, and canonical format catalog copied from one compiled profile.
 * @internal
 */
export type WasmDurableJsonContract =
  | Readonly<{ readonly mode: "v1" }>
  | Readonly<{
      readonly mode: "v2";
      readonly schema: WasmDurableSchemaBinding;
      readonly formats: readonly WasmDurableFormatBinding[];
    }>;

/** Exact engine snapshot associated with one synchronous document capture. */
export interface WasmDocumentJsonExpectedSnapshot {
  readonly lineage: string;
  readonly revision: string;
}

/** Structural subset of one generated Wasm error clone. */
export interface WasmDocumentJsonErrorView {
  readonly code: string;
  readonly message: string;
  free(): void;
}

/** Structural subset of the generated fallible-string result. */
export interface WasmDocumentJsonStringResultView {
  readonly status: "value" | "taken" | "absent" | "error";
  readonly error: WasmDocumentJsonErrorView | undefined;
  takeValue(): string | undefined;
  free(): void;
}

/** Bounded, handle-free mode-selected Document bytes and their exact snapshot. */
export interface BrowserDocumentJson {
  readonly documentJson: string;
  readonly documentUtf8Bytes: number;
  readonly snapshot: Readonly<{
    readonly lineage: string;
    readonly revision: string;
  }>;
}

/** Payload-redacted failure from a synchronous mode-selected Document capture. */
export type BrowserDocumentJsonReadError =
  | Readonly<{
      kind: "boundary";
      code: "document_json.invalid_wasm_view";
      message: "The Wasm document-JSON view is invalid.";
    }>
  | Readonly<{
      kind: "lifecycle";
      code: "document_json.adapter_unavailable";
      message: "The Wasm document-JSON reader is permanently unavailable.";
    }>
  | Readonly<{
      kind: "core";
      code: "document_json.core_rejected";
      message: "The Rust editor core could not export the active Document format.";
    }>;

/** Validated result of one synchronous mode-selected Document capture. */
export type BrowserDocumentJsonReadResult =
  | Readonly<{ ok: true; document: BrowserDocumentJson }>
  | Readonly<{ ok: false; error: BrowserDocumentJsonReadError }>;

/**
 * Handle-free document reader issued by the observation-owning adapter.
 *
 * `undefined` means the adapter is temporarily busy. A permanent lifecycle
 * loss is an explicit failure; neither outcome is replacement content.
 */
export interface WasmDocumentJsonReadPort {
  read(): BrowserDocumentJsonReadResult | undefined;
}

const INVALID_VIEW: BrowserDocumentJsonReadError = Object.freeze({
  kind: "boundary",
  code: "document_json.invalid_wasm_view",
  message: "The Wasm document-JSON view is invalid.",
});

const ADAPTER_UNAVAILABLE: BrowserDocumentJsonReadError = Object.freeze({
  kind: "lifecycle",
  code: "document_json.adapter_unavailable",
  message: "The Wasm document-JSON reader is permanently unavailable.",
});

const CORE_REJECTED: BrowserDocumentJsonReadError = Object.freeze({
  kind: "core",
  code: "document_json.core_rejected",
  message: "The Rust editor core could not export the active Document format.",
});

const OWNED_READ_RESULTS = new WeakSet<object>();
const JSON_PARSE = JSON.parse;
const JSON_STRINGIFY = JSON.stringify;
const OBJECT_KEYS = Object.keys;
const OBJECT_HAS_OWN = Object.hasOwn;
const PROMISE_RESOLVE = Promise.resolve.bind(Promise);
const PROMISE_CATCH = Promise.prototype.catch;
const IGNORE_SETTLEMENT = (): undefined => undefined;
const MAX_U64 = 18_446_744_073_709_551_615n;
const MAX_PARAGRAPHS = 10_000;
const MAX_RUNS_PER_PARAGRAPH = 10_000;
const MAX_NODES = 100_000;
const MAX_TEXT_UTF8_BYTES = 1024 * 1024;
const MAX_TOTAL_TEXT_UTF8_BYTES = 8 * 1024 * 1024;
const MAX_PROFILE_FORMATS = 256;
const MAX_FORMATS_PER_RUN = 32;
const LEGACY_V1_CONTRACT: WasmDurableJsonContract = Object.freeze({ mode: "v1" });

interface ResolvedDurableContract {
  readonly mode: WasmDurableMode;
  readonly schema: Readonly<{
    name: string;
    version: number;
    fingerprint: string | undefined;
  }>;
  readonly formatKinds: ReadonlySet<string>;
}

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
 * Consumes one generated string result into exact, bounded Document bytes.
 *
 * The outer result and every cloned error are freed exactly once after their
 * cleanup methods have been captured. Generated values are hostile: accessors
 * may throw, handles may alias protected owners, and sync methods may return
 * thenables. No generated handle or unvalidated payload crosses this edge.
 */
export function consumeWasmDocumentJson(
  expected: WasmDocumentJsonExpectedSnapshot,
  view: WasmDocumentJsonStringResultView,
  protectedHandles: readonly unknown[] = [],
  contract: WasmDurableJsonContract = LEGACY_V1_CONTRACT,
): BrowserDocumentJsonReadResult {
  const registry: HandleRegistry = { handles: [], seen: new Set(), invalid: false };
  let protectedSet: ReadonlySet<object>;
  try {
    protectedSet = objectSet(protectedHandles);
  } catch {
    return boundaryFailure();
  }
  let provisional: BrowserDocumentJsonReadResult = boundaryFailure();
  try {
    provisional = readDocument(expected, view, registry, protectedSet, contract);
  } catch {
    provisional = boundaryFailure();
  }
  return freeHandles(registry) ? boundaryFailure() : provisional;
}

/** Whether a handle-free result was minted by this module. @internal */
export function isOwnedBrowserDocumentJsonReadResult(
  value: unknown,
): value is BrowserDocumentJsonReadResult {
  return objectLike(value) && OWNED_READ_RESULTS.has(value);
}

/** Mints a handle-free failure for a permanently unavailable adapter. @internal */
export function unavailableWasmDocumentJsonReadResult(): BrowserDocumentJsonReadResult {
  return ownedResult(Object.freeze({ ok: false, error: ADAPTER_UNAVAILABLE }));
}

/** Mints a handle-free failure when invocation cannot yield a valid view. @internal */
export function invalidWasmDocumentJsonReadResult(): BrowserDocumentJsonReadResult {
  return boundaryFailure();
}

/** Validates a canonical mode-selected Document string and returns its bytes. */
export function documentJsonUtf8Bytes(
  value: unknown,
  contract: WasmDurableJsonContract = LEGACY_V1_CONTRACT,
): number | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BROWSER_DOCUMENT_JSON_BYTES
  ) {
    return null;
  }
  const utf8Bytes = wellFormedUtf8Length(
    value,
    MAX_BROWSER_DOCUMENT_JSON_BYTES,
  );
  if (utf8Bytes === null) return null;

  let parsed: unknown;
  try {
    parsed = Reflect.apply(JSON_PARSE, JSON, [value]) as unknown;
    if (Reflect.apply(JSON_STRINGIFY, JSON, [parsed]) !== value) return null;
  } catch {
    return null;
  }
  const resolved = readDurableContract(contract);
  return resolved !== null && validDocument(parsed, resolved) ? utf8Bytes : null;
}

/**
 * Proves that validated Document V1 bytes describe exactly the current base
 * semantic projection. Document V1 intentionally has no snapshot field, so
 * this comparison closes the content-correlation edge for structural engines.
 * @internal
 */
export function documentJsonMatchesProjection(
  value: unknown,
  projection: BaseDocumentProjection,
  contract: WasmDurableJsonContract = LEGACY_V1_CONTRACT,
): boolean {
  const resolved = readDurableContract(contract);
  if (
    !isOwnedProjection(projection) ||
    resolved === null ||
    documentJsonUtf8Bytes(value, contract) === null ||
    projection.schema.name !== resolved.schema.name ||
    projection.schema.version !== resolved.schema.version ||
    (resolved.mode === "v2" &&
      projection.schema.fingerprint !== resolved.schema.fingerprint)
  ) {
    return false;
  }
  try {
    const parsed = Reflect.apply(JSON_PARSE, JSON, [value]) as Record<string, unknown>;
    const root = parsed["root"] as Record<string, unknown>;
    const documentParagraphs = root["children"] as unknown[];
    if (documentParagraphs.length !== projection.paragraphs.length) return false;
    for (let paragraphIndex = 0; paragraphIndex < documentParagraphs.length; paragraphIndex += 1) {
      const paragraph = documentParagraphs[paragraphIndex] as Record<string, unknown>;
      const documentRuns = paragraph["children"] as unknown[];
      const projectionRuns = projection.paragraphs[paragraphIndex]?.runs;
      if (projectionRuns === undefined || documentRuns.length !== projectionRuns.length) {
        return false;
      }
      for (let runIndex = 0; runIndex < documentRuns.length; runIndex += 1) {
        const run = documentRuns[runIndex] as Record<string, unknown>;
        const formats = run["formats"] as Array<Record<string, unknown>>;
        const projected = projectionRuns[runIndex];
        if (
          projected === undefined ||
          run["text"] !== projected.text ||
          formats.length !== projected.formats.length ||
          formats.some((format, formatIndex) =>
            format["type"] !== projected.formats[formatIndex])
        ) {
          return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

function readDocument(
  expected: WasmDocumentJsonExpectedSnapshot,
  view: WasmDocumentJsonStringResultView,
  registry: HandleRegistry,
  protectedHandles: ReadonlySet<object>,
  contract: WasmDurableJsonContract,
): BrowserDocumentJsonReadResult {
  if (!captureHandle(registry, view, protectedHandles)) {
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

  const documentUtf8Bytes = documentJsonUtf8Bytes(rawValue, contract);
  if (documentUtf8Bytes === null) return boundaryFailure();
  const document: BrowserDocumentJson = Object.freeze({
    documentJson: rawValue,
    documentUtf8Bytes,
    snapshot,
  });
  return ownedResult(Object.freeze({ ok: true, document }));
}

function readExpectedSnapshot(
  value: WasmDocumentJsonExpectedSnapshot,
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
): BrowserDocumentJsonReadError | null | undefined {
  if (value === undefined) return undefined;
  if (objectLike(value) && protectedHandles.has(value)) {
    registry.invalid = true;
    return null;
  }
  if (!captureHandle(registry, value, protectedHandles)) return null;
  try {
    const error = value as WasmDocumentJsonErrorView;
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
    return CORE_REJECTED;
  } catch {
    return null;
  }
}

function readDurableContract(
  value: WasmDurableJsonContract,
): Readonly<{
  mode: WasmDurableMode;
  schema: WasmDurableSchemaBinding;
  formatKinds: ReadonlySet<string>;
}> | null {
  try {
    const v1 = exactJsonRecord(value, ["mode"]);
    if (v1 !== null && v1["mode"] === "v1") {
      return Object.freeze({
        mode: "v1",
        schema: Object.freeze({
          name: "breditor/base",
          version: 1,
          fingerprint: "",
        }),
        formatKinds: new Set(["breditor/strong"]),
      });
    }

    const v2 = exactJsonRecord(value, ["mode", "schema", "formats"]);
    if (v2 === null || v2["mode"] !== "v2") return null;
    const schema = exactJsonRecord(v2["schema"], ["name", "version", "fingerprint"]);
    const formats = snapshotOwnDataArray(v2["formats"], MAX_PROFILE_FORMATS);
    if (
      schema === null ||
      !isQualifiedName(schema["name"]) ||
      !isPositiveU32(schema["version"]) ||
      !isSchemaFingerprint(schema["fingerprint"]) ||
      formats === null
    ) {
      return null;
    }
    const formatKinds = new Set<string>();
    let prior = "";
    for (let index = 0; index < formats.length; index += 1) {
      const value = formats[index];
      const format = exactJsonRecord(value, ["kind", "revision"]);
      if (
        format === null ||
        !isQualifiedName(format["kind"]) ||
        !isPositiveU32(format["revision"]) ||
        format["kind"] <= prior
      ) {
        return null;
      }
      prior = format["kind"];
      formatKinds.add(format["kind"]);
    }
    return Object.freeze({
      mode: "v2",
      schema: Object.freeze({
        name: schema["name"],
        version: schema["version"],
        fingerprint: schema["fingerprint"],
      }),
      formatKinds,
    });
  } catch {
    return null;
  }
}

function validDocument(
  value: unknown,
  contract: Readonly<{
    mode: WasmDurableMode;
    schema: WasmDurableSchemaBinding;
    formatKinds: ReadonlySet<string>;
  }>,
): boolean {
  const expectedEnvelopeKeys = contract.mode === "v1"
    ? ["format", "formatVersion", "schema", "root"]
    : ["format", "formatVersion", "schema", "schemaFingerprint", "root"];
  const envelope = exactJsonRecord(value, expectedEnvelopeKeys);
  if (
    envelope === null ||
    envelope["format"] !== "breditor/document" ||
    envelope["formatVersion"] !== (contract.mode === "v1" ? 1 : 2) ||
    (contract.mode === "v2" &&
      envelope["schemaFingerprint"] !== contract.schema.fingerprint)
  ) {
    return false;
  }
  const schema = exactJsonRecord(envelope["schema"], ["name", "version"]);
  if (
    schema === null ||
    schema["name"] !== contract.schema.name ||
    schema["version"] !== contract.schema.version
  ) {
    return false;
  }
  const root = exactJsonRecord(envelope["root"], [
    "kind",
    "type",
    "entityId",
    "properties",
    "children",
  ]);
  if (
    root === null ||
    root["kind"] !== "element" ||
    root["type"] !== "breditor/document" ||
    root["entityId"] !== null ||
    !emptyJsonRecord(root["properties"]) ||
    !Array.isArray(root["children"]) ||
    root["children"].length === 0 ||
    root["children"].length > MAX_PARAGRAPHS
  ) {
    return false;
  }

  let nodes = 1 + root["children"].length;
  let totalTextBytes = 0;
  for (const rawParagraph of root["children"]) {
    const paragraph = exactJsonRecord(rawParagraph, [
      "kind",
      "type",
      "entityId",
      "properties",
      "children",
    ]);
    if (
      paragraph === null ||
      paragraph["kind"] !== "element" ||
      paragraph["type"] !== "breditor/paragraph" ||
      paragraph["entityId"] !== null ||
      !emptyJsonRecord(paragraph["properties"]) ||
      !Array.isArray(paragraph["children"]) ||
      paragraph["children"].length > MAX_RUNS_PER_PARAGRAPH
    ) {
      return false;
    }
    nodes += paragraph["children"].length;
    if (nodes > MAX_NODES) return false;

    let previousFormats: string | undefined;
    for (const rawRun of paragraph["children"]) {
      const run = exactJsonRecord(rawRun, ["kind", "text", "formats"]);
      if (
        run === null ||
        run["kind"] !== "text" ||
        typeof run["text"] !== "string" ||
        run["text"].length === 0 ||
        !Array.isArray(run["formats"]) ||
        run["formats"].length > MAX_FORMATS_PER_RUN ||
        run["formats"].length > contract.formatKinds.size
      ) {
        return false;
      }
      const textBytes = wellFormedUtf8Length(run["text"], MAX_TEXT_UTF8_BYTES);
      if (textBytes === null) return false;
      totalTextBytes += textBytes;
      if (totalTextBytes > MAX_TOTAL_TEXT_UTF8_BYTES) return false;

      const formatKinds: string[] = [];
      let priorFormat = "";
      for (const rawFormat of run["formats"]) {
        const format = exactJsonRecord(rawFormat, ["type", "properties"]);
        if (
          format === null ||
          !isQualifiedName(format["type"]) ||
          !contract.formatKinds.has(format["type"]) ||
          format["type"] <= priorFormat ||
          !emptyJsonRecord(format["properties"])
        ) {
          return false;
        }
        priorFormat = format["type"];
        formatKinds.push(format["type"]);
      }
      const formatKey = formatKinds.join("\u0000");
      if (previousFormats === formatKey) return false;
      previousFormats = formatKey;
    }
  }
  return true;
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
  const keys = Reflect.apply(OBJECT_KEYS, Object, [record]) as string[];
  if (keys.length !== expectedKeys.length) return null;
  for (let index = 0; index < expectedKeys.length; index += 1) {
    const expected = expectedKeys[index];
    if (
      expected === undefined ||
      keys[index] !== expected ||
      !Reflect.apply(OBJECT_HAS_OWN, Object, [record, expected])
    ) {
      return null;
    }
  }
  return record;
}

function emptyJsonRecord(value: unknown): boolean {
  const record = jsonRecord(value);
  return (
    record !== null &&
    (Reflect.apply(OBJECT_KEYS, Object, [record]) as string[]).length === 0
  );
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
  registry.handles.push({ value, free: () => Reflect.apply(free, value, []) });
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

function ownedResult<T extends BrowserDocumentJsonReadResult>(value: T): T {
  OWNED_READ_RESULTS.add(value);
  return value;
}

function boundaryFailure(): BrowserDocumentJsonReadResult {
  return ownedResult(Object.freeze({ ok: false, error: INVALID_VIEW }));
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
    // The value remains invalid even if rejection containment fails.
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
    return BigInt(value) <= MAX_U64;
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
    if (first <= 0x7f) bytes += 1;
    else if (first <= 0x7ff) bytes += 2;
    else if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (!(second >= 0xdc00 && second <= 0xdfff)) return null;
      bytes += 4;
      index += 1;
    } else if (first >= 0xdc00 && first <= 0xdfff) return null;
    else bytes += 3;
    if (bytes > maximum) return null;
  }
  return bytes;
}
