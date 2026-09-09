import {
  BASE_INTENT_IDS,
  BASE_TOOLBAR_STATE_IDS,
} from "@breditor/browser";
import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8,
  MAX_REFERENCE_LINK_HREF_UTF8,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT,
  REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON,
  REFERENCE_FORMATTING_IDS,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
  REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_FORMATTING_RENDER_MANIFEST,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT,
  REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON,
  REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
  REFERENCE_FORMATTING_TOOLBAR_MANIFEST,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_LINK_REMOVE_INPUT_JSON,
  createReferenceFormattingDocument,
  createReferenceFormattingDocumentJson,
  createReferenceLinkRemoveInput,
  createReferenceLinkRemoveInputJson,
  createReferenceLinkSetInput,
  createReferenceLinkSetInputJson,
} from "./index.js";

const EXPECTED_BOOTSTRAP_JSON =
  '{"format":"breditor/profile-bootstrap","formatVersion":2,"schema":{"name":"example/editor","version":1},"extensions":[{"id":{"name":"example/highlight-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/highlight","revision":7}],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[{"formatKind":"example/highlight","actionId":"example/toggle-highlight","intentId":"example/toggle-highlight-intent","bindingId":"example/toggle-highlight-binding","actionStateId":"example/highlight-control"}],"inlineFormatSets":[]},{"id":{"name":"example/link-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/link","revision":1}],"inlineFormatPropertyContracts":[{"formatKind":"example/link","properties":[{"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},{"name":"example/open-in-new-window","presence":"required","valueType":{"kind":"boolean"}}]}],"inlineFormatToggles":[],"inlineFormatSets":[{"formatKind":"example/link","actionId":"example/set-link","intentId":"example/set-link-intent","bindingId":"example/set-link-binding","actionStateId":"example/link-presence"}]}]}';

