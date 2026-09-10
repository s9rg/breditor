import {
  BASE_INTENT_IDS,
  BASE_TOOLBAR_STATE_IDS,
} from "@breditor/browser";
import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_LINK_HREF_UTF8,
  MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT,
  REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_IDS,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT,
  REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_SHOWCASE_TOOLBAR_MANIFEST,
  createReferenceShowcaseDocument,
  createReferenceShowcaseDocumentJson,
} from "./index.js";

const EXPECTED_SHOWCASE_BOOTSTRAP_JSON =
  '{"format":"breditor/profile-bootstrap","formatVersion":2,"schema":{"name":"example/showcase-editor","version":1},"extensions":[{"id":{"name":"example/highlight-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/highlight","revision":7}],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[{"formatKind":"example/highlight","actionId":"example/toggle-highlight","intentId":"example/toggle-highlight-intent","bindingId":"example/toggle-highlight-binding","actionStateId":"example/highlight-control"}],"inlineFormatSets":[]},{"id":{"name":"example/link-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/link","revision":1}],"inlineFormatPropertyContracts":[{"formatKind":"example/link","properties":[{"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},{"name":"example/open-in-new-window","presence":"required","valueType":{"kind":"boolean"}}]}],"inlineFormatToggles":[],"inlineFormatSets":[{"formatKind":"example/link","actionId":"example/set-link","intentId":"example/set-link-intent","bindingId":"example/set-link-binding","actionStateId":"example/link-presence"}]},{"id":{"name":"example/text-styles-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/emphasis","revision":1},{"kind":"example/strikethrough","revision":1},{"kind":"example/code","revision":1}],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[{"formatKind":"example/emphasis","actionId":"example/toggle-emphasis","intentId":"example/toggle-emphasis-intent","bindingId":"example/toggle-emphasis-binding","actionStateId":"example/emphasis-control"},{"formatKind":"example/strikethrough","actionId":"example/toggle-strikethrough","intentId":"example/toggle-strikethrough-intent","bindingId":"example/toggle-strikethrough-binding","actionStateId":"example/strikethrough-control"},{"formatKind":"example/code","actionId":"example/toggle-code","intentId":"example/toggle-code-intent","bindingId":"example/toggle-code-binding","actionStateId":"example/code-control"}],"inlineFormatSets":[]}]}';

const EXPECTED_HIGHLIGHT_BOOTSTRAP_JSON =
  '{"format":"breditor/profile-bootstrap","formatVersion":1,"schema":{"name":"example/editor","version":1},"extensions":[{"id":{"name":"example/highlight-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/highlight","revision":7}],"inlineFormatToggles":[{"formatKind":"example/highlight","actionId":"example/toggle-highlight","intentId":"example/toggle-highlight-intent","bindingId":"example/toggle-highlight-binding","actionStateId":"example/highlight-control"}]}]}';

const EXPECTED_FORMATTING_BOOTSTRAP_JSON =
  '{"format":"breditor/profile-bootstrap","formatVersion":2,"schema":{"name":"example/editor","version":1},"extensions":[{"id":{"name":"example/highlight-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/highlight","revision":7}],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[{"formatKind":"example/highlight","actionId":"example/toggle-highlight","intentId":"example/toggle-highlight-intent","bindingId":"example/toggle-highlight-binding","actionStateId":"example/highlight-control"}],"inlineFormatSets":[]},{"id":{"name":"example/link-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/link","revision":1}],"inlineFormatPropertyContracts":[{"formatKind":"example/link","properties":[{"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},{"name":"example/open-in-new-window","presence":"required","valueType":{"kind":"boolean"}}]}],"inlineFormatToggles":[],"inlineFormatSets":[{"formatKind":"example/link","actionId":"example/set-link","intentId":"example/set-link-intent","bindingId":"example/set-link-binding","actionStateId":"example/link-presence"}]}]}';

