import { describe, expect, it, vi } from "vitest";

import {
  type BrowserProjectionResult,
  type SemanticProjectionImpact,
  type SemanticProjectionUpdateView,
  type SemanticProjectionView,
  consumeSemanticProjection as consumeSemanticProjectionRaw,
  consumeSemanticProjectionUpdate as consumeSemanticProjectionUpdateRaw,
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

type FlatNode =
  | { readonly kind: "element"; readonly elementType: string; readonly children: readonly number[] }
  | {
      readonly kind: "text";
      readonly text: string;
      readonly formats: readonly string[];
    };

class FakeProjectionView implements SemanticProjectionView {
  readonly schemaName = "breditor/base";
  readonly schemaVersion = 1;
  readonly schemaFingerprint = TEST_SCHEMA_FINGERPRINT;
  readonly snapshotLineage = "adapter-tests";
  readonly snapshotRevision: string;
  readonly rootIndex = 0;
  readonly nodes: readonly FlatNode[];
  freeCalls = 0;

  constructor(revision: string, paragraphs: readonly (readonly Readonly<{ text: string; strong: boolean }>[])[]) {
    this.snapshotRevision = revision;
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
          formats: run.strong ? ["breditor/strong"] : [],
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
    return node?.kind === "text" ? node.formats[ordinal] : undefined;
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

describe("Wasm semantic projection adapter", () => {
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

  it("consumes an exact flattened preorder view without parsing JSON", () => {
    const view = new FakeProjectionView("0", [
      [{ text: "plain", strong: false }, { text: "strong", strong: true }],
      [],
    ]);

    const projection = valueOf(consumeSemanticProjection(view));
    expect(view.freeCalls).toBe(1);
    expect(projection.snapshot).toEqual({ lineage: "adapter-tests", revision: "0" });
    expect(projection.paragraphs).toEqual([
      { runs: [{ text: "plain", strong: false }, { text: "strong", strong: true }] },
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
    expect(update.result.paragraphs[0]?.runs[0]).toEqual({ text: "LEFT", strong: true });
    expect(resultView.freeCalls).toBe(1);
    expect(updateView.freeCalls).toBe(1);
    expect(updateView.takeProjection()).toBeUndefined();
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
