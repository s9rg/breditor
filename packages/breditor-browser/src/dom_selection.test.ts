import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BaseDocumentProjection,
  BaseProjectionUpdate,
  BaseRangeSelection,
  BreditorDomRenderer,
  BreditorDomSelectionBridge,
  type BrowserProjectionResult,
  type BrowserSelectionResult,
  type ProjectionRenderOutcome,
} from "./advanced.js";

type Run = Readonly<{ text: string; strong: boolean }>;

function projection(revision: number, paragraphs?: readonly (readonly Run[])[]) {
  return projectionValue(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "dom-selection", revision: String(revision) },
      paragraphs: (paragraphs ?? [
        [
          { text: "A😀", strong: false },
          { text: "bold", strong: true },
        ],
        [],
      ]).map((runs) => ({ runs })),
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
  documentProjection = projection(0),
): ProjectionRenderOutcome {
  return projectionValue(renderer.render(host, documentProjection));
}

function domSelection(host: HTMLElement): Selection {
  const selection = host.ownerDocument.defaultView?.getSelection();
  if (selection === undefined || selection === null) {
    throw new Error("test window has no Selection");
  }
  return selection;
}

function semanticSelection(
  documentProjection: ReturnType<typeof projection>,
  anchor: Readonly<Record<string, unknown>>,
  focus: Readonly<Record<string, unknown>>,
) {
  return selectionValue(
    BaseRangeSelection.create(documentProjection, { kind: "range", anchor, focus }),
  );
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

describe("BreditorDomSelectionBridge", () => {
  it("writes and reads exact forward anchor/focus while preserving affinity sidecars", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const bridge = new BreditorDomSelectionBridge();
    const semantic = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "before",
      },
      {
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 2,
        affinity: "after",
      },
    );
    const activeBefore = document.activeElement;

    expect(bridge.write(rendered, semantic)).toEqual({
      ok: true,
      value: { kind: "range", rendererGeneration: rendered.rendererGeneration },
    });
    const browser = domSelection(host);
    expect(browser.anchorNode).toBe(host.childNodes[0]?.childNodes[0]);
    expect(browser.anchorOffset).toBe(1);
    expect(browser.focusNode).toBe(host.querySelector("strong")?.firstChild);
    expect(browser.focusOffset).toBe(2);
    expect(document.activeElement).toBe(activeBefore);

    const observed = selectionValue(bridge.read(rendered));
    expect(observed.kind).toBe("range");
    if (observed.kind === "range") {
      expect(observed.origin).toBe("programmaticEcho");
      expect(observed.selection).toBe(semantic);
      expect(observed.selection.anchor.affinity).toBe("before");
    }
    const repeated = selectionValue(bridge.read(rendered));
    expect(repeated.kind).toBe("range");
    if (repeated.kind === "range") {
      expect(repeated.origin).toBe("dom");
      expect(repeated.selection).not.toBe(semantic);
      expect(repeated.selection.anchor.affinity).toBe("after");
    }
  });

  it("preserves a browser-originated backward anchor/focus direction", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const browser = domSelection(host);
    const plain = host.childNodes[0]?.childNodes[0];
    const strongText = host.querySelector("strong")?.firstChild;
    if (plain === undefined || strongText === undefined || strongText === null) {
      throw new Error("missing test DOM");
    }
    browser.setBaseAndExtent(strongText, 3, plain, 1);

    const observed = selectionValue(new BreditorDomSelectionBridge().read(rendered));
    expect(observed.kind).toBe("range");
    if (observed.kind === "range") {
      expect(observed.origin).toBe("dom");
      expect(observed.selection.order).toBe("backward");
      expect(observed.selection.anchor).toMatchObject({
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 3,
        affinity: "after",
      });
      expect(observed.selection.focus).toMatchObject({
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "after",
      });
    }
  });

  it("installs backward and collapsed ranges without sorting their endpoints", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const bridge = new BreditorDomSelectionBridge();
    const backward = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 4,
        affinity: "before",
      },
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "after",
      },
    );
    expect(bridge.write(rendered, backward).ok).toBe(true);
    expect(domSelection(host).anchorNode).toBe(host.querySelector("strong")?.firstChild);
    expect(domSelection(host).anchorOffset).toBe(4);
    expect(domSelection(host).focusNode).toBe(host.firstChild?.firstChild);
    expect(domSelection(host).focusOffset).toBe(1);

    const collapsed = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "before",
      },
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "after",
      },
    );
    expect(bridge.write(rendered, collapsed).ok).toBe(true);
    expect(domSelection(host).isCollapsed).toBe(true);
    const observed = selectionValue(bridge.read(rendered));
    expect(observed.kind).toBe("range");
    if (observed.kind === "range") {
      expect(observed.selection).toBe(collapsed);
      expect(observed.selection.order).toBe("collapsed");
    }
  });

  it("normalizes strong wrapper edges without making wrappers AST nodes", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const strong = host.querySelector("strong");
    if (strong === null) {
      throw new Error("missing strong");
    }
    domSelection(host).setBaseAndExtent(strong, 0, strong, 1);

    const observed = selectionValue(new BreditorDomSelectionBridge().read(rendered));
    expect(observed.kind).toBe("range");
    if (observed.kind === "range") {
      expect(observed.selection.anchor).toMatchObject({
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 0,
      });
      expect(observed.selection.focus).toMatchObject({
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 4,
      });
    }
    expect(rendered.astPathForDomNode(strong)).toBeNull();
  });

  it("normalizes every canonical empty-paragraph placeholder boundary", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const paragraph = host.childNodes[1];
    const placeholder = paragraph?.childNodes[0];
    if (paragraph === undefined || placeholder === undefined) {
      throw new Error("missing empty paragraph");
    }
    const bridge = new BreditorDomSelectionBridge();

    domSelection(host).setBaseAndExtent(paragraph, 0, paragraph, 1);
    const aroundPlaceholder = selectionValue(bridge.read(rendered));
    expect(aroundPlaceholder.kind).toBe("range");
    if (aroundPlaceholder.kind === "range") {
      expect(aroundPlaceholder.selection.order).toBe("collapsed");
      expect(aroundPlaceholder.selection.anchor).toEqual({
        kind: "children",
        parentPath: [1],
        childIndex: 0,
        affinity: "after",
      });
      expect(aroundPlaceholder.selection.focus).toEqual(aroundPlaceholder.selection.anchor);
    }

    domSelection(host).setBaseAndExtent(placeholder, 0, placeholder, 0);
    const onPlaceholder = selectionValue(bridge.read(rendered));
    expect(onPlaceholder.kind).toBe("range");
    if (onPlaceholder.kind === "range") {
      expect(onPlaceholder.selection.anchor).toMatchObject({
        kind: "children",
        parentPath: [1],
        childIndex: 0,
      });
    }
  });

  it("applies the frozen boundary-derived affinity policy to new DOM input", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    domSelection(host).setBaseAndExtent(text, 0, text, 3);

    const observed = selectionValue(new BreditorDomSelectionBridge().read(rendered));
    if (observed.kind !== "range") {
      throw new Error("expected range");
    }
    expect(observed.selection.anchor.affinity).toBe("after");
    expect(observed.selection.focus.affinity).toBe("before");
  });

  it("rejects UTF-16 surrogate midpoints and host-root boundary ambiguity", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    const bridge = new BreditorDomSelectionBridge();

    domSelection(host).setBaseAndExtent(text, 2, text, 3);
    expect(bridge.read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.invalid_utf16_boundary" },
    });

    domSelection(host).setBaseAndExtent(host, 1, host, 1);
    expect(bridge.read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.ambiguous_dom_point" },
    });
  });

  it("maps only the outer host boundaries for select-all semantics", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    domSelection(host).setBaseAndExtent(host, 0, host, host.childNodes.length);

    const observed = selectionValue(new BreditorDomSelectionBridge().read(rendered));
    expect(observed.kind).toBe("range");
    if (observed.kind === "range") {
      expect(observed.selection.anchor).toEqual({
        kind: "children",
        parentPath: [0],
        childIndex: 0,
        affinity: "after",
      });
      expect(observed.selection.focus).toEqual({
        kind: "children",
        parentPath: [1],
        childIndex: 0,
        affinity: "after",
      });
      expect(observed.selection.order).toBe("forward");
    }
  });

  it("maps a nonempty final host boundary to end affinity before", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(
      renderer,
      host,
      projection(0, [[{ text: "only", strong: false }]]),
    );
    domSelection(host).setBaseAndExtent(host, 0, host, 1);

    const observed = selectionValue(new BreditorDomSelectionBridge().read(rendered));
    if (observed.kind !== "range") {
      throw new Error("expected range");
    }
    expect(observed.selection.focus).toEqual({
      kind: "children",
      parentPath: [0],
      childIndex: 1,
      affinity: "before",
    });
  });

  it("reports outside/no-range DOM state without publishing semantic None", () => {
    const host = document.createElement("div");
    const outside = document.createTextNode("outside");
    document.body.append(host, outside);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const bridge = new BreditorDomSelectionBridge();

    expect(selectionValue(bridge.read(rendered))).toEqual({
      kind: "unavailable",
      reason: "noDomRange",
      origin: "dom",
    });
    domSelection(host).setBaseAndExtent(outside, 0, outside, 1);
    expect(selectionValue(bridge.read(rendered))).toEqual({
      kind: "unavailable",
      reason: "outsideHost",
      origin: "dom",
    });
  });

  it("clearing semantic selection never erases a range wholly outside this host", () => {
    const host = document.createElement("div");
    const outside = document.createTextNode("outside");
    document.body.append(host, outside);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const browser = domSelection(host);
    browser.setBaseAndExtent(outside, 0, outside, 1);

    expect(new BreditorDomSelectionBridge().write(rendered, null).ok).toBe(true);
    expect(browser.rangeCount).toBe(1);
    expect(browser.anchorNode).toBe(outside);
    expect(browser.focusNode).toBe(outside);
    expect(browser.focusOffset).toBe(1);
  });

  it("rejects an outside-to-outside range spanning the host but permits boundary touch", () => {
    const before = document.createTextNode("before");
    const host = document.createElement("div");
    const after = document.createTextNode("after");
    document.body.append(before, host, after);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const browser = domSelection(host);
    const bridge = new BreditorDomSelectionBridge();

    browser.setBaseAndExtent(before, 0, after, after.data.length);
    expect(bridge.read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.crosses_host" },
    });
    expect(bridge.write(rendered, null)).toMatchObject({
      ok: false,
      error: { code: "selection.crosses_host" },
    });
    expect(browser.anchorNode).toBe(before);
    expect(browser.focusNode).toBe(after);

    browser.setBaseAndExtent(before, 0, document.body, 1);
    expect(selectionValue(bridge.read(rendered))).toEqual({
      kind: "unavailable",
      reason: "outsideHost",
      origin: "dom",
    });
  });

  it("clears an owned DOM range and emits only one absence echo", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const browser = domSelection(host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    browser.setBaseAndExtent(text, 0, text, 1);
    const bridge = new BreditorDomSelectionBridge();

    expect(bridge.write(rendered, null).ok).toBe(true);
    expect(browser.rangeCount).toBe(0);
    expect(selectionValue(bridge.read(rendered))).toMatchObject({
      kind: "unavailable",
      reason: "noDomRange",
      origin: "programmaticEcho",
    });
    expect(selectionValue(bridge.read(rendered))).toMatchObject({
      kind: "unavailable",
      reason: "noDomRange",
      origin: "dom",
    });
  });

  it("fails closed when a range crosses the host or a fake selection is multi-range", () => {
    const host = document.createElement("div");
    const outside = document.createTextNode("outside");
    document.body.append(host, outside);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const inside = host.firstChild?.firstChild;
    if (inside === undefined || inside === null) {
      throw new Error("missing inside text");
    }
    const browser = domSelection(host);
    browser.setBaseAndExtent(inside, 0, outside, 1);
    const bridge = new BreditorDomSelectionBridge();
    expect(bridge.read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.crosses_host" },
    });
    expect(bridge.write(rendered, null)).toMatchObject({
      ok: false,
      error: { code: "selection.crosses_host" },
    });
    expect(browser.anchorNode).toBe(inside);
    expect(browser.focusNode).toBe(outside);

    const view = host.ownerDocument.defaultView;
    if (view === null) {
      throw new Error("missing window");
    }
    vi.spyOn(view, "getSelection").mockReturnValue({ rangeCount: 2 } as Selection);
    expect(new BreditorDomSelectionBridge().read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.multirange_unsupported" },
    });
    expect(new BreditorDomSelectionBridge().write(rendered, null)).toMatchObject({
      ok: false,
      error: { code: "selection.multirange_unsupported" },
    });
  });

  it("rejects fake anchor/focus data without one matching DOM Range", () => {
    const host = document.createElement("div");
    const outside = document.createTextNode("outside");
    document.body.append(host, outside);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const text = host.firstChild?.firstChild;
    const view = host.ownerDocument.defaultView;
    if (text === undefined || text === null || view === null) {
      throw new Error("missing test DOM");
    }
    const missingRange = {
      rangeCount: 1,
      anchorNode: text,
      anchorOffset: 0,
      focusNode: text,
      focusOffset: 1,
    } as unknown as Selection;
    vi.spyOn(view, "getSelection").mockReturnValue(missingRange);
    expect(new BreditorDomSelectionBridge().read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_read_failed" },
    });

    vi.restoreAllMocks();
    const outsideRange = document.createRange();
    outsideRange.setStart(outside, 0);
    outsideRange.setEnd(outside, 1);
    const contradictory = {
      ...missingRange,
      getRangeAt: () => outsideRange,
    } as Selection;
    vi.spyOn(view, "getSelection").mockReturnValue(contradictory);
    expect(new BreditorDomSelectionBridge().read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_read_failed" },
    });
  });

  it("replaces a transiently incoherent prior range only when all endpoints map inside the owned render", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const browser = domSelection(host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    browser.setBaseAndExtent(text, 1, text, 1);
    const contradictoryRange = document.createRange();
    contradictoryRange.setStart(text, 0);
    contradictoryRange.setEnd(text, 0);
    const nativeGetRangeAt = browser.getRangeAt.bind(browser);
    const original = Object.getOwnPropertyDescriptor(browser, "getRangeAt");
    const desired = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "after",
      },
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "before",
      },
    );
    let calls = 0;

    try {
      Object.defineProperty(browser, "getRangeAt", {
        configurable: true,
        value: ((index: number) => {
          calls += 1;
          return calls === 1 ? contradictoryRange : nativeGetRangeAt(index);
        }) satisfies Selection["getRangeAt"],
      });
      expect(new BreditorDomSelectionBridge().write(rendered, desired).ok).toBe(true);
      expect(browser.anchorNode).toBe(text);
      expect(browser.anchorOffset).toBe(1);
      expect(browser.focusNode).toBe(text);
      expect(browser.focusOffset).toBe(3);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "getRangeAt");
      } else {
        Object.defineProperty(browser, "getRangeAt", original);
      }
    }
  });

  it("refuses incoherent prior ranges with an outside or cross-host Range endpoint", () => {
    const host = document.createElement("div");
    const outside = document.createTextNode("outside");
    document.body.append(host, outside);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const browser = domSelection(host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    browser.setBaseAndExtent(text, 0, text, 0);
    const desired = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "after",
      },
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 3,
        affinity: "before",
      },
    );
    const originalGet = Object.getOwnPropertyDescriptor(browser, "getRangeAt");
    const originalSet = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");
    const nativeSet = browser.setBaseAndExtent.bind(browser);

    try {
      for (const kind of ["outside", "cross"] as const) {
        const contradictoryRange = document.createRange();
        if (kind === "outside") {
          contradictoryRange.setStart(outside, 0);
        } else {
          contradictoryRange.setStart(text, 0);
        }
        contradictoryRange.setEnd(outside, outside.data.length);
        let writes = 0;
        Object.defineProperty(browser, "getRangeAt", {
          configurable: true,
          value: (() => contradictoryRange) satisfies Selection["getRangeAt"],
        });
        Object.defineProperty(browser, "setBaseAndExtent", {
          configurable: true,
          value: ((
            anchorNode: Node,
            anchorOffset: number,
            focusNode: Node,
            focusOffset: number,
          ) => {
            writes += 1;
            nativeSet(anchorNode, anchorOffset, focusNode, focusOffset);
          }) satisfies Selection["setBaseAndExtent"],
        });

        expect(new BreditorDomSelectionBridge().write(rendered, desired)).toMatchObject({
          ok: false,
          error: { code: "selection.dom_read_failed" },
        });
        expect(writes).toBe(0);
        expect(browser.anchorNode).toBe(text);
        expect(browser.anchorOffset).toBe(0);
      }
    } finally {
      if (originalGet === undefined) {
        Reflect.deleteProperty(browser, "getRangeAt");
      } else {
        Object.defineProperty(browser, "getRangeAt", originalGet);
      }
      if (originalSet === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", originalSet);
      }
    }
  });

  it("accepts a browser-normalized DOM alias only when its semantic anchor and focus remain exact", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const browser = domSelection(host);
    const priorText = host.firstChild?.firstChild;
    const strongText = host.querySelector("strong")?.firstChild;
    if (
      priorText === undefined ||
      priorText === null ||
      strongText === undefined ||
      strongText === null
    ) {
      throw new Error("missing text");
    }
    browser.setBaseAndExtent(priorText, 0, priorText, 0);
    const desired = semanticSelection(
      documentProjection,
      {
        kind: "children",
        parentPath: [0],
        childIndex: 1,
        affinity: "after",
      },
      {
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 4,
        affinity: "before",
      },
    );
    const nativeSet = browser.setBaseAndExtent.bind(browser);
    const original = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");

    try {
      Object.defineProperty(browser, "setBaseAndExtent", {
        configurable: true,
        value: ((
          _anchorNode: Node,
          _anchorOffset: number,
          focusNode: Node,
          focusOffset: number,
        ) => {
          nativeSet(strongText, 0, focusNode, focusOffset);
        }) satisfies Selection["setBaseAndExtent"],
      });
      const bridge = new BreditorDomSelectionBridge();
      expect(bridge.write(rendered, desired).ok).toBe(true);
      const observed = selectionValue(bridge.read(rendered));
      expect(observed.kind).toBe("range");
      if (observed.kind === "range") {
        expect(observed.origin).toBe("programmaticEcho");
        expect(observed.selection).toBe(desired);
      }
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", original);
      }
    }
  });

  it("suppresses one exact DOM-container signature only within its render generation", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const base = projection(0);
    const initial = render(renderer, host, base);
    const bridge = new BreditorDomSelectionBridge();
    const seam = semanticSelection(
      base,
      {
        kind: "children",
        parentPath: [0],
        childIndex: 1,
        affinity: "before",
      },
      {
        kind: "children",
        parentPath: [0],
        childIndex: 1,
        affinity: "before",
      },
    );
    selectionValue(bridge.write(initial.rendered, seam));
    const strongText = host.querySelector("strong")?.firstChild;
    if (strongText === undefined || strongText === null) {
      throw new Error("missing strong text");
    }
    domSelection(host).setBaseAndExtent(strongText, 0, strongText, 0);

    const aliasMove = selectionValue(bridge.read(initial.rendered));
    expect(aliasMove.kind).toBe("range");
    if (aliasMove.kind === "range") {
      expect(aliasMove.origin).toBe("dom");
      expect(aliasMove.selection).not.toBe(seam);
      expect(aliasMove.selection.anchor).toMatchObject({
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 0,
        affinity: "after",
      });
    }
    const sameSelectionAgain = selectionValue(bridge.read(initial.rendered));
    expect(sameSelectionAgain.kind).toBe("range");
    if (sameSelectionAgain.kind === "range") {
      expect(sameSelectionAgain.origin).toBe("dom");
      expect(sameSelectionAgain.selection.anchor.affinity).toBe("after");
    }

    const result = projection(1);
    const update = projectionValue(
      BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } }),
    );
    const next = projectionValue(renderer.update(initial.rendered, update));
    const newGeneration = selectionValue(bridge.read(next.rendered));
    expect(newGeneration.kind).toBe("range");
    if (newGeneration.kind === "range") {
      expect(newGeneration.origin).toBe("dom");
      expect(newGeneration.selection.anchor).toMatchObject({
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 0,
        affinity: "after",
      });
    }
  });

  it("synchronously invalidates on canonical DOM drift before observer delivery", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    host.firstChild?.appendChild(document.createTextNode("foreign"));

    expect(new BreditorDomSelectionBridge().read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_drift" },
    });
    expect(rendered.current).toBe(false);
  });

  it("cannot bypass canonical validation by replacing branded-handle methods", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const prototype = Object.getPrototypeOf(rendered) as object;

    expect(Reflect.set(prototype, "validateCanonicalDom", () => true)).toBe(false);
    host.firstElementChild?.setAttribute("class", "drift");
    expect(new BreditorDomSelectionBridge().read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_drift" },
    });
  });

  it("post-validates DOM changed by a hostile Selection setter and restores prior selection", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const point = {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 1,
      affinity: "after",
    } as const;
    const semantic = semanticSelection(documentProjection, point, point);
    const browser = domSelection(host);
    const nativeSet = browser.setBaseAndExtent.bind(browser);
    const original = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");
    try {
      Object.defineProperty(browser, "setBaseAndExtent", {
        configurable: true,
        value: ((anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) => {
          host.firstElementChild?.setAttribute("data-hostile", "true");
          nativeSet(anchorNode, anchorOffset, focusNode, focusOffset);
        }) satisfies Selection["setBaseAndExtent"],
      });

      expect(new BreditorDomSelectionBridge().write(rendered, semantic)).toMatchObject({
        ok: false,
        error: { code: "selection.dom_drift" },
      });
      expect(rendered.current).toBe(false);
      expect(browser.rangeCount).toBe(0);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", original);
      }
    }
  });

  it("post-validates a hostile clear and restores the previously owned range", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const browser = domSelection(host);
    const text = host.firstChild?.firstChild;
    if (text === undefined || text === null) {
      throw new Error("missing text");
    }
    browser.setBaseAndExtent(text, 0, text, 1);
    const nativeRemove = browser.removeAllRanges.bind(browser);
    const original = Object.getOwnPropertyDescriptor(browser, "removeAllRanges");
    try {
      Object.defineProperty(browser, "removeAllRanges", {
        configurable: true,
        value: (() => {
          host.firstElementChild?.setAttribute("data-hostile-clear", "true");
          nativeRemove();
        }) satisfies Selection["removeAllRanges"],
      });
      expect(new BreditorDomSelectionBridge().write(rendered, null)).toMatchObject({
        ok: false,
        error: { code: "selection.dom_drift" },
      });
      expect(rendered.current).toBe(false);
      expect(browser.anchorNode).toBe(text);
      expect(browser.anchorOffset).toBe(0);
      expect(browser.focusNode).toBe(text);
      expect(browser.focusOffset).toBe(1);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "removeAllRanges");
      } else {
        Object.defineProperty(browser, "removeAllRanges", original);
      }
    }
  });

  it("rolls back when endpoint verification detects a hostile directional rewrite", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const browser = domSelection(host);
    const priorNode = host.firstChild?.firstChild;
    if (priorNode === undefined || priorNode === null) {
      throw new Error("missing prior node");
    }
    browser.setBaseAndExtent(priorNode, 0, priorNode, 0);
    const nativeSet = browser.setBaseAndExtent.bind(browser);
    const original = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");
    const forward = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 1,
        affinity: "after",
      },
      {
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 4,
        affinity: "before",
      },
    );

    try {
      Object.defineProperty(browser, "setBaseAndExtent", {
        configurable: true,
        value: ((anchorNode: Node, anchorOffset: number, focusNode: Node, focusOffset: number) => {
          nativeSet(focusNode, focusOffset, anchorNode, anchorOffset);
        }) satisfies Selection["setBaseAndExtent"],
      });
      expect(new BreditorDomSelectionBridge().write(rendered, forward)).toMatchObject({
        ok: false,
        error: { code: "selection.dom_write_failed" },
      });
      expect(browser.anchorNode).toBe(priorNode);
      expect(browser.anchorOffset).toBe(0);
      expect(browser.focusNode).toBe(priorNode);
      expect(browser.focusOffset).toBe(0);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", original);
      }
    }
  });

  it("rejects stale/forged render handles and an equal-looking foreign snapshot value", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const base = projection(0);
    const initial = render(renderer, host, base);
    const point = {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 0,
      affinity: "after",
    } as const;
    const initialSelection = semanticSelection(base, point, point);
    const copied = projection(0);
    const copiedSelection = semanticSelection(copied, point, point);
    const bridge = new BreditorDomSelectionBridge();

    expect(bridge.write(initial.rendered, copiedSelection)).toMatchObject({
      ok: false,
      error: { code: "selection.snapshot_mismatch" },
    });
    render(renderer, host, base);
    expect(bridge.read(initial.rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });
    expect(bridge.write(initial.rendered, initialSelection)).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });

    const forged = {
      current: true,
      host,
      projection: base,
      rendererGeneration: 1n,
      validateCanonicalDom: () => true,
      nodeForAstPath: () => host,
      astPathForDomNode: () => [],
    } as unknown as typeof initial.rendered;
    expect(bridge.read(forged)).toMatchObject({
      ok: false,
      error: { code: "selection.foreign_or_stale_render" },
    });
  });

  it("fails before mutation when backward direction cannot be installed", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const backward = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 4,
        affinity: "after",
      },
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 0,
        affinity: "after",
      },
    );
    const browser = domSelection(host);
    const beforeNode = host.firstChild?.firstChild;
    if (beforeNode === undefined || beforeNode === null) {
      throw new Error("missing text");
    }
    browser.setBaseAndExtent(beforeNode, 0, beforeNode, 0);
    const original = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");
    try {
      Object.defineProperty(browser, "setBaseAndExtent", {
        configurable: true,
        value: undefined,
      });
      expect(new BreditorDomSelectionBridge().write(rendered, backward)).toMatchObject({
        ok: false,
        error: { code: "selection.backward_unsupported" },
      });
      expect(browser.anchorNode).toBe(beforeNode);
      expect(browser.anchorOffset).toBe(0);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", original);
      }
    }
  });

  it("uses a native Range fallback for forward selection without setBaseAndExtent", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const forward = semanticSelection(
      documentProjection,
      {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 0,
        affinity: "after",
      },
      {
        kind: "text",
        textPath: [0, 1],
        utf16Offset: 4,
        affinity: "after",
      },
    );
    const browser = domSelection(host);
    const original = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");
    try {
      Object.defineProperty(browser, "setBaseAndExtent", {
        configurable: true,
        value: undefined,
      });
      expect(new BreditorDomSelectionBridge().write(rendered, forward).ok).toBe(true);
      expect(browser.anchorNode).toBe(host.firstChild?.firstChild);
      expect(browser.focusNode).toBe(host.querySelector("strong")?.firstChild);
      expect(browser.focusOffset).toBe(4);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", original);
      }
    }
  });

  it("preflights both DOM orders of a semantically collapsed alias before Range fallback mutation", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const documentProjection = projection(0);
    const { rendered } = render(renderer, host, documentProjection);
    const browser = domSelection(host);
    const priorNode = host.firstChild?.firstChild;
    if (priorNode === undefined || priorNode === null) {
      throw new Error("missing prior node");
    }
    browser.setBaseAndExtent(priorNode, 0, priorNode, 0);
    const childBoundary = {
      kind: "children",
      parentPath: [0],
      childIndex: 1,
      affinity: "after",
    } as const;
    const rightTextStart = {
      kind: "text",
      textPath: [0, 1],
      utf16Offset: 0,
      affinity: "after",
    } as const;
    const domBackwardAlias = semanticSelection(
      documentProjection,
      rightTextStart,
      childBoundary,
    );
    const domForwardAlias = semanticSelection(
      documentProjection,
      childBoundary,
      rightTextStart,
    );
    expect(domBackwardAlias.order).toBe("collapsed");
    expect(domForwardAlias.order).toBe("collapsed");
    const original = Object.getOwnPropertyDescriptor(browser, "setBaseAndExtent");
    try {
      Object.defineProperty(browser, "setBaseAndExtent", {
        configurable: true,
        value: undefined,
      });
      expect(new BreditorDomSelectionBridge().write(rendered, domBackwardAlias)).toMatchObject({
        ok: false,
        error: { code: "selection.dom_write_failed" },
      });
      expect(browser.anchorNode).toBe(priorNode);
      expect(browser.anchorOffset).toBe(0);

      expect(new BreditorDomSelectionBridge().write(rendered, domForwardAlias).ok).toBe(true);
      expect(browser.anchorNode).toBe(host.firstChild);
      expect(browser.anchorOffset).toBe(1);
      expect(browser.focusNode).toBe(host.querySelector("strong")?.firstChild);
      expect(browser.focusOffset).toBe(0);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(browser, "setBaseAndExtent");
      } else {
        Object.defineProperty(browser, "setBaseAndExtent", original);
      }
    }
  });

  it("keeps focus observation and semantic selection lifecycle separate", () => {
    const host = document.createElement("div");
    host.tabIndex = 0;
    const outside = document.createElement("button");
    document.body.append(host, outside);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host);
    const bridge = new BreditorDomSelectionBridge();

    host.focus();
    expect(selectionValue(bridge.readFocus(rendered)).kind).toBe("withinHost");
    outside.focus();
    expect(selectionValue(bridge.readFocus(rendered)).kind).toBe("outsideHost");
    expect(selectionValue(bridge.read(rendered)).kind).toBe("unavailable");

    domSelection(host).removeAllRanges();
    expect(bridge.write(rendered, null).ok).toBe(true);
    expect(document.activeElement).toBe(outside);
    expect(selectionValue(bridge.read(rendered))).toEqual({
      kind: "unavailable",
      reason: "noDomRange",
      origin: "programmaticEcho",
    });
    expect(selectionValue(bridge.read(rendered))).toEqual({
      kind: "unavailable",
      reason: "noDomRange",
      origin: "dom",
    });
  });

  it("keeps a same-generation echo across focus reads but drops it on generation/drift", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer();
    const base = projection(0);
    const initial = render(renderer, host, base);
    const point = {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 1,
      affinity: "before",
    } as const;
    const semantic = semanticSelection(base, point, point);
    const bridge = new BreditorDomSelectionBridge();
    selectionValue(bridge.write(initial.rendered, semantic));
    expect(bridge.readFocus(initial.rendered).ok).toBe(true);
    const sameGeneration = selectionValue(bridge.read(initial.rendered));
    expect(sameGeneration.kind).toBe("range");
    if (sameGeneration.kind === "range") {
      expect(sameGeneration.origin).toBe("programmaticEcho");
    }

    selectionValue(bridge.write(initial.rendered, semantic));
    const result = projection(1);
    const update = projectionValue(
      BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } }),
    );
    const next = projectionValue(renderer.update(initial.rendered, update));
    expect(bridge.readFocus(next.rendered).ok).toBe(true);
    const afterGeneration = selectionValue(bridge.read(next.rendered));
    expect(afterGeneration.kind).toBe("range");
    if (afterGeneration.kind === "range") {
      expect(afterGeneration.origin).toBe("dom");
    }

    const nextPoint = {
      kind: "text",
      textPath: [0, 0],
      utf16Offset: 1,
      affinity: "after",
    } as const;
    selectionValue(
      bridge.write(next.rendered, semanticSelection(result, nextPoint, nextPoint)),
    );
    host.firstChild?.appendChild(document.createTextNode("foreign"));
    expect(bridge.readFocus(next.rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.dom_drift" },
    });
  });

  it("uses the host document and reports missing Window Selection support", () => {
    const xmlDocument = document.implementation.createDocument(null, "root");
    const host = xmlDocument.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    xmlDocument.documentElement.append(host);
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host, projection(0, [[]]));

    expect(new BreditorDomSelectionBridge().read(rendered)).toMatchObject({
      ok: false,
      error: { code: "selection.selection_api_unavailable" },
    });
  });
});
