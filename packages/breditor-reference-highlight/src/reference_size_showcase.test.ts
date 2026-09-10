import { describe, expect, it } from "vitest";

import {
  MAX_REFERENCE_SIZE_SHOWCASE_DOCUMENT_TEXT_UTF8,
  MAX_REFERENCE_TEXT_SIZE_STEP,
  MIN_REFERENCE_TEXT_SIZE_STEP,
  REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SIZE_SHOWCASE_DEFAULT_TEXT_SIZE_STEP,
  REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT,
  REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT_JSON,
  REFERENCE_SIZE_SHOWCASE_IDS,
  REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_LINEAGE_ID,
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
  REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON,
  REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST,
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT,
  REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON,
  REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT,
  REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST,
  REFERENCE_TEXT_SIZE_REMOVE_INPUT_JSON,
  createReferenceSizeShowcaseDocument,
  createReferenceSizeShowcaseDocumentJson,
  createReferenceTextSizeRemoveInput,
  createReferenceTextSizeRemoveInputJson,
  createReferenceTextSizeSetInput,
  createReferenceTextSizeSetInputJson,
} from "./index.js";

describe("reference Text Size Showcase profile", () => {
  it("adds one exact fifth property-aware extension to Color Showcase", () => {
    expect(REFERENCE_SIZE_SHOWCASE_IDS).toMatchObject({
      schemaName: "example/size-showcase-editor",
      schemaVersion: 1,
      textSizeExtensionName: "example/text-size-extension",
      textSizeExtensionVersion: 1,
      textSizeFormatKind: "example/text-size",
      textSizeFormatRevision: 1,
      textSizeStepProperty: "example/text-size-step",
      textSizeActionId: "example/set-text-size",
      textSizeIntentId: "example/set-text-size-intent",
      textSizeBindingId: "example/set-text-size-binding",
      textSizeStateId: "example/text-size-presence",
    });
    expect(MIN_REFERENCE_TEXT_SIZE_STEP).toBe(0);
    expect(MAX_REFERENCE_TEXT_SIZE_STEP).toBe(2);

    const extensions = REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP.extensions;
    expect(extensions).toHaveLength(5);
    for (let index = 0; index < 4; index += 1) {
      expect(extensions[index]).toBe(
        REFERENCE_COLOR_SHOWCASE_PROFILE_BOOTSTRAP.extensions[index],
      );
    }
    expect(extensions[4]).toEqual({
      id: { name: "example/text-size-extension", version: 1 },
      dependencies: [],
      conflicts: [],
      inlineFormats: [{ kind: "example/text-size", revision: 1 }],
      inlineFormatPropertyContracts: [
        {
          formatKind: "example/text-size",
          properties: [
            {
              name: "example/text-size-step",
              presence: "required",
              valueType: { kind: "integer", minimum: 0, maximum: 2 },
            },
          ],
        },
      ],
      inlineFormatToggles: [],
      inlineFormatSets: [
        {
          formatKind: "example/text-size",
          actionId: "example/set-text-size",
          intentId: "example/set-text-size-intent",
          bindingId: "example/set-text-size-binding",
          actionStateId: "example/text-size-presence",
        },
      ],
    });
  });

  it("ships canonical frozen bootstrap data independently of fingerprinting", () => {
    expect(JSON.parse(REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP_JSON)).toEqual(
      REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP,
    );
    expectDeepFrozen(REFERENCE_SIZE_SHOWCASE_PROFILE_BOOTSTRAP);
    expect(Object.isFrozen(REFERENCE_SIZE_SHOWCASE_IDS)).toBe(true);
  });
});

