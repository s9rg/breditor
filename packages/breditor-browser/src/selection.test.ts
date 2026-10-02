import { describe, expect, it, vi } from "vitest";
import { isUnicodeScalarBoundary } from "./selection.js";

import {
  BaseDocumentProjection,
  BaseRangeSelection,
  type BrowserProjectionResult,
  type BrowserSelectionResult,
} from "./advanced.js";

function projection() {
  return projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "selection-values", revision: "7" },
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

describe("BaseRangeSelection", () => {
  it("rejects malformed numeric paths and offsets without coercion at either endpoint", () => {
    const coerce = vi.fn(() => { throw new Error("must not coerce a selection scalar"); });
    const invalid: readonly unknown[] = [
      undefined, null, false, true, "0", "1", 0n, Symbol("coordinate"),
      NaN, Infinity, -Infinity, -1, -0.5, Number.MIN_VALUE, 0.5,
      4_294_967_295.5, 4_294_967_296, Number.MAX_SAFE_INTEGER,
      new Number(0), {}, [], () => 0, { [Symbol.toPrimitive]: coerce },
    ];
    const documentProjection = projection();
    const valid = { kind: "children", parentPath: [0], childIndex: 0, affinity: "after" };
    for (const value of invalid) {
      const malformed = [
        { kind: "text", textPath: [value, 0], utf16Offset: 0, affinity: "before" },
        { kind: "text", textPath: [0, value], utf16Offset: 0, affinity: "before" },
        { kind: "text", textPath: [0, 0], utf16Offset: value, affinity: "before" },
        { kind: "children", parentPath: [value], childIndex: 0, affinity: "before" },
        { kind: "children", parentPath: [0], childIndex: value, affinity: "before" },
      ];
      for (const point of malformed) {
        for (const endpoint of ["anchor", "focus"] as const) {
          expect(BaseRangeSelection.create(documentProjection, {
            kind: "range", anchor: valid, focus: valid, [endpoint]: point,
          }).ok).toBe(false);
        }
      }
    }
    expect(coerce).not.toHaveBeenCalled();
  });

  it.each([0, -0])("admits zero paths and offsets %s without losing presence", (zero) => {
    const result = BaseRangeSelection.create(projection(), {
      kind: "range",
      anchor: { kind: "text", textPath: [zero, zero], utf16Offset: zero, affinity: "before" },
      focus: { kind: "children", parentPath: [zero], childIndex: zero, affinity: "after" },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.order).toBe("collapsed");
  });
  it("owns deeply immutable endpoints and preserves directional anchor/focus", () => {
    const documentProjection = projection();
    const anchorPath = [0, 1];
    const focusPath = [0];
    const selection = selectionValue(
      BaseRangeSelection.create(documentProjection, {
        kind: "range",
        anchor: {
          kind: "text",
          textPath: anchorPath,
          utf16Offset: 4,
          affinity: "before",
        },
        focus: {
          kind: "children",
          parentPath: focusPath,
          childIndex: 0,
          affinity: "after",
        },
      }),
    );

    anchorPath[0] = 1;
    focusPath[0] = 1;
    expect(selection.order).toBe("backward");
    expect(selection.anchor).toEqual({
      kind: "text",
      textPath: [0, 1],
      utf16Offset: 4,
      affinity: "before",
    });
    expect(selection.focus).toEqual({
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    });
    expect(Object.isFrozen(selection)).toBe(true);
    expect(Object.isFrozen(selection.anchor)).toBe(true);
    expect(
      Object.isFrozen(selection.anchor.kind === "text" ? selection.anchor.textPath : []),
    ).toBe(true);
  });

  it("treats text/children aliases at one run seam as spatially collapsed", () => {
    const documentProjection = projection();
    const selection = selectionValue(
      BaseRangeSelection.create(documentProjection, {
        kind: "range",
        anchor: {
          kind: "text",
          textPath: [0, 0],
          utf16Offset: 3,
          affinity: "before",
        },
        focus: {
          kind: "children",
          parentPath: [0],
          childIndex: 1,
          affinity: "after",
        },
      }),
    );

    expect(selection.order).toBe("collapsed");
    expect(selection.anchor.kind).toBe("text");
    expect(selection.focus.kind).toBe("children");
  });

  it("accepts both affinities and the empty paragraph child boundary", () => {
    const documentProjection = projection();
    const selection = BaseRangeSelection.create(documentProjection, {
      kind: "range",
      anchor: {
        kind: "children",
        parentPath: [1],
        childIndex: 0,
        affinity: "before",
      },
      focus: {
        kind: "children",
        parentPath: [1],
        childIndex: 0,
        affinity: "after",
      },
    });

    expect(selection.ok).toBe(true);
    if (selection.ok) {
      expect(selection.value.order).toBe("collapsed");
    }
  });

  it("rejects root/wrong-kind/out-of-range points and malformed exact records", () => {
    const documentProjection = projection();
    const validFocus = {
      kind: "text" as const,
      textPath: [0, 0],
      utf16Offset: 0,
      affinity: "after" as const,
    };
    const cases: unknown[] = [
      {
        kind: "range",
        anchor: { kind: "children", parentPath: [], childIndex: 0, affinity: "after" },
        focus: validFocus,
      },
      {
        kind: "range",
        anchor: { kind: "text", textPath: [1, 0], utf16Offset: 0, affinity: "after" },
        focus: validFocus,
      },
      {
        kind: "range",
        anchor: { kind: "children", parentPath: [0], childIndex: 3, affinity: "after" },
        focus: validFocus,
      },
      {
        kind: "range",
        anchor: { ...validFocus, extra: true },
        focus: validFocus,
      },
      { kind: "range", anchor: validFocus, focus: validFocus, extra: true },
    ];
    for (const input of cases) {
      expect(BaseRangeSelection.create(documentProjection, input).ok).toBe(false);
    }

    const accessor = Object.defineProperty({}, "kind", {
      enumerable: true,
      get: () => "text",
    });
    expect(
      BaseRangeSelection.create(documentProjection, {
        kind: "range",
        anchor: accessor,
        focus: validFocus,
      }).ok,
    ).toBe(false);
  });

  it("uses UTF-16 offsets but rejects a surrogate-pair midpoint", () => {
    const documentProjection = projection();
    const atScalarEnd = BaseRangeSelection.create(documentProjection, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "after",
      },
    });
    expect(atScalarEnd.ok).toBe(true);

    const split = BaseRangeSelection.create(documentProjection, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 2,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "after",
      },
    });
    expect(split.ok).toBe(false);
    if (!split.ok) {
      expect(split.error.code).toBe("selection.invalid_utf16_boundary");
    }
  });
});

describe("Unicode scalar boundary admission", () => {
  it("rejects malformed offsets without coercion and preserves scalar boundaries", () => {
    const coerce = vi.fn(() => { throw new Error("must not coerce an offset"); });
    for (const offset of [
      undefined, null, false, true, "0", 0n, Symbol("offset"), NaN, Infinity,
      -Infinity, -1, -0.5, Number.MIN_VALUE, 0.5, 5, 4_294_967_295,
      4_294_967_296, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1,
      new Number(0), { [Symbol.toPrimitive]: coerce },
    ]) {
      expect(isUnicodeScalarBoundary("A😀Z", offset as number)).toBe(false);
    }
    for (const offset of [0, -0, 1, 3, 4]) {
      expect(isUnicodeScalarBoundary("A😀Z", offset)).toBe(true);
    }
    expect(isUnicodeScalarBoundary("A😀Z", 2)).toBe(false);
    expect(isUnicodeScalarBoundary("", 0)).toBe(true);
    expect(isUnicodeScalarBoundary("", -0)).toBe(true);
    expect(coerce).not.toHaveBeenCalled();
  });
});