describe("reference showcase semantic profile", () => {
  it("retains the complete original Highlight and Link extension declarations", () => {
    expect(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[0]).toBe(
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[0],
    );
    expect(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[1]).toBe(
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[1],
    );
    expect(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[0]).toEqual(
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[0],
    );
    expect(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[1]).toEqual(
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP.extensions[1],
    );
    expect(REFERENCE_SHOWCASE_IDS).toMatchObject({
      highlightExtensionName: "example/highlight-extension",
      highlightExtensionVersion: 1,
      highlightFormatKind: "example/highlight",
      highlightFormatRevision: 7,
      highlightActionId: "example/toggle-highlight",
      highlightIntentId: "example/toggle-highlight-intent",
      highlightBindingId: "example/toggle-highlight-binding",
      highlightActionStateId: "example/highlight-control",
      linkExtensionName: "example/link-extension",
      linkExtensionVersion: 1,
      linkFormatKind: "example/link",
      linkFormatRevision: 1,
      linkHrefProperty: "example/href",
      linkOpenInNewWindowProperty: "example/open-in-new-window",
      linkActionId: "example/set-link",
      linkIntentId: "example/set-link-intent",
      linkBindingId: "example/set-link-binding",
      linkPresenceStateId: "example/link-presence",
    });
  });

  it("owns three distinct property-free generated toggle bundles", () => {
    expect(REFERENCE_SHOWCASE_IDS).toMatchObject({
      schemaName: "example/showcase-editor",
      schemaVersion: 1,
      textStylesExtensionName: "example/text-styles-extension",
      textStylesExtensionVersion: 1,
      emphasisFormatKind: "example/emphasis",
      emphasisFormatRevision: 1,
      emphasisActionId: "example/toggle-emphasis",
      emphasisIntentId: "example/toggle-emphasis-intent",
      emphasisBindingId: "example/toggle-emphasis-binding",
      emphasisActionStateId: "example/emphasis-control",
      strikethroughFormatKind: "example/strikethrough",
      strikethroughFormatRevision: 1,
      strikethroughActionId: "example/toggle-strikethrough",
      strikethroughIntentId: "example/toggle-strikethrough-intent",
      strikethroughBindingId: "example/toggle-strikethrough-binding",
      strikethroughActionStateId: "example/strikethrough-control",
      codeFormatKind: "example/code",
      codeFormatRevision: 1,
      codeActionId: "example/toggle-code",
      codeIntentId: "example/toggle-code-intent",
      codeBindingId: "example/toggle-code-binding",
      codeActionStateId: "example/code-control",
    });
    const ids = REFERENCE_SHOWCASE_IDS;
    for (const suffix of ["ActionId", "IntentId", "BindingId", "ActionStateId"] as const) {
      const values = [
        ids[`emphasis${suffix}`],
        ids[`strikethrough${suffix}`],
        ids[`code${suffix}`],
      ];
      expect(new Set(values).size).toBe(values.length);
    }
    expect(Object.isFrozen(REFERENCE_SHOWCASE_IDS)).toBe(true);
  });

  it("ships exact frozen V2 data and the Rust-compiler fingerprint", () => {
    expect(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON).toBe(
      EXPECTED_SHOWCASE_BOOTSTRAP_JSON,
    );
    expect(JSON.parse(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP_JSON)).toEqual(
      REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
    );
    expect(REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT).toBe(
      "sha256:2a90a5fea97e6f4c3b9c535a78b76e9daf50afd95df3e3119392bfc19fd5ec63",
    );
    expectDataOnlyFrozenGraph(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP);
  });

  it("does not alter either previously frozen reference profile", () => {
    expect(REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON).toBe(
      EXPECTED_HIGHLIGHT_BOOTSTRAP_JSON,
    );
    expect(REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT).toBe(
      "sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741",
    );
    expect(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON).toBe(
      EXPECTED_FORMATTING_BOOTSTRAP_JSON,
    );
    expect(REFERENCE_FORMATTING_SCHEMA_FINGERPRINT).toBe(
      "sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc",
    );
  });
});