describe("reference Highlight + Link semantic profile", () => {
  it("retains every original Highlight identity under additive names", () => {
    expect(REFERENCE_FORMATTING_IDS).toMatchObject({
      schemaName: REFERENCE_HIGHLIGHT_IDS.schemaName,
      schemaVersion: REFERENCE_HIGHLIGHT_IDS.schemaVersion,
      highlightExtensionName: REFERENCE_HIGHLIGHT_IDS.extensionName,
      highlightExtensionVersion: REFERENCE_HIGHLIGHT_IDS.extensionVersion,
      highlightFormatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
      highlightFormatRevision: REFERENCE_HIGHLIGHT_IDS.formatRevision,
      highlightActionId: REFERENCE_HIGHLIGHT_IDS.actionId,
      highlightIntentId: REFERENCE_HIGHLIGHT_IDS.intentId,
      highlightBindingId: REFERENCE_HIGHLIGHT_IDS.bindingId,
      highlightActionStateId: REFERENCE_HIGHLIGHT_IDS.actionStateId,
    });
    expect(REFERENCE_FORMATTING_IDS).toMatchObject({
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
    expect(Object.isFrozen(REFERENCE_FORMATTING_IDS)).toBe(true);
  });

  it("ships exact, frozen Profile Bootstrap V2 data", () => {
    expect(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON).toBe(
      EXPECTED_BOOTSTRAP_JSON,
    );
    expect(JSON.parse(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP_JSON)).toEqual(
      REFERENCE_FORMATTING_PROFILE_BOOTSTRAP,
    );
    expect(REFERENCE_FORMATTING_SCHEMA_FINGERPRINT).toBe(
      "sha256:33d6e87ffa2d10a504a3319d64a71a2c980ec90c3e1c9e4f6cf97809982113cc",
    );
    expectDataOnlyFrozenGraph(REFERENCE_FORMATTING_PROFILE_BOOTSTRAP);
  });
});

describe("reference Highlight + Link browser presentation", () => {
  it("renders Link outermost, then Strong, then Highlight", () => {
    expect(REFERENCE_FORMATTING_RENDER_MANIFEST).toEqual({
      recipes: [
        {
          formatKind: "breditor/strong",
          element: "strong",
          classes: [],
          before: [REFERENCE_FORMATTING_IDS.highlightFormatKind],
          after: [],
        },
        {
          formatKind: REFERENCE_FORMATTING_IDS.highlightFormatKind,
          element: "mark",
          classes: ["breditor-reference-highlight"],
          before: [],
          after: [],
        },
        {
          formatKind: REFERENCE_FORMATTING_IDS.linkFormatKind,
          element: "a",
          classes: ["breditor-link"],
          before: [
            "breditor/strong",
            REFERENCE_FORMATTING_IDS.highlightFormatKind,
          ],
          after: [],
          attributes: {
            kind: "safeLinkV1",
            hrefProperty: REFERENCE_FORMATTING_IDS.linkHrefProperty,
            openInNewWindowProperty:
              REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty,
          },
        },
      ],
    });
    expectDataOnlyFrozenGraph(REFERENCE_FORMATTING_RENDER_MANIFEST);
  });

  it("keeps typed Link input outside the static native-button toolbar", () => {
    expect(REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls).toEqual([
      expect.objectContaining({
        stateId: BASE_TOOLBAR_STATE_IDS.bold,
        command: { kind: "intent", intentId: BASE_INTENT_IDS.formatStrong },
      }),
      expect.objectContaining({
        stateId: REFERENCE_FORMATTING_IDS.highlightActionStateId,
        command: {
          kind: "intent",
          intentId: REFERENCE_FORMATTING_IDS.highlightIntentId,
        },
      }),
      expect.objectContaining({
        stateId: BASE_TOOLBAR_STATE_IDS.undo,
        command: { kind: "history", operation: "undo" },
      }),
      expect.objectContaining({
        stateId: BASE_TOOLBAR_STATE_IDS.redo,
        command: { kind: "history", operation: "redo" },
      }),
    ]);
    expect(REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls[0]?.command).toEqual({
      kind: "intent",
      intentId: BASE_INTENT_IDS.formatStrong,
    });
    expect(
      REFERENCE_FORMATTING_TOOLBAR_MANIFEST.controls.some(
        (control) =>
          control.stateId === REFERENCE_FORMATTING_IDS.linkPresenceStateId,
      ),
    ).toBe(false);
    expectDataOnlyFrozenGraph(REFERENCE_FORMATTING_TOOLBAR_MANIFEST);
  });
});

describe("reference Highlight + Link typed input", () => {
  it("writes set properties in lexical identity order", () => {
    const input = createReferenceLinkSetInput("https://example.test/a", true);
    expect(input).toEqual({
      operation: "set",
      properties: [
        {
          name: REFERENCE_FORMATTING_IDS.linkHrefProperty,
          value: "https://example.test/a",
        },
        {
          name: REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty,
          value: true,
        },
      ],
    });
    expect(createReferenceLinkSetInputJson("https://example.test/a", true)).toBe(
      '{"operation":"set","properties":[{"name":"example/href","value":"https://example.test/a"},{"name":"example/open-in-new-window","value":true}]}',
    );
    expect(createReferenceLinkSetInputJson("https://example.test/a")).toContain(
      '"value":false',
    );
    expectDataOnlyFrozenGraph(input);
  });

  it("exports one canonical frozen remove input", () => {
    expect(createReferenceLinkRemoveInput()).toEqual({ operation: "remove" });
    expect(REFERENCE_LINK_REMOVE_INPUT_JSON).toBe('{"operation":"remove"}');
    expect(createReferenceLinkRemoveInputJson()).toBe(
      REFERENCE_LINK_REMOVE_INPUT_JSON,
    );
    expectDataOnlyFrozenGraph(createReferenceLinkRemoveInput());
  });

  it("enforces required well-formed bounded href and Boolean values", () => {
    expect(() => createReferenceLinkSetInputJson("", false)).toThrow(RangeError);
    expect(() => createReferenceLinkSetInputJson("\ud800", false)).toThrow(
      TypeError,
    );
    expect(() =>
      createReferenceLinkSetInputJson(
        "😀".repeat(MAX_REFERENCE_LINK_HREF_UTF8 / 4),
        false,
      ),
    ).not.toThrow();
    expect(() =>
      createReferenceLinkSetInputJson(
        `${"😀".repeat(MAX_REFERENCE_LINK_HREF_UTF8 / 4)}a`,
        false,
      ),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceLinkSetInputJson(
        "https://example.test",
        "yes" as unknown as boolean,
      ),
    ).toThrow(TypeError);
  });
});

describe("reference Highlight + Link Document V2 fixtures", () => {
  it("exports one canonical empty combined-profile document", () => {
    expect(REFERENCE_FORMATTING_EMPTY_DOCUMENT).toEqual({
      format: "breditor/document",
      formatVersion: 2,
      schema: {
        name: REFERENCE_FORMATTING_IDS.schemaName,
        version: REFERENCE_FORMATTING_IDS.schemaVersion,
      },
      schemaFingerprint: REFERENCE_FORMATTING_SCHEMA_FINGERPRINT,
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
    expect(REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_FORMATTING_EMPTY_DOCUMENT),
    );
    expect(createReferenceFormattingDocumentJson()).toBe(
      REFERENCE_FORMATTING_EMPTY_DOCUMENT_JSON,
    );
    expectDataOnlyFrozenGraph(REFERENCE_FORMATTING_EMPTY_DOCUMENT);
  });

  it("orders Highlight before Link and Link properties lexically", () => {
    expect(REFERENCE_FORMATTING_SAMPLE_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_FORMATTING_SAMPLE_DOCUMENT),
    );
    expect(
      REFERENCE_FORMATTING_SAMPLE_DOCUMENT.root.children[0].children[0]?.formats,
    ).toEqual([
      {
        type: REFERENCE_FORMATTING_IDS.highlightFormatKind,
        properties: {},
      },
      {
        type: REFERENCE_FORMATTING_IDS.linkFormatKind,
        properties: {
          [REFERENCE_FORMATTING_IDS.linkHrefProperty]:
            "https://example.test/reference",
          [REFERENCE_FORMATTING_IDS.linkOpenInNewWindowProperty]: true,
        },
      },
    ]);
    expectDataOnlyFrozenGraph(REFERENCE_FORMATTING_SAMPLE_DOCUMENT);
  });

  it("validates text bounds and an exact data-only options shape", () => {
    const exact = "x".repeat(MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8);
    expect(
      createReferenceFormattingDocument(exact).root.children[0].children[0]?.text,
    ).toHaveLength(MAX_REFERENCE_FORMATTING_DOCUMENT_TEXT_UTF8);
    expect(() => createReferenceFormattingDocument(`${exact}x`)).toThrow(
      RangeError,
    );
    expect(() => createReferenceFormattingDocument("\ud800")).toThrow(TypeError);
    expect(() =>
      createReferenceFormattingDocument("text", {
        link: { href: "", openInNewWindow: false },
      }),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceFormattingDocument(
        "text",
        { extra: true } as unknown as Record<string, never>,
      ),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceFormattingDocument("text", {
        get highlighted(): boolean {
          throw new Error("must not execute");
        },
      }),
    ).toThrow(TypeError);
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
