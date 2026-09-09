import type { BrowserProjectionErrorCode, BrowserProjectionResult } from "./result.js";
import { projectionFailure, projectionSuccess } from "./result.js";
import {
  browserPresentationMatchesProfile,
  isOwnedBrowserCompiledPresentation,
  type BrowserCompiledPresentation,
} from "./compiled_browser_presentation.js";
import {
  browserCompiledProfileDescriptorMatchesGeneration,
  type BrowserCompiledProfileDescriptor,
  type BrowserProfileFormatDescriptor,
  type BrowserProfileFormatPropertyDescriptor,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

/** Schema identity represented by one immutable browser projection. */
export interface ProjectionSchema {
  /** Exact qualified schema name. */
  readonly name: string;
  /** Exact positive schema version. */
  readonly version: number;
  /** Durable schema fingerprint for a compiled-profile projection. */
  readonly fingerprint?: string;
}

/** Base-schema identity required by the first browser renderer. */
export interface BaseProjectionSchema {
  /** Exact qualified schema name. */
  readonly name: "breditor/base";
  /** Exact base-schema version. */
  readonly version: 1;
}

/** Exact schema identity copied from a compiled editor profile. */
export interface CompiledProjectionSchema extends ProjectionSchema {
  readonly fingerprint: string;
}

/** Exact identity of the immutable editor snapshot behind a projection. */
export interface ProjectionSnapshot {
  /** Validated Breditor lineage identifier. */
  readonly lineage: string;
  /** Canonical unsigned-decimal `u64` revision. */
  readonly revision: string;
}

/** One scalar value retained by a schema-admitted inline-format property. */
export type InlineFormatPropertyProjectionValue = boolean | number | string;

/** One qualified property entry in canonical lexical-name order. */
export interface InlineFormatPropertyProjection {
  /** Exact qualified property name. */
  readonly name: string;
  /** Exact schema-admitted scalar value. */
  readonly value: InlineFormatPropertyProjectionValue;
}

/** One inline format and its canonical, deeply immutable property entries. */
export interface InlineFormatProjection {
  /** Exact qualified inline-format kind. */
  readonly kind: string;
  /** Canonical property entries in strictly ascending name order. */
  readonly properties: readonly InlineFormatPropertyProjection[];
}

/** One base-schema text leaf projected without persistence-record details. */
export interface BaseTextRunProjection {
  /** Non-empty Unicode scalar text. */
  readonly text: string;
  /** Whether the property-free `breditor/strong` format is present. */
  readonly strong: boolean;
  /** Canonical qualified identities of all property-free inline formats. */
  readonly formats: readonly string[];
  /** Canonical inline formats, including their schema-admitted scalar properties. */
  readonly formatDetails: readonly InlineFormatProjection[];
}

/** One direct-root base-schema paragraph. */
export interface BaseParagraphProjection {
  /** Canonical text leaves; an empty list represents an empty paragraph. */
  readonly runs: readonly BaseTextRunProjection[];
}

/** Input accepted by {@link BaseDocumentProjection.create}. */
export interface BaseDocumentProjectionInput {
  /** Schema identity supplied by the core adapter. */
  readonly schema: Readonly<{ name: string; version: number }>;
  /** Result snapshot supplied by the core adapter. */
  readonly snapshot: Readonly<{ lineage: string; revision: string }>;
  /** Direct-root paragraphs in document order. */
  readonly paragraphs: readonly Readonly<{
    runs: readonly Readonly<{ text: string; strong: boolean }>[];
  }>[];
}

/** Profile-aware input accepted only by the Wasm projection adapter. @internal */
export interface ProfiledDocumentProjectionInput {
  readonly schema: Readonly<{ name: string; version: number; fingerprint: string }>;
  readonly snapshot: Readonly<{ lineage: string; revision: string }>;
  readonly paragraphs: readonly Readonly<{
    runs: readonly Readonly<{
      text: string;
      formatDetails: readonly Readonly<{
        kind: string;
        properties: readonly Readonly<{
          name: string;
          value: InlineFormatPropertyProjectionValue;
        }>[];
      }>[];
    }>[];
  }>[];
}

const MAX_LINEAGE_BYTES = 128;
const MAX_PARAGRAPHS = 10_000;
const MAX_RUNS_PER_PARAGRAPH = 10_000;
const MAX_NODES = 100_000;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_TOTAL_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_FORMATS_PER_RUN = 32;
const MAX_PROPERTIES_PER_FORMAT = 32;
const MAX_TOTAL_PROPERTY_VALUES = 10_000;
const MAX_PROPERTY_STRING_BYTES = 65_536;
const MAX_TOTAL_PROPERTY_STRING_BYTES = 1024 * 1024;
const MAX_REVISION = 18_446_744_073_709_551_615n;
const ARRAY_IS_ARRAY = Array.isArray;
const GET_OWN_PROPERTY_DESCRIPTOR = Reflect.getOwnPropertyDescriptor;
const OWN_KEYS = Reflect.ownKeys;
const CONSTRUCTION_TOKEN = Symbol("BaseDocumentProjection construction");
const OWNED_PROJECTIONS = new WeakSet<BaseDocumentProjection>();
interface ProjectionProfileBinding {
  readonly generation: WasmProfileGenerationView;
  readonly descriptor: BrowserCompiledProfileDescriptor;
}
const PROFILE_BINDINGS = new WeakMap<BaseDocumentProjection, ProjectionProfileBinding>();
const PROJECTION_PRESENTATIONS = new WeakMap<
  BaseDocumentProjection,
  BrowserCompiledPresentation
>();
const BASE_SCHEMA: BaseProjectionSchema = Object.freeze({
  name: "breditor/base",
  version: 1,
});

interface ValidatedProjection {
  readonly schema: ProjectionSchema;
  readonly snapshot: ProjectionSnapshot;
  readonly paragraphs: readonly BaseParagraphProjection[];
}

type ValidationResult =
  | { readonly ok: true; readonly value: ValidatedProjection }
  | { readonly ok: false; readonly code: BrowserProjectionErrorCode };

type ExactArrayResult =
  | { readonly ok: true; readonly values: readonly unknown[] }
  | { readonly ok: false; readonly resourceLimit: boolean };

/**
 * A validated, deeply immutable base-schema view intended for DOM projection.
 *
 * This is not the persisted document record. Adapters construct it from an
 * already validated semantic view, so the browser renderer never parses
 * editor-state or commit JSON.
 */
export class BaseDocumentProjection {
  /** Exact schema identity. */
  readonly schema: ProjectionSchema;
  /** Snapshot whose AST is represented. */
  readonly snapshot: ProjectionSnapshot;
  /** Direct-root paragraphs in document order. */
  readonly paragraphs: readonly BaseParagraphProjection[];

  protected constructor(
    token: symbol,
    schema: ProjectionSchema,
    snapshot: ProjectionSnapshot,
    paragraphs: readonly BaseParagraphProjection[],
    profileBinding?: ProjectionProfileBinding,
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new TypeError("Use BaseDocumentProjection.create().");
    }
    this.schema = schema;
    this.snapshot = snapshot;
    this.paragraphs = paragraphs;
    OWNED_PROJECTIONS.add(this);
    if (profileBinding !== undefined) {
      PROFILE_BINDINGS.set(this, profileBinding);
    }
    Object.freeze(this);
  }

  /**
   * Validates and owns a base projection without retaining caller arrays.
   *
   * Invalid shapes, non-canonical adjacent runs, lone UTF-16 surrogates, and
   * resource-limit violations return redacted structured errors.
   */
  static create(input: unknown): BrowserProjectionResult<BaseDocumentProjection> {
    let validation: ValidationResult;
    try {
      validation = validateProjection(input);
    } catch {
      return projectionFailure("projection.invalid_shape");
    }
    if (!validation.ok) {
      return projectionFailure(validation.code);
    }
    return projectionSuccess(
      new BaseDocumentProjection(
        CONSTRUCTION_TOKEN,
        validation.value.schema,
        validation.value.snapshot,
        validation.value.paragraphs,
      ),
    );
  }
}