describe("reference showcase browser presentation", () => {
  it("declares one unique Link-to-Code outer-to-inner chain", () => {
    expect(REFERENCE_SHOWCASE_RENDER_MANIFEST).toEqual({
      recipes: [
        {
          formatKind: "breditor/strong",
          element: "strong",
          classes: [],
          before: [REFERENCE_SHOWCASE_IDS.emphasisFormatKind],
          after: [],
        },
        {
          formatKind: REFERENCE_SHOWCASE_IDS.codeFormatKind,
          element: "code",
          classes: [],
          before: [],
          after: [],
        },
        {
          formatKind: REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
          element: "em",
          classes: [],
          before: [REFERENCE_SHOWCASE_IDS.highlightFormatKind],
          after: [],
        },
        {
          formatKind: REFERENCE_SHOWCASE_IDS.highlightFormatKind,
          element: "mark",
          classes: ["breditor-reference-highlight"],
          before: [REFERENCE_SHOWCASE_IDS.strikethroughFormatKind],
          after: [],
        },
        {
          formatKind: REFERENCE_SHOWCASE_IDS.linkFormatKind,
          element: "a",
          classes: ["breditor-link"],
          before: ["breditor/strong"],
          after: [],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: REFERENCE_SHOWCASE_IDS.linkHrefProperty,
            openInNewWindowProperty:
              REFERENCE_SHOWCASE_IDS.linkOpenInNewWindowProperty,
          },
        },
        {
          formatKind: REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
          element: "s",
          classes: [],
          before: [REFERENCE_SHOWCASE_IDS.codeFormatKind],
          after: [],
        },
      ],
    });

    const byKind = new Map(
      REFERENCE_SHOWCASE_RENDER_MANIFEST.recipes.map((recipe) => [
        recipe.formatKind,
        recipe,
      ]),
    );
    const orderedKinds = [
      REFERENCE_SHOWCASE_IDS.linkFormatKind,
      "breditor/strong",
      REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
      REFERENCE_SHOWCASE_IDS.highlightFormatKind,
      REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
      REFERENCE_SHOWCASE_IDS.codeFormatKind,
    ];
    const orderedElements = ["a", "strong", "em", "mark", "s", "code"];
    expect(orderedKinds.map((kind) => byKind.get(kind)?.element)).toEqual(
      orderedElements,
    );
    for (let index = 0; index < orderedKinds.length - 1; index += 1) {
      expect(byKind.get(orderedKinds[index] ?? "")?.before).toContain(
        orderedKinds[index + 1],
      );
    }
    expectDataOnlyFrozenGraph(REFERENCE_SHOWCASE_RENDER_MANIFEST);
  });

  it("binds exact controls in the requested presentation order", () => {
    expect(
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls.map((control) => control.label),
    ).toEqual([
      "Bold",
      "Italic",
      "Strikethrough",
      "Code",
      "Highlight",
      "Link",
      "Clear formatting",
      "Undo",
      "Redo",
    ]);
    expect(
      REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls.map(
        (control) => control.stateId,
      ),
    ).toEqual([
      BASE_TOOLBAR_STATE_IDS.bold,
      REFERENCE_SHOWCASE_IDS.emphasisActionStateId,
      REFERENCE_SHOWCASE_IDS.strikethroughActionStateId,
      REFERENCE_SHOWCASE_IDS.codeActionStateId,
      REFERENCE_SHOWCASE_IDS.highlightActionStateId,
      REFERENCE_SHOWCASE_IDS.linkPresenceStateId,
      BASE_TOOLBAR_STATE_IDS.clearInlineFormatting,
      BASE_TOOLBAR_STATE_IDS.undo,
      BASE_TOOLBAR_STATE_IDS.redo,
    ]);
    const intents = REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls
      .filter((control) => control.kind === "button")
      .flatMap((control) =>
        control.command.kind === "intent" ? [control.command.intentId] : [],
      );
    expect(intents).toEqual([
      BASE_INTENT_IDS.formatStrong,
      REFERENCE_SHOWCASE_IDS.emphasisIntentId,
      REFERENCE_SHOWCASE_IDS.strikethroughIntentId,
      REFERENCE_SHOWCASE_IDS.codeIntentId,
      REFERENCE_SHOWCASE_IDS.highlightIntentId,
      BASE_INTENT_IDS.clearInlineFormatting,
    ]);
    const showcaseLink = REFERENCE_SHOWCASE_TOOLBAR_MANIFEST.controls[5];
    const establishedLink = REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[2];
    expect(showcaseLink).toEqual(establishedLink);
    expectDataOnlyFrozenGraph(REFERENCE_SHOWCASE_TOOLBAR_MANIFEST);
  });
});

