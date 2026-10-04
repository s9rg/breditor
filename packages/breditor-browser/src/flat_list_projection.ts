import {
  createStructuralTextProjection, exactDataRecord, readExactBoundedArray,
  bindProjectionPresentation,
  projectionPresentation,
  projectionMatchesProfileGeneration,
  projectionsShareProfileBinding, projectionProfileDescriptor,
  type BaseDocumentProjection, type BaseParagraphProjection,
  type ProjectionSchema, type ProjectionSnapshot,
} from "./projection.js";
import type { BrowserCompiledPresentation } from "./compiled_browser_presentation.js";
import { projectionFailure, projectionSuccess, type BrowserProjectionResult } from "./result.js";
import { browserCompiledProfileDescriptorMatchesGeneration, wasmProfileGenerationIsLive,
  type BrowserCompiledProfileDescriptor, type WasmProfileGenerationView } from "./wasm_profile_descriptor.js";

/** Root text block or flat list; list items contain exactly one text block. */
export type FlatListRootProjection =
  | Readonly<{ kind: "textBlock"; block: BaseParagraphProjection }>
  | Readonly<{ kind: "bulletList"; items: readonly BaseParagraphProjection[] }>
  | Readonly<{ kind: "orderedList"; start: number; items: readonly BaseParagraphProjection[] }>;

/** Actual AST text-block path and its immutable content, in document order. */
export interface FlatListTextBlockProjection {
  readonly path: readonly number[];
  readonly block: BaseParagraphProjection;
}

export type FlatListRootShape =
  | Readonly<{ kind: "textBlock" }>
  | Readonly<{ kind: "bulletList"; items: number }>
  | Readonly<{ kind: "orderedList"; start: number; items: number }>;
const OWNED = new WeakSet<FlatListDocumentProjection>();
const TEXT_PROOFS = new WeakMap<FlatListDocumentProjection, BaseDocumentProjection>();
const CONSTRUCTION_TOKEN = Symbol("FlatListDocumentProjection construction");
const VALIDATED = new WeakMap<BaseDocumentProjection, Readonly<{
  shapes: readonly FlatListRootShape[];
  generation: WasmProfileGenerationView;
  descriptor: BrowserCompiledProfileDescriptor;
}>>();

/**
 * Explicit hierarchical list projection, deliberately not a BaseDocumentProjection.
 * Legacy paragraph renderers cannot accept it and silently erase list structure.
 * Only canonical schema-bound data can create an owned instance.
 */
export class FlatListDocumentProjection {
  readonly schema: ProjectionSchema;
  readonly snapshot: ProjectionSnapshot;
  readonly blocks: readonly FlatListRootProjection[];
  readonly textBlocks: readonly FlatListTextBlockProjection[];
  readonly #generation: WasmProfileGenerationView;
  readonly #descriptor: BrowserCompiledProfileDescriptor;

  private constructor(token: symbol, text: BaseDocumentProjection, proof: NonNullable<ReturnType<typeof VALIDATED.get>>) {
    if (token !== CONSTRUCTION_TOKEN) throw new TypeError("Use FlatListDocumentProjection.create().");
    this.schema = text.schema;
    this.snapshot = text.snapshot;
    this.#generation = proof.generation;
    this.#descriptor = proof.descriptor;
    const blocks: FlatListRootProjection[] = [];
    const directory: FlatListTextBlockProjection[] = [];
    let offset = 0;
    for (const [root, shape] of proof.shapes.entries()) {
      if (shape.kind === "textBlock") {
        const block = text.paragraphs[offset++]!;
        blocks.push(Object.freeze({kind: "textBlock", block}));
        directory.push(Object.freeze({path: Object.freeze([root]), block}));
      } else {
        const items = Object.freeze(text.paragraphs.slice(offset, offset + shape.items));
        offset += shape.items;
        blocks.push(Object.freeze(shape.kind === "bulletList"
          ? {kind: "bulletList", items} : {kind: "orderedList", start: shape.start, items}));
        items.forEach((block, item) => directory.push(Object.freeze({path: Object.freeze([root, item, 0]), block})));
      }
    }
    this.blocks = Object.freeze(blocks);
    this.textBlocks = Object.freeze(directory);
    OWNED.add(this);
    TEXT_PROOFS.set(this, text);
    Object.freeze(this);
  }

  /** Validates closed root/item records, exact binding and whole-document budgets. */
  static create(input: unknown, generation: WasmProfileGenerationView,
    descriptor: BrowserCompiledProfileDescriptor): BrowserProjectionResult<FlatListDocumentProjection> {
    const text = createFlatListTextProjection(input, generation, descriptor);
    return text.ok ? FlatListDocumentProjection.fromValidatedText(text.value) : text;
  }

  /** Converts an internal proof only; arbitrary paragraph projections reject. @internal */
  static fromValidatedText(text: BaseDocumentProjection): BrowserProjectionResult<FlatListDocumentProjection> {
    const proof = VALIDATED.get(text);
    if (proof === undefined || !wasmProfileGenerationIsLive(proof.generation)) return projectionFailure("projection.invalid_shape");
    return projectionSuccess(new FlatListDocumentProjection(CONSTRUCTION_TOKEN, text, proof));
  }

