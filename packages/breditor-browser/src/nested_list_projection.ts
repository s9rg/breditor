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

/** Root text block or nested list; list items contain exactly one text block. */
export type NestedListRootProjection =
  | Readonly<{ kind: "textBlock"; block: BaseParagraphProjection }>
  | Readonly<{ kind: "bulletList"; items: readonly NestedListItemProjection[] }>
  | Readonly<{ kind: "orderedList"; start: number; items: readonly NestedListItemProjection[] }>;

/** One leading block followed by zero or more nested list sections. */
export interface NestedListItemProjection {
  readonly block: BaseParagraphProjection;
  readonly lists: readonly NestedListContainerProjection[];
}
export type NestedListContainerProjection = Exclude<NestedListRootProjection, Readonly<{kind: "textBlock"; block: BaseParagraphProjection}>>;

/** Actual AST text-block path and its immutable content, in document order. */
export interface NestedListTextBlockProjection {
  readonly path: readonly number[];
  readonly block: BaseParagraphProjection;
}

export type NestedListRootShape =
  | Readonly<{ kind: "textBlock" }>
  | Readonly<{ kind: "bulletList"; items: readonly NestedListItemShape[] }>
  | Readonly<{ kind: "orderedList"; start: number; items: readonly NestedListItemShape[] }>;
interface NestedListItemShape { readonly lists: readonly NestedListContainerShape[]; }
type NestedListContainerShape = Exclude<NestedListRootShape, Readonly<{kind: "textBlock"}>>;
const OWNED = new WeakSet<NestedListDocumentProjection>();
const TEXT_PROOFS = new WeakMap<NestedListDocumentProjection, BaseDocumentProjection>();
const CONSTRUCTION_TOKEN = Symbol("NestedListDocumentProjection construction");
const VALIDATED = new WeakMap<BaseDocumentProjection, Readonly<{
  shapes: readonly NestedListRootShape[];
  generation: WasmProfileGenerationView;
  descriptor: BrowserCompiledProfileDescriptor;
}>>();

/**
 * Explicit hierarchical list projection, deliberately not a BaseDocumentProjection.
 * Legacy paragraph renderers cannot accept it and silently erase list structure.
 * Only canonical schema-bound data can create an owned instance.
 */
export class NestedListDocumentProjection {
  readonly schema: ProjectionSchema;
  readonly snapshot: ProjectionSnapshot;
  readonly blocks: readonly NestedListRootProjection[];
  readonly textBlocks: readonly NestedListTextBlockProjection[];
  readonly #generation: WasmProfileGenerationView;
  readonly #descriptor: BrowserCompiledProfileDescriptor;

  private constructor(token: symbol, text: BaseDocumentProjection, proof: NonNullable<ReturnType<typeof VALIDATED.get>>) {
    if (token !== CONSTRUCTION_TOKEN) throw new TypeError("Use NestedListDocumentProjection.create().");
    this.schema = text.schema;
    this.snapshot = text.snapshot;
    this.#generation = proof.generation;
    this.#descriptor = proof.descriptor;
    const blocks: NestedListRootProjection[] = [];
    const directory: NestedListTextBlockProjection[] = [];
    let offset = 0;
    const buildList = (shape: NestedListContainerShape, path: readonly number[]): NestedListContainerProjection => {
      const items = shape.items.map((item, index) => {
        const block = text.paragraphs[offset++]!;
        const itemPath = [...path, index];
        directory.push(Object.freeze({path: Object.freeze([...itemPath, 0]), block}));
        const lists = Object.freeze(item.lists.map((list, section) => buildList(list, [...itemPath, section + 1])));
        return Object.freeze({block, lists});
      });
      return Object.freeze(shape.kind === "bulletList"
        ? {kind: "bulletList", items: Object.freeze(items)}
        : {kind: "orderedList", start: shape.start, items: Object.freeze(items)});
    };
    for (const [root, shape] of proof.shapes.entries()) {
      if (shape.kind === "textBlock") {
        const block = text.paragraphs[offset++]!;
        blocks.push(Object.freeze({kind: "textBlock", block}));
        directory.push(Object.freeze({path: Object.freeze([root]), block}));
      } else blocks.push(buildList(shape, [root]));
    }
    this.blocks = Object.freeze(blocks);
    this.textBlocks = Object.freeze(directory);
    OWNED.add(this);
    TEXT_PROOFS.set(this, text);
    Object.freeze(this);
  }

  /** Validates closed root/item records, exact binding and whole-document budgets. */
  static create(input: unknown, generation: WasmProfileGenerationView,
    descriptor: BrowserCompiledProfileDescriptor): BrowserProjectionResult<NestedListDocumentProjection> {
    const text = createNestedListTextProjection(input, generation, descriptor);
    return text.ok ? NestedListDocumentProjection.fromValidatedText(text.value) : text;
  }

  /** Converts an internal proof only; arbitrary paragraph projections reject. @internal */
  static fromValidatedText(text: BaseDocumentProjection): BrowserProjectionResult<NestedListDocumentProjection> {
    const proof = VALIDATED.get(text);
    if (proof === undefined || !wasmProfileGenerationIsLive(proof.generation)) return projectionFailure("projection.invalid_shape");
    return projectionSuccess(new NestedListDocumentProjection(CONSTRUCTION_TOKEN, text, proof));
  }

