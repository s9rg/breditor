import { beforeEach, describe, expect, it } from "vitest";

import {
  BreditorDomRenderer,
  type ProjectionRenderOutcome,
  type RenderedProjection,
} from "./dom_renderer.js";
import { mapDomTargetRange } from "./dom_target_range.js";
import {
  BaseDocumentProjection,
  type BaseDocumentProjection as BaseDocumentProjectionValue,
} from "./projection.js";
import type { BrowserProjectionResult } from "./result.js";
import type { BrowserSelectionResult } from "./selection_result.js";
import type { BaseTargetRange } from "./target_range.js";

type Run = Readonly<{ text: string; strong: boolean }>;

function projection(
  revision = 0,
  paragraphs: readonly (readonly Run[])[] = [
    [
      { text: "A😀", strong: false },
      { text: "bold", strong: true },
    ],
    [],
  ],
): BaseDocumentProjectionValue {
  return projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "dom-target-range", revision: String(revision) },
      paragraphs: paragraphs.map((runs) => ({ runs })),
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
  documentProjection = projection(),
): ProjectionRenderOutcome {
  return projectionValue(renderer.render(host, documentProjection));
}

function staticRange(
  startContainer: Node,
  startOffset: number,
  endContainer: Node,
  endOffset: number,
): StaticRange {
  return new StaticRange({ startContainer, startOffset, endContainer, endOffset });
}

