import { describe, expect, it, vi } from "vitest";

import {
  type BrowserProjectionResult,
  type SemanticProjectionImpact,
  type SemanticProjectionUpdateView,
  type SemanticProjectionView,
  consumeSemanticProjection,
  consumeSemanticProjectionUpdate,
} from "./index.js";

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
}

function valueOf<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

describe("Wasm semantic projection adapter", () => {
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
      affectedParagraphIndex: () => undefined,
      takeProjection: () => updateView as unknown as SemanticProjectionView,
      free,
    };

    expect(consumeSemanticProjectionUpdate(base, updateView).ok).toBe(false);
    expect(free).toHaveBeenCalledOnce();
  });
});
