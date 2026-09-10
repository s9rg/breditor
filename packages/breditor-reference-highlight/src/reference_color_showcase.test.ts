import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_TEXT_COLOR_RGB24,
  MIN_REFERENCE_TEXT_COLOR_RGB24,
  REFERENCE_COLOR_SHOWCASE_DEFAULT_RGB24,
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT,
  REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_COLOR_SHOWCASE_IDS,
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT,
  REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST,
  REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON,
  createReferenceColorShowcaseDocument,
  createReferenceColorShowcaseDocumentJson,
  createReferenceTextColorRemoveInput,
  createReferenceTextColorRemoveInputJson,
  createReferenceTextColorSetInput,
  createReferenceTextColorSetInputJson,
} from "./index.js";

const EXPECTED_COLOR_SHOWCASE_BOOTSTRAP_JSON =
  '{"format":"breditor/profile-bootstrap","formatVersion":2,"schema":{"name":"example/color-showcase-editor","version":1},"extensions":[{"id":{"name":"example/highlight-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/highlight","revision":7}],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[{"formatKind":"example/highlight","actionId":"example/toggle-highlight","intentId":"example/toggle-highlight-intent","bindingId":"example/toggle-highlight-binding","actionStateId":"example/highlight-control"}],"inlineFormatSets":[]},{"id":{"name":"example/link-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/link","revision":1}],"inlineFormatPropertyContracts":[{"formatKind":"example/link","properties":[{"name":"example/href","presence":"required","valueType":{"kind":"string","minimumUtf8Bytes":1,"maximumUtf8Bytes":2048}},{"name":"example/open-in-new-window","presence":"required","valueType":{"kind":"boolean"}}]}],"inlineFormatToggles":[],"inlineFormatSets":[{"formatKind":"example/link","actionId":"example/set-link","intentId":"example/set-link-intent","bindingId":"example/set-link-binding","actionStateId":"example/link-presence"}]},{"id":{"name":"example/text-styles-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/emphasis","revision":1},{"kind":"example/strikethrough","revision":1},{"kind":"example/code","revision":1}],"inlineFormatPropertyContracts":[],"inlineFormatToggles":[{"formatKind":"example/emphasis","actionId":"example/toggle-emphasis","intentId":"example/toggle-emphasis-intent","bindingId":"example/toggle-emphasis-binding","actionStateId":"example/emphasis-control"},{"formatKind":"example/strikethrough","actionId":"example/toggle-strikethrough","intentId":"example/toggle-strikethrough-intent","bindingId":"example/toggle-strikethrough-binding","actionStateId":"example/strikethrough-control"},{"formatKind":"example/code","actionId":"example/toggle-code","intentId":"example/toggle-code-intent","bindingId":"example/toggle-code-binding","actionStateId":"example/code-control"}],"inlineFormatSets":[]},{"id":{"name":"example/text-color-extension","version":1},"dependencies":[],"conflicts":[],"inlineFormats":[{"kind":"example/text-color","revision":1}],"inlineFormatPropertyContracts":[{"formatKind":"example/text-color","properties":[{"name":"example/rgb24","presence":"required","valueType":{"kind":"integer","minimum":0,"maximum":16777215}}]}],"inlineFormatToggles":[],"inlineFormatSets":[{"formatKind":"example/text-color","actionId":"example/set-text-color","intentId":"example/set-text-color-intent","bindingId":"example/set-text-color-binding","actionStateId":"example/text-color-presence"}]}]}';