function mapped(rendered: RenderedProjection, range: AbstractRange): BaseTargetRange {
  return selectionValue(mapDomTargetRange(rendered, range));
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("mapDomTargetRange", () => {
  it("maps plain text and strong-wrapper edges into ordered semantic endpoints", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { rendered } = render(new BreditorDomRenderer(), host);
    const plain = host.firstChild?.firstChild;
    const strong = host.querySelector("strong");
    if (plain === undefined || plain === null || strong === null) {
      throw new Error("missing canonical test DOM");
    }

    const target = mapped(rendered, staticRange(plain, 1, strong, 1));
    expect(target.start).toEqual({
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 1,
      affinity: "after",
    });
    expect(target.end).toEqual({
      kind: "text",
      textPath: [0, 1],
      utf16Offset: 4,
      affinity: "before",
    });
    expect(target.projection).toBe(rendered.projection);
    expect(target.rendered).toBe(rendered);
    expect("startContainer" in target).toBe(false);
    expect("endContainer" in target).toBe(false);
  });

  it("normalizes empty paragraph, placeholder, and outer host boundary aliases", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { rendered } = render(new BreditorDomRenderer(), host);
    const emptyParagraph = host.childNodes[1];
    const placeholder = emptyParagraph?.childNodes[0];
    if (emptyParagraph === undefined || placeholder === undefined) {
      throw new Error("missing empty paragraph");
    }

    const aroundPlaceholder = mapped(
      rendered,
      staticRange(emptyParagraph, 0, emptyParagraph, 1),
    );
    expect(aroundPlaceholder.start).toEqual({
      kind: "children",
      parentPath: [1],
      childIndex: 0,
      affinity: "after",
    });
    expect(aroundPlaceholder.end).toEqual(aroundPlaceholder.start);

    const onPlaceholder = mapped(rendered, staticRange(placeholder, 0, placeholder, 0));
    expect(onPlaceholder.start).toEqual(aroundPlaceholder.start);
    expect(onPlaceholder.end).toEqual(aroundPlaceholder.end);

    const wholeHost = mapped(
      rendered,
      staticRange(host, 0, host, host.childNodes.length),
    );
    expect(wholeHost.start).toEqual({
      kind: "children",
      parentPath: [0],
      childIndex: 0,
      affinity: "after",
    });
    expect(wholeHost.end).toEqual({
      kind: "children",
      parentPath: [1],
      childIndex: 0,
      affinity: "after",
    });
  });

  it("snapshots each live range boundary once", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { rendered } = render(new BreditorDomRenderer(), host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    const reads = { startContainer: 0, startOffset: 0, endContainer: 0, endOffset: 0 };
    const live = {
      get startContainer() {
        reads.startContainer += 1;
        return text;
      },
      get startOffset() {
        reads.startOffset += 1;
        return 0;
      },
      get endContainer() {
        reads.endContainer += 1;
        return text;
      },
      get endOffset() {
        reads.endOffset += 1;
        return 1;
      },
    } as unknown as AbstractRange;

    expect(mapDomTargetRange(rendered, live).ok).toBe(true);
    expect(reads).toEqual({
      startContainer: 1,
      startOffset: 1,
      endContainer: 1,
      endOffset: 1,
    });
  });

  it("rejects surrogate midpoints and ambiguous internal host boundaries", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { rendered } = render(new BreditorDomRenderer(), host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }

    expect(mapDomTargetRange(rendered, staticRange(text, 2, text, 3))).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_utf16_boundary" },
    });
    expect(mapDomTargetRange(rendered, staticRange(host, 1, host, 1))).toMatchObject({
      ok: false,
      error: { code: "selection.ambiguous_dom_point" },
    });
  });

  it("rejects ranges outside, crossing, spanning, or detached from the host", () => {
    const before = document.createTextNode("before");
    const host = document.createElement("div");
    const after = document.createTextNode("after");
    document.body.append(before, host, after);
    const { rendered } = render(new BreditorDomRenderer(), host);
    const inside = host.firstChild?.firstChild;
    if (inside === undefined || inside === null) {
      throw new Error("missing inside text");
    }

    expect(mapDomTargetRange(rendered, staticRange(before, 0, before, 1))).toMatchObject({
      ok: false,
      error: { code: "selection.ambiguous_dom_point" },
    });
    expect(mapDomTargetRange(rendered, staticRange(inside, 0, after, 1))).toMatchObject({
      ok: false,
      error: { code: "selection.crosses_host" },
    });
    expect(mapDomTargetRange(rendered, staticRange(before, 0, after, 1))).toMatchObject({
      ok: false,
      error: { code: "selection.crosses_host" },
    });

    const detached = document.createTextNode("detached");
    expect(mapDomTargetRange(rendered, staticRange(detached, 0, detached, 1))).toMatchObject({
      ok: false,
      error: { code: "selection.ambiguous_dom_point" },
    });
  });

  it("rejects malformed and backward range snapshots without throwing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { rendered } = render(new BreditorDomRenderer(), host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }

    const malformed = {
      startContainer: text,
      startOffset: "zero",
      endContainer: text,
      endOffset: 1,
    } as unknown as AbstractRange;
    expect(mapDomTargetRange(rendered, malformed)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_read_failed" },
    });

    const backward = {
      startContainer: text,
      startOffset: 3,
      endContainer: text,
      endOffset: 1,
    } as unknown as AbstractRange;
    expect(mapDomTargetRange(rendered, backward)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_read_failed" },
    });

    const throwing = Object.defineProperty({}, "startContainer", {
      get: () => {
        throw new Error("native getter failed");
      },
    }) as AbstractRange;
    expect(mapDomTargetRange(rendered, throwing)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_read_failed" },
    });
  });

  it("validates canonical DOM both before and after native range snapshotting", () => {
    const driftedHost = document.createElement("div");
    document.body.append(driftedHost);
    const drifted = render(new BreditorDomRenderer(), driftedHost).rendered;
    const driftedText = driftedHost.firstChild?.firstChild;
    if (driftedText === undefined || driftedText === null) {
      throw new Error("missing drift text");
    }
    driftedHost.firstElementChild?.setAttribute("class", "drift");
    expect(
      mapDomTargetRange(
        drifted,
        staticRange(driftedText, 0, driftedText, 1),
      ),
    ).toMatchObject({ ok: false, error: { code: "selection.dom_drift" } });

    const hostileHost = document.createElement("div");
    document.body.append(hostileHost);
    const hostile = render(new BreditorDomRenderer(), hostileHost).rendered;
    const hostileText = hostileHost.firstChild?.firstChild;
    if (hostileText === undefined || hostileText === null) {
      throw new Error("missing hostile text");
    }
    const hostileRange = {
      get startContainer() {
        hostileHost.firstElementChild?.setAttribute("data-hostile", "true");
        return hostileText;
      },
      startOffset: 0,
      endContainer: hostileText,
      endOffset: 1,
    } as unknown as AbstractRange;
    expect(mapDomTargetRange(hostile, hostileRange)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_drift" },
    });
  });

  it("rejects stale and foreign render handles before reading the range", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const first = render(renderer, host).rendered;
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    const range = staticRange(text, 0, text, 1);
    render(renderer, host, projection(1));
    expect(mapDomTargetRange(first, range)).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });

    const forged = {
      current: true,
      host,
      projection: projection(2),
      rendererGeneration: 1n,
      validateCanonicalDom: () => true,
      nodeForAstPath: () => host,
      astPathForDomNode: () => [],
    } as unknown as RenderedProjection;
    expect(mapDomTargetRange(forged, range)).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });
  });
});
