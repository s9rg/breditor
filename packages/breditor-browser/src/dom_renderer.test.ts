import { describe, expect, it, vi } from "vitest";

import {
  BaseDocumentProjection,
  BaseRangeSelection,
  BaseProjectionUpdate,
  BreditorDomRenderer,
  type BrowserCompiledProfileDescriptor,
  type ProjectionRenderOutcome,
  compileBrowserPresentation,
  consumeWasmCompiledProfileDescriptor,
  createInlineFormatRenderManifest,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./advanced.js";
import {
  MAX_COMPOSITION_DOM_DYNAMIC_ATTRIBUTE_UTF8_BYTES,
  reconcileCompositionDom,
} from "./dom_composition_reconcile.js";
import { mapDomPointToBaseSelectionPoint } from "./dom_point_mapping.js";
import {
  nativeChildNodes,
  nativeNodeValue,
  nativeParentNode,
} from "./html_host.js";
import { createProfiledDocumentProjection } from "./projection.js";

type Run = Readonly<{ text: string; strong: boolean }>;

function valueOf<T>(result:
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{ code: string; message: string }>;
    }>
): T {
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
  it("renders canonical mixed profile formats and detects wrapper drift", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "breditor/strong",
      "example/highlight",
      "example/whisper",
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "example/whisper", element: "em", after: ["example/highlight"] },
          { formatKind: "breditor/strong", element: "strong", before: ["example/highlight"] },
          { formatKind: "example/highlight", element: "mark", classes: ["accent"] },
        ],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: {
        name: descriptor.schema.name,
        version: descriptor.schema.version,
        fingerprint: descriptor.schema.fingerprint,
      },
      snapshot: { lineage: "profile-dom-tests", revision: "0" },
      paragraphs: [{
        runs: [
          {
            text: "mixed",
            formatDetails: propertyFreeFormats([
              "breditor/strong",
              "example/highlight",
              "example/whisper",
            ]),
          },
          { text: "plain", formatDetails: [] },
        ],
      }],
    }, generation, descriptor));
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer(presentation);

    const rendered = valueOf(renderer.render(host, profiled)).rendered;

    expect(host.innerHTML).toBe(
      '<p><strong><mark class="accent"><em>mixed</em></mark></strong>plain</p>',
    );
    const strong = host.querySelector("strong");
    const mark = host.querySelector("mark");
    const emphasis = host.querySelector("em");
    const text = emphasis?.firstChild;
    expect(rendered.nodeForAstPath([0, 0])).toBe(text);
    expect(rendered.astPathForDomNode(strong as Node)).toBeNull();
    expect(rendered.astPathForDomNode(mark as Node)).toBeNull();
    expect(rendered.astPathForDomNode(emphasis as Node)).toBeNull();
    expect(rendered.validateCanonicalDom()).toBe(true);
    expect(mapDomPointToBaseSelectionPoint(rendered, strong as Node, 0)).toMatchObject({
      ok: true,
      value: { kind: "text", textPath: [0, 0], utf16Offset: 0 },
    });
    expect(mapDomPointToBaseSelectionPoint(rendered, mark as Node, 1)).toMatchObject({
      ok: true,
      value: { kind: "text", textPath: [0, 0], utf16Offset: 5 },
    });

    mark?.setAttribute("class", "accent extra");
    expect(rendered.validateCanonicalDom()).toBe(false);
    expect(rendered.nodeForAstPath([0, 0])).toBeNull();
  });

  it("derives canonical safe-link attributes and renders unsafe URLs inert", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "example/highlight",
      SAFE_LINK_FORMAT,
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          {
            formatKind: "example/highlight",
            element: "mark",
            classes: ["accent"],
            after: ["example/link"],
          },
          {
            formatKind: "example/link",
            element: "a",
            classes: ["breditor-link"],
            attributes: {
              kind: "safeLinkV1",
              hrefProperty: "example/href",
              openInNewWindowProperty: "example/open-in-new-window",
            },
          },
        ],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-link-dom-tests", revision: "0" },
      paragraphs: [{
        runs: [
          {
            text: "safe",
            formatDetails: [
              { kind: "example/highlight", properties: [] },
              {
                kind: "example/link",
                properties: [
                  {
                    name: "example/href",
                    value: "HTTPS://Example.COM:443/a/../path?q=one&b=two",
                  },
                  { name: "example/open-in-new-window", value: true },
                ],
              },
            ],
          },
          {
            text: "unsafe",
            formatDetails: [{
              kind: "example/link",
              properties: [
                { name: "example/href", value: "javascript:alert(1)" },
                { name: "example/open-in-new-window", value: true },
              ],
            }],
          },
        ],
      }],
    }, generation, descriptor));
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer(presentation);

    const rendered = valueOf(renderer.render(host, profiled)).rendered;

    expect(host.innerHTML).toBe(
      '<p><a class="breditor-link" href="https://example.com/path?q=one&amp;b=two" rel="noopener noreferrer" target="_blank"><mark class="accent">safe</mark></a><a class="breditor-link">unsafe</a></p>',
    );
    expect(rendered.validateCanonicalDom()).toBe(true);
    const safeAnchor = host.querySelector("a");
    safeAnchor?.setAttribute("rel", "opener");
    expect(rendered.validateCanonicalDom()).toBe(false);
  });

  it("admits only canonical safe links during a native-composition lease", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [SAFE_LINK_FORMAT]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{
          formatKind: "example/link",
          element: "a",
          classes: ["breditor-link"],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: "example/href",
            openInNewWindowProperty: "example/open-in-new-window",
          },
        }],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-link-composition-tests", revision: "0" },
      paragraphs: [{ runs: [{
        text: "abcdef",
        formatDetails: [{
          kind: "example/link",
          properties: [
            { name: "example/href", value: "https://example.test/path" },
            { name: "example/open-in-new-window", value: false },
          ],
        }],
      }] }],
    }, generation, descriptor));
    const selection = valueOf(BaseRangeSelection.create(profiled, {
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
        utf16Offset: 4,
        affinity: "before",
      },
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = valueOf(renderer.render(host, profiled)).rendered;
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    const anchor = host.querySelector("a");
    anchor?.replaceChildren(document.createTextNode("abXYef"));

    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: { originalText: "cd", text: "XY" },
    });

    anchor?.setAttribute("href", "javascript:alert(1)");
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });
  });

  it("bounds aggregate transient safe-link attribute validation before URL parsing", () => {
    expect(MAX_COMPOSITION_DOM_DYNAMIC_ATTRIBUTE_UTF8_BYTES).toBe(1024 * 1024);
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [SAFE_LINK_FORMAT]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{
          formatKind: "example/link",
          element: "a",
          classes: ["breditor-link"],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: "example/href",
            openInNewWindowProperty: "example/open-in-new-window",
          },
        }],
      }),
    );
    const prefix = "https://example.test/";
    const maximumHref = `${prefix}${"x".repeat(2_048 - prefix.length)}`;
    expect(maximumHref).toHaveLength(2_048);
    const linksAtLimit =
      MAX_COMPOSITION_DOM_DYNAMIC_ATTRIBUTE_UTF8_BYTES / maximumHref.length;
    expect(linksAtLimit).toBe(512);
    const baseText = "x".repeat(linksAtLimit + 1);
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "safe-link-composition-budget-tests", revision: "0" },
      paragraphs: [{ runs: [{
        text: baseText,
        formatDetails: [{
          kind: "example/link",
          properties: [
            { name: "example/href", value: "https://example.test/" },
            { name: "example/open-in-new-window", value: false },
          ],
        }],
      }] }],
    }, generation, descriptor));
    const selection = valueOf(BaseRangeSelection.create(profiled, {
      kind: "range",
      anchor: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: 0,
        affinity: "after",
      },
      focus: {
        kind: "text",
        textPath: [0, 0],
        utf16Offset: baseText.length,
        affinity: "before",
      },
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = valueOf(renderer.render(host, profiled)).rendered;
    expect(renderer.beginCompositionDomLease(rendered)).not.toBeNull();
    const paragraph = host.firstElementChild;
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const makeLink = (href: string): HTMLAnchorElement => {
      const anchor = document.createElement("a");
      anchor.setAttribute("class", "breditor-link");
      anchor.setAttribute("href", href);
      anchor.append(document.createTextNode("x"));
      return anchor;
    };

    paragraph.replaceChildren(
      ...Array.from({ length: linksAtLimit }, () => makeLink(maximumHref)),
    );
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: { text: "x".repeat(linksAtLimit) },
    });

    paragraph.append(makeLink("javascript:must-not-be-parsed()"));
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.resource_limit" },
    });
  });

  it("reuses canonical profile paragraphs under the exact presentation", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "breditor/strong",
      "example/highlight",
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "breditor/strong", element: "strong" },
          { formatKind: "example/highlight", element: "mark" },
        ],
      }),
    );
    const create = (revision: string, firstText: string) => valueOf(
      createProfiledDocumentProjection({
        schema: { ...descriptor.schema },
        snapshot: { lineage: "profile-update-tests", revision },
        paragraphs: [
          { runs: [{
            text: firstText,
            formatDetails: propertyFreeFormats([
              "breditor/strong",
              "example/highlight",
            ]),
          }] },
          { runs: [{ text: "stable", formatDetails: [] }] },
        ],
      }, generation, descriptor),
    );
    const base = create("0", "before");
    const result = create("1", "after");
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer(presentation);
    const initial = valueOf(renderer.render(host, base));
    const stableParagraph = host.childNodes[1];

    const outcome = valueOf(renderer.update(initial.rendered, update));

    expect(outcome.mode).toBe("incremental");
    expect(host.innerHTML).toBe("<p><strong><mark>after</mark></strong></p><p>stable</p>");
    expect(host.childNodes[1]).toBe(stableParagraph);
    expect(outcome.rendered.validateCanonicalDom()).toBe(true);
  });

  it("does not switch a projection between equal-profile presentation identities", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, ["example/highlight"]);
    const first = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: "example/highlight", element: "mark" }],
      }),
    );
    const second = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [{ formatKind: "example/highlight", element: "em" }],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "presentation-identity-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "x",
          formatDetails: propertyFreeFormats(["example/highlight"]),
        }],
      }],
    }, generation, descriptor));

    expect(new BreditorDomRenderer(first).render(
      document.createElement("div"),
      profiled,
    ).ok).toBe(true);
    expect(new BreditorDomRenderer(second).render(
      document.createElement("div"),
      profiled,
    )).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
  });

  it("rejects a profiled projection without its exact presentation", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, ["example/highlight"]);
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "profile-dom-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "x",
          formatDetails: propertyFreeFormats(["example/highlight"]),
        }],
      }],
    }, generation, descriptor));
    const host = document.createElement("div");

    expect(new BreditorDomRenderer().render(host, profiled)).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
    expect(host.childNodes).toHaveLength(0);
  });

  it("requires the descriptor's exact generation before projection construction", () => {
    const descriptorGeneration = profileGeneration();
    const foreignGeneration = profileGeneration();
    const descriptor = ownedProfileDescriptor(
      descriptorGeneration,
      ["example/highlight"],
    );

    expect(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "profile-generation-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "x",
          formatDetails: propertyFreeFormats(["example/highlight"]),
        }],
      }],
    }, foreignGeneration, descriptor)).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
  });

  it("reconciles composition through known profile wrappers and strips them", () => {
    const generation = profileGeneration();
    const descriptor = ownedProfileDescriptor(generation, [
      "breditor/strong",
      "example/highlight",
    ]);
    const presentation = compileBrowserPresentation(
      generation,
      descriptor,
      createInlineFormatRenderManifest({
        recipes: [
          { formatKind: "breditor/strong", element: "strong", before: ["example/highlight"] },
          { formatKind: "example/highlight", element: "mark", classes: ["accent"] },
        ],
      }),
    );
    const profiled = valueOf(createProfiledDocumentProjection({
      schema: { ...descriptor.schema },
      snapshot: { lineage: "profile-composition-tests", revision: "0" },
      paragraphs: [{
        runs: [{
          text: "abcdef",
          formatDetails: propertyFreeFormats([
            "breditor/strong",
            "example/highlight",
          ]),
        }],
      }],
    }, generation, descriptor));
    const selection = valueOf(BaseRangeSelection.create(profiled, {
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
        utf16Offset: 4,
        affinity: "before",
      },
    }));
    const host = document.createElement("div");
    document.body.append(host);
    const renderer = new BreditorDomRenderer(presentation);
    const rendered = valueOf(renderer.render(host, profiled)).rendered;
    const lease = renderer.beginCompositionDomLease(rendered);
    if (lease === null) throw new Error("expected composition lease");
    const strong = document.createElement("strong");
    const mark = document.createElement("mark");
    mark.className = "accent";
    mark.append(document.createTextNode("abXYef"));
    strong.append(mark);
    host.firstElementChild?.replaceChildren(strong);

    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: true,
      value: {
        replacementStartUtf16: 2,
        replacementEndUtf16: 4,
        originalText: "cd",
        text: "XY",
      },
    });

    const unknown = document.createElement("span");
    unknown.append(document.createTextNode("abXYef"));
    host.firstElementChild?.replaceChildren(unknown);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });

    const reversedMark = document.createElement("mark");
    reversedMark.className = "accent";
    const reversedStrong = document.createElement("strong");
    reversedStrong.append(document.createTextNode("abXYef"));
    reversedMark.append(reversedStrong);
    host.firstElementChild?.replaceChildren(reversedMark);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });

    const wrongClass = document.createElement("mark");
    wrongClass.className = "other";
    wrongClass.append(document.createTextNode("abXYef"));
    host.firstElementChild?.replaceChildren(wrongClass);
    expect(reconcileCompositionDom(host, profiled, selection)).toMatchObject({
      ok: false,
      error: { code: "composition.dom.invalid_structure" },
    });
    expect(renderer.discardCompositionDomLease(lease)).toBe(true);
  });

  it("blocks same-host renderer reentry from detached DOM constructors", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const originalCreateTextNode = host.ownerDocument.createTextNode.bind(
      host.ownerDocument,
    );
    let nested: ReturnType<BreditorDomRenderer["render"]> | undefined;
    let attempted = false;
    const constructor = vi.spyOn(host.ownerDocument, "createTextNode")
      .mockImplementation((text) => {
        if (!attempted) {
          attempted = true;
          nested = renderer.render(
            host,
            projection(1, [[{ text: "nested", strong: false }]]),
          );
        }
        return originalCreateTextNode(text);
      });
    try {
      const outer = valueOf(renderer.render(
        host,
        projection(0, [[{ text: "outer", strong: false }]]),
      ));
      expect(nested).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(host.textContent).toBe("outer");
      expect(outer.rendered.validateCanonicalDom()).toBe(true);
    } finally {
      constructor.mockRestore();
    }
  });

  it.each(["nodeType", "ownerDocument"] as const)(
    "ignores an own %s identity getter while admitting the native HTML host",
    (propertyName) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const applicationContent = document.createElement("aside");
      applicationContent.textContent = "application getter content";
      const nativeValue = host[propertyName];
      let getterReads = 0;
      Object.defineProperty(host, propertyName, {
        configurable: true,
        get: () => {
          getterReads += 1;
          if (applicationContent.parentNode === null) {
            host.append(applicationContent);
          }
          return nativeValue;
        },
      });

      try {
        const result = renderer.render(
          host,
          projection(0, [[{ text: "must not replace app content", strong: false }]]),
        );
        expect(result).toMatchObject({ ok: true });
        const hostChildren = nativeChildNodes(host);
        const paragraphChildren = nativeChildNodes(hostChildren[0] as Node);
        expect(getterReads).toBe(0);
        expect(hostChildren).toHaveLength(1);
        expect(paragraphChildren).toHaveLength(1);
        expect(nativeNodeValue(paragraphChildren[0] as Node)).toBe(
          "must not replace app content",
        );
        expect(nativeParentNode(applicationContent)).toBeNull();
      } finally {
        Reflect.deleteProperty(host, propertyName);
      }
    },
  );

  it("does not let an own childNodes getter forge the pre-render child baseline", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application childNodes content";
    const nativeChildNodes = host.childNodes;
    let getterReads = 0;
    Object.defineProperty(host, "childNodes", {
      configurable: true,
      get: () => {
        getterReads += 1;
        if (applicationContent.parentNode === null) {
          host.append(applicationContent);
        }
        return nativeChildNodes;
      },
    });

    try {
      expect(renderer.render(
        host,
        projection(0, [[{ text: "must not survive", strong: false }]]),
      )).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(getterReads).toBeGreaterThan(0);
      expect(host.querySelectorAll("p")).toHaveLength(0);
      expect(applicationContent.parentElement).toBe(host);
      expect(host.textContent).toBe("application childNodes content");
    } finally {
      Reflect.deleteProperty(host, "childNodes");
    }
  });

  it("rejects an SVG host whose own namespace shadow claims to be HTML", () => {
    const host = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const prior = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    host.append(prior);
    document.body.append(host);
    const namespaceShadow = vi.fn(() => "http://www.w3.org/1999/xhtml");
    Object.defineProperty(host, "namespaceURI", {
      configurable: true,
      get: namespaceShadow,
    });

    expect(
      new BreditorDomRenderer().render(
        host as unknown as HTMLElement,
        projection(0, [[{ text: "must not install", strong: false }]]),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "renderer.invalid_host" },
    });
    expect(namespaceShadow).not.toHaveBeenCalled();
    expect(host.childNodes).toHaveLength(1);
    expect(host.firstChild).toBe(prior);
  });

  it("snapshots update children before a forged canonical childNodes read", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "before", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const result = projection(1, [[{ text: "after", strong: true }]]);
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const forgedCanonicalChildren = Object.freeze(Array.from(host.childNodes));
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application update getter content";
    let getterReads = 0;
    Object.defineProperty(host, "childNodes", {
      configurable: true,
      get: () => {
        getterReads += 1;
        if (applicationContent.parentNode === null) {
          host.append(applicationContent);
        }
        return forgedCanonicalChildren;
      },
    });

    try {
      expect(renderer.update(initial.rendered, update)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(getterReads).toBeGreaterThan(0);
      expect(applicationContent.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(1);
      expect(host.textContent).toBe("beforeapplication update getter content");
      expect(initial.rendered.current).toBe(false);
      expect(renderer.owns(initial.rendered)).toBe(false);
    } finally {
      Reflect.deleteProperty(host, "childNodes");
    }
  });

  it("does not erase top-level content inserted by a retained paragraph refresh", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "before", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const paragraph = host.querySelector("p");
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const result = projection(1, [[{ text: "after", strong: false }]]);
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application refresh content";
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    const replace = vi.spyOn(paragraph, "replaceChildren").mockImplementation(
      (...nodes: (Node | string)[]) => {
        Reflect.apply(nativeReplaceChildren, paragraph, nodes);
        if (applicationContent.parentNode === null) {
          host.append(applicationContent);
        }
      },
    );

    try {
      expect(renderer.update(initial.rendered, update)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(applicationContent.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(1);
      expect(paragraph.textContent).toBe("before");
      expect(host.textContent).toBe("beforeapplication refresh content");
      expect(initial.rendered.current).toBe(false);
      expect(renderer.owns(initial.rendered)).toBe(false);
    } finally {
      replace.mockRestore();
    }
  });

  it("restores a retained paragraph when its write mutates then throws", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "before", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const paragraph = host.querySelector("p");
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const result = projection(1, [[{ text: "after", strong: false }]]);
    const update = valueOf(BaseProjectionUpdate.create({
      base,
      result,
      impact: { kind: "textContainers", paragraphIndexes: [0] },
    }));
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    const replace = vi.spyOn(paragraph, "replaceChildren").mockImplementation(
      (...nodes: (Node | string)[]) => {
        Reflect.apply(nativeReplaceChildren, paragraph, nodes);
        throw new Error("retained write failed after mutation");
      },
    );

    try {
      expect(renderer.update(initial.rendered, update)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(paragraph.textContent).toBe("before");
      expect(host.firstChild).toBe(paragraph);
      expect(initial.rendered.current).toBe(false);
      expect(renderer.owns(initial.rendered)).toBe(false);
    } finally {
      replace.mockRestore();
    }
  });

  it.each(["createElementNS", "createTextNode"] as const)(
    "does not clobber host content changed by %s during an initial detached build",
    (constructorName) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const applicationContent = document.createElement("aside");
      applicationContent.textContent = "application initial content";
      let mutated = false;
      let restore: () => void;

      if (constructorName === "createElementNS") {
        const original = host.ownerDocument.createElementNS.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
          .mockImplementation((namespace, qualifiedName, options) => {
            const element = original(namespace, qualifiedName, options);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return element;
          });
        restore = () => constructor.mockRestore();
      } else {
        const original = host.ownerDocument.createTextNode.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createTextNode")
          .mockImplementation((text) => {
            const node = original(text);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return node;
          });
        restore = () => constructor.mockRestore();
      }

      try {
        expect(renderer.render(
          host,
          projection(0, [[{ text: "canonical", strong: false }]]),
        )).toMatchObject({
          ok: false,
          error: { code: "renderer.dom_write_failed" },
        });
        expect(mutated).toBe(true);
        expect(host.childNodes).toHaveLength(1);
        expect(host.firstChild).toBe(applicationContent);
        expect(host.textContent).toBe("application initial content");
      } finally {
        restore();
      }
    },
  );

  it.each(["createElementNS", "createTextNode"] as const)(
    "invalidates an update without clobbering host content changed by %s during its detached build",
    (constructorName) => {
      const host = document.createElement("div");
      const renderer = new BreditorDomRenderer();
      const base = projection(0, [[{ text: "before", strong: false }]]);
      const initial = valueOf(renderer.render(host, base));
      const result = projection(1, [[{ text: "after", strong: true }]]);
      const update = valueOf(BaseProjectionUpdate.create({
        base,
        result,
        impact: { kind: "textContainers", paragraphIndexes: [0] },
      }));
      const applicationContent = document.createElement("aside");
      applicationContent.textContent = "application update content";
      let mutated = false;
      let restore: () => void;

      if (constructorName === "createElementNS") {
        const original = host.ownerDocument.createElementNS.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
          .mockImplementation((namespace, qualifiedName, options) => {
            const element = original(namespace, qualifiedName, options);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return element;
          });
        restore = () => constructor.mockRestore();
      } else {
        const original = host.ownerDocument.createTextNode.bind(host.ownerDocument);
        const constructor = vi.spyOn(host.ownerDocument, "createTextNode")
          .mockImplementation((text) => {
            const node = original(text);
            if (!mutated) {
              mutated = true;
              host.replaceChildren(applicationContent);
            }
            return node;
          });
        restore = () => constructor.mockRestore();
      }

      try {
        expect(renderer.update(initial.rendered, update)).toMatchObject({
          ok: false,
          error: { code: "renderer.dom_write_failed" },
        });
        expect(mutated).toBe(true);
        expect(host.childNodes).toHaveLength(1);
        expect(host.firstChild).toBe(applicationContent);
        expect(host.textContent).toBe("application update content");
        expect(initial.rendered.current).toBe(false);
        expect(initial.rendered.nodeForAstPath([])).toBeNull();
        expect(renderer.owns(initial.rendered)).toBe(false);
      } finally {
        restore();
      }
    },
  );

  it("fails closed when a host write reports success without installing canonical DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const replace = vi.spyOn(host, "replaceChildren").mockImplementation(() => undefined);
    try {
      expect(renderer.render(
        host,
        projection(0, [[{ text: "missing", strong: false }]]),
      )).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(host.childNodes).toHaveLength(0);
    } finally {
      replace.mockRestore();
    }
  });

  it("removes only newly installed paragraphs when a host write throws after mutation", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const applicationNode = document.createElement("aside");
    applicationNode.textContent = "application content";
    const nativeReplaceChildren = Element.prototype.replaceChildren;
    const replace = vi.spyOn(host, "replaceChildren").mockImplementation(
      (...nodes: (Node | string)[]) => {
        Reflect.apply(nativeReplaceChildren, host, nodes);
        host.append(applicationNode);
        throw new Error("write failed after mutation");
      },
    );
    try {
      expect(
        renderer.render(
          host,
          projection(0, [[{ text: "must not remain", strong: false }]]),
        ),
      ).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(applicationNode.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(0);
      expect(host.textContent).toBe("application content");
    } finally {
      replace.mockRestore();
    }
  });

  it("does not expose invariant-critical implementation helpers at runtime", () => {
    const surface = Object.getOwnPropertyNames(BreditorDomRenderer.prototype);
    expect(surface).not.toContain("liveCompositionLeaseRecord");
    expect(surface).not.toContain("invalidateCompositionLeaseRecord");
    expect(surface).not.toContain("install");
  });

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

  it("bypasses an own defaultView shadow when installing observation", () => {
    const host = document.createElement("div");
    const ownerDocument = host.ownerDocument;
    const defaultView = vi.fn(() => {
      throw new Error("own defaultView shadow must not be read");
    });
    Object.defineProperty(ownerDocument, "defaultView", {
      configurable: true,
      get: defaultView,
    });
    try {
      const renderer = new BreditorDomRenderer();
      const outcome = valueOf(renderer.render(host, projection(0, [[]])));
      expect(outcome.rendered.validateCanonicalDom()).toBe(true);
      expect(defaultView).not.toHaveBeenCalled();
      expect(renderer.release(outcome.rendered)).toBe(true);
    } finally {
      Reflect.deleteProperty(ownerDocument, "defaultView");
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

  it("synchronously rejects subtree drift hidden behind own DOM shadows", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const outcome = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    const paragraph = host.querySelector("p");
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error("expected rendered paragraph");
    }
    const forgedChildren = Object.freeze(Array.from(paragraph.childNodes));
    paragraph.append(document.createTextNode("foreign"));
    const childNodesShadow = vi.fn(() => forgedChildren);
    const attributesShadow = vi.fn(() => Object.freeze({ length: 0 }));
    Object.defineProperties(paragraph, {
      childNodes: { configurable: true, get: childNodesShadow },
      attributes: { configurable: true, get: attributesShadow },
    });

    try {
      expect(outcome.rendered.validateCanonicalDom()).toBe(false);
      expect(outcome.rendered.current).toBe(false);
      expect(outcome.rendered.nodeForAstPath([0, 0])).toBeNull();
      expect(childNodesShadow).not.toHaveBeenCalled();
      expect(attributesShadow).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(paragraph, "childNodes");
      Reflect.deleteProperty(paragraph, "attributes");
    }
  });

  it("leases exact renderer ownership across expected native composition DOM drift", async () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const outcome = valueOf(renderer.render(host, base));

    const lease = renderer.beginCompositionDomLease(outcome.rendered);
    expect(lease).not.toBeNull();
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    expect(outcome.rendered.current).toBe(false);
    expect(outcome.rendered.validateCanonicalDom()).toBe(false);
    expect(outcome.rendered.nodeForAstPath([0, 0])).toBeNull();
    expect(renderer.ownsCompositionDomLease(lease, outcome.rendered)).toBe(true);

    (host.firstChild as Element | null)?.replaceChildren(
      document.createTextNode("provisional"),
    );
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(renderer.ownsCompositionDomLease(lease, outcome.rendered)).toBe(true);
    expect(renderer.owns(outcome.rendered)).toBe(false);
  });

  it("restores a composition lease once and rejects forged or foreign capabilities", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const foreignRenderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    (host.firstChild as Element | null)?.replaceChildren(document.createTextNode("native"));

    expect(renderer.beginCompositionDomLease(initial.rendered)).toBeNull();
    expect(foreignRenderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
    expect(
      renderer.ownsCompositionDomLease(Object.freeze({}), initial.rendered),
    ).toBe(false);

    const result = projection(1, [[{ text: "committed", strong: false }]]);
    const restored = valueOf(renderer.restoreCompositionDomLease(lease, result));
    expect(restored.mode).toBe("full");
    expect(host.textContent).toBe("committed");
    expect(restored.rendered.current).toBe(true);
    expect(initial.rendered.current).toBe(false);
    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);

    const repeated = renderer.restoreCompositionDomLease(lease, base);
    expect(repeated.ok).toBe(false);
    expect(host.textContent).toBe("committed");
  });

  it("keeps a composition lease recoverable across invalid input and detached build failure", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    host.textContent = "native";

    expect(renderer.restoreCompositionDomLease(lease, {} as never)).toMatchObject({
      ok: false,
      error: { code: "projection.invalid_shape" },
    });
    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(true);

    const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
      .mockImplementation(() => {
        throw new Error("hostile detached DOM constructor");
      });
    try {
      expect(renderer.restoreCompositionDomLease(lease, base)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
    } finally {
      constructor.mockRestore();
    }

    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(true);
    expect(renderer.discardCompositionDomLease(lease)).toBe(true);
    expect(initial.rendered.current).toBe(false);

    const recovered = valueOf(renderer.render(host, base));
    expect(recovered.rendered.current).toBe(true);
    expect(host.textContent).toBe("base");
    const reacquired = renderer.beginCompositionDomLease(recovered.rendered);
    expect(reacquired).not.toBeNull();
    if (reacquired !== null) {
      expect(renderer.discardCompositionDomLease(reacquired)).toBe(true);
    }
  });

  it("does not absorb content inserted during composition restore construction", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    (host.firstChild as Element | null)?.replaceChildren(
      document.createTextNode("native"),
    );
    const applicationContent = document.createElement("aside");
    applicationContent.textContent = "application restore content";
    const original = host.ownerDocument.createElementNS.bind(host.ownerDocument);
    let mutated = false;
    const constructor = vi.spyOn(host.ownerDocument, "createElementNS")
      .mockImplementation((namespace, qualifiedName, options) => {
        const element = original(namespace, qualifiedName, options);
        if (!mutated) {
          mutated = true;
          host.append(applicationContent);
        }
        return element;
      });

    try {
      expect(renderer.restoreCompositionDomLease(
        lease,
        projection(1, [[{ text: "committed", strong: false }]]),
      )).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
      expect(mutated).toBe(true);
      expect(applicationContent.parentElement).toBe(host);
      expect(host.querySelectorAll("p")).toHaveLength(1);
      expect(host.textContent).toBe("nativeapplication restore content");
      expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
      expect(initial.rendered.current).toBe(false);
    } finally {
      constructor.mockRestore();
    }
  });

  it("invalidates host ownership when installation fails after spending a lease", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const base = projection(0, [[{ text: "base", strong: false }]]);
    const initial = valueOf(renderer.render(host, base));
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    host.textContent = "native";

    const replace = vi.spyOn(host, "replaceChildren").mockImplementation(() => {
      throw new Error("hostile host write");
    });
    try {
      expect(renderer.restoreCompositionDomLease(lease, base)).toMatchObject({
        ok: false,
        error: { code: "renderer.dom_write_failed" },
      });
    } finally {
      replace.mockRestore();
    }

    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
    expect(renderer.discardCompositionDomLease(lease)).toBe(false);
    expect(initial.rendered.current).toBe(false);
    expect(renderer.release(initial.rendered)).toBe(false);

    const recovered = valueOf(renderer.render(host, base));
    expect(recovered.rendered.current).toBe(true);
    expect(host.textContent).toBe("base");
    const reacquired = renderer.beginCompositionDomLease(recovered.rendered);
    expect(reacquired).not.toBeNull();
    if (reacquired !== null) {
      expect(renderer.discardCompositionDomLease(reacquired)).toBe(true);
    }
  });

  it("invalidates an explicitly discarded composition lease without changing DOM", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const initial = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }
    host.textContent = "native";

    expect(renderer.discardCompositionDomLease(lease)).toBe(true);
    expect(renderer.discardCompositionDomLease(lease)).toBe(false);
    expect(initial.rendered.current).toBe(false);
    expect(host.textContent).toBe("native");
  });

  it("invalidates a lease when another render supersedes its host ownership", () => {
    const host = document.createElement("div");
    const renderer = new BreditorDomRenderer();
    const initial = render(renderer, host, 0, [[{ text: "base", strong: false }]]);
    const lease = renderer.beginCompositionDomLease(initial.rendered);
    if (lease === null) {
      throw new Error("expected composition lease");
    }

    render(renderer, host, 1, [[{ text: "replacement", strong: false }]]);

    expect(renderer.ownsCompositionDomLease(lease, initial.rendered)).toBe(false);
    expect(renderer.restoreCompositionDomLease(lease, initial.rendered.projection).ok).toBe(
      false,
    );
    expect(host.textContent).toBe("replacement");
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

const PROFILE_FINGERPRINT =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function profileGeneration(): WasmProfileGenerationView {
  const generation: WasmProfileGenerationView = {
    matches(candidate) {
      return candidate === generation;
    },
    free() {},
  };
  return generation;
}

function ownedProfileDescriptor(
  generation: WasmProfileGenerationView,
  formats: readonly ProfileFormatFixture[],
): BrowserCompiledProfileDescriptor {
  const absent = (): undefined => undefined;
  const normalized = formats.map((format) => typeof format === "string"
    ? { kind: format, properties: [] }
    : format);
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/document",
    schemaVersion: 1,
    schemaFingerprint: PROFILE_FINGERPRINT,
    formatCount: formats.length,
    intentCount: 0,
    actionStateCount: 0,
    matchesProfileGeneration: (candidate) => candidate === generation,
    formatKind: (index) => normalized[index]?.kind,
    formatRevision: (index) =>
      index >= 0 && index < formats.length ? 1 : undefined,
    formatPropertyCount: (index) => normalized[index]?.properties.length,
    formatPropertyName: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.name,
    formatPropertyPresence: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.presence,
    formatPropertyValueType: (formatIndex, propertyIndex) =>
      normalized[formatIndex]?.properties[propertyIndex]?.valueType.kind,
    formatPropertyIntegerMinimum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.minimum : undefined;
    },
    formatPropertyIntegerMaximum: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "integer" ? type.maximum : undefined;
    },
    formatPropertyStringMinimumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.minimumUtf8Bytes : undefined;
    },
    formatPropertyStringMaximumUtf8Bytes: (formatIndex, propertyIndex) => {
      const type = normalized[formatIndex]?.properties[propertyIndex]?.valueType;
      return type?.kind === "string" ? type.maximumUtf8Bytes : undefined;
    },
    intentId: absent,
    intentInputKind: absent,
    intentInputContractName: absent,
    intentInputContractVersion: absent,
    intentActivationContract: absent,
    intentValueContractName: absent,
    intentValueContractVersion: absent,
    actionStateId: absent,
    actionStateSourceKind: absent,
    actionStateSourceActionId: absent,
    actionStateSourceIntentId: absent,
    actionStateHistoryDirection: absent,
    actionStateActivationContract: absent,
    actionStateValueContractName: absent,
    actionStateValueContractVersion: absent,
    free: () => undefined,
  };
  const result = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!result.ok) throw new Error("test descriptor was rejected");
  return result.descriptor;
}

type ProfilePropertyFixture = Readonly<{
  name: string;
  presence: "required" | "optional";
  valueType:
    | Readonly<{ kind: "boolean" }>
    | Readonly<{ kind: "integer"; minimum?: number; maximum?: number }>
    | Readonly<{
      kind: "string";
      minimumUtf8Bytes: number;
      maximumUtf8Bytes: number;
    }>;
}>;

type ProfileFormatFixture = string | Readonly<{
  kind: string;
  properties: readonly ProfilePropertyFixture[];
}>;

const SAFE_LINK_FORMAT: Exclude<ProfileFormatFixture, string> = Object.freeze({
  kind: "example/link",
  properties: Object.freeze([
    Object.freeze({
      name: "example/href",
      presence: "required" as const,
      valueType: Object.freeze({
        kind: "string" as const,
        minimumUtf8Bytes: 1,
        maximumUtf8Bytes: 2_048,
      }),
    }),
    Object.freeze({
      name: "example/open-in-new-window",
      presence: "required" as const,
      valueType: Object.freeze({ kind: "boolean" as const }),
    }),
  ]),
});

function propertyFreeFormats(formats: readonly string[]) {
  return formats.map((kind) => ({ kind, properties: [] }));
}