describe("reference RGB24 Color Showcase profile", () => {
  it("adds one exact property-aware extension without mutating the old Showcase", () => {
    expect(REFERENCE_COLOR_SHOWCASE_IDS).toMatchObject({
      schemaName: "example/color-showcase-editor",
      schemaVersion: 1,
      textColorExtensionName: "example/text-color-extension",
      textColorExtensionVersion: 1,
      textColorFormatKind: "example/text-color",
      textColorFormatRevision: 1,
      textColorRgb24Property: "example/rgb24",
      textColorActionId: "example/set-text-color",
      textColorIntentId: "example/set-text-color-intent",
      textColorBindingId: "example/set-text-color-binding",
      textColorStateId: "example/text-color-presence",
    });
    expect(MIN_REFERENCE_TEXT_COLOR_RGB24).toBe(0);
    expect(MAX_REFERENCE_TEXT_COLOR_RGB24).toBe(16_777_215);
    expect(REFERENCE_SHOWCASE_SCHEMA_FINGERPRINT).toBe(
      "sha256:2a90a5fea97e6f4c3b9c535a78b76e9daf50afd95df3e3119392bfc19fd5ec63",
    );

    const extensions = REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP.extensions;
    expect(extensions).toHaveLength(4);
    expect(extensions[0]).toBe(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[0]);
    expect(extensions[1]).toBe(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[1]);
    expect(extensions[2]).toBe(REFERENCE_SHOWCASE_PROFILE_BOOTSTRAP.extensions[2]);
    expect(extensions[3]).toEqual({
      id: { name: "example/text-color-extension", version: 1 },
      dependencies: [],
      conflicts: [],
      inlineFormats: [{ kind: "example/text-color", revision: 1 }],
      inlineFormatPropertyContracts: [
        {
          formatKind: "example/text-color",
          properties: [
            {
              name: "example/rgb24",
              presence: "required",
              valueType: {
                kind: "integer",
                minimum: 0,
                maximum: 16_777_215,
              },
            },
          ],
        },
      ],
      inlineFormatToggles: [],
      inlineFormatSets: [
        {
          formatKind: "example/text-color",
          actionId: "example/set-text-color",
          intentId: "example/set-text-color-intent",
          bindingId: "example/set-text-color-binding",
          actionStateId: "example/text-color-presence",
        },
      ],
    });
  });

  it("ships canonical frozen bootstrap data and its Rust compiler fingerprint", () => {
    expect(REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON).toBe(
      EXPECTED_COLOR_SHOWCASE_BOOTSTRAP_JSON,
    );
    expect(JSON.parse(REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP_JSON)).toEqual(
      REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP,
    );
    expect(REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT).toBe(
      "sha256:b3d051b7a68a15ef8d47ce2a7c4f051a76d09c386f9545f7b955590d2cc7433d",
    );
    expectDeepFrozen(REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP);
    expect(Object.isFrozen(REFERENCE_COLOR_SHOWCASE_IDS)).toBe(true);
  });
});

describe("reference RGB24 Color Showcase browser presentation", () => {
  it("renders text color as the exact innermost closed-policy wrapper", () => {
    const byKind = new Map(
      REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST.recipes.map((recipe) => [
        recipe.formatKind,
        recipe,
      ]),
    );
    const order = [
      "example/link",
      "breditor/strong",
      "example/emphasis",
      "example/highlight",
      "example/strikethrough",
      "example/code",
      "example/text-color",
    ];
    expect(REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST.recipes).toHaveLength(7);
    for (let index = 0; index < order.length - 1; index += 1) {
      expect(byKind.get(order[index] ?? "")?.before).toContain(
        order[index + 1],
      );
    }
    expect(byKind.get("example/text-color")).toEqual({
      formatKind: "example/text-color",
      element: "span",
      classes: ["breditor-text-color"],
      before: [],
      after: [],
      attributes: { kind: "safeTextColorV1" },
    });
    expectDeepFrozen(REFERENCE_COLOR_SHOWCASE_RENDER_MANIFEST);
  });

  it("adds one exact native RGB24 form without inventing a shortcut", () => {
    expect(
      REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls.map(
        (control) => control.label,
      ),
    ).toEqual([
      "Bold",
      "Italic",
      "Strikethrough",
      "Code",
      "Highlight",
      "Text color",
      "Link",
      "Clear formatting",
      "Undo",
      "Redo",
    ]);
    const color = REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST.controls[5];
    expect(color).toEqual({
      kind: "inlineFormatForm",
      stateId: "example/text-color-presence",
      label: "Text color",
      group: "inline",
      formatKind: "example/text-color",
      intentId: "example/set-text-color-intent",
      fields: [
        {
          kind: "integer",
          propertyName: "example/rgb24",
          label: "Text color",
          presentation: "rgb24",
          minimum: 0,
          maximum: 16_777_215,
          defaultValue: 0x5b_21_b6,
        },
      ],
      applyLabel: "Apply color",
      removeLabel: "Remove color",
      closeLabel: "Close",
    });
    expect(REFERENCE_COLOR_SHOWCASE_DEFAULT_RGB24).toBe(0x5b_21_b6);
    expect(REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST).toBe(
      REFERENCE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    );
    expectDeepFrozen(REFERENCE_COLOR_SHOWCASE_TOOLBAR_MANIFEST);
  });
});