describe("reference Text Size Showcase browser presentation", () => {
  it("composes Link through Text Color in one exact wrapper order", () => {
    const byKind = new Map(
      REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST.recipes.map((recipe) => [
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
      "example/text-size",
      "example/text-color",
    ];
    expect(REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST.recipes).toHaveLength(8);
    for (let index = 0; index < order.length - 1; index += 1) {
      expect(byKind.get(order[index] ?? "")?.before).toContain(order[index + 1]);
    }
    expect(byKind.get("example/text-size")).toEqual({
      formatKind: "example/text-size",
      element: "span",
      classes: ["breditor-text-size"],
      before: ["example/text-color"],
      after: [],
      attributes: {
        kind: "safeIntegerTokenV1",
        propertyName: "example/text-size-step",
        tokens: [
          { value: 0, token: "small" },
          { value: 1, token: "large" },
          { value: 2, token: "huge" },
        ],
      },
    });
    expectDeepFrozen(REFERENCE_SIZE_SHOWCASE_RENDER_MANIFEST);
  });

  it("places one exhaustive size select immediately before Text Color", () => {
    expect(
      REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST.controls.map(
        (control) => control.label,
      ),
    ).toEqual([
      "Bold",
      "Italic",
      "Strikethrough",
      "Code",
      "Highlight",
      "Text size",
      "Text color",
      "Link",
      "Clear formatting",
      "Undo",
      "Redo",
    ]);
    expect(REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST.controls[5]).toEqual({
      kind: "inlineFormatForm",
      stateId: "example/text-size-presence",
      label: "Text size",
      group: "inline",
      formatKind: "example/text-size",
      intentId: "example/set-text-size-intent",
      fields: [
        {
          kind: "integer",
          propertyName: "example/text-size-step",
          label: "Text size",
          presentation: "select",
          minimum: 0,
          maximum: 2,
          defaultValue: 1,
          options: [
            { value: 0, label: "Small" },
            { value: 1, label: "Large" },
            { value: 2, label: "Huge" },
          ],
        },
      ],
      applyLabel: "Apply size",
      removeLabel: "Reset size",
      closeLabel: "Close",
    });
    expect(REFERENCE_SIZE_SHOWCASE_DEFAULT_TEXT_SIZE_STEP).toBe(1);
    expect(REFERENCE_SIZE_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST).toBe(
      REFERENCE_COLOR_SHOWCASE_KEYBOARD_SHORTCUT_MANIFEST,
    );
    expectDeepFrozen(REFERENCE_SIZE_SHOWCASE_TOOLBAR_MANIFEST);
  });
});

describe("reference Text Size typed input", () => {
  it.each([0, 1, 2])("creates canonical frozen set input for step %i", (step) => {
    const input = createReferenceTextSizeSetInput(step);
    expect(input).toEqual({
      operation: "set",
      properties: [{ name: "example/text-size-step", value: step }],
    });
    expect(createReferenceTextSizeSetInputJson(step)).toBe(JSON.stringify(input));
    expectDeepFrozen(input);
  });

  it("rejects aliases, non-integers, and values outside the closed scale", () => {
    for (const value of [
      -0,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      1.5,
      "1",
      null,
    ]) {
      expect(() => createReferenceTextSizeSetInput(value as number)).toThrow(
        TypeError,
      );
    }
    expect(() => createReferenceTextSizeSetInput(-1)).toThrow(RangeError);
    expect(() => createReferenceTextSizeSetInput(3)).toThrow(RangeError);
  });

  it("creates one canonical frozen removal input", () => {
    const input = createReferenceTextSizeRemoveInput();
    expect(input).toEqual({ operation: "remove" });
    expect(REFERENCE_TEXT_SIZE_REMOVE_INPUT_JSON).toBe('{"operation":"remove"}');
    expect(createReferenceTextSizeRemoveInputJson()).toBe(
      REFERENCE_TEXT_SIZE_REMOVE_INPUT_JSON,
    );
    expectDeepFrozen(input);
  });
});

describe("reference Text Size Showcase documents", () => {
  it("uses a distinct fingerprint-bound empty document and lineage", () => {
    expect(REFERENCE_SIZE_SHOWCASE_LINEAGE_ID).toBe(
      "breditor-react-reference-size-showcase",
    );
    expect(MAX_REFERENCE_SIZE_SHOWCASE_DOCUMENT_TEXT_UTF8).toBe(1_048_576);
    expect(REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT).toEqual({
      format: "breditor/document",
      formatVersion: 2,
      schema: { name: "example/size-showcase-editor", version: 1 },
      schemaFingerprint: REFERENCE_SIZE_SHOWCASE_SCHEMA_FINGERPRINT,
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
    expect(REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT),
    );
    expectDeepFrozen(REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT);
  });

  it("stores all admitted formats in canonical semantic order", () => {
    const document = createReferenceSizeShowcaseDocument("Sized", {
      bold: true,
      italic: true,
      strikethrough: true,
      code: true,
      highlighted: true,
      link: { href: "https://example.test/x", openInNewWindow: false },
      textColor: 0x00_ab_cd,
      textSize: 2,
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
      "example/text-size",
    ]);
    expect(text?.formats.at(-1)).toEqual({
      type: "example/text-size",
      properties: { "example/text-size-step": 2 },
    });
    expect(createReferenceSizeShowcaseDocumentJson("Sized", { textSize: 1 })).toBe(
      JSON.stringify(createReferenceSizeShowcaseDocument("Sized", { textSize: 1 })),
    );
    expectDeepFrozen(document);
  });

  it("omits formats for empty text while still validating every option", () => {
    expect(createReferenceSizeShowcaseDocument("", { textSize: 2 })).toEqual(
      REFERENCE_SIZE_SHOWCASE_EMPTY_DOCUMENT,
    );
    expect(() => createReferenceSizeShowcaseDocument("x", { textSize: -0 })).toThrow(
      TypeError,
    );
    expect(() =>
      createReferenceSizeShowcaseDocument("x", { textSize: 1.5 } as never),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceSizeShowcaseDocument("x", { textSize: -1 } as never),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceSizeShowcaseDocument("x", { textSize: 3 } as never),
    ).toThrow(RangeError);
    expect(() =>
      createReferenceSizeShowcaseDocument("x", { textSize: "large" } as never),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceSizeShowcaseDocument("x", { unexpected: true } as never),
    ).toThrow(TypeError);
    expect(REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT_JSON).toBe(
      JSON.stringify(REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT),
    );
    expectDeepFrozen(REFERENCE_SIZE_SHOWCASE_SAMPLE_DOCUMENT);
  });

  it("accepts null-prototype data and rejects hostile option graphs", () => {
    const options = Object.assign(Object.create(null) as Record<string, unknown>, {
      textSize: 0,
      textColor: 0x12_34_56,
      link: Object.assign(Object.create(null) as Record<string, unknown>, {
        href: "https://example.test/null-prototype",
        openInNewWindow: false,
      }),
    });
    expect(
      createReferenceSizeShowcaseDocument("x", options as never),
    ).toEqual(
      createReferenceSizeShowcaseDocument("x", {
        textSize: 0,
        textColor: 0x12_34_56,
        link: {
          href: "https://example.test/null-prototype",
          openInNewWindow: false,
        },
      }),
    );

    const symbolOptions = { textSize: 1 } as Record<PropertyKey, unknown>;
    symbolOptions[Symbol("hidden")] = true;
    expect(() => createReferenceSizeShowcaseDocument("x", symbolOptions)).toThrow(
      TypeError,
    );
    expect(() => createReferenceSizeShowcaseDocument("x", [] as never)).toThrow(
      TypeError,
    );
    expect(() =>
      createReferenceSizeShowcaseDocument("x", new Date() as never),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceSizeShowcaseDocument(
        "x",
        Object.defineProperty({}, "textSize", { get: () => 1 }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      createReferenceSizeShowcaseDocument(
        "x",
        new Proxy({}, { ownKeys: () => { throw new Error("hostile"); } }),
      ),
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
