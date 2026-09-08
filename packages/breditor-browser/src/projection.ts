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

/** One base-schema text leaf projected without persistence-record details. */
export interface BaseTextRunProjection {
  /** Non-empty Unicode scalar text. */
  readonly text: string;
  /** Whether the property-free `breditor/strong` format is present. */
  readonly strong: boolean;
  /** Canonical qualified identities of all property-free inline formats. */
  readonly formats: readonly string[];
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
    runs: readonly Readonly<{ text: string; formats: readonly string[] }>[];
  }>[];
}

const MAX_LINEAGE_BYTES = 128;
const MAX_PARAGRAPHS = 10_000;
const MAX_RUNS_PER_PARAGRAPH = 10_000;
const MAX_NODES = 100_000;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_TOTAL_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_FORMATS_PER_RUN = 32;
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
      !formatKindsEqual(leftRun.formats, rightRun.formats)
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

  const admittedFormats = new Set(descriptor.formats.map((format) => format.kind));
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
    if (nodeCount > MAX_NODES) return validationFailure("projection.resource_limit");

    const runs: BaseTextRunProjection[] = [];
    let previousFormats: readonly string[] | undefined;
    for (let runIndex = 0; runIndex < runInputs.length; runIndex += 1) {
      const runInput = runInputs[runIndex];
      const run = exactDataRecord(runInput, ["text", "formats"]);
      if (run === null || typeof run["text"] !== "string") {
        return validationFailure("projection.invalid_shape");
      }
      const text = run["text"];
      const formats = validateFormatKinds(run["formats"], admittedFormats);
      if (formats === null || text.length === 0) {
        return validationFailure("projection.invalid_shape");
      }
      if (previousFormats !== undefined && formatKindsEqual(previousFormats, formats)) {
        return validationFailure("projection.noncanonical_runs");
      }
      previousFormats = formats;
      const byteLength = unicodeScalarUtf8Length(text);
      if (byteLength === null) return validationFailure("projection.invalid_shape");
      if (text.length > MAX_TEXT_BYTES || byteLength > MAX_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      totalTextBytes += byteLength;
      if (totalTextBytes > MAX_TOTAL_TEXT_BYTES) {
        return validationFailure("projection.resource_limit");
      }
      runs.push(freezeRun(text, formats));
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

function validateFormatKinds(
  input: unknown,
  admitted: ReadonlySet<string>,
): readonly string[] | null {
  const array = readExactBoundedArray(input, MAX_FORMATS_PER_RUN);
  if (!array.ok) return null;
  const formats: string[] = [];
  let previous: string | undefined;
  for (let index = 0; index < array.values.length; index += 1) {
    const format = array.values[index];
    if (
      typeof format !== "string" ||
      !admitted.has(format) ||
      (previous !== undefined && previous >= format)
    ) {
      return null;
    }
    formats.push(format);
    previous = format;
  }
  return Object.freeze(formats);
}

function freezeRun(text: string, formats: readonly string[]): BaseTextRunProjection {
  const ownedFormats = Object.isFrozen(formats)
    ? formats
    : Object.freeze([...formats]);
  const run = {
    text,
    strong: ownedFormats.includes("breditor/strong"),
  } as BaseTextRunProjection;
  Object.defineProperty(run, "formats", {
    value: ownedFormats,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return Object.freeze(run);
}

function formatKindsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
