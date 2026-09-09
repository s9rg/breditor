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
export type WasmDurableMode = "v1" | "v2" | "v3";

/** Exact schema selector and fingerprint required by a compiled durable codec. */
export interface WasmDurableSchemaBinding {
  readonly name: string;
  readonly version: number;
  readonly fingerprint: string;
}

/** Closed scalar property type retained by the durable browser contract. */
export type WasmDurablePropertyTypeBinding =
  | Readonly<{ kind: "boolean" }>
  | Readonly<{ kind: "integer"; minimum: number | null; maximum: number | null }>
  | Readonly<{
      kind: "string";
      minimumUtf8Bytes: number;
      maximumUtf8Bytes: number;
    }>;

/** One format-property declaration retained from a compiled profile. */
export interface WasmDurablePropertyBinding {
  readonly name: string;
  readonly presence: "required" | "optional";
  readonly valueType: WasmDurablePropertyTypeBinding;
}

/** One inline format admitted by a compiled profile. */
export interface WasmDurableFormatBinding {
  readonly kind: string;
  readonly revision: number;
  readonly properties: readonly WasmDurablePropertyBinding[];
}

/**
 * Browser-side durable contract selected independently of payload contents.
 *
 * V1 is the exact built-in base contract. V2 and V3 require the complete
 * selector, fingerprint, and canonical format/property catalog copied from one
 * compiled profile. Both use Document V2; the mode distinguishes session,
 * state, commit, and operation generations.
 * @internal
 */
export type WasmDurableJsonContract =
  | Readonly<{ readonly mode: "v1" }>
  | Readonly<{
      readonly mode: "v2" | "v3";
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
const MAX_PROPERTY_VALUES = 10_000;
const MAX_PROPERTY_STRING_UTF8_BYTES = 65_536;
const MAX_TOTAL_PROPERTY_STRING_UTF8_BYTES = 1024 * 1024;
const LEGACY_V1_CONTRACT: WasmDurableJsonContract = Object.freeze({ mode: "v1" });

/** Fully validated durable contract used only inside browser preflight. @internal */
export interface ResolvedWasmDurableJsonContract {
  readonly mode: WasmDurableMode;
  readonly schema: Readonly<{
    name: string;
    version: number;
    fingerprint: string | undefined;
  }>;
  readonly formatsByKind: ReadonlyMap<string, WasmDurableFormatBinding>;
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
  const resolved = resolveWasmDurableJsonContract(contract);
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
  const resolved = resolveWasmDurableJsonContract(contract);
  if (
    !isOwnedProjection(projection) ||
    resolved === null ||
    documentJsonUtf8Bytes(value, contract) === null ||
    projection.schema.name !== resolved.schema.name ||
    projection.schema.version !== resolved.schema.version ||
    (resolved.mode !== "v1" &&
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
          formats.length !== projected.formatDetails.length ||
          !formats.every((format, formatIndex) => {
            const projectedFormat = projected.formatDetails[formatIndex];
            const properties = format["properties"] as Record<string, unknown>;
            if (
              projectedFormat === undefined ||
              format["type"] !== projectedFormat.kind
            ) {
              return false;
            }
            const propertyNames = Reflect.apply(
              OBJECT_KEYS,
              Object,
              [properties],
            ) as string[];
            return propertyNames.length === projectedFormat.properties.length &&
              propertyNames.every((name, propertyIndex) => {
                const projectedProperty = projectedFormat.properties[propertyIndex];
                return projectedProperty !== undefined &&
                  name === projectedProperty.name &&
                  properties[name] === projectedProperty.value;
              });
          })
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

/**
 * Snapshots and validates a caller-owned durable contract without retaining it.
 * @internal
 */
export function resolveWasmDurableJsonContract(
  value: WasmDurableJsonContract,
): ResolvedWasmDurableJsonContract | null {
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
        formatsByKind: new Map([
          [
            "breditor/strong",
            Object.freeze({
              kind: "breditor/strong",
              revision: 1,
              properties: Object.freeze([]),
            }),
          ],
        ]),
      });
    }

    const compiled = exactJsonRecord(value, ["mode", "schema", "formats"]);
    if (
      compiled === null ||
      (compiled["mode"] !== "v2" && compiled["mode"] !== "v3")
    ) return null;
    const schema = exactJsonRecord(compiled["schema"], ["name", "version", "fingerprint"]);
    const formats = snapshotOwnDataArray(compiled["formats"], MAX_PROFILE_FORMATS);
    if (
      schema === null ||
      !isQualifiedName(schema["name"]) ||
      !isPositiveU32(schema["version"]) ||
      !isSchemaFingerprint(schema["fingerprint"]) ||
      formats === null
    ) {
      return null;
    }
    const formatsByKind = new Map<string, WasmDurableFormatBinding>();
    let prior = "";
    for (let index = 0; index < formats.length; index += 1) {
      const value = formats[index];
      const format = readDurableFormatBinding(value);
      if (
        format === null ||
        format.kind <= prior
      ) {
        return null;
      }
      prior = format.kind;
      formatsByKind.set(format.kind, format);
    }
    return Object.freeze({
      mode: compiled["mode"],
      schema: Object.freeze({
        name: schema["name"],
        version: schema["version"],
        fingerprint: schema["fingerprint"],
      }),
      formatsByKind,
    });
  } catch {
    return null;
  }
}