describe("reference RGB24 typed input", () => {
  it.each([
    [0, "#000000"],
    [1, "#000001"],
    [0x12_34_56, "#123456"],
    [0xff_ff_ff, "#ffffff"],
  ])("creates canonical set input for %i (%s)", (rgb24) => {
    const input = createReferenceTextColorSetInput(rgb24);
    expect(input).toEqual({
      operation: "set",
      properties: [{ name: "example/rgb24", value: rgb24 }],
    });
    expect(createReferenceTextColorSetInputJson(rgb24)).toBe(
      JSON.stringify(input),
    );
    expectDeepFrozen(input);
  });

  it("rejects aliases, non-integers, and values outside RGB24", () => {
    for (const value of [
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1.5,
      "1",
      null,
    ]) {
      expect(() =>
        createReferenceTextColorSetInput(value as number),
      ).toThrow(TypeError);
    }
    expect(() => createReferenceTextColorSetInput(-1)).toThrow(RangeError);
    expect(() => createReferenceTextColorSetInput(0x1_00_00_00)).toThrow(
      RangeError,
    );
  });

  it("creates one canonical removal input", () => {
    const input = createReferenceTextColorRemoveInput();
    expect(input).toEqual({ operation: "remove" });
    expect(createReferenceTextColorRemoveInputJson()).toBe(
      REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON,
    );
    expect(REFERENCE_TEXT_COLOR_REMOVE_INPUT_JSON).toBe(
      '{"operation":"remove"}',
    );
    expectDeepFrozen(input);
  });
});

describe("reference RGB24 Color Showcase documents", () => {
  it("uses a distinct fingerprint-bound empty document", () => {
    expect(REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT).toEqual({
      format: "breditor/document",
      formatVersion: 2,
      schema: { name: "example/color-showcase-editor", version: 1 },
      schemaFingerprint: REFERENCE_COLOR_SHOWCASE_SCHEMA_FINGERPRINT,
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
    expect(REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT),
    );
    expectDeepFrozen(REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT);
  });

  it("stores RGB24 as the final canonical semantic format", () => {
    const document = createReferenceColorShowcaseDocument("Color", {
      bold: true,
      italic: true,
      strikethrough: true,
      code: true,
      highlighted: true,
      link: { href: "https://example.test/x", openInNewWindow: false },
      textColor: 0x00_ab_cd,
    });
    const text = document.root.children[0].children[0];
    expect(text?.formats.map((format) => format.type)).toEqual([
      "breditor/strong",
      "example/code",
      "example/emphasis",
      "example/highlight",
      "example/link",
      "example/strikethrough",
      "example/text-color",
    ]);
    expect(text?.formats.at(-1)).toEqual({
      type: "example/text-color",
      properties: { "example/rgb24": 43_981 },
    });
    expect(createReferenceColorShowcaseDocumentJson("Color", {
      textColor: 0x00_ab_cd,
    })).toBe(
      JSON.stringify(
        createReferenceColorShowcaseDocument("Color", {
          textColor: 0x00_ab_cd,
        }),
      ),
    );
    expectDeepFrozen(document);
  });

  it("omits all formats for empty text and validates hostile option shapes", () => {
    expect(
      createReferenceColorShowcaseDocument("", { textColor: 0xff_00_00 }),
    ).toEqual(REFERENCE_COLOR_SHOWCASE_EMPTY_DOCUMENT);
    expect(() =>
      createReferenceColorShowcaseDocument("x", { textColor: -0 }),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", { textColor: -1 }),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", { textColor: 0x1_00_00_00 }),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", {
        textColor: 1.25,
      }),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", {
        unexpected: true,
      } as never),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument(
        "x",
        Object.defineProperty({}, "textColor", { get: () => 0 }),
      ),
    ).toThrow(TypeError);
    expect(REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT),
    );
    expectDeepFrozen(REFERENCE_COLOR_SHOWCASE_SAMPLE_DOCUMENT);
  });

  it("accepts null-prototype data and rejects hostile option graphs", () => {
    const options = Object.assign(Object.create(null) as Record<string, unknown>, {
      textColor: 0x12_34_56,
      link: Object.assign(Object.create(null) as Record<string, unknown>, {
        href: "https://example.test/null-prototype",
        openInNewWindow: false,
      }),
    });
    expect(
      createReferenceColorShowcaseDocument("x", options),
    ).toEqual(
      createReferenceColorShowcaseDocument("x", {
        textColor: 0x12_34_56,
        link: {
          href: "https://example.test/null-prototype",
          openInNewWindow: false,
        },
      }),
    );

    const symbolOptions = { textColor: 0x12_34_56 } as Record<PropertyKey, unknown>;
    symbolOptions[Symbol("hidden")] = true;
    expect(() =>
      createReferenceColorShowcaseDocument("x", symbolOptions),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", [] as never),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", new Date() as never),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument(
        "x",
        new Proxy({}, { ownKeys: () => { throw new Error("hostile"); } }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceColorShowcaseDocument("x", {
        link: Object.defineProperty({}, "href", {
          get: () => "https://example.test",
        }) as never,
      }),
    ).toThrow(TypeError);
  });
});

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (typeof value !== "object" || value === null || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      expectDeepFrozen(descriptor.value, seen);
    }
  }
}
