import { describe, expect, it, vi } from "vitest";
import { consumeSemanticProjectionUpdateWithCleanup, consumeTextBlockSemanticProjection, consumeFlatListSemanticProjection, consumeFlatListSemanticProjectionUpdate, type FlatListSemanticProjectionView } from "./wasm_projection_adapter.js";
import { FlatListDocumentProjection, isOwnedFlatListProjection } from "./flat_list_projection.js";
import { isOwnedProjection } from "./projection.js";

import {
  type BrowserCompiledProfileDescriptor,
  type BrowserProjectionResult,
  type SemanticProjectionImpact,
  type SemanticProjectionUpdateView,
  type SemanticProjectionView,
  consumeSemanticProjection as consumeSemanticProjectionRaw,
  consumeSemanticProjectionUpdate as consumeSemanticProjectionUpdateRaw,
  consumeWasmCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./advanced.js";

const TEST_SCHEMA_FINGERPRINT =
  "sha256:68aecbceb27b88171cf2f64f4ff6af8f4372fb338467eafd5fbf89ab04401173";
const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other) {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};

describe("flat-list generated updates", () => {
  function fixture(impact: SemanticProjectionImpact = "none") {
    const descriptor = ownedProfileDescriptor([]);
    const base = valueOf(consumeFlatListSemanticProjection(flatListView(), TEST_PROFILE_GENERATION, descriptor));
    const child = flatListView(); Object.defineProperty(child, "snapshotRevision", {value: "8"});
    const update = new FakeUpdateView({baseRevision: "7", resultRevision: "8", impact, projection: child});
    return {base, child, update, descriptor};
  }
  it("consumes exact list transitions and frees the child and parent once", () => {
    const {base, child, update, descriptor} = fixture();
    const result = valueOf(consumeFlatListSemanticProjectionUpdate(base, update, TEST_PROFILE_GENERATION, descriptor));
    expect(result.base).toBe(base); expect(result.result.snapshot.revision).toBe("8");
    expect(result.result.blocks).toEqual(base.blocks); expect(result.impact).toEqual({kind: "none"});
    expect(child.freeCalls).toBe(1); expect(update.freeCalls).toBe(1);
  });
  it("rejects a false unchanged claim but accepts a broad root change", () => {
    for (const impact of ["none", "root"] as const) {
      const {base, child, update, descriptor} = fixture(impact);
      child.orderedListStart = index => index === 3 ? 9 : undefined;
      expect(consumeFlatListSemanticProjectionUpdate(base, update, TEST_PROFILE_GENERATION, descriptor).ok).toBe(impact === "root");
      expect(child.freeCalls).toBe(1); expect(update.freeCalls).toBe(1);
    }
  });
  it("rejects inconsistent parent result metadata and retains cleanup", () => {
    const {base, child, update, descriptor} = fixture();
    Object.defineProperty(update, "resultRevision", {value: "9"});
    expect(consumeFlatListSemanticProjectionUpdate(base, update, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
    expect(child.freeCalls).toBe(1); expect(update.freeCalls).toBe(1);
  });
  it("keeps the child claimed through parent cleanup across both consumer modes", () => {
    const {base, child, update, descriptor} = fixture(); let nested: unknown;
    update.free = () => {
      update.freeCalls += 1;
      nested = consumeFlatListSemanticProjection(child, TEST_PROFILE_GENERATION, descriptor);
      expect(consumeTextBlockSemanticProjection(child, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
    };
    expect(consumeFlatListSemanticProjectionUpdate(base, update, TEST_PROFILE_GENERATION, descriptor).ok).toBe(true);
    expect(nested).toMatchObject({ok: false}); expect(child.freeCalls).toBe(1); expect(update.freeCalls).toBe(1);
  });
  it("protects outer owner aliases before reading or freeing a taken child", () => {
    const {base, child, update, descriptor} = fixture();
    expect(consumeFlatListSemanticProjectionUpdate(base, update, TEST_PROFILE_GENERATION, descriptor, [child]).ok).toBe(false);
    expect(child.freeCalls).toBe(0); expect(update.freeCalls).toBe(1);
  });
  it("does not let the legacy adapter consume a list base", () => {
    const {base, child, update, descriptor} = fixture(); const take = vi.spyOn(update, "takeProjection");
    // @ts-expect-error Flat-list base is deliberately not a legacy projection.
    expect(consumeSemanticProjectionUpdateRaw(base, update, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
    expect(take).not.toHaveBeenCalled(); expect(child.freeCalls).toBe(0); expect(update.freeCalls).toBe(1);
  });
});

/** A mixed preorder tree, including a numbered heading and an empty bullet item. */
function flatListView(): FakeProjectionView & FlatListSemanticProjectionView {
  const view = new FakeProjectionView("7", [], {name: "example/document", version: 1, fingerprint: TEST_SCHEMA_FINGERPRINT});
  const element = (elementType: string, children: number[]): FlatNode => ({kind: "element", elementType, children});
  const text = (value: string): FlatNode => ({kind: "text", text: value, formats: []});
  Object.defineProperty(view, "nodes", {value: [
    element("breditor/document", [1, 3, 10]),
    element("breditor/paragraph", [2]), text("Intro"),
    element("breditor/ordered-list", [4, 7]),
    element("breditor/list-item", [5]), element("breditor/heading", [6]), text("A🙂"),
    element("breditor/list-item", [8]), element("breditor/paragraph", [9]), text("B"),
    element("breditor/bullet-list", [11]),
    element("breditor/list-item", [12]), element("breditor/paragraph", []),
  ], configurable: true});
  return Object.assign(view, {
    headingLevel: (index: number) => index === 5 ? 2 : undefined,
    listKind: (index: number): "ordered" | "bullet" | undefined => index === 3 ? "ordered" : index === 10 ? "bullet" : undefined,
    orderedListStart: (index: number) => index === 3 ? 8 : undefined,
  });
}

describe("opt-in flat-list projection", () => {
  const empty = () => ({headingLevel: null, runs: []});
  const input = (blocks: unknown[]) => ({schema: {name: "example/document", version: 1, fingerprint: TEST_SCHEMA_FINGERPRINT},
    snapshot: {lineage: "lists", revision: "0"}, blocks});
  const create = (blocks: unknown[]) => FlatListDocumentProjection.create(input(blocks), TEST_PROFILE_GENERATION, ownedProfileDescriptor([]));

  it("preserves hierarchy, starts, headings, empty items and actual AST paths", () => {
    const view = flatListView();
    const descriptor = ownedProfileDescriptor([]);
    const result = consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor);
    expect(view.freeCalls).toBe(1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(isOwnedFlatListProjection(result.value)).toBe(true);
    expect(isOwnedProjection(result.value)).toBe(false);
    expect(result.value.blocks.map(block => block.kind)).toEqual(["textBlock", "orderedList", "bulletList"]);
    expect(result.value.blocks[1]).toMatchObject({start: 8, items: [{headingLevel: 2}, {runs: [{text: "B"}]}]});
    expect(result.value.textBlocks[2]?.block.headingLevel).toBeUndefined();
    expect(result.value.textBlocks.map(entry => entry.path)).toEqual([[0], [1, 0, 0], [1, 1, 0], [2, 0, 0]]);
    expect(result.value.textBlocks.map(entry => entry.block.runs.map(run => run.text).join(""))).toEqual(["Intro", "A🙂", "B", ""]);
    expect(result.value.matchesProfile(TEST_PROFILE_GENERATION, descriptor)).toBe(true);
    expect(result.value.matchesProfile(TEST_PROFILE_GENERATION, ownedProfileDescriptor([]))).toBe(false);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.textBlocks[1]?.path)).toBe(true);
  });

  it("copies caller-owned roots/items and shares only immutable validated blocks", () => {
    const block = {headingLevel: null, runs: [{text: "before", formatDetails: []}]};
    const root = {kind: "orderedList", start: 3, items: [block]};
    const result = create([root]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    root.start = 90; block.runs[0]!.text = "after"; root.items.length = 0;
    expect(result.value.blocks[0]).toMatchObject({start: 3, items: [{runs: [{text: "before"}]}]});
    const projected = result.value.blocks[0];
    if (projected?.kind === "orderedList") {
      expect(projected.items[0]).toBe(result.value.textBlocks[0]?.block);
      expect(Object.isFrozen(projected.items)).toBe(true);
      expect(Object.isFrozen(projected.items[0]?.runs[0])).toBe(true);
    }
  });

  it("cannot acquire ownership by bypassing the TypeScript-private constructor", () => {
    expect(() => Reflect.construct(FlatListDocumentProjection, [Symbol("forged"), {}, {}])).toThrow(TypeError);
    expect(isOwnedFlatListProjection(Object.create(FlatListDocumentProjection.prototype))).toBe(false);
  });

  it("preserves typed inline properties inside list items", () => {
    const view = flatListView();
    const nodes = [...view.nodes];
    nodes[6] = {kind: "text", text: "A🙂", formats: [{kind: "example/metadata", properties: [
      {name: "example/enabled", kind: "boolean", value: true},
      {name: "example/title", kind: "string", value: "label"},
    ]}]};
    Object.defineProperty(view, "nodes", {value: nodes});
    const result = consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, ownedProfileDescriptor([TYPED_FORMAT]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.textBlocks[1]?.block.runs[0]?.formatDetails).toEqual([
      {kind: "example/metadata", properties: [
        {name: "example/enabled", value: true},
        {name: "example/title", value: "label"},
      ]},
    ]);
    expect(view.freeCalls).toBe(1);
  });

  it.each(["kind", "start", "bullet-start", "heading", "item-heading", "wrapper-text", "after-list"])("rejects inconsistent %s metadata", fault => {
    const view = flatListView();
    if (fault === "kind") view.listKind = index => index === 3 || index === 10 ? "bullet" : undefined;
    if (fault === "start") view.orderedListStart = index => index === 3 ? 2_147_483_647 : undefined;
    if (fault === "bullet-start") view.orderedListStart = index => index === 3 ? 8 : index === 10 ? 1 : undefined;
    if (fault === "heading") view.headingLevel = index => index === 5 ? 7 : undefined;
    if (fault === "item-heading") view.headingLevel = index => index === 5 || index === 4 ? 2 : undefined;
    if (fault === "wrapper-text") view.text = index => index === 3 ? "unexpected" : FakeProjectionView.prototype.text.call(view, index);
    if (fault === "after-list") view.childAt = (index, ordinal) => index === 3 && ordinal === 2 ? 10 : FakeProjectionView.prototype.childAt.call(view, index, ordinal);
    expect(consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, ownedProfileDescriptor([])).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });

  it.each([
    [], [{kind: "bulletList", items: []}], [{kind: "orderedList", items: [empty()]}],
    [{kind: "bulletList", start: 1, items: [empty()]}],
    [{kind: "bulletList", items: [{kind: "bulletList", items: [empty()]}]}],
    [{kind: "bulletList", items: [{blocks: [empty(), empty()]}]}],
    [{kind: "textBlock", block: empty(), extra: true}],
    [{kind: "textBlock", block: {headingLevel: 7, runs: []}}],
    [{kind: "textBlock", block: {headingLevel: null, runs: [{text: "\ud800", formatDetails: []}]}}],
  ])("rejects non-flat or noncanonical input %j", (...blocks) => {
    expect(create(blocks).ok).toBe(false);
  });

  it.each([0, -1, 1.5, NaN, Infinity, 2_147_483_648])("rejects invalid numbered start %s", start => {
    expect(create([{kind: "orderedList", start, items: [empty()]}]).ok).toBe(false);
  });

  it("bounds the final ordinal as well as the start", () => {
    expect(create([{kind: "orderedList", start: 2_147_483_647, items: [empty()]}]).ok).toBe(true);
    expect(create([{kind: "orderedList", start: 2_147_483_647, items: [empty(), empty()]}]).ok).toBe(false);
  });

  it("rejects getters and sparse arrays without executing the getter", () => {
    const getter = vi.fn(() => [empty()]);
    expect(create([{kind: "bulletList", get items() { return getter(); }}]).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect(create([{kind: "bulletList", items: new Array(2)}]).ok).toBe(false);
  });

  it("bounds each container, not an invented total of 10,000 text blocks", () => {
    const items = Array.from({length: 10_000}, empty);
    expect(create([{kind: "bulletList", items}, {kind: "bulletList", items: [empty()]}]).ok).toBe(true);
    expect(create([{kind: "bulletList", items: [...items, empty()]}])).toMatchObject({ok: false, error: {code: "projection.resource_limit"}});
    expect(create(Array.from({length: 10_001}, () => ({kind: "textBlock", block: empty()}))).ok).toBe(false);
  });

  it("counts list and item nodes in the whole-document budget", () => {
    const list = {kind: "bulletList", items: Array.from({length: 10_000}, empty)};
    // Four lists = 80,005 nodes; a fifth would exceed 100,000.
    expect(create([list, list, list, list]).ok).toBe(true);
    const last = {kind: "bulletList", items: Array.from({length: 9_997}, empty)};
    expect(create([list, list, list, list, last]).ok).toBe(true); // Exactly 100,000.
    last.items.push(empty());
    expect(create([list, list, list, list, last]).ok).toBe(false);
    expect(create([list, list, list, list, list]).ok).toBe(false);
  });

  it("counts ordered starts and heading levels in the shared property budget", () => {
    const items = Array.from({length: 10_000}, () => ({headingLevel: 2, runs: []}));
    expect(create([{kind: "bulletList", items}]).ok).toBe(true);
    expect(create([{kind: "orderedList", start: 1, items}]).ok).toBe(false);
  });

  it("keeps legacy paragraph/heading consumers closed to lists", () => {
    for (const consumer of [consumeSemanticProjectionRaw, consumeTextBlockSemanticProjection]) {
      const view = flatListView();
      expect(consumer(view, TEST_PROFILE_GENERATION, ownedProfileDescriptor([])).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
  });

  it.each(["nested", "multiple-item-blocks", "alias", "gap", "unreachable", "empty-list"])("rejects structural %s", fault => {
    const view = flatListView();
    const original = view.childAt.bind(view);
    if (fault === "nested") view.elementType = index => index === 5 ? "breditor/bullet-list" : FakeProjectionView.prototype.elementType.call(view, index);
    if (fault === "multiple-item-blocks") view.childCount = index => index === 4 ? 2 : FakeProjectionView.prototype.childCount.call(view, index);
    if (fault === "alias") view.childAt = (index, ordinal) => index === 3 && ordinal === 1 ? 4 : original(index, ordinal);
    if (fault === "gap") view.childAt = (index, ordinal) => index === 4 && ordinal === 0 ? 6 : original(index, ordinal);
    if (fault === "unreachable") Object.defineProperty(view, "nodeCount", {value: 14});
    if (fault === "empty-list") view.childCount = index => index === 3 ? 0 : FakeProjectionView.prototype.childCount.call(view, index);
    expect(consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, ownedProfileDescriptor([])).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });

  it.each([0, 2, 4, 5, 13])("rejects list metadata on unrelated node %s", index => {
    const view = flatListView();
    const original = view.listKind;
    view.listKind = i => i === index ? "bullet" : original(i);
    expect(consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, ownedProfileDescriptor([])).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });

  it("rejects missing and asynchronous list methods, containing cleanup exactly once", async () => {
    for (const replacement of [undefined, () => Promise.reject(new Error("foreign failure")), () => { throw new Error("foreign failure"); }]) {
      const view = flatListView();
      Object.defineProperty(view, "listKind", {value: replacement});
      expect(consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, ownedProfileDescriptor([])).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
    await Promise.resolve();
  });

  it("uses the shared consumption guard across list and legacy entry points", () => {
    const view = flatListView();
    const descriptor = ownedProfileDescriptor([]);
    let nested: unknown;
    view.free = () => {
      view.freeCalls += 1;
      nested = consumeTextBlockSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor);
    };
    expect(consumeFlatListSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor).ok).toBe(true);
    expect(nested).toMatchObject({ok: false});
    expect(view.freeCalls).toBe(1);
  });

  it("rejects a result if cleanup retires its generation", () => {
    let live = true;
    const generation: WasmProfileGenerationView = {matches: other => live && other === generation, free: () => { live = false; }};
    const descriptor = ownedProfileDescriptor([], generation);
    const view = flatListView();
    view.matchesProfileGeneration = candidate => candidate === generation;
    view.free = () => { view.freeCalls += 1; generation.free(); };
    expect(consumeFlatListSemanticProjection(view, generation, descriptor).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });
});

type FlatNode =
  | { readonly kind: "element"; readonly elementType: string; readonly children: readonly number[] }
  | {
      readonly kind: "text";
      readonly text: string;
      readonly formats: readonly FlatFormat[];
    };

type FlatProperty = Readonly<{
  name: string;
  kind: "boolean" | "integer" | "string";
  value: boolean | number | string;
}>;

type FlatFormat = Readonly<{
  kind: string;
  properties: readonly FlatProperty[];
}>;

class FakeProjectionView implements SemanticProjectionView {
  readonly schemaName: string;
  readonly schemaVersion: number;
  readonly schemaFingerprint: string;
  readonly snapshotLineage = "adapter-tests";
  readonly snapshotRevision: string;
  readonly rootIndex = 0;
  readonly nodes: readonly FlatNode[];
  freeCalls = 0;

  constructor(
    revision: string,
    paragraphs: readonly (readonly Readonly<{
      text: string;
      strong: boolean;
      formats?: readonly string[];
      formatDetails?: readonly FlatFormat[];
    }>[])[],
    schema: Readonly<{
      name: string;
      version: number;
      fingerprint: string;
    }> = {
      name: "breditor/base",
      version: 1,
      fingerprint: TEST_SCHEMA_FINGERPRINT,
    },
  ) {
    this.snapshotRevision = revision;
    this.schemaName = schema.name;
    this.schemaVersion = schema.version;
    this.schemaFingerprint = schema.fingerprint;
    const nodes: FlatNode[] = [
      { kind: "element", elementType: "breditor/document", children: [] },
    ];
    const paragraphIndexes: number[] = [];
    for (const paragraph of paragraphs) {
      const paragraphIndex = nodes.length;
      paragraphIndexes.push(paragraphIndex);
      nodes.push({ kind: "element", elementType: "breditor/paragraph", children: [] });
      const runIndexes: number[] = [];
      for (const run of paragraph) {
        runIndexes.push(nodes.length);
        nodes.push({
          kind: "text",
          text: run.text,
          formats: run.formatDetails ??
            (run.formats ?? (run.strong ? ["breditor/strong"] : []))
              .map((kind) => ({ kind, properties: [] })),
        });
      }
      nodes[paragraphIndex] = {
        kind: "element",
        elementType: "breditor/paragraph",
        children: runIndexes,
      };
    }
    nodes[0] = {
      kind: "element",
      elementType: "breditor/document",
      children: paragraphIndexes,
    };
    this.nodes = nodes;
  }

  get nodeCount(): number {
    return this.nodes.length;
  }

  nodeKind(index: number): "element" | "text" | undefined {
    return this.nodes[index]?.kind;
  }

  elementType(index: number): string | undefined {
    const node = this.nodes[index];
    return node?.kind === "element" ? node.elementType : undefined;
  }

  childCount(index: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "element" ? node.children.length : undefined;
  }

  childAt(index: number, ordinal: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "element" ? node.children[ordinal] : undefined;
  }

  text(index: number): string | undefined {
    const node = this.nodes[index];
    return node?.kind === "text" ? node.text : undefined;
  }

  formatCount(index: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "text" ? node.formats.length : undefined;
  }

  formatType(index: number, ordinal: number): string | undefined {
    const node = this.nodes[index];
    return node?.kind === "text" ? node.formats[ordinal]?.kind : undefined;
  }

  formatPropertyCount(index: number, formatOrdinal: number): number | undefined {
    const node = this.nodes[index];
    return node?.kind === "text"
      ? node.formats[formatOrdinal]?.properties.length
      : undefined;
  }

  formatPropertyName(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): string | undefined {
    return this.property(index, formatOrdinal, propertyOrdinal)?.name;
  }

  formatPropertyValueKind(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): "boolean" | "integer" | "string" | undefined {
    return this.property(index, formatOrdinal, propertyOrdinal)?.kind;
  }

  formatPropertyBoolean(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): boolean | undefined {
    const property = this.property(index, formatOrdinal, propertyOrdinal);
    return property?.kind === "boolean" && typeof property.value === "boolean"
      ? property.value
      : undefined;
  }

  formatPropertyInteger(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): number | undefined {
    const property = this.property(index, formatOrdinal, propertyOrdinal);
    return property?.kind === "integer" && typeof property.value === "number"
      ? property.value
      : undefined;
  }

  formatPropertyString(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): string | undefined {
    const property = this.property(index, formatOrdinal, propertyOrdinal);
    return property?.kind === "string" && typeof property.value === "string"
      ? property.value
      : undefined;
  }

  private property(
    index: number,
    formatOrdinal: number,
    propertyOrdinal: number,
  ): FlatProperty | undefined {
    const node = this.nodes[index];
    return node?.kind === "text"
      ? node.formats[formatOrdinal]?.properties[propertyOrdinal]
      : undefined;
  }

  free(): void {
    this.freeCalls += 1;
  }

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }
}

class FakeUpdateView implements SemanticProjectionUpdateView {
  readonly baseLineage = "adapter-tests";
  readonly baseRevision: string;
  readonly resultLineage = "adapter-tests";
  readonly resultRevision: string;
  readonly impact: SemanticProjectionImpact;
  readonly affectedParagraphCount: number;
  readonly oldChildStart: number | undefined;
  readonly oldChildEnd: number | undefined;
  readonly newChildStart: number | undefined;
  readonly newChildEnd: number | undefined;
  readonly #affected: readonly number[];
  #projection: SemanticProjectionView | undefined;
  freeCalls = 0;

  constructor(options: {
    readonly baseRevision: string;
    readonly resultRevision: string;
    readonly impact: SemanticProjectionImpact;
    readonly projection: SemanticProjectionView | undefined;
    readonly affected?: readonly number[];
    readonly oldRange?: readonly [number, number];
    readonly newRange?: readonly [number, number];
  }) {
    this.baseRevision = options.baseRevision;
    this.resultRevision = options.resultRevision;
    this.impact = options.impact;
    this.#projection = options.projection;
    this.#affected = options.affected ?? [];
    this.affectedParagraphCount = this.#affected.length;
    this.oldChildStart = undefined;
    this.oldChildEnd = undefined;
    this.newChildStart = undefined;
    this.newChildEnd = undefined;
    if (options.oldRange !== undefined) {
      [this.oldChildStart, this.oldChildEnd] = options.oldRange;
    }
    if (options.newRange !== undefined) {
      [this.newChildStart, this.newChildEnd] = options.newRange;
    }
  }

  affectedParagraphIndex(index: number): number | undefined {
    return this.#affected[index];
  }

  takeProjection(): SemanticProjectionView | undefined {
    const projection = this.#projection;
    this.#projection = undefined;
    return projection;
  }

  free(): void {
    this.freeCalls += 1;
  }

  matchesProfileGeneration(generation: WasmProfileGenerationView): boolean {
    return generation === TEST_PROFILE_GENERATION;
  }
}

function consumeSemanticProjection(
  view: SemanticProjectionView,
): BrowserProjectionResult<import("./projection.js").BaseDocumentProjection> {
  return consumeSemanticProjectionRaw(
    view,
    TEST_PROFILE_GENERATION,
    TEST_SCHEMA_FINGERPRINT,
  );
}

function consumeSemanticProjectionUpdate(
  base: import("./projection.js").BaseDocumentProjection,
  view: SemanticProjectionUpdateView,
  protectedHandles: readonly unknown[] = [],
) {
  return consumeSemanticProjectionUpdateRaw(
    base,
    view,
    TEST_PROFILE_GENERATION,
    TEST_SCHEMA_FINGERPRINT,
    protectedHandles,
  );
}

function valueOf<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

type ProfilePropertyFixture = Readonly<{
  name: string;
  presence: "required" | "optional";
  valueType:
    | Readonly<{ kind: "boolean" }>
    | Readonly<{ kind: "integer"; minimum?: number; maximum?: number }>
    | Readonly<{
        kind: "string";
        minimumUtf8Bytes: number;
        maximumUtf8Bytes: number;
      }>;
}>;

type ProfileFormatFixture = string | Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}>;

function ownedProfileDescriptor(
  formats: readonly ProfileFormatFixture[],
  generation: WasmProfileGenerationView = TEST_PROFILE_GENERATION,
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const normalized = formats.map((format) => typeof format === "string"
    ? { kind: format, properties: [] }
    : format);
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: TEST_SCHEMA_FINGERPRINT,
    formatCount: formats.length,
    intentCount: 0,
    actionStateCount: 0,
    inlineFormatSetCount: 0,
    matchesProfileGeneration: (candidate) => candidate === generation,
    formatKind: (index) => normalized[index]?.kind,
    formatRevision: (index) =>
      index >= 0 && index < normalized.length ? 1 : undefined,
    formatPropertyCount: (formatIndex) =>
      normalized[formatIndex]?.properties.length,
    formatPropertyName: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.name,
    formatPropertyPresence: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.presence,
    formatPropertyValueType: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.valueType.kind,
    formatPropertyIntegerMinimum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.minimum : undefined;
    },
    formatPropertyIntegerMaximum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.maximum : undefined;
    },
    formatPropertyStringMinimumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.minimumUtf8Bytes : undefined;
    },
    formatPropertyStringMaximumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.maximumUtf8Bytes : undefined;
    },
    intentId: absent,
    intentInputKind: absent,
    intentInputContractName: absent,
    intentInputContractVersion: absent,
    intentActivationContract: absent,
    intentValueContractName: absent,
    intentValueContractVersion: absent,
    actionStateId: absent,
    actionStateSourceKind: absent,
    actionStateSourceActionId: absent,
    actionStateSourceIntentId: absent,
    actionStateHistoryDirection: absent,
    actionStateActivationContract: absent,
    actionStateValueContractName: absent,
    actionStateValueContractVersion: absent,
    inlineFormatSetFormatKind: absent,
    inlineFormatSetIntentId: absent,
    inlineFormatSetActionStateId: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(
    generation,
    view,
  );
  if (!result.ok) throw new Error("test profile descriptor was rejected");
  return result.descriptor;
}

const TYPED_FORMAT: Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}> = Object.freeze({
  kind: "example/metadata",
  properties: Object.freeze([
    Object.freeze({
      name: "example/enabled",
      presence: "required" as const,
      valueType: Object.freeze({ kind: "boolean" as const }),
    }),
    Object.freeze({
      name: "example/priority",
      presence: "optional" as const,
      valueType: Object.freeze({
        kind: "integer" as const,
        minimum: 0,
        maximum: 10,
      }),
    }),
    Object.freeze({
      name: "example/title",
      presence: "required" as const,
      valueType: Object.freeze({
        kind: "string" as const,
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 64,
      }),
    }),
  ]),
});

const PROPERTY_BUDGET_FORMAT: Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}> = Object.freeze({
  kind: "example/value",
  properties: Object.freeze([
    Object.freeze({
      name: "example/value",
      presence: "required" as const,
      valueType: Object.freeze({
        kind: "string" as const,
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 65_536,
      }),
    }),
  ]),
});