function readDurableFormatBinding(value: unknown): WasmDurableFormatBinding | null {
  const format = exactJsonRecord(value, ["kind", "revision", "properties"]);
  if (
    format === null ||
    !isQualifiedName(format["kind"]) ||
    !isPositiveU32(format["revision"])
  ) return null;
  const rawProperties = snapshotOwnDataArray(format["properties"], 32);
  if (rawProperties === null) return null;
  const properties: WasmDurablePropertyBinding[] = [];
  let prior = "";
  for (const rawProperty of rawProperties) {
    const property = exactJsonRecord(rawProperty, ["name", "presence", "valueType"]);
    if (
      property === null ||
      !isQualifiedName(property["name"]) ||
      property["name"] <= prior ||
      (property["presence"] !== "required" && property["presence"] !== "optional")
    ) return null;
    const valueType = readDurablePropertyType(property["valueType"]);
    if (valueType === null) return null;
    prior = property["name"];
    properties.push(Object.freeze({
      name: property["name"],
      presence: property["presence"],
      valueType,
    }));
  }
  return Object.freeze({
    kind: format["kind"],
    revision: format["revision"],
    properties: Object.freeze(properties),
  });
}

function readDurablePropertyType(value: unknown): WasmDurablePropertyTypeBinding | null {
  const boolean = exactJsonRecord(value, ["kind"]);
  if (boolean !== null && boolean["kind"] === "boolean") {
    return Object.freeze({ kind: "boolean" });
  }
  const integer = exactJsonRecord(value, ["kind", "minimum", "maximum"]);
  if (
    integer !== null &&
    integer["kind"] === "integer" &&
    isNullableSafeInteger(integer["minimum"]) &&
    isNullableSafeInteger(integer["maximum"]) &&
    !(
      typeof integer["minimum"] === "number" &&
      typeof integer["maximum"] === "number" &&
      integer["minimum"] > integer["maximum"]
    )
  ) {
    return Object.freeze({
      kind: "integer",
      minimum: integer["minimum"],
      maximum: integer["maximum"],
    });
  }
  const string = exactJsonRecord(value, [
    "kind",
    "minimumUtf8Bytes",
    "maximumUtf8Bytes",
  ]);
  if (
    string === null ||
    string["kind"] !== "string" ||
    !isU32(string["minimumUtf8Bytes"]) ||
    !isU32(string["maximumUtf8Bytes"]) ||
    string["minimumUtf8Bytes"] > string["maximumUtf8Bytes"] ||
    string["maximumUtf8Bytes"] > 65_536
  ) return null;
  return Object.freeze({
    kind: "string",
    minimumUtf8Bytes: string["minimumUtf8Bytes"],
    maximumUtf8Bytes: string["maximumUtf8Bytes"],
  });
}

function validFormatProperties(
  value: unknown,
  format: WasmDurableFormatBinding | undefined,
  mode: WasmDurableMode,
): FormatPropertySummary | null {
  // V1 and V2 are deliberately frozen at the original property-free payload
  // generation. Document V2 is shared by both compiled modes, but only V3 may
  // use the descriptor's scalar property contracts.
  if (mode !== "v3") {
    return emptyJsonRecord(value) ? EMPTY_FORMAT_PROPERTY_SUMMARY : null;
  }
  const record = jsonRecord(value);
  if (record === null || format === undefined) return null;
  const keys = Reflect.apply(OBJECT_KEYS, Object, [record]) as string[];
  if (keys.length > format.properties.length) return null;
  let propertyIndex = 0;
  let stringUtf8Bytes = 0;
  for (const property of format.properties) {
    const key = keys[propertyIndex];
    if (key === property.name) {
      const propertyStringUtf8Bytes = validPropertyScalar(
        record[key],
        property.valueType,
      );
      if (propertyStringUtf8Bytes === null) return null;
      stringUtf8Bytes += propertyStringUtf8Bytes;
      propertyIndex += 1;
    } else if (property.presence === "required") {
      return null;
    }
  }
  return propertyIndex === keys.length
    ? { values: propertyIndex, stringUtf8Bytes }
    : null;
}

