import { describe, expect, it, vi } from "vitest";

import {
  BaseDocumentProjection,
  type BrowserProjectionResult,
  type BrowserSelectionResult,
  consumeSemanticSelection as consumeSemanticSelectionRaw,
  semanticRangeSelectionScalars,
  type SemanticSelectionView,
  type WasmProfileGenerationView,
} from "./advanced.js";
import { associateProjectionWithProfileGeneration } from "./wasm_projection_adapter.js";
import { consumeSemanticSelectionWithCleanup } from "./wasm_selection_adapter.js";

const TEST_PROFILE_GENERATION: WasmProfileGenerationView = {
  matches(other) {
    return other === TEST_PROFILE_GENERATION;
  },
  free: vi.fn(),
};

const SELECTION_SNAPSHOT_FIELDS = [
  "snapshotLineage", "snapshotRevision", "kind",
  "anchorPointKind", "anchorNodeIndex", "anchorOffset", "anchorAffinity",
  "focusPointKind", "focusNodeIndex", "focusOffset", "focusAffinity", "rangeOrder",
] as const;

function projection(generation: WasmProfileGenerationView = TEST_PROFILE_GENERATION) {
  const value = projectionValue(
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
  associateProjectionWithProfileGeneration(value, generation);
  return value;
}

function consumeSemanticSelection(
  documentProjection: BaseDocumentProjection,
  view: SemanticSelectionView,
) {
  return consumeSemanticSelectionRaw(
    documentProjection,
    view,
    TEST_PROFILE_GENERATION,
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
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
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
    matchesProfileGeneration: (generation) =>
      generation === TEST_PROFILE_GENERATION,
    free,
  };
}

describe("Wasm selection adapter", () => {
  it.each(["cleanup getter", "then getter", "scalar getter", "cleanup"])(
    "rejects same-view reentry during %s without transferring ownership twice", (phase) => {
      const documentProjection = projection();
      let nested: BrowserSelectionResult<unknown> | undefined;
      let entered = false;
      const reenter = () => {
        if (entered) return;
        entered = true;
        nested = consumeSemanticSelection(documentProjection, view);
      };
      const free = vi.fn(() => { if (phase === "cleanup") reenter(); });
      const view = rangeView(free);
      if (phase === "cleanup getter") Object.defineProperty(view, "free", { get() { reenter(); return free; } });
      if (phase === "then getter") Object.defineProperty(view, "then", { get() { reenter(); return undefined; } });
      if (phase === "scalar getter") Object.defineProperty(view, "rangeOrder", { get() { reenter(); return "backward"; } });
      expect(consumeSemanticSelection(documentProjection, view).ok).toBe(true);
      expect(nested).toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
      expect(free).toHaveBeenCalledOnce();
    },
  );

  it.each(["public", "captured"])("shares the reentry guard with a nested %s consumer", (nestedEntry) => {
    const documentProjection = projection();
    let nested: BrowserSelectionResult<unknown> | undefined;
    let entered = false;
    const free = vi.fn();
    const view = rangeView(free);
    Object.defineProperty(view, "rangeOrder", { get() {
      if (!entered) {
        entered = true;
        nested = nestedEntry === "public"
          ? consumeSemanticSelection(documentProjection, view)
          : consumeSemanticSelectionWithCleanup(documentProjection, view, free, TEST_PROFILE_GENERATION);
      }
      return "backward";
    } });
    expect(consumeSemanticSelectionWithCleanup(documentProjection, view, free, TEST_PROFILE_GENERATION).ok).toBe(true);
    expect(nested).toMatchObject({ ok: false });
    expect(free).toHaveBeenCalledOnce();
  });

  it("does not inspect a nested thenable or invoke nested captured cleanup", () => {
    const documentProjection = projection();
    const nestedCleanup = vi.fn();
    const thenRead = vi.fn(() => undefined);
    let nested: BrowserSelectionResult<unknown> | undefined;
    const free = vi.fn(() => {
      Object.defineProperty(view, "then", { get: thenRead });
      nested = consumeSemanticSelectionWithCleanup(documentProjection, view, nestedCleanup, TEST_PROFILE_GENERATION);
    });
    const view = rangeView(free);
    expect(consumeSemanticSelection(documentProjection, view).ok).toBe(true);
    expect(nested).toMatchObject({ ok: false });
    expect(thenRead).not.toHaveBeenCalled();
    expect(nestedCleanup).not.toHaveBeenCalled();
    expect(free).toHaveBeenCalledOnce();
  });

  it("permits nested consumption of a distinct selection view", () => {
    const documentProjection = projection();
    const nestedFree = vi.fn();
    const other = noneView(nestedFree);
    const free = vi.fn();
    const view = rangeView(free);
    let nested: BrowserSelectionResult<unknown> | undefined;
    Object.defineProperty(view, "rangeOrder", { get() {
      nested = consumeSemanticSelection(documentProjection, other);
      return "backward";
    } });
    expect(consumeSemanticSelection(documentProjection, view).ok).toBe(true);
    expect(nested).toEqual({ ok: true, value: null });
    expect(nestedFree).toHaveBeenCalledOnce();
    expect(free).toHaveBeenCalledOnce();
  });

  it("releases the active claim after a throwing getter rejects a fake view", () => {
    const documentProjection = projection();
    const free = vi.fn();
    const view = rangeView(free);
    Object.defineProperty(view, "rangeOrder", { configurable: true, get() { throw new Error("bad field"); } });
    expect(consumeSemanticSelection(documentProjection, view).ok).toBe(false);
    // The fake destructor does not retire this fixture. This only proves the
    // in-progress claim is removed; real freed Wasm handles remain invalid.
    Object.defineProperty(view, "rangeOrder", { value: "backward" });
    expect(consumeSemanticSelection(documentProjection, view).ok).toBe(true);
    expect(free).toHaveBeenCalledTimes(2);
  });

  it.each(["read", "cleanup"])("rejects a generation invalidated during %s", (phase) => {
    let live = true;
    const generation: WasmProfileGenerationView = {
      matches(other) { return live && other === generation; },
      free: vi.fn(),
    };
    const documentProjection = projection(generation);
    const free = vi.fn(() => { if (phase === "cleanup") live = false; });
    const view = rangeView(free, { matchesProfileGeneration: (other) => other === generation });
    if (phase === "read") {
      Object.defineProperty(view, "rangeOrder", { get() { live = false; return "backward"; } });
    }
    expect(consumeSemanticSelectionRaw(documentProjection, view, generation))
      .toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
    expect(free).toHaveBeenCalledOnce();
    expect(generation.free).not.toHaveBeenCalled();
  });

  it("reads inherited generated getters once with the original view as receiver", () => {
    const free = vi.fn();
    const values = rangeView(free);
    const fields: string[] = [];
    const prototype = Object.create(null) as object;
    for (const field of SELECTION_SNAPSHOT_FIELDS) {
      Object.defineProperty(prototype, field, {
        get(this: unknown) {
          expect(this).toBe(view);
          fields.push(field);
          return values[field];
        },
      });
    }
    const view = Object.assign(Object.create(prototype), {
      matchesProfileGeneration: values.matchesProfileGeneration,
      free,
    }) as SemanticSelectionView;

    expect(consumeSemanticSelection(projection(), view).ok).toBe(true);
    expect(fields).toEqual(SELECTION_SNAPSHOT_FIELDS);
    expect(free).toHaveBeenCalledOnce();
  });

  it("rejects a selection from another profile generation", () => {
    const foreignGeneration: WasmProfileGenerationView = {
      matches(other) { return other === foreignGeneration; },
      free: vi.fn(),
    };
    const free = vi.fn();

    expect(
      consumeSemanticSelectionRaw(projection(), noneView(free), foreignGeneration).ok,
    ).toBe(false);
    expect(free).toHaveBeenCalledOnce();
  });

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

  it("rejects every invalid numeric endpoint without coercion and frees exactly once", () => {
    const coerce = vi.fn(() => { throw new Error("must not coerce a selection coordinate"); });
    const invalid: readonly unknown[] = [
      undefined, null, false, true, "0", "2", 0n, Symbol("coordinate"),
      NaN, Infinity, -Infinity, -1, -4_294_967_296, -0.5, Number.MIN_VALUE,
      0.5, 4_294_967_295.5, 4_294_967_296, 4_294_967_298, Number.MAX_SAFE_INTEGER,
      new Number(0), {}, [], () => 0, { [Symbol.toPrimitive]: coerce },
    ];
    const documentProjection = projection();
    for (const field of ["anchorNodeIndex", "anchorOffset", "focusNodeIndex", "focusOffset"] as const) {
      for (const value of invalid) {
        const free = vi.fn();
        const view = rangeView(free) as unknown as Record<string, unknown>;
        view[field] = value;
        expect(consumeSemanticSelection(documentProjection, view as unknown as SemanticSelectionView))
          .toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
        expect(free).toHaveBeenCalledOnce();
      }
    }
    expect(coerce).not.toHaveBeenCalled();
  });

  it.each([0, -0])("admits zero offset %s without confusing it with absence", (offset) => {
    const free = vi.fn();
    const consumed = selectionValue(consumeSemanticSelection(projection(), rangeView(free, {
      anchorNodeIndex: 2, anchorOffset: offset,
      focusPointKind: "text", focusNodeIndex: 2, focusOffset: 3,
      rangeOrder: "forward",
    })));
    expect(consumed).not.toBeNull();
    expect(consumed?.order).toBe("forward");
    expect(free).toHaveBeenCalledOnce();
  });

  it("does not wrap valid u32 coordinates into the projection", () => {
    for (const field of ["anchorNodeIndex", "anchorOffset", "focusNodeIndex", "focusOffset"] as const) {
      for (const value of [2_147_483_648, 4_294_967_295]) {
        const free = vi.fn();
        expect(consumeSemanticSelection(projection(), rangeView(free, { [field]: value })))
          .toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
        expect(free).toHaveBeenCalledOnce();
      }
    }
  });

  it("rejects malformed point kinds and affinities without coercion", () => {
    const coerce = vi.fn(() => { throw new Error("must not coerce an endpoint enum"); });
    const invalid: readonly unknown[] = [
      undefined, null, false, 0, NaN, "", "other", Symbol("endpoint"),
      new String("text"), new String("before"), { [Symbol.toPrimitive]: coerce },
    ];
    for (const field of ["anchorPointKind", "focusPointKind", "anchorAffinity", "focusAffinity"] as const) {
      for (const value of invalid) {
        const free = vi.fn();
        const view = rangeView(free) as unknown as Record<string, unknown>;
        view[field] = value;
        expect(consumeSemanticSelection(projection(), view as unknown as SemanticSelectionView))
          .toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
        expect(free).toHaveBeenCalledOnce();
      }
    }
    expect(coerce).not.toHaveBeenCalled();
  });

  it("admits only actual typed nodes and scalar-safe offsets through canonical validation", () => {
    // The root is not an exposed paragraph/text endpoint; each admitted node
    // has an exact preorder index, type, and UTF-16/child-boundary extent.
    const endpoints = [
      { kind: "children", index: 1, maximum: 2, invalidOffset: 3 },
      { kind: "text", index: 2, maximum: 3, invalidOffset: 2 },
      { kind: "text", index: 3, maximum: 4, invalidOffset: 5 },
      { kind: "children", index: 4, maximum: 0, invalidOffset: 1 },
    ] as const;
    for (const endpoint of endpoints) {
      for (const offset of [0, endpoint.maximum, endpoint.invalidOffset]) {
        const free = vi.fn();
        const result = consumeSemanticSelection(projection(), rangeView(free, {
          anchorPointKind: endpoint.kind, anchorNodeIndex: endpoint.index,
          anchorOffset: offset, anchorAffinity: "before",
          focusPointKind: endpoint.kind, focusNodeIndex: endpoint.index,
          focusOffset: offset, focusAffinity: "after", rangeOrder: "collapsed",
        }));
        expect(result.ok).toBe(offset !== endpoint.invalidOffset);
        expect(free).toHaveBeenCalledOnce();
      }
    }
    for (const anchorNodeIndex of [0, -0, 1.5, 4.5, 5, 100_001]) {
      const free = vi.fn();
      expect(consumeSemanticSelection(projection(), rangeView(free, { anchorNodeIndex })))
        .toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
      expect(free).toHaveBeenCalledOnce();
    }
  });

  it.each(["none", "range", "invalid"] as const)("reads each %s snapshot field once before freeing", (kind) => {
    const reads: string[] = [];
    const free = vi.fn(() => { reads.push("free"); });
    const values = kind === "none" ? noneView(free)
      : rangeView(free, kind === "invalid" ? { anchorOffset: NaN } : {});
    const view = { ...values };
    for (const field of SELECTION_SNAPSHOT_FIELDS) {
      Object.defineProperty(view, field, {
        get() {
          if (reads.includes(field)) throw new Error(`field reread: ${field}`);
          reads.push(field);
          return values[field];
        },
      });
    }
    const result = consumeSemanticSelection(projection(), view);
    expect(result.ok).toBe(kind !== "invalid");
    expect(reads).toEqual([...SELECTION_SNAPSHOT_FIELDS, "free"]);
    expect(free).toHaveBeenCalledOnce();
  });

  it.each(SELECTION_SNAPSHOT_FIELDS)("stops at a throwing %s getter and frees once", (throwingField) => {
    const reads: string[] = [];
    const free = vi.fn(() => { reads.push("free"); });
    const values = rangeView(free);
    const view = { ...values };
    for (const field of SELECTION_SNAPSHOT_FIELDS) {
      Object.defineProperty(view, field, {
        get() {
          reads.push(field);
          if (field === throwingField) throw new Error("unavailable snapshot field");
          return values[field];
        },
      });
    }
    expect(consumeSemanticSelection(projection(), view))
      .toMatchObject({ ok: false, error: { code: "selection.invalid_wasm_view" } });
    expect(reads).toEqual([
      ...SELECTION_SNAPSHOT_FIELDS.slice(0, SELECTION_SNAPSHOT_FIELDS.indexOf(throwingField) + 1),
      "free",
    ]);
    expect(free).toHaveBeenCalledOnce();
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