/** Internal constructor bridge; no additional observable projection subtype exists. */
class OwnedProfiledDocumentProjection extends BaseDocumentProjection {
  constructor(
    schema: ProjectionSchema,
    snapshot: ProjectionSnapshot,
    paragraphs: readonly BaseParagraphProjection[],
    binding: ProjectionProfileBinding,
  ) {
    super(CONSTRUCTION_TOKEN, schema, snapshot, paragraphs, binding);
  }
}

/**
 * Validates a base-text projection against one exact compiled profile.
 *
 * The generation and descriptor are retained only in process-local sidecars;
 * neither identity becomes part of a durable document representation.
 * @internal
 */
export function createProfiledDocumentProjection(
  input: unknown,
  generation: WasmProfileGenerationView,
  descriptor: BrowserCompiledProfileDescriptor,
): BrowserProjectionResult<BaseDocumentProjection> {
  try {
    if (
      !browserCompiledProfileDescriptorMatchesGeneration(descriptor, generation)
    ) {
      return projectionFailure("projection.invalid_shape");
    }
    const validation = validateProfiledProjection(input, descriptor);
    if (!validation.ok) return projectionFailure(validation.code);
    const binding = Object.freeze({ generation, descriptor });
    return projectionSuccess(
      new OwnedProfiledDocumentProjection(
        validation.value.schema,
        validation.value.snapshot,
        validation.value.paragraphs,
        binding,
      ),
    );
  } catch {
    return projectionFailure("projection.invalid_shape");
  }
}