  /** Exact process-local owner binding, never inferred from matching JSON fields. */
  matchesProfile(generation: WasmProfileGenerationView, descriptor: BrowserCompiledProfileDescriptor): boolean {
    return this.#generation === generation && this.#descriptor === descriptor &&
      browserCompiledProfileDescriptorMatchesGeneration(descriptor, generation) && wasmProfileGenerationIsLive(generation);
  }
}

/** @internal */
export function isOwnedNestedListProjection(value: unknown): value is NestedListDocumentProjection {
  return typeof value === "object" && value !== null && OWNED.has(value as NestedListDocumentProjection);
}

/** Shares exact-owner presentation admission without exposing the internal proof. @internal */
export function bindNestedListProjectionPresentation(projection: NestedListDocumentProjection, presentation: BrowserCompiledPresentation): boolean {
  const text = TEXT_PROOFS.get(projection);
  return text !== undefined && bindProjectionPresentation(text, presentation);
}

/** Exact bound presentation for strict DOM reconciliation; no text proof escapes. @internal */
export function nestedListProjectionPresentation(projection: NestedListDocumentProjection): BrowserCompiledPresentation | undefined {
  const text = TEXT_PROOFS.get(projection);
  return text === undefined ? undefined : projectionPresentation(text);
}

/** Exact owner correlation for consuming generated selection/update handles. @internal */
export function nestedListProjectionMatchesProfileGeneration(projection: NestedListDocumentProjection, generation: WasmProfileGenerationView): boolean {
  const text = TEXT_PROOFS.get(projection);
  return text !== undefined && projectionMatchesProfileGeneration(text, generation);
}

/** @internal */
export function nestedListProjectionsShareProfile(left: NestedListDocumentProjection, right: NestedListDocumentProjection): boolean {
  const a = TEXT_PROOFS.get(left), b = TEXT_PROOFS.get(right);
  return a !== undefined && b !== undefined && projectionsShareProfileBinding(a, b);
}

/** @internal */
export function nestedListProjectionDescriptor(projection: NestedListDocumentProjection): BrowserCompiledProfileDescriptor | undefined {
  const text = TEXT_PROOFS.get(projection);
  return text === undefined ? undefined : projectionProfileDescriptor(text);
}

/** Internal adapter bridge; the temporary flat text proof is never a renderer result. @internal */
export function createNestedListTextProjection(input: unknown, generation: WasmProfileGenerationView,
  descriptor: BrowserCompiledProfileDescriptor): BrowserProjectionResult<BaseDocumentProjection> {
  const LIMIT = Symbol("projection budget");
  try {
    const record = exactDataRecord(input, ["schema", "snapshot", "blocks"]);
    if (record === null || !browserCompiledProfileDescriptorMatchesGeneration(descriptor, generation)) return projectionFailure("projection.invalid_shape");
    const paragraphs: unknown[] = [];
    let nodes = 0, properties = 0;
    const array = (value: unknown): readonly unknown[] => {
      const result = readExactBoundedArray(value, 10_000);
      if (!result.ok) { if (result.resourceLimit) throw LIMIT; throw new TypeError("array"); }
      return result.values;
    };
    const parseList = (value: unknown, depth: number): NestedListContainerShape => {
      if (depth + 3 > 64) throw LIMIT;
      const record = exactDataRecord(value, ["kind", "items"]) ?? exactDataRecord(value, ["kind", "start", "items"]);
      if (record === null || (record["kind"] !== "bulletList" && record["kind"] !== "orderedList")) throw new TypeError("list");
      if (record["kind"] === "bulletList" && "start" in record) throw new TypeError("start");
      const values = array(record["items"]);
      if (values.length === 0) throw new TypeError("empty list");
      const start = record["start"];
      if (record["kind"] === "orderedList" && (typeof start !== "number" || !Number.isSafeInteger(start) || start < 1 || start + values.length - 1 > 2_147_483_647)) throw new TypeError("ordinal");
      nodes += 1 + values.length;
      properties += record["kind"] === "orderedList" ? 1 : 0;
      if (1 + nodes + paragraphs.length > 100_000 || properties > 10_000) throw LIMIT;
      const items = values.map(value => {
        const item = exactDataRecord(value, ["block", "lists"]);
        if (item === null) throw new TypeError("item");
        paragraphs.push(item["block"]);
        if (1 + nodes + paragraphs.length > 100_000) throw LIMIT;
        const lists = array(item["lists"]).map(child => parseList(child, depth + 2));
        return Object.freeze({lists: Object.freeze(lists)});
      });
      return Object.freeze(record["kind"] === "bulletList"
        ? {kind: "bulletList", items: Object.freeze(items)}
        : {kind: "orderedList", start: start as number, items: Object.freeze(items)});
    };
    const roots = array(record["blocks"]);
    if (roots.length === 0) return projectionFailure("projection.invalid_shape");
    const shapes: NestedListRootShape[] = roots.map(value => {
      const bare = exactDataRecord(value, ["kind", "block"]);
      if (bare?.["kind"] === "textBlock") {
        paragraphs.push(bare["block"]);
        if (1 + nodes + paragraphs.length > 100_000) throw LIMIT;
        return Object.freeze({kind: "textBlock"});
      }
      return parseList(value, 1);
    });
    const text = createStructuralTextProjection({schema: record["schema"], snapshot: record["snapshot"], paragraphs}, generation, descriptor, {nodes, properties});
    if (text.ok) VALIDATED.set(text.value, Object.freeze({shapes: Object.freeze(shapes), generation, descriptor}));
    return text;
  } catch (error) { return projectionFailure(error === LIMIT ? "projection.resource_limit" : "projection.invalid_shape"); }
}
