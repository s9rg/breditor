import { describe, expect, it, vi } from "vitest";

import {
  BaseDocumentProjection,
  type BrowserProjectionResult,
  type BrowserSelectionResult,
  consumeSemanticSelection,
  semanticRangeSelectionScalars,
  type SemanticSelectionView,
} from "./index.js";

function projection() {
  return projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "wasm-selection", revision: "8" },
      paragraphs: [
        {
          runs: [
            { text: "A😀", strong: false },
            { text: "bold", strong: true },
          ],
        },
        { runs: [] },
      ],
    }),
  );
}

function projectionValue<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.value;
}

function selectionValue<T>(result: BrowserSelectionResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error.code);
  }
  return result.value;
}

function rangeView(
  free: () => void,
  overrides: Partial<Omit<SemanticSelectionView, "free">> = {},
): SemanticSelectionView {
  return {
    snapshotLineage: "wasm-selection",
    snapshotRevision: "8",
    kind: "range",
    anchorPointKind: "text",
    anchorNodeIndex: 3,
    anchorOffset: 4,
    anchorAffinity: "before",
    focusPointKind: "children",
    focusNodeIndex: 1,
    focusOffset: 0,
    focusAffinity: "after",
    rangeOrder: "backward",
    ...overrides,
    free,
  };
}

function noneView(free: () => void): SemanticSelectionView {
  return {
    snapshotLineage: "wasm-selection",
    snapshotRevision: "8",
    kind: "none",
    anchorPointKind: undefined,
    anchorNodeIndex: undefined,
    anchorOffset: undefined,
    anchorAffinity: undefined,
    focusPointKind: undefined,
    focusNodeIndex: undefined,
    focusOffset: undefined,
    focusAffinity: undefined,
    rangeOrder: undefined,
    free,
  };
}

describe("Wasm selection adapter", () => {
  it("consumes one exact directional range and frees its view", () => {
    let freeCount = 0;
    const selection = selectionValue(
      consumeSemanticSelection(
        projection(),
        rangeView(() => {
          freeCount += 1;
        }),
      ),
    );

    expect(freeCount).toBe(1);
    expect(selection?.order).toBe("backward");
    expect(selection?.anchor).toEqual({
      kind: "text",
      textPath: [0, 1],
      utf16Offset: 4,
      affinity: "before",
    });
    expect(selection?.focus).toEqual({
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    });
  });

  it("uses the selection cleanup captured before thenable inspection", () => {
    const originalFree = vi.fn();
    const replacementFree = vi.fn();
    const view = rangeView(originalFree);
    Object.defineProperty(view, "then", {
      get() {
        Object.assign(view, { free: replacementFree });
        return undefined;
      },
    });

    expect(consumeSemanticSelection(projection(), view).ok).toBe(true);
    expect(originalFree).toHaveBeenCalledOnce();
    expect(replacementFree).not.toHaveBeenCalled();
  });

  it("contains a rejected selection impostor even when it has no cleanup", async () => {
    const rejected = Promise.reject(new Error("selection rejection must be contained"));

    expect(
      consumeSemanticSelection(
        projection(),
        rejected as unknown as SemanticSelectionView,
      ).ok,
    ).toBe(false);
    await Promise.resolve();
  });

  it("keeps explicit semantic absence distinct and rejects populated none fields", () => {
    let freeCount = 0;
    const absent = consumeSemanticSelection(
      projection(),
      noneView(() => {
        freeCount += 1;
      }),
    );
    expect(absent).toEqual({ ok: true, value: null });
    expect(freeCount).toBe(1);

    const malformed = noneView(() => {
      freeCount += 1;
    });
    Object.defineProperty(malformed, "anchorOffset", { value: 0 });
    const rejected = consumeSemanticSelection(projection(), malformed);
    expect(rejected.ok).toBe(false);
    expect(freeCount).toBe(2);
  });

  it("checks snapshot, node kind/index, offset boundary, and duplicated order", () => {
    const cases: SemanticSelectionView[] = [
      rangeView(() => {}, { snapshotRevision: "9" }),
      rangeView(() => {}, { anchorPointKind: "text", anchorNodeIndex: 1 }),
      rangeView(() => {}, { anchorPointKind: "children", anchorNodeIndex: 3 }),
      rangeView(() => {}, { anchorNodeIndex: 99 }),
      rangeView(() => {}, { anchorNodeIndex: 2, anchorOffset: 2 }),
      rangeView(() => {}, { rangeOrder: "forward" }),
    ];

    expect(consumeSemanticSelection(projection(), cases[0] as SemanticSelectionView)).toMatchObject({
      ok: false,
      error: { code: "selection.snapshot_mismatch" },
    });
    for (const view of cases.slice(1)) {
      expect(consumeSemanticSelection(projection(), view)).toMatchObject({
        ok: false,
        error: { code: "selection.invalid_wasm_view" },
      });
    }
  });

  it("rejects JavaScript numeric coercions before values can cross back to Wasm", () => {
    const view = rangeView(() => {}) as unknown as Record<string, unknown>;
    view["anchorNodeIndex"] = "3";
    expect(
      consumeSemanticSelection(projection(), view as unknown as SemanticSelectionView),
    ).toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
  });

  it("frees on getter failure and lets a free failure fail closed", () => {
    let freeCount = 0;
    const getterFailure = rangeView(() => {
      freeCount += 1;
    });
    Object.defineProperty(getterFailure, "kind", {
      get: () => {
        throw new Error("getter failed");
      },
    });
    expect(consumeSemanticSelection(projection(), getterFailure).ok).toBe(false);
    expect(freeCount).toBe(1);

    const freeFailure = rangeView(() => {
      throw new Error("free failed");
    });
    expect(consumeSemanticSelection(projection(), freeFailure)).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_wasm_view" },
    });
  });

  it("rejects a forged projection even for semantic absence and still frees", () => {
    let freed = false;
    const forged = {
      snapshot: { lineage: "wasm-selection", revision: "8" },
      paragraphs: [],
    } as unknown as ReturnType<typeof projection>;
    const result = consumeSemanticSelection(
      forged,
      noneView(() => {
        freed = true;
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_wasm_view" },
    });
    expect(freed).toBe(true);
  });

  it("converts paths back to exact preorder scalar command fields", () => {
    const documentProjection = projection();
    const selection = selectionValue(
      consumeSemanticSelection(documentProjection, rangeView(() => {})),
    );
    if (selection === null) {
      throw new Error("expected range");
    }

    expect(selectionValue(semanticRangeSelectionScalars(selection))).toEqual({
      anchorPointKind: "text",
      anchorNodeIndex: 3,
      anchorOffset: 4,
      anchorAffinity: "before",
      focusPointKind: "children",
      focusNodeIndex: 1,
      focusOffset: 0,
      focusAffinity: "after",
    });
  });
});
