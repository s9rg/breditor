import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_COMPOSITION_TEXT_UTF16,
} from "./composition_event.js";
import {
  reconcileCompositionDom,
  type DomCompositionReconciliation,
} from "./dom_composition_reconcile.js";
import {
  BaseDocumentProjection,
  type BaseParagraphProjection,
} from "./projection.js";
import { BaseRangeSelection } from "./selection.js";

type ResultLike<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: Readonly<{ code: string; message: string }> }>;

function valueOf<T>(result: ResultLike<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function projection(
  paragraphs: readonly (readonly Readonly<{ text: string; strong: boolean }>[])[],
): BaseDocumentProjection {
  return valueOf(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "composition-dom-tests", revision: "0" },
      paragraphs: paragraphs.map((runs) => ({ runs })),
    }),
  );
}

function canonicalHost(base: BaseDocumentProjection): HTMLElement {
  const host = document.createElement("div");
  for (const paragraph of base.paragraphs) {
    const element = document.createElement("p");
    if (paragraph.runs.length === 0) {
      element.append(document.createElement("br"));
    } else {
      for (const run of paragraph.runs) {
        const text = document.createTextNode(run.text);
        if (run.strong) {
          const strong = document.createElement("strong");
          strong.append(text);
          element.append(strong);
        } else {
          element.append(text);
        }
      }
    }
    host.append(element);
  }
  document.body.append(host);
  return host;
}

function textSelection(
  base: BaseDocumentProjection,
  paragraphIndex: number,
  anchorOffset: number,
  focusOffset: number,
): BaseRangeSelection {
  return valueOf(
    BaseRangeSelection.create(base, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [paragraphIndex, 0],
        utf16Offset: anchorOffset,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [paragraphIndex, 0],
        utf16Offset: focusOffset,
        affinity: "before",
      },
    }),
  );
}

function childSelection(
  base: BaseDocumentProjection,
  paragraphIndex: number,
  anchorChild: number,
  focusChild: number,
): BaseRangeSelection {
  return valueOf(
    BaseRangeSelection.create(base, {
      kind: "range",
      anchor: {
        kind: "children",
        parentPath: [paragraphIndex],
        childIndex: anchorChild,
        affinity: "after",
      },
      focus: {
        kind: "children",
        parentPath: [paragraphIndex],
        childIndex: focusChild,
        affinity: "before",
      },
    }),
  );
}

function targetParagraph(host: HTMLElement, index = 0): HTMLParagraphElement {
  const paragraph = host.childNodes[index];
  if (!(paragraph instanceof HTMLParagraphElement)) {
    throw new Error("paragraph fixture failed");
  }
  return paragraph;
}