function validPropertyScalar(
  value: unknown,
  contract: WasmDurablePropertyTypeBinding,
): number | null {
  if (contract.kind === "boolean") return typeof value === "boolean" ? 0 : null;
  if (contract.kind === "integer") {
    return typeof value === "number" &&
      Number.isSafeInteger(value) &&
      (contract.minimum === null || value >= contract.minimum) &&
      (contract.maximum === null || value <= contract.maximum)
      ? 0
      : null;
  }
  if (typeof value !== "string") return null;
  const bytes = wellFormedUtf8Length(
    value,
    Math.min(contract.maximumUtf8Bytes, MAX_PROPERTY_STRING_UTF8_BYTES),
  );
  return bytes !== null && bytes >= contract.minimumUtf8Bytes ? bytes : null;
}

function validDocument(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
): boolean {
  const expectedEnvelopeKeys = contract.mode === "v1"
    ? ["format", "formatVersion", "schema", "root"]
    : ["format", "formatVersion", "schema", "schemaFingerprint", "root"];
  const envelope = exactJsonRecord(value, expectedEnvelopeKeys);
  if (
    envelope === null ||
    envelope["format"] !== "breditor/document" ||
    envelope["formatVersion"] !== (contract.mode === "v1" ? 1 : 2) ||
    (contract.mode !== "v1" &&
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
  let totalPropertyValues = 0;
  let totalPropertyStringUtf8Bytes = 0;
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
        run["formats"].length > contract.formatsByKind.size
      ) {
        return false;
      }
      const textBytes = wellFormedUtf8Length(run["text"], MAX_TEXT_UTF8_BYTES);
      if (textBytes === null) return false;
      totalTextBytes += textBytes;
      if (totalTextBytes > MAX_TOTAL_TEXT_UTF8_BYTES) return false;

      const propertySummary = summarizeDurableFormatRecords(
        run["formats"],
        contract,
      );
      if (propertySummary === null) return false;
      totalPropertyValues += propertySummary.values;
      totalPropertyStringUtf8Bytes += propertySummary.stringUtf8Bytes;
      if (
        totalPropertyValues > MAX_PROPERTY_VALUES ||
        totalPropertyStringUtf8Bytes > MAX_TOTAL_PROPERTY_STRING_UTF8_BYTES
      ) return false;
      // Property values are semantic format identity in V3. Adjacent runs with
      // the same kinds but different values must remain distinct; equal complete
      // format arrays are noncanonical and should already have been coalesced.
      const formatKey = Reflect.apply(JSON_STRINGIFY, JSON, [run["formats"]]) as string;
      if (previousFormats === formatKey) return false;
      previousFormats = formatKey;
    }
  }
  return true;
}

/**
 * Validates one canonical inline-format array against an already resolved
 * durable contract. Used by Document V2, Editor State V3 pending formats, and
 * property-preserving V3 operation fragments. @internal
 */
export function durableFormatRecordsMatchContract(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
): boolean {
  return summarizeDurableFormatRecords(value, contract) !== null;
}

interface FormatPropertySummary {
  readonly values: number;
  readonly stringUtf8Bytes: number;
}

const EMPTY_FORMAT_PROPERTY_SUMMARY: FormatPropertySummary = Object.freeze({
  values: 0,
  stringUtf8Bytes: 0,
});

function summarizeDurableFormatRecords(
  value: unknown,
  contract: ResolvedWasmDurableJsonContract,
): FormatPropertySummary | null {
  if (
    !Array.isArray(value) ||
    value.length > MAX_FORMATS_PER_RUN ||
    value.length > contract.formatsByKind.size
  ) {
    return null;
  }
  let priorFormat = "";
  let propertyValues = 0;
  let propertyStringUtf8Bytes = 0;
  for (const rawFormat of value) {
    const format = exactJsonRecord(rawFormat, ["type", "properties"]);
    const propertySummary = format === null
      ? null
      : validFormatProperties(
        format["properties"],
        contract.formatsByKind.get(format["type"] as string),
        contract.mode,
      );
    if (
      format === null ||
      !isQualifiedName(format["type"]) ||
      !contract.formatsByKind.has(format["type"]) ||
      format["type"] <= priorFormat ||
      propertySummary === null
    ) {
      return null;
    }
    propertyValues += propertySummary.values;
    propertyStringUtf8Bytes += propertySummary.stringUtf8Bytes;
    priorFormat = format["type"];
  }
  return {
    values: propertyValues,
    stringUtf8Bytes: propertyStringUtf8Bytes,
  };
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

function isU32(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 4_294_967_295;
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null ||
    (typeof value === "number" && Number.isSafeInteger(value));
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
