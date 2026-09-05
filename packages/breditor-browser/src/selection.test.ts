import { describe, expect, it } from "vitest";

import {
  BaseDocumentProjection,
  BaseRangeSelection,
  type BrowserProjectionResult,
  type BrowserSelectionResult,
} from "./index.js";

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