describe("reference showcase Document V2 fixtures", () => {
  it("exports one canonical empty document bound to the showcase fingerprint", () => {
    expect(REFERENCE_SHOWCASE_EMPTY_DOCUMENT).toEqual({
      format: "breditor/document",
      formatVersion: 2,
      schema: { name: "example/showcase-editor", version: 1 },
      schemaFingerprint: REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
      root: {
        kind: "element",
        type: "breditor/document",
        entityId: null,
        properties: {},
        children: [
          {
            kind: "element",
            type: "breditor/paragraph",
            entityId: null,
            properties: {},
            children: [],
          },
        ],
      },
    });
    expect(REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_SHOWCASE_EMPTY_DOCUMENT),
    );
    expect(createReferenceShowcaseDocumentJson()).toBe(
      REFERENCE_SHOWCASE_EMPTY_DOCUMENT_JSON,
    );
    expectDataOnlyFrozenGraph(REFERENCE_SHOWCASE_EMPTY_DOCUMENT);
  });

  it("keeps the sample Highlight plus safe Link while new styles start absent", () => {
    expect(REFERENCE_SHOWCASE_SAMPLE_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_SHOWCASE_SAMPLE_DOCUMENT),
    );
    expect(
      REFERENCE_SHOWCASE_SAMPLE_DOCUMENT.root.children[0].children[0],
    ).toEqual({
      kind: "text",
      text: "Breditor showcase",
      formats: [
        {
          type: REFERENCE_SHOWCASE_IDS.highlightFormatKind,
          properties: {},
        },
        {
          type: REFERENCE_SHOWCASE_IDS.linkFormatKind,
          properties: {
            [REFERENCE_SHOWCASE_IDS.linkHrefProperty]:
              "https://example.test/reference",
            [REFERENCE_SHOWCASE_IDS.linkOpenInNewWindowProperty]: true,
          },
        },
      ],
    });
    expectDataOnlyFrozenGraph(REFERENCE_SHOWCASE_SAMPLE_DOCUMENT);
  });

  it("emits all six formats and Link properties in canonical lexical order", () => {
    const document = createReferenceShowcaseDocument("all", {
      bold: true,
      italic: true,
      strikethrough: true,
      code: true,
      highlighted: true,
      link: {
        href: "https://example.test/all",
        openInNewWindow: false,
      },
    });
    expect(
      document.root.children[0].children[0]?.formats.map((format) => format.type),
    ).toEqual([
      "breditor/strong",
      REFERENCE_SHOWCASE_IDS.codeFormatKind,
      REFERENCE_SHOWCASE_IDS.emphasisFormatKind,
      REFERENCE_SHOWCASE_IDS.highlightFormatKind,
      REFERENCE_SHOWCASE_IDS.linkFormatKind,
      REFERENCE_SHOWCASE_IDS.strikethroughFormatKind,
    ]);
    expect(document.root.children[0].children[0]?.formats[4]).toEqual({
      type: REFERENCE_SHOWCASE_IDS.linkFormatKind,
      properties: {
        [REFERENCE_SHOWCASE_IDS.linkHrefProperty]: "https://example.test/all",
        [REFERENCE_SHOWCASE_IDS.linkOpenInNewWindowProperty]: false,
      },
    });
    expect(createReferenceShowcaseDocumentJson("all", {
      bold: true,
      italic: true,
      strikethrough: true,
      code: true,
      highlighted: true,
      link: {
        href: "https://example.test/all",
        openInNewWindow: false,
      },
    })).toBe(JSON.stringify(document));
    expectDataOnlyFrozenGraph(document);
  });

  it("enforces text bounds and the exact own-data options contract", () => {
    const exact = "x".repeat(MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8);
    expect(
      createReferenceShowcaseDocument(exact).root.children[0].children[0]?.text,
    ).toHaveLength(MAX_REFERENCE_SHOWCASE_DOCUMENT_TEXT_UTF8);
    expect(() => createReferenceShowcaseDocument(`${exact}x`)).toThrow(
      RangeError,
    );
    expect(() => createReferenceShowcaseDocument("\ud800")).toThrow(TypeError);
    expect(() =>
      createReferenceShowcaseDocument("text", {
        bold: "yes",
      } as unknown as { bold: boolean }),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceShowcaseDocument(
        "text",
        { extra: true } as unknown as Record<string, never>,
      ),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceShowcaseDocument(
        "text",
        new Date() as unknown as Record<string, never>,
      ),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceShowcaseDocument(
        "text",
        Object.create({ bold: true }) as Record<string, never>,
      ),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceShowcaseDocument("text", {
        get italic(): boolean {
          throw new Error("must not execute");
        },
      }),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceShowcaseDocument("text", {
        link: { href: "", openInNewWindow: false },
      }),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceShowcaseDocument("text", {
        link: {
          href: "😀".repeat(MAX_REFERENCE_LINK_HREF_UTF8 / 4),
          openInNewWindow: false,
        },
      }),
    ).not.toThrow();
  });
});

function expectDataOnlyFrozenGraph(value: unknown): void {
  const visited = new Set<object>();
  const visit = (candidate: unknown): void => {
    expect(typeof candidate).not.toBe("function");
    if (typeof candidate !== "object" || candidate === null) return;
    if (visited.has(candidate)) return;
    visited.add(candidate);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.getOwnPropertySymbols(candidate)).toHaveLength(0);
    for (const key of Reflect.ownKeys(candidate)) {
      if (key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      expect(descriptor).toBeDefined();
      expect(descriptor).toHaveProperty("value");
      expect(descriptor?.get).toBeUndefined();
      expect(descriptor?.set).toBeUndefined();
      visit(descriptor?.value);
    }
  };
  visit(value);
}
