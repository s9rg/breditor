import {
  BASE_INTENT_IDS,
  BASE_TOOLBAR_STATE_IDS,
} from "@breditor/browser";
import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8,
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT,
  REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
  REFERENCE_HIGHLIGHT_IDS,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP,
  REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_HIGHLIGHT_RENDER_MANIFEST,
  REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT,
  REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT_JSON,
  REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
  REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST,
  createReferenceHighlightDocument,
  createReferenceHighlightDocumentJson,
} from "./index.js";

const EXPECTED_BOOTSTRAP_JSON =
  '{"format":"breditor/profile-bootstrap","formatVersion":1,"schema":{"name":"example/editor","version":1},"extensions":[{"id":{"name":"example/highlight-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/highlight","revision":7}],"inlineFormatToggles":[{"formatKind":"example/highlight","actionId":"example/toggle-highlight","intentId":"example/toggle-highlight-intent","bindingId":"example/toggle-highlight-binding","actionStateId":"example/highlight-control"}]}]}';

describe("reference Highlight semantic profile", () => {
  it("exports the exact Rust/Wasm reference identities and fingerprint", () => {
    expect(REFERENCE_HIGHLIGHT_IDS).toEqual({
      schemaName: "example/editor",
      schemaVersion: 1,
      extensionName: "example/highlight-extension",
      extensionVersion: 1,
      formatKind: "example/highlight",
      formatRevision: 7,
      actionId: "example/toggle-highlight",
      intentId: "example/toggle-highlight-intent",
      bindingId: "example/toggle-highlight-binding",
      actionStateId: "example/highlight-control",
    });
    expect(REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT).toBe(
      "sha256:374d5f058129ab8916d052866e37f3b3540dbb754ba560e55086415a3c58f741",
    );
  });

  it("ships one compact, deeply frozen, data-only toggle bootstrap", () => {
    expect(REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON).toBe(EXPECTED_BOOTSTRAP_JSON);
    expect(JSON.parse(REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP_JSON)).toEqual(
      REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP,
    );
    expectDataOnlyFrozenGraph(REFERENCE_HIGHLIGHT_PROFILE_BOOTSTRAP);
  });
});

describe("reference Highlight browser presentation", () => {
  it("completely renders base Strong outside the reference Highlight", () => {
    expect(REFERENCE_HIGHLIGHT_RENDER_MANIFEST).toEqual({
      recipes: [
        {
          formatKind: "breditor/strong",
          element: "strong",
          classes: [],
          before: [REFERENCE_HIGHLIGHT_IDS.formatKind],
          after: [],
        },
        {
          formatKind: REFERENCE_HIGHLIGHT_IDS.formatKind,
          element: "mark",
          classes: ["breditor-reference-highlight"],
          before: [],
          after: [],
        },
      ],
    });
    expectDataOnlyFrozenGraph(REFERENCE_HIGHLIGHT_RENDER_MANIFEST);
  });

  it("uses only descriptor-matching intents and history commands", () => {
    expect(REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST).toEqual({
      label: "Editor controls",
      controls: [
        expect.objectContaining({
          stateId: BASE_TOOLBAR_STATE_IDS.bold,
          activation: "tracked",
          command: { kind: "intent", intentId: BASE_INTENT_IDS.formatStrong },
        }),
        expect.objectContaining({
          stateId: REFERENCE_HIGHLIGHT_IDS.actionStateId,
          activation: "tracked",
          command: { kind: "intent", intentId: REFERENCE_HIGHLIGHT_IDS.intentId },
        }),
        expect.objectContaining({
          stateId: BASE_TOOLBAR_STATE_IDS.undo,
          activation: "stateless",
          command: { kind: "history", operation: "undo" },
        }),
        expect.objectContaining({
          stateId: BASE_TOOLBAR_STATE_IDS.redo,
          activation: "stateless",
          command: { kind: "history", operation: "redo" },
        }),
      ],
    });
    expect(
      REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST.controls.some(
        (control) => control.command.kind === "action",
      ),
    ).toBe(false);
    expectDataOnlyFrozenGraph(REFERENCE_HIGHLIGHT_TOOLBAR_MANIFEST);
  });
});

describe("reference Highlight Document V2 fixtures", () => {
  it("exports a canonical empty paragraph bound to the exact fingerprint", () => {
    expect(REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT).toEqual({
      format: "breditor/document",
      formatVersion: 2,
      schema: { name: REFERENCE_HIGHLIGHT_IDS.schemaName, version: 1 },
      schemaFingerprint: REFERENCE_HIGHLIGHT_SCHEMA_FINGERPRINT,
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
    expect(REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT),
    );
    expect(createReferenceHighlightDocumentJson()).toBe(
      REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
    );
    expect(createReferenceHighlightDocumentJson("", "highlighted")).toBe(
      REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT_JSON,
    );
    expectDataOnlyFrozenGraph(REFERENCE_HIGHLIGHT_EMPTY_DOCUMENT);
  });

  it("exports and recreates one canonical highlighted text run", () => {
    expect(REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT),
    );
    expect(REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT.root.children[0].children).toEqual([
      {
        kind: "text",
        text: "Highlighted text",
        formats: [
          { type: REFERENCE_HIGHLIGHT_IDS.formatKind, properties: {} },
        ],
      },
    ]);
    expect(
      createReferenceHighlightDocument("Highlighted text", "highlighted"),
    ).toEqual(REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT);
    expectDataOnlyFrozenGraph(REFERENCE_HIGHLIGHT_SAMPLE_DOCUMENT);
  });

  it("creates exactly one canonical plain or highlighted text run", () => {
    const plain = createReferenceHighlightDocument("a😀b");
    const highlighted = createReferenceHighlightDocument("a😀b", "highlighted");
    expect(plain.root.children[0].children).toEqual([
      { kind: "text", text: "a😀b", formats: [] },
    ]);
    expect(highlighted.root.children[0].children).toEqual([
      {
        kind: "text",
        text: "a😀b",
        formats: [
          { type: REFERENCE_HIGHLIGHT_IDS.formatKind, properties: {} },
        ],
      },
    ]);
    expectDataOnlyFrozenGraph(plain);
    expectDataOnlyFrozenGraph(highlighted);
  });

  it("rejects malformed UTF-16 and invalid runtime inputs", () => {
    expect(() => createReferenceHighlightDocument("\ud800")).toThrow(TypeError);
    expect(() => createReferenceHighlightDocument("\udc00")).toThrow(TypeError);
    expect(() =>
      createReferenceHighlightDocument(1 as unknown as string),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceHighlightDocument("x", "other" as "plain"),
    ).toThrow(TypeError);
  });

  it("admits the one-leaf UTF-8 limit and rejects limit plus one", () => {
    const exactAscii = "x".repeat(MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8);
    const exactUnicode = "😀".repeat(
      MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8 / 4,
    );
    expect(
      createReferenceHighlightDocument(exactAscii).root.children[0].children[0]?.text,
    ).toHaveLength(MAX_REFERENCE_HIGHLIGHT_DOCUMENT_TEXT_UTF8);
    expect(
      createReferenceHighlightDocument(exactUnicode).root.children[0].children[0]?.text,
    ).toBe(exactUnicode);
    expect(() =>
      createReferenceHighlightDocument(`${exactAscii}x`),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceHighlightDocument(`${exactUnicode}😀`),
    ).toThrow(RangeError);
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