/** @internal */
export function isOwnedProjection(value: unknown): value is BaseDocumentProjection {
  return typeof value === "object" && value !== null && OWNED_PROJECTIONS.has(value as BaseDocumentProjection);
}

/** Returns the exact compiled-profile descriptor bound to a projection. @internal */
export function projectionProfileDescriptor(
  projection: BaseDocumentProjection,
): BrowserCompiledProfileDescriptor | undefined {
  return isOwnedProjection(projection)
    ? PROFILE_BINDINGS.get(projection)?.descriptor
    : undefined;
}

/** Checks one projection against its exact process-local profile generation. @internal */
export function projectionMatchesProfileGeneration(
  projection: BaseDocumentProjection,
  generation: WasmProfileGenerationView,
): boolean {
  return isOwnedProjection(projection) &&
    PROFILE_BINDINGS.get(projection)?.generation === generation;
}

/** Whether two owned projections were minted for the same exact profile. @internal */
export function projectionsShareProfileBinding(
  left: BaseDocumentProjection,
  right: BaseDocumentProjection,
): boolean {
  if (!isOwnedProjection(left) || !isOwnedProjection(right)) return false;
  const leftBinding = PROFILE_BINDINGS.get(left);
  const rightBinding = PROFILE_BINDINGS.get(right);
  if (leftBinding === undefined || rightBinding === undefined) {
    return leftBinding === rightBinding;
  }
  return leftBinding.generation === rightBinding.generation &&
    leftBinding.descriptor === rightBinding.descriptor;
}

/** Binds a profiled projection to one checked browser presentation exactly once. @internal */
export function bindProjectionPresentation(
  projection: BaseDocumentProjection,
  presentation: BrowserCompiledPresentation,
): boolean {
  if (!isOwnedProjection(projection) || !isOwnedBrowserCompiledPresentation(presentation)) {
    return false;
  }
  const binding = PROFILE_BINDINGS.get(projection);
  if (
    binding === undefined ||
    !browserPresentationMatchesProfile(
      presentation,
      binding.generation,
      binding.descriptor,
    )
  ) {
    return false;
  }
  const existing = PROJECTION_PRESENTATIONS.get(projection);
  if (existing !== undefined) return existing === presentation;
  PROJECTION_PRESENTATIONS.set(projection, presentation);
  return true;
}

/** Returns the exact process-local presentation bound by its renderer. @internal */
export function projectionPresentation(
  projection: BaseDocumentProjection,
): BrowserCompiledPresentation | undefined {
  return isOwnedProjection(projection)
    ? PROJECTION_PRESENTATIONS.get(projection)
    : undefined;
}

/** Checks an owned projection's exact process-local presentation identity. @internal */
export function projectionMatchesBrowserPresentation(
  projection: BaseDocumentProjection,
  presentation: BrowserCompiledPresentation,
): boolean {
  return isOwnedProjection(projection) &&
    isOwnedBrowserCompiledPresentation(presentation) &&
    PROJECTION_PRESENTATIONS.get(projection) === presentation;
}

/** @internal */
export function snapshotsEqual(left: ProjectionSnapshot, right: ProjectionSnapshot): boolean {
  return left.lineage === right.lineage && left.revision === right.revision;
}