  /** Exact process-local owner binding, never inferred from matching JSON fields. */
  matchesProfile(generation: WasmProfileGenerationView, descriptor: BrowserCompiledProfileDescriptor): boolean {
    return this.#generation === generation && this.#descriptor === descriptor &&
      browserCompiledProfileDescriptorMatchesGeneration(descriptor, generation) && wasmProfileGenerationIsLive(generation);
  }
}

/** @internal */
export function isOwnedFlatListProjection(value: unknown): value is FlatListDocumentProjection {
  return typeof value === "object" && value !== null && OWNED.has(value as FlatListDocumentProjection);
}

/** Shares exact-owner presentation admission without exposing the internal proof. @internal */
export function bindFlatListProjectionPresentation(projection: FlatListDocumentProjection, presentation: BrowserCompiledPresentation): boolean {
  const text = TEXT_PROOFS.get(projection);
  return text !== undefined && bindProjectionPresentation(text, presentation);
}

/** Exact bound presentation for strict DOM reconciliation; no text proof escapes. @internal */
export function flatListProjectionPresentation(projection: FlatListDocumentProjection): BrowserCompiledPresentation | undefined {
  const text = TEXT_PROOFS.get(projection);
  return text === undefined ? undefined : projectionPresentation(text);
}

/** Exact owner correlation for consuming generated selection/update handles. @internal */
export function flatListProjectionMatchesProfileGeneration(projection: FlatListDocumentProjection, generation: WasmProfileGenerationView): boolean {
  const text = TEXT_PROOFS.get(projection);
  return text !== undefined && projectionMatchesProfileGeneration(text, generation);
}

/** @internal */
export function flatListProjectionsShareProfile(left: FlatListDocumentProjection, right: FlatListDocumentProjection): boolean {
  const a = TEXT_PROOFS.get(left), b = TEXT_PROOFS.get(right);
  return a !== undefined && b !== undefined && projectionsShareProfileBinding(a, b);
}

/** @internal */
export function flatListProjectionDescriptor(projection: FlatListDocumentProjection): BrowserCompiledProfileDescriptor | undefined {
  const text = TEXT_PROOFS.get(projection);
  return text === undefined ? undefined : projectionProfileDescriptor(text);
}

/** Internal adapter bridge; the temporary flat text proof is never a renderer result. @internal */
export function createFlatListTextProjection(input: unknown, generation: WasmProfileGenerationView,
  descriptor: BrowserCompiledProfileDescriptor): BrowserProjectionResult<BaseDocumentProjection> {
  try {
    const record = exactDataRecord(input, ["schema", "snapshot", "blocks"]);
    if (record === null || !browserCompiledProfileDescriptorMatchesGeneration(descriptor, generation)) return projectionFailure("projection.invalid_shape");
    const roots = readExactBoundedArray(record["blocks"], 10_000);
    if (!roots.ok) return projectionFailure(roots.resourceLimit ? "projection.resource_limit" : "projection.invalid_shape");
    if (roots.values.length === 0) return projectionFailure("projection.invalid_shape");
    const paragraphs: unknown[] = [];
    const shapes: FlatListRootShape[] = [];
    let nodes = 0;
    let properties = 0;
    for (const root of roots.values) {
      const bare = exactDataRecord(root, ["kind", "block"]);
      if (bare?.["kind"] === "textBlock") {
        paragraphs.push(bare["block"]);
        shapes.push(Object.freeze({kind: "textBlock"}));
      } else {
        const list = exactDataRecord(root, ["kind", "items"]) ?? exactDataRecord(root, ["kind", "start", "items"]);
        if (list === null || (list["kind"] !== "bulletList" && list["kind"] !== "orderedList")) return projectionFailure("projection.invalid_shape");
        if (list["kind"] === "bulletList" && "start" in list) return projectionFailure("projection.invalid_shape");
        const items = readExactBoundedArray(list["items"], 10_000);
        if (!items.ok) return projectionFailure(items.resourceLimit ? "projection.resource_limit" : "projection.invalid_shape");
        if (items.values.length === 0) return projectionFailure("projection.invalid_shape");
        const start = list["start"];
        if (list["kind"] === "orderedList" && (typeof start !== "number" || !Number.isSafeInteger(start) || start < 1 || start + items.values.length - 1 > 2_147_483_647)) return projectionFailure("projection.invalid_shape");
        nodes += 1 + items.values.length;
        properties += list["kind"] === "orderedList" ? 1 : 0;
        if (1 + nodes + paragraphs.length + items.values.length > 100_000) return projectionFailure("projection.resource_limit");
        paragraphs.push(...items.values);
        shapes.push(Object.freeze(list["kind"] === "bulletList"
          ? {kind: "bulletList", items: items.values.length}
          : {kind: "orderedList", start: start as number, items: items.values.length}));
      }
    }
    const text = createStructuralTextProjection({schema: record["schema"], snapshot: record["snapshot"], paragraphs}, generation, descriptor, {nodes, properties});
    if (text.ok) VALIDATED.set(text.value, Object.freeze({shapes: Object.freeze(shapes), generation, descriptor}));
    return text;
  } catch { return projectionFailure("projection.invalid_shape"); }
}