function typedProperties(priority = 7): readonly FlatProperty[] {
  return Object.freeze([
    Object.freeze({
      name: "example/enabled",
      kind: "boolean" as const,
      value: true,
    }),
    Object.freeze({
      name: "example/priority",
      kind: "integer" as const,
      value: priority,
    }),
    Object.freeze({
      name: "example/title",
      kind: "string" as const,
      value: "safe title",
    }),
  ]);
}

describe("Wasm semantic projection adapter", () => {
  function headingView(rank: unknown = 2, revision = "0") {
    const descriptor = ownedProfileDescriptor(["breditor/strong"]);
    const view = new FakeProjectionView(revision, [[{ text: "a🙂", strong: true }]], descriptor.schema);
    const priorType = view.elementType.bind(view);
    view.elementType = (index) => index === 1 ? "breditor/heading" : priorType(index);
    return { descriptor, view: Object.assign(view, {
      headingLevel: (index: number) => index === 1 ? rank as number : undefined,
    }) };
  }

  it("consumes explicit heading metadata and carries the mode through updates", () => {
    const { view, descriptor } = headingView();
    const result = consumeTextBlockSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("missing heading projection");
    expect(result.value.paragraphs[0]?.headingLevel).toBe(2);
    expect(view.freeCalls).toBe(1);
    const next = headingView(4, "1").view;
    const update = new FakeUpdateView({ baseRevision: "0", resultRevision: "1",
      impact: "textContainers", affected: [0], projection: next });
    const changed = consumeSemanticProjectionUpdateRaw(result.value, update, TEST_PROFILE_GENERATION, descriptor);
    expect(changed.ok).toBe(true);
    if (!changed.ok) throw new Error("missing update");
    expect(changed.value.result.paragraphs[0]?.headingLevel).toBe(4);
    expect(next.freeCalls).toBe(1);
    expect(update.freeCalls).toBe(1);
  });

  it("rejects malformed or misplaced heading metadata and frees each view once", () => {
    for (const rank of [undefined, null, 0, 7, 2.1, "2", {}, NaN, Infinity]) {
      const { view, descriptor } = headingView(rank);
      // Explicit undefined must not activate the fixture's default argument.
      view.headingLevel = (index) => index === 1 ? rank as number : undefined;
      expect(consumeTextBlockSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
    for (const wrongIndex of [0, 2, 3]) {
      const { view, descriptor } = headingView();
      view.headingLevel = (index) => index === 1 || index === wrongIndex ? 2 : undefined;
      expect(consumeTextBlockSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
    const { view, descriptor } = headingView();
    view.elementType = (index) => index === 0 ? "breditor/document" : index === 1 ? "breditor/paragraph" : undefined;
    expect(consumeTextBlockSemanticProjection(view, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
  });

  it("never reads the experimental getter through the legacy consumer", () => {
    const { view, descriptor } = headingView();
    Object.defineProperty(view, "headingLevel", { get: () => { throw new Error("not a legacy capability"); } });
    expect(consumeSemanticProjectionRaw(view, TEST_PROFILE_GENERATION, descriptor).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
    const paragraph = new FakeProjectionView("0", [[{ text: "p", strong: false }]], descriptor.schema);
    Object.defineProperty(paragraph, "headingLevel", { get: () => { throw new Error("not a legacy capability"); } });
    expect(consumeSemanticProjectionRaw(paragraph, TEST_PROFILE_GENERATION, descriptor).ok).toBe(true);
    expect(paragraph.freeCalls).toBe(1);
  });

  it("consumes profile formats against the exact owned descriptor", () => {
    const descriptor = ownedProfileDescriptor([
      "breditor/strong",
      "example/highlight",
    ]);
    const baseView = new FakeProjectionView("0", [[
      {
        text: "mixed",
        strong: true,
        formats: ["breditor/strong", "example/highlight"],
      },
    ]], descriptor.schema);
    const base = valueOf(consumeSemanticProjectionRaw(
      baseView,
      TEST_PROFILE_GENERATION,
      descriptor,
    ));

    expect(base.schema).toEqual(descriptor.schema);
    expect(base.paragraphs[0]?.runs[0]?.formats).toEqual([
      "breditor/strong",
      "example/highlight",
    ]);
    expect(base.paragraphs[0]?.runs[0]?.strong).toBe(true);

    const resultView = new FakeProjectionView("1", [[
      { text: "plain", strong: false, formats: ["example/highlight"] },
    ]], descriptor.schema);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "textContainers",
      affected: [0],
      projection: resultView,
    });
    const update = valueOf(consumeSemanticProjectionUpdateRaw(
      base,
      updateView,
      TEST_PROFILE_GENERATION,
      descriptor,
    ));
    expect(update.result.paragraphs[0]?.runs[0]?.formats).toEqual([
      "example/highlight",
    ]);
    expect(update.result.paragraphs[0]?.runs[0]?.strong).toBe(false);
  });

  it("owns canonical typed format details while retaining the format-kind index", () => {
    const descriptor = ownedProfileDescriptor([
      "breditor/strong",
      TYPED_FORMAT,
    ]);
    const view = new FakeProjectionView("0", [[{
      text: "typed",
      strong: true,
      formatDetails: [
        { kind: "breditor/strong", properties: [] },
        { kind: TYPED_FORMAT.kind, properties: typedProperties() },
      ],
    }]], descriptor.schema);

    const projection = valueOf(consumeSemanticProjectionRaw(
      view,
      TEST_PROFILE_GENERATION,
      descriptor,
    ));
    const run = projection.paragraphs[0]?.runs[0];

    expect(run?.formats).toEqual(["breditor/strong", "example/metadata"]);
    expect(run?.formatDetails).toEqual([
      { kind: "breditor/strong", properties: [] },
      {
        kind: "example/metadata",
        properties: [
          { name: "example/enabled", value: true },
          { name: "example/priority", value: 7 },
          { name: "example/title", value: "safe title" },
        ],
      },
    ]);
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run?.formats)).toBe(true);
    expect(Object.isFrozen(run?.formatDetails)).toBe(true);
    expect(Object.isFrozen(run?.formatDetails[1])).toBe(true);
    expect(Object.isFrozen(run?.formatDetails[1]?.properties)).toBe(true);
    expect(Object.isFrozen(run?.formatDetails[1]?.properties[0])).toBe(true);
    expect(Reflect.ownKeys(run ?? {})).toEqual([
      "text",
      "strong",
      "formatDetails",
      "formats",
    ]);
    expect(Object.keys(run ?? {})).toEqual(["text", "strong", "formatDetails"]);
    expect(view.freeCalls).toBe(1);
  });

  it("keeps adjacent runs separate when only typed property values differ", () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const differing = new FakeProjectionView("0", [[
      {
        text: "left",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(1) }],
      },
      {
        text: "right",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(2) }],
      },
    ]], descriptor.schema);
    expect(consumeSemanticProjectionRaw(
      differing,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(true);

    const equivalent = new FakeProjectionView("0", [[
      {
        text: "left",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(1) }],
      },
      {
        text: "right",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties(1) }],
      },
    ]], descriptor.schema);
    expect(consumeSemanticProjectionRaw(
      equivalent,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(equivalent.freeCalls).toBe(1);
  });

  it("matches all required/optional and supplied-property subsets, including trailing omissions", () => {
    const valid = typedProperties();
    // Exhaust all 64 combinations, including no properties and optional gaps.
    // A tail omission must reject only when the omitted contract is required.
    for (let required = 0; required < 8; required++) {
      const descriptor = ownedProfileDescriptor([{
        ...TYPED_FORMAT,
        properties: TYPED_FORMAT.properties.map((property, index) => ({
          ...property,
          presence: (required & (1 << index)) !== 0 ? "required" as const : "optional" as const,
        })),
      }]);
      for (let supplied = 0; supplied < 8; supplied++) {
        const properties = valid.filter((_property, index) => (supplied & (1 << index)) !== 0);
        const view = new FakeProjectionView("0", [[{
          text: "typed", strong: false,
          formatDetails: [{ kind: TYPED_FORMAT.kind, properties }],
        }]], descriptor.schema);
        const result = consumeSemanticProjectionRaw(view, TEST_PROFILE_GENERATION, descriptor);
        const context = `required=${required} supplied=${supplied}`;
        expect(result.ok, context).toBe((supplied & required) === required);
        expect(view.freeCalls, context).toBe(1);
        if (result.ok) {
          expect(result.value.paragraphs[0]?.runs[0]?.formatDetails[0]?.properties.map(property => property.name), context)
            .toEqual(properties.map(property => property.name));
        } else {
          expect(result.error.code, context).toBe("projection.invalid_shape");
        }
      }
    }
  });

  it("rejects noncanonical, uncontracted, wrong-domain, and unsafe property values", () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const valid = typedProperties();
    const cases: readonly [string, readonly FlatProperty[]][] = [
      ["missing required", valid.slice(1)],
      [
        "unknown property",
        [
          valid[0] as FlatProperty,
          { name: "example/rogue", kind: "boolean", value: true },
          valid[2] as FlatProperty,
        ],
      ],
      [
        "noncanonical property order",
        [valid[1] as FlatProperty, valid[0] as FlatProperty, valid[2] as FlatProperty],
      ],
      [
        "integer below contract",
        [
          valid[0] as FlatProperty,
          { name: "example/priority", kind: "integer", value: -1 },
          valid[2] as FlatProperty,
        ],
      ],
      [
        "string below contract",
        [
          valid[0] as FlatProperty,
          valid[1] as FlatProperty,
          { name: "example/title", kind: "string", value: "" },
        ],
      ],
      [
        "unsafe integer",
        [
          valid[0] as FlatProperty,
          {
            name: "example/priority",
            kind: "integer",
            value: Number.MAX_SAFE_INTEGER + 1,
          },
          valid[2] as FlatProperty,
        ],
      ],
      [
        "negative zero",
        [
          valid[0] as FlatProperty,
          { name: "example/priority", kind: "integer", value: -0 },
          valid[2] as FlatProperty,
        ],
      ],
    ];

    for (const [_name, properties] of cases) {
      const view = new FakeProjectionView("0", [[{
        text: "typed",
        strong: false,
        formatDetails: [{ kind: TYPED_FORMAT.kind, properties }],
      }]], descriptor.schema);
      expect(consumeSemanticProjectionRaw(
        view,
        TEST_PROFILE_GENERATION,
        descriptor,
      ).ok).toBe(false);
      expect(view.freeCalls).toBe(1);
    }
  });

  it("requires exact scalar channels, bounded counts, and absent sentinels", () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const createView = () => new FakeProjectionView("0", [[{
      text: "typed",
      strong: false,
      formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties() }],
    }]], descriptor.schema);

    const crossKind = createView();
    const boolean = crossKind.formatPropertyBoolean.bind(crossKind);
    crossKind.formatPropertyBoolean = (node, format, property) =>
      property === 1 ? false : boolean(node, format, property);
    expect(consumeSemanticProjectionRaw(
      crossKind,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(crossKind.freeCalls).toBe(1);

    const overCount = createView();
    overCount.formatPropertyCount = () => 33;
    expect(consumeSemanticProjectionRaw(
      overCount,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(overCount.freeCalls).toBe(1);

    const propertySentinelLeaks: readonly ((view: FakeProjectionView) => void)[] = [
      (view) => {
        const original = view.formatPropertyName.bind(view);
        view.formatPropertyName = (node, format, property) =>
          property === 3 ? "example/extra" : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyValueKind.bind(view);
        view.formatPropertyValueKind = (node, format, property) =>
          property === 3 ? "boolean" : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyBoolean.bind(view);
        view.formatPropertyBoolean = (node, format, property) =>
          property === 3 ? true : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyInteger.bind(view);
        view.formatPropertyInteger = (node, format, property) =>
          property === 3 ? 1 : original(node, format, property);
      },
      (view) => {
        const original = view.formatPropertyString.bind(view);
        view.formatPropertyString = (node, format, property) =>
          property === 3 ? "extra" : original(node, format, property);
      },
    ];
    for (const leak of propertySentinelLeaks) {
      const sentinel = createView();
      leak(sentinel);
      expect(consumeSemanticProjectionRaw(
        sentinel,
        TEST_PROFILE_GENERATION,
        descriptor,
      ).ok).toBe(false);
      expect(sentinel.freeCalls).toBe(1);
    }

    const formatSentinel = createView();
    const formatPropertyCount = formatSentinel.formatPropertyCount.bind(formatSentinel);
    formatSentinel.formatPropertyCount = (node, format) =>
      format === 1 ? 0 : formatPropertyCount(node, format);
    expect(consumeSemanticProjectionRaw(
      formatSentinel,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(formatSentinel.freeCalls).toBe(1);
  });

  it("contains thenable property results and throwing method accessors", async () => {
    const descriptor = ownedProfileDescriptor([TYPED_FORMAT]);
    const createView = () => new FakeProjectionView("0", [[{
      text: "typed",
      strong: false,
      formatDetails: [{ kind: TYPED_FORMAT.kind, properties: typedProperties() }],
    }]], descriptor.schema);

    const asynchronous = createView();
    asynchronous.formatPropertyString = (() => Promise.reject(
      new Error("projected property rejection must be contained"),
    )) as unknown as SemanticProjectionView["formatPropertyString"];
    expect(consumeSemanticProjectionRaw(
      asynchronous,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(asynchronous.freeCalls).toBe(1);

    const throwing = createView();
    Object.defineProperty(throwing, "formatPropertyName", {
      get() {
        throw new Error("hostile method accessor");
      },
    });
    expect(consumeSemanticProjectionRaw(
      throwing,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(throwing.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("matches the core aggregate property-value and string-byte budgets", () => {
    const descriptor = ownedProfileDescriptor([PROPERTY_BUDGET_FORMAT]);
    const exactValueRuns = Array.from({ length: 10_000 }, (_, index) => ({
      text: "x",
      strong: false,
      formatDetails: [{
        kind: PROPERTY_BUDGET_FORMAT.kind,
        properties: propertyBudgetProjection(index % 2 === 0 ? "a" : "b"),
      }],
    }));
    const exactValues = new FakeProjectionView(
      "0",
      [exactValueRuns],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      exactValues,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(true);
    expect(exactValues.freeCalls).toBe(1);

    const overValues = new FakeProjectionView(
      "0",
      [exactValueRuns, [{
        text: "x",
        strong: false,
        formatDetails: [{
          kind: PROPERTY_BUDGET_FORMAT.kind,
          properties: propertyBudgetProjection("c"),
        }],
      }]],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      overValues,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(overValues.freeCalls).toBe(1);

    const left = "💡".repeat(16_384);
    const right = "🚀".repeat(16_384);
    const exactStringRuns = Array.from({ length: 16 }, (_, index) => ({
      text: "x",
      strong: false,
      formatDetails: [{
        kind: PROPERTY_BUDGET_FORMAT.kind,
        properties: propertyBudgetProjection(index % 2 === 0 ? left : right),
      }],
    }));
    const exactStrings = new FakeProjectionView(
      "0",
      [exactStringRuns],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      exactStrings,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(true);
    expect(exactStrings.freeCalls).toBe(1);

    const overStrings = new FakeProjectionView(
      "0",
      [[...exactStringRuns, {
        text: "x",
        strong: false,
        formatDetails: [{
          kind: PROPERTY_BUDGET_FORMAT.kind,
          properties: propertyBudgetProjection("é"),
        }],
      }]],
      descriptor.schema,
    );
    expect(consumeSemanticProjectionRaw(
      overStrings,
      TEST_PROFILE_GENERATION,
      descriptor,
    ).ok).toBe(false);
    expect(overStrings.freeCalls).toBe(1);
  });

  it("rejects projections and updates from another profile generation", () => {
    const foreignGeneration: WasmProfileGenerationView = {
      matches(other) { return other === foreignGeneration; },
      free: vi.fn(),
    };
    const projectionView = new FakeProjectionView("0", [[]]);
    expect(
      consumeSemanticProjectionRaw(
        projectionView,
        foreignGeneration,
        TEST_SCHEMA_FINGERPRINT,
      ).ok,
    ).toBe(false);
    expect(projectionView.freeCalls).toBe(1);

    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: new FakeProjectionView("1", [[]]),
    });
    expect(
      consumeSemanticProjectionUpdateRaw(
        base,
        updateView,
        foreignGeneration,
        TEST_SCHEMA_FINGERPRINT,
      ).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(1);
  });

  it.each(["projection", "update"])("rejects a generation invalidated by %s cleanup", (phase) => {
    let live = true;
    const generation: WasmProfileGenerationView = {
      matches(other) { return live && other === generation; },
      free: vi.fn(),
    };
    const makeView = (revision: string) => {
      const view = new FakeProjectionView(revision, [[]]);
      view.matchesProfileGeneration = (other) => other === generation;
      return view;
    };
    const view = makeView("1");
    if (phase === "projection") {
      view.free = () => { view.freeCalls += 1; live = false; };
      expect(consumeSemanticProjectionRaw(view, generation, TEST_SCHEMA_FINGERPRINT))
        .toMatchObject({ ok: false, error: { code: "projection.invalid_shape" } });
    } else {
      const base = valueOf(consumeSemanticProjectionRaw(makeView("0"), generation, TEST_SCHEMA_FINGERPRINT));
      const update = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: view });
      update.matchesProfileGeneration = (other) => other === generation;
      update.free = () => { update.freeCalls += 1; live = false; };
      expect(consumeSemanticProjectionUpdateRaw(base, update, generation, TEST_SCHEMA_FINGERPRINT))
        .toMatchObject({ ok: false, error: { code: "projection.invalid_update" } });
      expect(update.freeCalls).toBe(1);
    }
    expect(view.freeCalls).toBe(1);
    expect(generation.free).not.toHaveBeenCalled();
  });

  it("rejects an owned descriptor minted by a different live generation", () => {
    const foreignGeneration: WasmProfileGenerationView = {
      matches(other) { return other === foreignGeneration; },
      free: vi.fn(),
    };
    const descriptor = ownedProfileDescriptor(
      ["breditor/strong"],
      foreignGeneration,
    );
    const view = new FakeProjectionView("0", [[{
      text: "x",
      strong: true,
    }]], descriptor.schema);

    expect(consumeSemanticProjectionRaw(
      view,
      TEST_PROFILE_GENERATION,
      descriptor,
    )).toMatchObject({ ok: false });
    expect(view.freeCalls).toBe(1);
  });

  it("consumes an exact flattened preorder view without parsing JSON", () => {
    const view = new FakeProjectionView("0", [
      [{ text: "plain", strong: false }, { text: "strong", strong: true }],
      [],
    ]);

    const projection = valueOf(consumeSemanticProjection(view));
    expect(view.freeCalls).toBe(1);
    expect(projection.snapshot).toEqual({ lineage: "adapter-tests", revision: "0" });
    expect(projection.paragraphs).toEqual([
      {
        runs: [
          { text: "plain", strong: false, formatDetails: [] },
          {
            text: "strong",
            strong: true,
            formatDetails: [{ kind: "breditor/strong", properties: [] }],
          },
        ],
      },
      { runs: [] },
    ]);
  });

  it("uses the projection cleanup captured before thenable inspection", () => {
    const view = new FakeProjectionView("0", [[{ text: "plain", strong: false }]]);
    const replacementFree = vi.fn();
    Object.defineProperty(view, "then", {
      get() {
        Object.assign(view, { free: replacementFree });
        return undefined;
      },
    });

    expect(consumeSemanticProjection(view).ok).toBe(true);
    expect(view.freeCalls).toBe(1);
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it("rejects same-handle reentry without double-freeing the outer owner", () => {
    const view = new FakeProjectionView("0", [[{ text: "plain", strong: false }]]);
    let nested: BrowserProjectionResult<import("./projection.js").BaseDocumentProjection> |
      undefined;
    const fingerprint = view.schemaFingerprint;
    Object.defineProperty(view, "schemaFingerprint", {
      configurable: true,
      get() {
        nested = consumeSemanticProjection(view);
        return fingerprint;
      },
    });

    expect(consumeSemanticProjection(view).ok).toBe(true);
    expect(nested).toMatchObject({ ok: false });
    expect(view.freeCalls).toBe(1);
  });

  it.each((["public", "captured"] as const).flatMap((entry) =>
    ["valid", "invalid", "throwing cleanup"].map((scenario) => [entry, scenario] as const),
  ))("retains the child reservation during %s update cleanup (%s)", (entry, scenario) => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const child = new FakeProjectionView("1", [[]]);
    if (scenario === "invalid") Object.defineProperty(child, "schemaVersion", { value: 0 });
    const outer = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: child });
    const nestedUpdate = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: child });
    const nested: boolean[] = [];
    const cleanup = () => {
      outer.freeCalls++;
      nested.push(consumeSemanticProjection(child).ok);
      nested.push(consumeSemanticProjectionUpdate(base, nestedUpdate).ok);
      if (scenario === "throwing cleanup") throw new Error("cleanup failed");
    };
    outer.free = cleanup;
    const result = entry === "public" ? consumeSemanticProjectionUpdate(base, outer)
      : consumeSemanticProjectionUpdateWithCleanup(base, outer, cleanup, TEST_PROFILE_GENERATION, TEST_SCHEMA_FINGERPRINT);
    expect(result.ok).toBe(scenario === "valid");
    expect(nested).toEqual([false, false]);
    expect(outer.freeCalls).toBe(1);
    expect(nestedUpdate.freeCalls).toBe(1);
    expect(child.freeCalls).toBe(1);
  });

  it.each(["free getter", "schema read", "child cleanup"])("does not acquire another consumer's active child during %s", (phase) => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const child = new FakeProjectionView("1", [[]]);
    const nested = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: child });
    let entered = false;
    let accepted: boolean | undefined;
    const reenter = () => {
      if (entered) return;
      entered = true;
      accepted = consumeSemanticProjectionUpdate(base, nested).ok;
    };
    if (phase === "free getter") Object.defineProperty(child, "free", { get() { reenter(); return FakeProjectionView.prototype.free; } });
    if (phase === "schema read") Object.defineProperty(child, "schemaName", { get() { reenter(); return "breditor/base"; } });
    if (phase === "child cleanup") child.free = () => { child.freeCalls++; reenter(); };
    expect(consumeSemanticProjection(child).ok).toBe(true);
    expect(accepted).toBe(false);
    expect(child.freeCalls).toBe(1);
    expect(nested.freeCalls).toBe(1);
  });

  it("permits an independent projection read during parent cleanup", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const child = new FakeProjectionView("1", [[]]);
    const independent = new FakeProjectionView("2", [[]]);
    const outer = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: child });
    let accepted = false;
    outer.free = () => { outer.freeCalls++; accepted = consumeSemanticProjection(independent).ok; };
    expect(consumeSemanticProjectionUpdate(base, outer).ok).toBe(true);
    expect(accepted).toBe(true);
    expect(child.freeCalls).toBe(1);
    expect(independent.freeCalls).toBe(1);
    expect(outer.freeCalls).toBe(1);
  });

  it("keeps independent nested update ownership separate", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const child = new FakeProjectionView("1", [[]]);
    const otherChild = new FakeProjectionView("1", [[]]);
    const outer = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: child });
    const inner = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: otherChild });
    let accepted = false;
    let aliasAccepted: boolean | undefined;
    outer.free = () => {
      outer.freeCalls++;
      accepted = consumeSemanticProjectionUpdate(base, inner).ok;
      aliasAccepted = consumeSemanticProjection(child).ok;
    };
    expect(consumeSemanticProjectionUpdate(base, outer).ok).toBe(true);
    expect(accepted).toBe(true);
    expect(aliasAccepted).toBe(false);
    expect(child.freeCalls).toBe(1);
    expect(otherChild.freeCalls).toBe(1);
    expect(inner.freeCalls).toBe(1);
    expect(outer.freeCalls).toBe(1);
  });

  it.each(["public", "captured"] as const)("retains the child through the %s update's final generation check", (entry) => {
    let cleaned = false;
    let entered = false;
    let accepted: boolean | undefined;
    let child: FakeProjectionView;
    const generation: WasmProfileGenerationView = {
      matches(other) {
        if (cleaned && !entered) {
          entered = true;
          accepted = consumeSemanticProjectionRaw(child, generation, TEST_SCHEMA_FINGERPRINT).ok;
        }
        return other === generation;
      },
      free: vi.fn(),
    };
    const makeView = (revision: string) => {
      const view = new FakeProjectionView(revision, [[]]);
      view.matchesProfileGeneration = (other) => other === generation;
      return view;
    };
    const base = valueOf(consumeSemanticProjectionRaw(makeView("0"), generation, TEST_SCHEMA_FINGERPRINT));
    child = makeView("1");
    const outer = new FakeUpdateView({ baseRevision: "0", resultRevision: "1", impact: "root", projection: child });
    outer.matchesProfileGeneration = (other) => other === generation;
    const cleanup = () => { outer.freeCalls++; cleaned = true; };
    outer.free = cleanup;
    const result = entry === "public"
      ? consumeSemanticProjectionUpdateRaw(base, outer, generation, TEST_SCHEMA_FINGERPRINT)
      : consumeSemanticProjectionUpdateWithCleanup(base, outer, cleanup, generation, TEST_SCHEMA_FINGERPRINT);
    expect(result.ok).toBe(true);
    expect(accepted).toBe(false);
    expect(outer.freeCalls).toBe(1);
    expect(child.freeCalls).toBe(1);
    expect(generation.free).not.toHaveBeenCalled();
  });

  it("contains thenables returned by generated scalar methods", async () => {
    const view = new FakeProjectionView("0", [[{ text: "plain", strong: false }]]);
    view.nodeKind = (() => Promise.reject(
      new Error("generated scalar rejection must be contained"),
    )) as unknown as SemanticProjectionView["nodeKind"];

    expect(consumeSemanticProjection(view).ok).toBe(false);
    expect(view.freeCalls).toBe(1);
    await Promise.resolve();
  });

  it("fails closed and frees a view with a non-preorder child index", () => {
    const view = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const root = view.nodes[0];
    if (root?.kind !== "element") {
      throw new Error("fixture root missing");
    }
    (view.nodes as FlatNode[])[0] = { ...root, children: [2] };

    const result = consumeSemanticProjection(view);
    expect(result.ok).toBe(false);
    expect(view.freeCalls).toBe(1);
  });

  it("bounds traversal by nodeCount before iterating a hostile run count", () => {
    const view = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const childCount = view.childCount.bind(view);
    const childAt = vi.spyOn(view, "childAt");
    view.childCount = (index) => index === 1 ? 10_000 : childCount(index);

    expect(consumeSemanticProjection(view).ok).toBe(false);
    expect(childAt).toHaveBeenCalledTimes(1);
    expect(view.freeCalls).toBe(1);
  });

  it("rejects cross-kind getter data and hidden nodes beyond nodeCount", () => {
    const elementFormat = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const baseFormatType = elementFormat.formatType.bind(elementFormat);
    elementFormat.formatType = (index, ordinal) =>
      index === 0 && ordinal === 0 ? "breditor/strong" : baseFormatType(index, ordinal);
    expect(consumeSemanticProjection(elementFormat).ok).toBe(false);
    expect(elementFormat.freeCalls).toBe(1);

    const textChild = new FakeProjectionView("0", [[{ text: "text", strong: false }]]);
    const baseChildAt = textChild.childAt.bind(textChild);
    textChild.childAt = (index, ordinal) =>
      index === 2 && ordinal === 0 ? 0 : baseChildAt(index, ordinal);
    expect(consumeSemanticProjection(textChild).ok).toBe(false);
    expect(textChild.freeCalls).toBe(1);

    const hiddenNode = new FakeProjectionView("0", [[]]);
    const baseNodeKind = hiddenNode.nodeKind.bind(hiddenNode);
    hiddenNode.nodeKind = (index) =>
      index === hiddenNode.nodeCount ? "text" : baseNodeKind(index);
    expect(consumeSemanticProjection(hiddenNode).ok).toBe(false);
    expect(hiddenNode.freeCalls).toBe(1);
  });

  it("consumes and verifies a text-container update and both handles", () => {
    const baseView = new FakeProjectionView("8", [
      [{ text: "left", strong: false }],
      [{ text: "right", strong: false }],
    ]);
    const base = valueOf(consumeSemanticProjection(baseView));
    const resultView = new FakeProjectionView("9", [
      [{ text: "LEFT", strong: true }],
      [{ text: "right", strong: false }],
    ]);
    const updateView = new FakeUpdateView({
      baseRevision: "8",
      resultRevision: "9",
      impact: "textContainers",
      projection: resultView,
      affected: [0],
    });

    const update = valueOf(consumeSemanticProjectionUpdate(base, updateView));
    expect(update.impact).toEqual({ kind: "textContainers", paragraphIndexes: [0] });
    expect(update.result.paragraphs[0]?.runs[0]).toEqual({
      text: "LEFT",
      strong: true,
      formatDetails: [{ kind: "breditor/strong", properties: [] }],
    });
    expect(resultView.freeCalls).toBe(1);
    expect(updateView.freeCalls).toBe(1);
    expect(updateView.takeProjection()).toBeUndefined();
  });

  it("accepts text-container impact only with affected paragraphs and all splice ranges absent", () => {
    const rangeKeys = ["oldChildStart", "oldChildEnd", "newChildStart", "newChildEnd"] as const;
    // Cover each partial range shape too: zero is a present endpoint, not absence.
    for (let rangeMask = 0; rangeMask < 16; rangeMask += 1) {
      for (const affected of [[], [0]]) {
        const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[{ text: "a", strong: false }]])));
        const child = new FakeProjectionView("1", [[{ text: "b", strong: false }]]);
        const update = new FakeUpdateView({ baseRevision: "0", resultRevision: "1",
          impact: "textContainers", projection: child, affected });
        const reads = rangeKeys.map((key, index) => {
          const read = vi.fn(() => (rangeMask & (1 << index)) === 0 ? undefined : 0);
          Object.defineProperty(update, key, { get: read });
          return read;
        });
        const count = vi.fn(() => affected.length);
        Object.defineProperty(update, "affectedParagraphCount", { get: count });
        const take = vi.spyOn(update, "takeProjection");
        const accepted = rangeMask === 0 && affected.length > 0;
        const result = consumeSemanticProjectionUpdate(base, update);
        expect(result.ok, `ranges=${rangeMask}, affected=${affected.length}`).toBe(accepted);
        if (!result.ok) expect(result.error.code).toBe("projection.invalid_update");
        expect(count).toHaveBeenCalledOnce();
        for (const read of reads) expect(read).toHaveBeenCalledOnce();
        expect(take).toHaveBeenCalledTimes(accepted ? 1 : 0);
        expect(update.freeCalls).toBe(1);
        // An unconsumed child remains owned by the Rust update, not JS cleanup.
        expect(child.freeCalls).toBe(accepted ? 1 : 0);
      }
    }
  });

  it("rejects mismatched duplicate snapshots and still frees the update", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const resultView = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "wrong",
      resultRevision: "1",
      impact: "none",
      projection: resultView,
    });

    const result = consumeSemanticProjectionUpdate(base, updateView);
    expect(result.ok).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(0);
  });

  it("rejects an inconsistent root-splice shape", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const resultView = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "rootSplice",
      projection: resultView,
      oldRange: [0, 1],
    });

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(resultView.freeCalls).toBe(0);
  });

  it("rejects a protected nested projection without freeing its owner", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: protectedProjection,
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, [protectedProjection]).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("snapshots protected ownership before takeProjection can mutate its source list", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const protectedHandles: unknown[] = [protectedProjection];
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: undefined,
    });
    Object.assign(updateView, {
      takeProjection: () => {
        protectedHandles.splice(0, protectedHandles.length);
        return protectedProjection;
      },
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, protectedHandles).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(1);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("leaves the update caller-owned when protected ownership cannot be snapshotted", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: protectedProjection,
    });
    const protectedHandles = new Proxy([protectedProjection], {
      getOwnPropertyDescriptor(_target, property) {
        if (property === "0") throw new Error("hostile ownership list");
        return Reflect.getOwnPropertyDescriptor(_target, property);
      },
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, protectedHandles).ok,
    ).toBe(false);
    expect(updateView.freeCalls).toBe(0);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("never reads a hostile protected-list length before rejecting its ownership snapshot", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    const protectedProjection = new FakeProjectionView("1", [[]]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "root",
      projection: protectedProjection,
    });
    const lengthRead = vi.fn(() => {
      throw new Error("hostile length getter");
    });
    const protectedHandles = new Proxy([protectedProjection], {
      get(target, property, receiver) {
        if (property === "length") return lengthRead();
        return Reflect.get(target, property, receiver);
      },
      getOwnPropertyDescriptor(target, property) {
        if (property === "length") {
          throw new Error("hostile ownership descriptor");
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    expect(
      consumeSemanticProjectionUpdate(base, updateView, protectedHandles).ok,
    ).toBe(false);
    expect(lengthRead).not.toHaveBeenCalled();
    expect(updateView.freeCalls).toBe(0);
    expect(protectedProjection.freeCalls).toBe(0);
  });

  it("reads the affected-paragraph count exactly once", () => {
    const base = valueOf(
      consumeSemanticProjection(
        new FakeProjectionView("0", [[{ text: "a", strong: false }]]),
      ),
    );
    const resultView = new FakeProjectionView("1", [
      [{ text: "b", strong: false }],
    ]);
    const updateView = new FakeUpdateView({
      baseRevision: "0",
      resultRevision: "1",
      impact: "textContainers",
      projection: resultView,
      affected: [0],
    });
    const reads = vi.fn(() => 1);
    Object.defineProperty(updateView, "affectedParagraphCount", { get: reads });

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(true);
    expect(reads).toHaveBeenCalledOnce();
  });

  it("contains a rejected projection impostor even when it has no cleanup", async () => {
    const rejected = Promise.reject(new Error("projection rejection must be contained"));

    expect(
      consumeSemanticProjection(rejected as unknown as SemanticProjectionView).ok,
    ).toBe(false);
    await Promise.resolve();
  });

  it("frees a self-aliased update exactly once", () => {
    const base = valueOf(consumeSemanticProjection(new FakeProjectionView("0", [[]])));
    let updateView: SemanticProjectionUpdateView;
    const free = vi.fn();
    updateView = {
      baseLineage: "adapter-tests",
      baseRevision: "0",
      resultLineage: "adapter-tests",
      resultRevision: "1",
      impact: "root",
      affectedParagraphCount: 0,
      oldChildStart: undefined,
      oldChildEnd: undefined,
      newChildStart: undefined,
      newChildEnd: undefined,
      matchesProfileGeneration: (generation) =>
        generation === TEST_PROFILE_GENERATION,
      affectedParagraphIndex: () => undefined,
      takeProjection: () => updateView as unknown as SemanticProjectionView,
      free,
    };

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(false);
    expect(free).toHaveBeenCalledOnce();
  });
});

function propertyBudgetProjection(value: string): readonly FlatProperty[] {
  return [{
    name: "example/value",
    kind: "string",
    value,
  }];
}
