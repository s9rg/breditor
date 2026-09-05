import type { BrowserProjectionErrorCode, BrowserProjectionResult } from "./result.js";
import { projectionFailure, projectionSuccess } from "./result.js";

/** Base-schema identity required by the first browser renderer. */
export interface BaseProjectionSchema {
  /** Exact qualified schema name. */
  readonly name: "breditor/base";
  /** Exact base-schema version. */
  readonly version: 1;
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

const MAX_LINEAGE_BYTES = 128;
const MAX_PARAGRAPHS = 10_000;
const MAX_RUNS_PER_PARAGRAPH = 10_000;
const MAX_NODES = 100_000;
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_TOTAL_TEXT_BYTES = 8 * 1024 * 1024;
const MAX_REVISION = 18_446_744_073_709_551_615n;
const CONSTRUCTION_TOKEN = Symbol("BaseDocumentProjection construction");
const OWNED_PROJECTIONS = new WeakSet<BaseDocumentProjection>();
const BASE_SCHEMA: BaseProjectionSchema = Object.freeze({
  name: "breditor/base",
  version: 1,
});

interface ValidatedProjection {
  readonly snapshot: ProjectionSnapshot;
  readonly paragraphs: readonly BaseParagraphProjection[];
}

type ValidationResult =
  | { readonly ok: true; readonly value: ValidatedProjection }
  | { readonly ok: false; readonly code: BrowserProjectionErrorCode };

/**
 * A validated, deeply immutable base-schema view intended for DOM projection.
 *
 * This is not the persisted document record. Adapters construct it from an
 * already validated semantic view, so the browser renderer never parses
 * editor-state or commit JSON.
 */
export class BaseDocumentProjection {
  /** Exact schema identity. */
  readonly schema: BaseProjectionSchema;
  /** Snapshot whose AST is represented. */
  readonly snapshot: ProjectionSnapshot;
  /** Direct-root paragraphs in document order. */
  readonly paragraphs: readonly BaseParagraphProjection[];

  private constructor(
    token: symbol,
    snapshot: ProjectionSnapshot,
    paragraphs: readonly BaseParagraphProjection[],
  ) {
    if (token !== CONSTRUCTION_TOKEN) {
      throw new TypeError("Use BaseDocumentProjection.create().");
    }
    this.schema = BASE_SCHEMA;
    this.snapshot = snapshot;
    this.paragraphs = paragraphs;
    OWNED_PROJECTIONS.add(this);
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
        validation.value.snapshot,
        validation.value.paragraphs,
      ),
    );
  }
}

/** @internal */
export function isOwnedProjection(value: unknown): value is BaseDocumentProjection {
  return typeof value === "object" && value !== null && OWNED_PROJECTIONS.has(value as BaseDocumentProjection);
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
      leftRun.strong !== rightRun.strong
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

  const paragraphInputs = projection["paragraphs"];
  if (
    !Array.isArray(paragraphInputs) ||
    !Number.isSafeInteger(paragraphInputs.length) ||
    paragraphInputs.length === 0
  ) {
    return validationFailure("projection.invalid_shape");
  }
  if (paragraphInputs.length > MAX_PARAGRAPHS) {
    return validationFailure("projection.resource_limit");
  }

  let nodeCount = 1 + paragraphInputs.length;
  let totalTextBytes = 0;
  const paragraphs: BaseParagraphProjection[] = [];
  for (let paragraphIndex = 0; paragraphIndex < paragraphInputs.length; paragraphIndex += 1) {
    const paragraphInput = paragraphInputs[paragraphIndex];
    const paragraph = exactDataRecord(paragraphInput, ["runs"]);
    if (
      paragraph === null ||
      !Array.isArray(paragraph["runs"]) ||
      !Number.isSafeInteger(paragraph["runs"].length)
    ) {
      return validationFailure("projection.invalid_shape");
    }
    const runInputs = paragraph["runs"];
    if (runInputs.length > MAX_RUNS_PER_PARAGRAPH) {
      return validationFailure("projection.resource_limit");
    }
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
      runs.push(Object.freeze({ text, strong }));
    }
    paragraphs.push(Object.freeze({ runs: Object.freeze(runs) }));
  }

  return {
    ok: true,
    value: {
      snapshot,
      paragraphs: Object.freeze(paragraphs),
    },
  };
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
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const keys = Reflect.ownKeys(input);
  if (keys.length !== expectedKeys.length || keys.some((key) => typeof key !== "string")) {
    return null;
  }
  const record = input as Record<string, unknown>;
  for (const expectedKey of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, expectedKey);
    if (descriptor === undefined || !("value" in descriptor)) {
      return null;
    }
  }
  if (keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))) {
    return null;
  }
  return record;
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
