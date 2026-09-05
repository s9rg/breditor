import { describe, expect, it } from "vitest";

import {
  BaseDocumentProjection,
  BaseProjectionUpdate,
  BreditorDomRenderer,
  type BrowserProjectionResult,
  type ProjectionRenderOutcome,
} from "./index.js";

type Run = Readonly<{ text: string; strong: boolean }>;

function valueOf<T>(result: BrowserProjectionResult<T>): T {
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

function projection(revision: number, paragraphs: readonly (readonly Run[])[]) {
  return valueOf(
    BaseDocumentProjection.create({
      schema: { name: "breditor/base", version: 1 },
      snapshot: { lineage: "dom-tests", revision: String(revision) },
      paragraphs: paragraphs.map((runs) => ({ runs })),
    }),
  );
}

function render(
  renderer: BreditorDomRenderer,
  host: HTMLElement,
  revision: number,
  paragraphs: readonly (readonly Run[])[],
): ProjectionRenderOutcome {
  return valueOf(renderer.render(host, projection(revision, paragraphs)));
}

describe("BreditorDomRenderer", () => {
  it("creates only the closed base DOM vocabulary and treats hostile text as text", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [
      [
        { text: '<img src=x onerror="attack()">', strong: false },
        { text: "bold", strong: true },
      ],
      [],
    ]);

    expect(outcome.mode).toBe("full");
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelectorAll("p")).toHaveLength(2);
    expect(host.querySelectorAll("strong")).toHaveLength(1);
    expect(host.querySelectorAll("br")).toHaveLength(1);
    expect(host.querySelectorAll("[data-path], [data-breditor-path]")).toHaveLength(0);
    expect(Array.from(host.querySelectorAll("p, strong, br")).every((node) => node.attributes.length === 0)).toBe(true);
    expect(host.textContent).toBe('<img src=x onerror="attack()">bold');
  });

  it("creates namespace-correct HTML descendants in an XML-owned XHTML host", () => {
    const xmlDocument = document.implementation.createDocument(null, "root");
    const host = xmlDocument.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    ) as HTMLElement;
    xmlDocument.documentElement.appendChild(host);
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[]]);

    const outcome = renderer.render(host, base);

    expect(outcome.ok).toBe(true);
    expect(host.firstElementChild?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(host.firstElementChild?.localName).toBe("p");
    expect(host.firstElementChild?.firstElementChild?.namespaceURI).toBe(
      "http://www.w3.org/1999/xhtml",
    );
    expect(host.firstElementChild?.firstElementChild?.localName).toBe("br");
    const paragraph = host.firstElementChild;
    const result = projection(1, [[]]);
    const update = valueOf(
      BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } }),
    );
    const updated = valueOf(renderer.update(valueOf(outcome).rendered, update));
    expect(updated.mode).toBe("incremental");
    expect(host.firstElementChild).toBe(paragraph);
  });

  it("keeps result methods controlled when MutationObserver setup or teardown throws", () => {
    const host = document.createElement("div");
    const window = host.ownerDocument.defaultView;
    if (window === null) {
      throw new Error("test document has no window");
    }
    const original = Object.getOwnPropertyDescriptor(window, "MutationObserver");
    try {
      Object.defineProperty(window, "MutationObserver", {
        configurable: true,
        value: class {
          constructor() {
            throw new Error("observer constructor failed");
          }
        },
      });
      const constructorRenderer = new BreditorDomRenderer();
      const constructed = valueOf(constructorRenderer.render(host, projection(0, [[]])));
      expect(host.innerHTML).toBe("<p><br></p>");
      expect(constructorRenderer.release(constructed.rendered)).toBe(true);

      Object.defineProperty(window, "MutationObserver", {
        configurable: true,
        value: class {
          observe(): void {}
          disconnect(): void {
            throw new Error("observer disconnect failed");
          }
        },
      });
      const disconnectRenderer = new BreditorDomRenderer();
      const observed = valueOf(disconnectRenderer.render(host, projection(1, [[]])));
      expect(disconnectRenderer.release(observed.rendered)).toBe(true);
      expect(observed.rendered.current).toBe(false);
    } finally {
      if (original === undefined) {
        Reflect.deleteProperty(window, "MutationObserver");
      } else {
        Object.defineProperty(window, "MutationObserver", original);
      }
    }
  });

  it("maps only exact AST-backed host, paragraph, and text nodes", () => {
    const host = document.createElement("section");
    const renderer = new BreditorDomRenderer();
    const { rendered } = render(renderer, host, 0, [
      [{ text: "plain", strong: false }, { text: "bold", strong: true }],
      [],
    ]);
    const firstParagraph = host.childNodes[0];
    const plainText = firstParagraph?.childNodes[0];
    const strong = firstParagraph?.childNodes[1];
    const strongText = strong?.childNodes[0];
    const emptyParagraph = host.childNodes[1];
    const placeholder = emptyParagraph?.childNodes[0];

    expect(rendered.nodeForAstPath([])).toBe(host);
    expect(rendered.nodeForAstPath([0])).toBe(firstParagraph);
    expect(rendered.nodeForAstPath([0, 0])).toBe(plainText);
    expect(rendered.nodeForAstPath([0, 1])).toBe(strongText);
    expect(rendered.astPathForDomNode(host)).toEqual([]);
    expect(rendered.astPathForDomNode(firstParagraph as Node)).toEqual([0]);
    expect(rendered.astPathForDomNode(strongText as Node)).toEqual([0, 1]);
    expect(rendered.astPathForDomNode(strong as Node)).toBeNull();
    expect(rendered.astPathForDomNode(placeholder as Node)).toBeNull();
    expect(rendered.nodeForAstPath([0, -1])).toBeNull();
    expect(rendered.nodeForAstPath([0, 0, 0])).toBeNull();
  });

  it("retains every affected paragraph element while refreshing its children", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [
      [{ text: "one", strong: false }],
      [{ text: "two", strong: false }],
      [{ text: "three", strong: false }],
    ]);
    const initial = valueOf(renderer.render(host, base));
    const oldParagraphs = Array.from(host.children);
    const oldFirstText = oldParagraphs[0]?.firstChild;
    const oldThirdText = oldParagraphs[2]?.firstChild;
    const result = projection(1, [
      [{ text: "ONE", strong: true }],
      [{ text: "two", strong: false }],
      [{ text: "THREE", strong: false }],
    ]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0, 2] },
      }),
    );

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("incremental");
    expect(Array.from(host.children)).toEqual(oldParagraphs);
    expect(host.children[0]?.firstChild).not.toBe(oldFirstText);
    expect(host.children[1]?.firstChild?.nodeValue).toBe("two");
    expect(host.children[2]?.firstChild).not.toBe(oldThirdText);
    expect(host.children[0]?.firstChild?.nodeName).toBe("STRONG");
    expect(host.textContent).toBe("ONEtwoTHREE");
    expect(initial.rendered.current).toBe(false);
    expect(initial.rendered.nodeForAstPath([0])).toBeNull();
  });

  it("reuses an exact root-splice prefix and shifted suffix with rebound paths", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(10, [
      [{ text: "prefix", strong: false }],
      [{ text: "remove-a", strong: false }],
      [{ text: "remove-b", strong: false }],
      [{ text: "suffix", strong: false }],
    ]);
    const initial = valueOf(renderer.render(host, base));
    const prefix = host.children[0];
    const oldMiddle = host.children[1];
    const suffix = host.children[3];
    const result = projection(11, [
      [{ text: "prefix", strong: false }],
      [{ text: "new-a", strong: false }],
      [{ text: "new-b", strong: true }],
      [{ text: "new-c", strong: false }],
      [{ text: "suffix", strong: false }],
    ]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: {
          kind: "rootSplice",
          oldRange: { start: 1, end: 3 },
          newRange: { start: 1, end: 4 },
        },
      }),
    );

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("incremental");
    expect(host.children[0]).toBe(prefix);
    expect(host.children[1]).not.toBe(oldMiddle);
    expect(host.children[4]).toBe(suffix);
    expect(outcome.rendered.nodeForAstPath([4])).toBe(suffix);
    expect(outcome.rendered.astPathForDomNode(suffix as Node)).toEqual([4]);
  });

  it.each(["root", "multipleOperations", "untrusted"] as const)(
    "uses a full fallback for %s impact",
    (kind) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const base = projection(0, [[{ text: "same", strong: false }]]);
      const initial = valueOf(renderer.render(host, base));
      const oldParagraph = host.firstChild;
      const result = projection(1, [[{ text: "same", strong: false }]]);
      const update = valueOf(BaseProjectionUpdate.create({ base, result, impact: { kind } }));

      const outcome = valueOf(renderer.update(initial.rendered, update));
      expect(outcome.mode).toBe("full");
      expect(outcome.fallbackReason).toBe(kind);
      expect(host.firstChild).not.toBe(oldParagraph);
    },
  );

  it("advances a no-content-change snapshot without replacing paragraph DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(2, [[{ text: "same", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const paragraph = host.firstChild;
    const text = paragraph?.firstChild;
    const result = projection(3, [[{ text: "same", strong: false }]]);
    const update = valueOf(BaseProjectionUpdate.create({ base, result, impact: { kind: "none" } }));

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("incremental");
    expect(host.firstChild).toBe(paragraph);
    expect(host.firstChild?.firstChild).toBe(text);
    expect(outcome.rendered.rendererGeneration).toBe(initial.rendered.rendererGeneration + 1n);
  });

  it("falls back fully when a candidate retained paragraph drifted", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [
      [{ text: "unchanged", strong: false }],
      [{ text: "change", strong: false }],
    ]);
    const initial = valueOf(renderer.render(host, base));
    const drifted = host.children[0] as HTMLElement;
    drifted.setAttribute("class", "foreign");
    const result = projection(1, [
      [{ text: "unchanged", strong: false }],
      [{ text: "changed", strong: false }],
    ]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [1] },
      }),
    );

    const outcome = valueOf(renderer.update(initial.rendered, update));
    expect(outcome.mode).toBe("full");
    expect(outcome.fallbackReason).toBe("domDrift");
    expect(host.children[0]).not.toBe(drifted);
    expect(host.querySelector(".foreign")).toBeNull();
  });

  it("rejects stale and foreign handles before changing the DOM", () => {
    const host = document.createElement("div");
    const firstRenderer = new BreditorDomRenderer();
    const secondRenderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const first = valueOf(firstRenderer.render(host, base));
    const result = projection(1, [[{ text: "result", strong: false }]]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0] },
      }),
    );

    const before = host.textContent;
    const foreign = secondRenderer.update(first.rendered, update);
    expect(foreign.ok).toBe(false);
    expect(host.textContent).toBe(before);

    valueOf(secondRenderer.render(host, base));
    expect(first.rendered.current).toBe(false);
    const stale = firstRenderer.update(first.rendered, update);
    expect(stale.ok).toBe(false);
    expect(host.textContent).toBe("base");
  });

  it("rejects an equal-looking but non-identical base before changing the DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const renderedBase = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, renderedBase));
    const copiedBase = projection(0, [[{ text: "base", strong: false }]]);
    const result = projection(1, [[{ text: "result", strong: false }]]);
    const update = valueOf(
      BaseProjectionUpdate.create({
        base: copiedBase,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0] },
      }),
    );

    const before = host.firstChild;
    const rejected = renderer.update(initial.rendered, update);
    expect(rejected.ok).toBe(false);
    expect(host.firstChild).toBe(before);
    expect(host.textContent).toBe("base");
  });

  it("invalidates mappings after observed external DOM mutation", async () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    expect(outcome.rendered.current).toBe(true);

    host.firstChild?.appendChild(document.createTextNode("foreign"));
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(outcome.rendered.current).toBe(false);
    expect(outcome.rendered.nodeForAstPath([0])).toBeNull();
  });

  it("releases a current mapping without removing DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [[]]);

    expect(renderer.release(outcome.rendered)).toBe(true);
    expect(renderer.release(outcome.rendered)).toBe(false);
    expect(outcome.rendered.current).toBe(false);
    expect(host.childNodes).toHaveLength(1);
  });
});