/** @internal */
export function paragraphsEqual(
  left: BaseParagraphProjection,
  right: BaseParagraphProjection,
): boolean {
  if (left === right) {
    return true;
  }
  if (left.runs.length !== right.runs.length) {
    return false;
  }
  for (let index = 0; index < left.runs.length; index += 1) {
    const leftRun = left.runs[index];
    const rightRun = right.runs[index];
    if (
      leftRun === undefined ||
      rightRun === undefined ||
      leftRun.text !== rightRun.text ||
      leftRun.strong !== rightRun.strong ||
      !formatDetailsEqual(leftRun.formatDetails, rightRun.formatDetails)
    ) {
      return false;
    }
  }
  return true;
}

function validateProjection(input: unknown): ValidationResult {
  const projection = exactDataRecord(input, ["schema", "snapshot", "paragraphs"]);
  if (projection === null) {
    return validationFailure("projection.invalid_shape");
  }

  const schema = exactDataRecord(projection["schema"], ["name", "version"]);
  if (
    schema === null ||
    schema["name"] !== BASE_SCHEMA.name ||
    schema["version"] !== BASE_SCHEMA.version
  ) {
    return validationFailure("projection.invalid_shape");
  }

  const snapshot = validateSnapshot(projection["snapshot"]);
  if (snapshot === null) {
    return validationFailure("projection.invalid_snapshot");
  }

  const paragraphArray = readExactBoundedArray(
    projection["paragraphs"],
    MAX_PARAGRAPHS,
  );
  if (!paragraphArray.ok) {
    return validationFailure(
      paragraphArray.resourceLimit
        ? "projection.resource_limit"
        : "projection.invalid_shape",
    );
  }
  const paragraphInputs = paragraphArray.values;
  if (paragraphInputs.length === 0) {
    return validationFailure("projection.invalid_shape");
  }

  let nodeCount = 1 + paragraphInputs.length;
  let totalTextBytes = 0;
  const paragraphs: BaseParagraphProjection[] = [];
  for (let paragraphIndex = 0; paragraphIndex < paragraphInputs.length; paragraphIndex += 1) {
    const paragraphInput = paragraphInputs[paragraphIndex];
    const paragraph = exactDataRecord(paragraphInput, ["runs"]);
    if (paragraph === null) {
      return validationFailure("projection.invalid_shape");
    }
    const runArray = readExactBoundedArray(
      paragraph["runs"],
      MAX_RUNS_PER_PARAGRAPH,
    );
    if (!runArray.ok) {
      return validationFailure(
        runArray.resourceLimit
          ? "projection.resource_limit"
          : "projection.invalid_shape",
      );
    }
    const runInputs = runArray.values;
    nodeCount += runInputs.length;
    if (nodeCount > MAX_NODES) {
      return validationFailure("projection.resource_limit");
    }

    const runs: BaseTextRunProjection[] = [];
    let previousStrong: boolean | undefined;
    for (let runIndex = 0; runIndex < runInputs.length; runIndex += 1) {
      const runInput = runInputs[runIndex];
      const run = exactDataRecord(runInput, ["text", "strong"]);
      if (run === null || typeof run["text"] !== "string" || typeof run["strong"] !== "boolean") {
        return validationFailure("projection.invalid_shape");
      }
      const text = run["text"];
      const strong = run["strong"];
      if (text.length === 0) {
        return validationFailure("projection.invalid_shape");
      }
      if (text.length > MAX_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      if (previousStrong === strong) {
        return validationFailure("projection.noncanonical_runs");
      }
      previousStrong = strong;

      const byteLength = unicodeScalarUtf8Length(text);
      if (byteLength === null) {
        return validationFailure("projection.invalid_shape");
      }
      if (byteLength > MAX_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      totalTextBytes += byteLength;
      if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      runs.push(freezeRun(text, strong ? ["breditor/strong"] : []));
    }
    paragraphs.push(Object.freeze({ runs: Object.freeze(runs) }));
  }

  return {
    ok: true,
    value: {
      schema: BASE_SCHEMA,
      snapshot,
      paragraphs: Object.freeze(paragraphs),
    },
  };
}

function validateProfiledProjection(
  input: unknown,
  descriptor: BrowserCompiledProfileDescriptor,
): ValidationResult {
  const projection = exactDataRecord(input, ["schema", "snapshot", "paragraphs"]);
  if (projection === null) return validationFailure("projection.invalid_shape");
  const schema = exactDataRecord(projection["schema"], ["name", "version", "fingerprint"]);
  if (
    schema === null ||
    schema["name"] !== descriptor.schema.name ||
    schema["version"] !== descriptor.schema.version ||
    schema["fingerprint"] !== descriptor.schema.fingerprint
  ) {
    return validationFailure("projection.invalid_shape");
  }
  const snapshot = validateSnapshot(projection["snapshot"]);
  if (snapshot === null) return validationFailure("projection.invalid_snapshot");
  const paragraphArray = readExactBoundedArray(
    projection["paragraphs"],
    MAX_PARAGRAPHS,
  );
  if (!paragraphArray.ok) {
    return validationFailure(
      paragraphArray.resourceLimit
        ? "projection.resource_limit"
        : "projection.invalid_shape",
    );
  }
  const paragraphInputs = paragraphArray.values;
  if (paragraphInputs.length === 0) {
    return validationFailure("projection.invalid_shape");
  }

  const admittedFormats = new Map(
    descriptor.formats.map((format) => [format.kind, format] as const),
  );
  let nodeCount = 1 + paragraphInputs.length;
  let totalTextBytes = 0;
  let totalPropertyValues = 0;
  let totalPropertyStringBytes = 0;
  const paragraphs: BaseParagraphProjection[] = [];
  for (let paragraphIndex = 0; paragraphIndex < paragraphInputs.length; paragraphIndex += 1) {
    const paragraphInput = paragraphInputs[paragraphIndex];
    const paragraph = exactDataRecord(paragraphInput, ["runs"]);
    if (paragraph === null) {
      return validationFailure("projection.invalid_shape");
    }
    const runArray = readExactBoundedArray(
      paragraph["runs"],
      MAX_RUNS_PER_PARAGRAPH,
    );
    if (!runArray.ok) {
      return validationFailure(
        runArray.resourceLimit
          ? "projection.resource_limit"
          : "projection.invalid_shape",
      );
    }
    const runInputs = runArray.values;
    nodeCount += runInputs.length;
    if (nodeCount > MAX_NODES) return validationFailure("projection.resource_limit");

    const runs: BaseTextRunProjection[] = [];
    let previousFormats: readonly InlineFormatProjection[] | undefined;
    for (let runIndex = 0; runIndex < runInputs.length; runIndex += 1) {
      const runInput = runInputs[runIndex];
      const run = exactDataRecord(runInput, ["text", "formatDetails"]);
      if (run === null || typeof run["text"] !== "string") {
        return validationFailure("projection.invalid_shape");
      }
      const text = run["text"];
      const validatedFormats = validateFormatDetails(
        run["formatDetails"],
        admittedFormats,
      );
      if (validatedFormats === null || text.length === 0) {
        return validationFailure("projection.invalid_shape");
      }
      const { formatDetails, formats, propertyValues, propertyStringBytes } =
        validatedFormats;
      if (
        previousFormats !== undefined &&
        formatDetailsEqual(previousFormats, formatDetails)
      ) {
        return validationFailure("projection.noncanonical_runs");
      }
      previousFormats = formatDetails;
      totalPropertyValues += propertyValues;
      totalPropertyStringBytes += propertyStringBytes;
      if (
        totalPropertyValues > MAX_TOTAL_PROPERTY_VALUES ||
        totalPropertyStringBytes > MAX_TOTAL_PROPERTY_STRING_BYTES
      ) {
        return validationFailure("projection.resource_limit");
      }
      const byteLength = unicodeScalarUtf8Length(text);
      if (byteLength === null) return validationFailure("projection.invalid_shape");
      if (text.length > MAX_TEXT_BYTES || byteLength > MAX_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      totalTextBytes += byteLength;
      if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      runs.push(freezeRun(text, formats, formatDetails));
    }
    paragraphs.push(Object.freeze({ runs: Object.freeze(runs) }));
  }

  const ownedSchema: CompiledProjectionSchema = Object.freeze({
    name: descriptor.schema.name,
    version: descriptor.schema.version,
    fingerprint: descriptor.schema.fingerprint,
  });
  return {
    ok: true,
    value: {
      schema: ownedSchema,
      snapshot,
      paragraphs: Object.freeze(paragraphs),
    },
  };
}

interface ValidatedFormatDetails {
  readonly formats: readonly string[];
  readonly formatDetails: readonly InlineFormatProjection[];
  readonly propertyValues: number;
  readonly propertyStringBytes: number;
}

function validateFormatDetails(
  input: unknown,
  admitted: ReadonlyMap<string, BrowserProfileFormatDescriptor>,
): ValidatedFormatDetails | null {
  const array = readExactBoundedArray(input, MAX_FORMATS_PER_RUN);
  if (!array.ok) return null;
  const formats: string[] = [];
  const formatDetails: InlineFormatProjection[] = [];
  let previous: string | undefined;
  let propertyValues = 0;
  let propertyStringBytes = 0;
  for (let index = 0; index < array.values.length; index += 1) {
    const record = exactDataRecord(array.values[index], ["kind", "properties"]);
    if (record === null) return null;
    const format = record["kind"];
    const formatContract = typeof format === "string"
      ? admitted.get(format)
      : undefined;
    if (
      typeof format !== "string" ||
      formatContract === undefined ||
      (previous !== undefined && previous >= format)
    ) {
      return null;
    }
    const propertyArray = readExactBoundedArray(
      record["properties"],
      MAX_PROPERTIES_PER_FORMAT,
    );
    if (!propertyArray.ok) return null;
    const properties: InlineFormatPropertyProjection[] = [];
    let previousProperty: string | undefined;
    let contractIndex = 0;
    for (let propertyIndex = 0; propertyIndex < propertyArray.values.length; propertyIndex += 1) {
      const property = exactDataRecord(
        propertyArray.values[propertyIndex],
        ["name", "value"],
      );
      if (property === null) return null;
      const name = property["name"];
      const value = property["value"];
      if (
        !isQualifiedName(name) ||
        (previousProperty !== undefined && previousProperty >= name) ||
        !isCanonicalPropertyScalar(value)
      ) {
        return null;
      }
      while (
        contractIndex < formatContract.properties.length &&
        formatContract.properties[contractIndex]?.name !== undefined &&
        (formatContract.properties[contractIndex]?.name ?? "") < name
      ) {
        if (formatContract.properties[contractIndex]?.presence === "required") return null;
        contractIndex += 1;
      }
      const propertyContract = formatContract.properties[contractIndex];
      if (propertyContract?.name !== name) return null;
      let stringBytes = 0;
      if (typeof value === "string") {
        if (value.length > MAX_PROPERTY_STRING_BYTES) return null;
        const byteLength = unicodeScalarUtf8Length(value);
        if (byteLength === null || byteLength > MAX_PROPERTY_STRING_BYTES) return null;
        stringBytes = byteLength;
      }
      if (!propertyValueMatchesContract(value, stringBytes, propertyContract)) return null;
      propertyStringBytes += stringBytes;
      propertyValues += 1;
      previousProperty = name;
      properties.push(Object.freeze({ name, value }));
      contractIndex += 1;
    }
    while (contractIndex < formatContract.properties.length) {
      if (formatContract.properties[contractIndex]?.presence === "required") return null;
      contractIndex += 1;
    }
    formats.push(format);
    formatDetails.push(Object.freeze({
      kind: format,
      properties: Object.freeze(properties),
    }));
    previous = format;
  }
  return Object.freeze({
    formats: Object.freeze(formats),
    formatDetails: Object.freeze(formatDetails),
    propertyValues,
    propertyStringBytes,
  });
}

function freezeRun(
  text: string,
  formats: readonly string[],
  formatDetails?: readonly InlineFormatProjection[],
): BaseTextRunProjection {
  const ownedFormats = Object.isFrozen(formats)
    ? formats
    : Object.freeze([...formats]);
  const ownedFormatDetails = formatDetails ?? Object.freeze(
    ownedFormats.map((kind) => Object.freeze({
      kind,
      properties: Object.freeze([]),
    })),
  );
  const run = {
    text,
    strong: ownedFormats.includes("breditor/strong"),
    formatDetails: ownedFormatDetails,
  } as BaseTextRunProjection;
  Object.defineProperty(run, "formats", {
    value: ownedFormats,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(run);
}

function formatDetailsEqual(
  left: readonly InlineFormatProjection[],
  right: readonly InlineFormatProjection[],
): boolean {
  if (left.length !== right.length) return false;
  for (let formatIndex = 0; formatIndex < left.length; formatIndex += 1) {
    const leftFormat = left[formatIndex];
    const rightFormat = right[formatIndex];
    if (
      leftFormat === undefined ||
      rightFormat === undefined ||
      leftFormat.kind !== rightFormat.kind ||
      leftFormat.properties.length !== rightFormat.properties.length
    ) {
      return false;
    }
    for (
      let propertyIndex = 0;
      propertyIndex < leftFormat.properties.length;
      propertyIndex += 1
    ) {
      const leftProperty = leftFormat.properties[propertyIndex];
      const rightProperty = rightFormat.properties[propertyIndex];
      if (
        leftProperty === undefined ||
        rightProperty === undefined ||
        leftProperty.name !== rightProperty.name ||
        leftProperty.value !== rightProperty.value
      ) {
        return false;
      }
    }
  }
  return true;
}

function isQualifiedName(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 128 &&
    /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u.test(value);
}

function isCanonicalPropertyScalar(
  value: unknown,
): value is InlineFormatPropertyProjectionValue {
  return typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      !Object.is(value, -0));
}

function propertyValueMatchesContract(
  value: InlineFormatPropertyProjectionValue,
  stringBytes: number,
  contract: BrowserProfileFormatPropertyDescriptor,
): boolean {
  switch (contract.valueType.kind) {
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" &&
        (contract.valueType.minimum === null || value >= contract.valueType.minimum) &&
        (contract.valueType.maximum === null || value <= contract.valueType.maximum);
    case "string":
      return typeof value === "string" &&
        stringBytes >= contract.valueType.minimumUtf8Bytes &&
        stringBytes <= contract.valueType.maximumUtf8Bytes;
  }
}

function validateSnapshot(input: unknown): ProjectionSnapshot | null {
  const snapshot = exactDataRecord(input, ["lineage", "revision"]);
  if (
    snapshot === null ||
    typeof snapshot["lineage"] !== "string" ||
    typeof snapshot["revision"] !== "string"
  ) {
    return null;
  }
  const lineage = snapshot["lineage"];
  const revision = snapshot["revision"];
  if (
    lineage.length === 0 ||
    lineage.length > MAX_LINEAGE_BYTES ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(lineage) ||
    revision.length > 20 ||
    !/^(?:0|[1-9][0-9]*)$/u.test(revision)
  ) {
    return null;
  }
  let parsedRevision: bigint;
  try {
    parsedRevision = BigInt(revision);
  } catch {
    return null;
  }
  if (parsedRevision > MAX_REVISION) {
    return null;
  }
  return Object.freeze({ lineage, revision });
}

function validationFailure(code: BrowserProjectionErrorCode): ValidationResult {
  return { ok: false, code };
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | null {
  if (typeof input !== "object" || input === null || ARRAY_IS_ARRAY(input)) {
    return null;
  }
  const keys = OWN_KEYS(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string")) {
    return null;
  }
  const record = input as object;
  const owned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const expectedKey of expectedKeys) {
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(record, expectedKey);
    if (descriptor === undefined || !("value" in descriptor)) {
      return null;
    }
    owned[expectedKey] = descriptor.value as unknown;
  }
  if (keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    return null;
  }
  return owned;
}

function readExactBoundedArray(
  input: unknown,
  maximum: number,
): ExactArrayResult {
  if (!ARRAY_IS_ARRAY(input)) {
    return { ok: false, resourceLimit: false };
  }
  const lengthDescriptor = GET_OWN_PROPERTY_DESCRIPTOR(input, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return { ok: false, resourceLimit: false };
  }
  const length = lengthDescriptor.value;
  if (length > maximum) {
    return { ok: false, resourceLimit: true };
  }
  const keys = OWN_KEYS(input);
  if (keys.length !== length + 1 || !keys.includes("length")) {
    return { ok: false, resourceLimit: false };
  }
  const keySet = new Set(keys);
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    if (!keySet.has(key)) {
      return { ok: false, resourceLimit: false };
    }
    const descriptor = GET_OWN_PROPERTY_DESCRIPTOR(input, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return { ok: false, resourceLimit: false };
    }
    values.push(descriptor.value as unknown);
  }
  return { ok: true, values };
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
      if (!(low >= 0xdc00 && low <= 0xdfff)) {
        return null;
      }
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
