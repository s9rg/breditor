import { beforeEach, describe, expect, it } from "vitest";

import {
  BreditorDomRenderer,
  type ProjectionRenderOutcome,
  type RenderedProjection,
} from "./dom_renderer.js";
import {
  BaseDocumentProjection,
  type BaseDocumentProjection as BaseDocumentProjectionValue,
} from "./projection.js";
import type { BrowserProjectionResult } from "./result.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import {
  BaseTargetRange,
  baseTargetRangesEqual,
  isOwnedBaseTargetRange,
} from "./target_range.js";

function projection(revision: number): BaseDocumentProjectionValue {
  return projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "target-range", revision: String(revision) },
      paragraphs: [
        { runs: [{ text: "A😀", strong: false }] },
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

function render(
  renderer: BreditorDomRenderer,
  host: HTMLElement,
  documentProjection: BaseDocumentProjectionValue,
): ProjectionRenderOutcome {
  return projectionValue(renderer.render(host, documentProjection));
}

function target(
  rendered: RenderedProjection,
  startOffset = 0,
  endOffset = 3,
  startAffinity: "before" | "after" = "after",
  endAffinity: "before" | "after" = "before",
): BaseTargetRange {
  return selectionValue(
    BaseTargetRange.create(rendered, {
      kind: "range",
      start: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: startOffset,
        affinity: startAffinity,
      },
      end: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: endOffset,
        affinity: endAffinity,
      },
    }),
  );
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("BaseTargetRange", () => {
  it("owns an ordered immutable range bound to exact projection and render identity", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const documentProjection = projection(0);
    const { rendered } = render(new BreditorDomRenderer(), host, documentProjection);
    const range = target(rendered);

    expect(range.projection).toBe(documentProjection);
    expect(range.rendered).toBe(rendered);
    expect(range.rendererGeneration).toBe(rendered.rendererGeneration);
    expect(range.start).toEqual({
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 0,
      affinity: "after",
    });
    expect(range.end).toEqual({
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 3,
      affinity: "before",
    });
    expect(Object.isFrozen(range)).toBe(true);
    expect(Object.isFrozen(range.start)).toBe(true);
    expect(isOwnedBaseTargetRange(range)).toBe(true);
    expect(isOwnedBaseTargetRange({ ...range })).toBe(false);
  });

  it("compares semantic endpoints only under the same exact render generation", () => {
    const documentProjection = projection(0);
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    const first = render(new BreditorDomRenderer(), firstHost, documentProjection).rendered;
    const second = render(new BreditorDomRenderer(), secondHost, documentProjection).rendered;
    const left = target(first);
    const equal = target(first);
    const affinityDiffers = target(first, 0, 3, "before", "before");
    const otherRender = target(second);

    expect(left).not.toBe(equal);
    expect(baseTargetRangesEqual(left, equal)).toBe(true);
    expect(baseTargetRangesEqual(left, affinityDiffers)).toBe(false);
    expect(baseTargetRangesEqual(left, otherRender)).toBe(false);
    expect(
      baseTargetRangesEqual(left, { ...left } as unknown as BaseTargetRange),
    ).toBe(false);
  });

  it("snapshots outer data descriptors without invoking proxy property reads", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(new BreditorDomRenderer(), host, projection(0)).rendered;
    const point = {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 0,
      affinity: "after",
    } as const;
    const input = new Proxy(
      { kind: "range", start: point, end: point },
      {
        get: () => {
          throw new Error("outer properties must not be re-read");
        },
      },
    );

    const range = selectionValue(BaseTargetRange.create(rendered, input));
    expect(range.start).toEqual(point);
    expect(range.end).toEqual(point);
  });

  it("rejects reversed, malformed, and non-scalar semantic boundaries", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const rendered = render(new BreditorDomRenderer(), host, projection(0)).rendered;

    expect(
      BaseTargetRange.create(rendered, {
        kind: "range",
        start: {
          kind: "children",
          parentPath: [1],
          childIndex: 0,
          affinity: "after",
        },
        end: {
          kind: "children",
          parentPath: [0],
          childIndex: 0,
          affinity: "after",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "selection.invalid_shape" } });
    expect(BaseTargetRange.create(rendered, { kind: "range" })).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_shape" },
    });
    expect(
      BaseTargetRange.create(rendered, {
        kind: "range",
        start: {
          kind: "text",
          textPath: [0, 0],
          utf16Offset: 2,
          affinity: "after",
        },
        end: {
          kind: "text",
          textPath: [0, 0],
          utf16Offset: 3,
          affinity: "before",
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_utf16_boundary" },
    });
  });

  it("fails closed for DOM drift and stale or forged renderer handles", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const documentProjection = projection(0);
    const renderer = new BreditorDomRenderer();
    const first = render(renderer, host, documentProjection).rendered;
    render(renderer, host, documentProjection);
    expect(BaseTargetRange.create(first, {})).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });

    const driftHost = document.createElement("div");
    document.body.append(driftHost);
    const drifted = render(new BreditorDomRenderer(), driftHost, documentProjection).rendered;
    driftHost.firstElementChild?.setAttribute("class", "foreign");
    expect(BaseTargetRange.create(drifted, {})).toMatchObject({
      ok: false,
      error: { code: "selection.dom_drift" },
    });

    const forged = {
      current: true,
      host,
      projection: documentProjection,
      rendererGeneration: 1n,
      validateCanonicalDom: () => true,
      nodeForAstPath: () => host,
      astPathForDomNode: () => [],
    } as unknown as RenderedProjection;
    expect(BaseTargetRange.create(forged, {})).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });
  });
});