function expectFailure(
  result: ResultLike<DomCompositionReconciliation>,
  code: string,
): void {
  expect(result).toMatchObject({ ok: false, error: { code } });
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("strict composition DOM reconciliation", () => {
  it("extracts one collapsed insertion from split text and strong nodes", () => {
    const base = projection([[{ text: "abc", strong: false }]]);
    const host = canonicalHost(base);
    const paragraph = targetParagraph(host);
    const strong = document.createElement("strong");
    strong.append(document.createTextNode("漢"), document.createTextNode("字"));
    paragraph.replaceChildren(
      document.createTextNode("a"),
      strong,
      document.createTextNode("bc"),
    );

    const result = valueOf(
      reconcileCompositionDom(host, base, textSelection(base, 0, 1, 1)),
    );

    expect(result).toEqual({
      paragraphIndex: 0,
      replacementStartUtf16: 1,
      replacementEndUtf16: 1,
      originalText: "",
      text: "漢字",
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect("node" in result).toBe(false);
  });

  it("normalizes backward text ranges and child-boundary ranges", () => {
    const textBase = projection([[{ text: "abcdef", strong: false }]]);
    const textHost = canonicalHost(textBase);
    targetParagraph(textHost).replaceChildren(document.createTextNode("abXYef"));
    expect(
      valueOf(reconcileCompositionDom(
        textHost,
        textBase,
        textSelection(textBase, 0, 4, 2),
      )),
    ).toEqual({
      paragraphIndex: 0,
      replacementStartUtf16: 2,
      replacementEndUtf16: 4,
      originalText: "cd",
      text: "XY",
    });

    const childBase = projection([[
      { text: "a", strong: false },
      { text: "B", strong: true },
      { text: "c", strong: false },
    ]]);
    const childHost = canonicalHost(childBase);
    targetParagraph(childHost).replaceChildren(document.createTextNode("a替c"));
    expect(
      valueOf(reconcileCompositionDom(
        childHost,
        childBase,
        childSelection(childBase, 0, 1, 2),
      )),
    ).toEqual({
      paragraphIndex: 0,
      replacementStartUtf16: 1,
      replacementEndUtf16: 2,
      originalText: "B",
      text: "替",
    });
  });

  it("accepts unambiguous empty target representations and deletion", () => {
    const emptyBase = projection([[]]);
    const emptyHost = canonicalHost(emptyBase);
    targetParagraph(emptyHost).replaceChildren(document.createTextNode("入力"));
    expect(
      valueOf(reconcileCompositionDom(
        emptyHost,
        emptyBase,
        childSelection(emptyBase, 0, 0, 0),
      )),
    ).toMatchObject({ text: "入力" });

    const deletionBase = projection([[{ text: "abc", strong: false }]]);
    const deletionHost = canonicalHost(deletionBase);
    targetParagraph(deletionHost).replaceChildren();
    expect(
      valueOf(reconcileCompositionDom(
        deletionHost,
        deletionBase,
        textSelection(deletionBase, 0, 0, 3),
      )),
    ).toMatchObject({ text: "" });

    const brHost = canonicalHost(emptyBase);
    expect(
      valueOf(reconcileCompositionDom(
        brHost,
        emptyBase,
        childSelection(emptyBase, 0, 0, 0),
      )),
    ).toMatchObject({ text: "" });
  });

  it("rejects changes before or after the captured replacement", () => {
    const base = projection([[{ text: "abcdef", strong: false }]]);
    const host = canonicalHost(base);
    targetParagraph(host).replaceChildren(document.createTextNode("AXYef"));
    expectFailure(
      reconcileCompositionDom(host, base, textSelection(base, 0, 2, 4)),
      "composition.dom.unchanged_region_mismatch",
    );

    targetParagraph(host).replaceChildren(document.createTextNode("abXYeZ"));
    expectFailure(
      reconcileCompositionDom(host, base, textSelection(base, 0, 2, 4)),
      "composition.dom.unchanged_region_mismatch",
    );
  });

  it("requires every non-target paragraph to remain canonical", () => {
    const base = projection([
      [{ text: "one", strong: false }],
      [{ text: "two", strong: true }],
      [],
    ]);
    const host = canonicalHost(base);
    targetParagraph(host, 0).replaceChildren(document.createTextNode("oXne"));
    targetParagraph(host, 1).textContent = "changed";
    expectFailure(
      reconcileCompositionDom(host, base, textSelection(base, 0, 1, 1)),
      "composition.dom.invalid_structure",
    );

    const fresh = canonicalHost(base);
    fresh.append(document.createComment("foreign sibling"));
    expectFailure(
      reconcileCompositionDom(fresh, base, textSelection(base, 0, 1, 1)),
      "composition.dom.invalid_structure",
    );
  });

  it("rejects target markup outside the closed fallback vocabulary", () => {
    const base = projection([[{ text: "abc", strong: false }]]);
    const selection = textSelection(base, 0, 1, 1);

    const spanHost = canonicalHost(base);
    const span = document.createElement("span");
    span.textContent = "x";
    targetParagraph(spanHost).replaceChildren("a", span, "bc");
    expectFailure(
      reconcileCompositionDom(spanHost, base, selection),
      "composition.dom.invalid_structure",
    );

    const attributedHost = canonicalHost(base);
    const strong = document.createElement("strong");
    strong.setAttribute("style", "font-weight:bold");
    strong.textContent = "x";
    targetParagraph(attributedHost).replaceChildren("a", strong, "bc");
    expectFailure(
      reconcileCompositionDom(attributedHost, base, selection),
      "composition.dom.invalid_structure",
    );

    const commentHost = canonicalHost(base);
    targetParagraph(commentHost).replaceChildren("a", document.createComment("x"), "bc");
    expectFailure(
      reconcileCompositionDom(commentHost, base, selection),
      "composition.dom.invalid_structure",
    );

    const paragraphAttributeHost = canonicalHost(base);
    targetParagraph(paragraphAttributeHost).setAttribute("lang", "ja");
    expectFailure(
      reconcileCompositionDom(paragraphAttributeHost, base, selection),
      "composition.dom.invalid_structure",
    );
  });

  it("enforces candidate Unicode and resource limits", () => {
    const base = projection([[]]);
    const selection = childSelection(base, 0, 0, 0);
    const oversized = canonicalHost(base);
    targetParagraph(oversized).replaceChildren(
      document.createTextNode("x".repeat(MAX_COMPOSITION_TEXT_UTF16 + 1)),
    );
    expectFailure(
      reconcileCompositionDom(oversized, base, selection),
      "composition.dom.resource_limit",
    );

    const malformed = canonicalHost(base);
    targetParagraph(malformed).replaceChildren(document.createTextNode("\ud800"));
    expectFailure(
      reconcileCompositionDom(malformed, base, selection),
      "composition.dom.invalid_unicode",
    );
  });

  it("rejects cross-paragraph, stale-ownership, disconnected, and hostile inputs", () => {
    const base = projection([
      [{ text: "a", strong: false }],
      [{ text: "b", strong: false }],
    ]);
    const host = canonicalHost(base);
    const cross = valueOf(
      BaseRangeSelection.create(base, {
        kind: "range",
        anchor: {
          kind: "text",
          textPath: [0, 0],
          utf16Offset: 0,
          affinity: "after",
        },
        focus: {
          kind: "text",
          textPath: [1, 0],
          utf16Offset: 1,
          affinity: "before",
        },
      }),
    );
    expectFailure(
      reconcileCompositionDom(host, base, cross),
      "composition.dom.cross_paragraph",
    );

    const other = projection([[{ text: "a", strong: false }]]);
    expectFailure(
      reconcileCompositionDom(host, other, textSelection(base, 0, 0, 0)),
      "composition.dom.invalid_input",
    );

    const disconnected = canonicalHost(other);
    disconnected.remove();
    expectFailure(
      reconcileCompositionDom(disconnected, other, textSelection(other, 0, 0, 0)),
      "composition.dom.invalid_input",
    );

    const proxy = new Proxy(host, {
      get() {
        throw new Error("hostile host");
      },
    });
    expect(() => reconcileCompositionDom(proxy, base, cross)).not.toThrow();
    expectFailure(
      reconcileCompositionDom(proxy, base, cross),
      "composition.dom.invalid_input",
    );
  });
});

// Compile-time assertion that test fixtures track the public paragraph shape.
const _paragraphShape: BaseParagraphProjection = { runs: [] };
void _paragraphShape;
