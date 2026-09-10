import { describe, expect, it } from "vitest";

import {
  createToolbarManifest,
  type ToolbarInlineFormatFormDeclaration,
} from "./toolbar_manifest.js";
import {
  TOOLBAR_INLINE_FORMAT_FORM_REMOVE_INPUT_JSON,
  createToolbarInlineFormatFormRemoveInputJson,
  createToolbarInlineFormatFormSetInputJson,
} from "./toolbar_inline_format_form_input.js";

const HREF = "example/href";
const NEW_WINDOW = "example/open-in-new-window";
const RGB24 = "example/rgb24";
const TEXT_SIZE_STEP = "example/text-size-step";

function linkForm(
  minimumUtf8Bytes = 1,
  maximumUtf8Bytes = 2_048,
): ToolbarInlineFormatFormDeclaration {
  const manifest = createToolbarManifest({
    label: "Editor controls",
    controls: [
      {
        kind: "inlineFormatForm",
        stateId: "example/link-presence",
        label: "Link formatting",
        formatKind: "example/link",
        intentId: "example/set-link-intent",
        fields: [
          {
            kind: "boolean",
            propertyName: NEW_WINDOW,
            label: "Open in new window",
            defaultValue: false,
          },
          {
            kind: "string",
            propertyName: HREF,
            label: "Link URL",
            presentation: "url",
            autocomplete: "url",
            minimumUtf8Bytes,
            maximumUtf8Bytes,
            placeholder: "https://example.com",
          },
        ],
        applyLabel: "Apply Link",
        removeLabel: "Remove Link",
        closeLabel: "Close Link controls",
      },
    ],
  });
  const form = manifest.controls[0];
  if (form?.kind !== "inlineFormatForm") {
    throw new Error("Link form fixture was not admitted");
  }
  return form;
}

function colorForm(): ToolbarInlineFormatFormDeclaration {
  const control = createToolbarManifest({
    label: "Editor controls",
    controls: [
      {
        kind: "inlineFormatForm",
        stateId: "example/color-presence",
        label: "Text color",
        formatKind: "example/text-color",
        intentId: "example/set-text-color-intent",
        fields: [
          {
            kind: "integer",
            propertyName: RGB24,
            label: "Text color",
            presentation: "rgb24",
            minimum: 0,
            maximum: 16_777_215,
            defaultValue: 0,
          },
        ],
        applyLabel: "Apply color",
        removeLabel: "Remove color",
        closeLabel: "Close color controls",
      },
    ],
  }).controls[0];
  if (control?.kind !== "inlineFormatForm") {
    throw new Error("Color form fixture was not admitted");
  }
  return control;
}

function textSizeForm(): ToolbarInlineFormatFormDeclaration {
  const control = createToolbarManifest({
    label: "Editor controls",
    controls: [
      {
        kind: "inlineFormatForm",
        stateId: "example/text-size-presence",
        label: "Text size",
        formatKind: "example/text-size",
        intentId: "example/set-text-size-intent",
        fields: [
          {
            kind: "integer",
            propertyName: TEXT_SIZE_STEP,
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
        closeLabel: "Close size controls",
      },
    ],
  }).controls[0];
  if (control?.kind !== "inlineFormatForm") {
    throw new Error("Text size form fixture was not admitted");
  }
  return control;
}

describe("toolbar inline-format form input", () => {
  it("sorts properties lexically independent of declaration and record order", () => {
    expect(
      createToolbarInlineFormatFormSetInputJson(linkForm(), {
        [NEW_WINDOW]: true,
        [HREF]: "https://example.test/a",
      }),
    ).toBe(
      '{"operation":"set","properties":[{"name":"example/href","value":"https://example.test/a"},{"name":"example/open-in-new-window","value":true}]}',
    );
  });

  it("serializes an exact RGB24 integer through the typed property path", () => {
    expect(
      createToolbarInlineFormatFormSetInputJson(colorForm(), {
        [RGB24]: 0x12abef,
      }),
    ).toBe(
      '{"operation":"set","properties":[{"name":"example/rgb24","value":1223663}]}',
    );

    for (const value of [-0, 1.5, "#12abef", null]) {
      expect(() =>
        createToolbarInlineFormatFormSetInputJson(colorForm(), {
          [RGB24]: value,
        }),
      ).toThrow(TypeError);
    }
    for (const value of [-1, 16_777_216]) {
      expect(() =>
        createToolbarInlineFormatFormSetInputJson(colorForm(), {
          [RGB24]: value,
        }),
      ).toThrow(RangeError);
    }

    const form = colorForm();
    const forged = {
      ...form,
      fields: [{ ...form.fields[0], presentation: "number" }],
    } as unknown as ToolbarInlineFormatFormDeclaration;
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(forged, {
        [RGB24]: 0x12abef,
      }),
    ).toThrow(TypeError);
  });

  it("serializes bounded integer-select values and rejects every invalid scalar", () => {
    for (const value of [0, 1, 2]) {
      expect(
        createToolbarInlineFormatFormSetInputJson(textSizeForm(), {
          [TEXT_SIZE_STEP]: value,
        }),
      ).toBe(
        `{"operation":"set","properties":[{"name":"example/text-size-step","value":${value}}]}`,
      );
    }
    for (const value of [-0, 1.5, "1", null]) {
      expect(() =>
        createToolbarInlineFormatFormSetInputJson(textSizeForm(), {
          [TEXT_SIZE_STEP]: value,
        }),
      ).toThrow(TypeError);
    }
    for (const value of [-1, 3]) {
      expect(() =>
        createToolbarInlineFormatFormSetInputJson(textSizeForm(), {
          [TEXT_SIZE_STEP]: value,
        }),
      ).toThrow(RangeError);
    }
  });

  it("defensively rejects forged integer-select option contracts", () => {
    const form = textSizeForm();
    const sourceField = form.fields[0];
    if (
      sourceField?.kind !== "integer" ||
      sourceField.presentation !== "select"
    ) {
      throw new Error("missing integer select fixture");
    }
    for (const options of [
      sourceField.options.slice(0, 2),
      [sourceField.options[1], sourceField.options[0], sourceField.options[2]],
      new Array(3),
    ]) {
      const forged = {
        ...form,
        fields: [{ ...sourceField, options }],
      } as ToolbarInlineFormatFormDeclaration;
      expect(() =>
        createToolbarInlineFormatFormSetInputJson(forged, {
          [TEXT_SIZE_STEP]: 1,
        }),
      ).toThrow(TypeError);
    }

    let reads = 0;
    const option = { value: 0 };
    Object.defineProperty(option, "label", {
      get: () => {
        reads += 1;
        return "Private";
      },
    });
    const forged = {
      ...form,
      fields: [
        {
          ...sourceField,
          minimum: 0,
          maximum: 0,
          defaultValue: 0,
          options: [option],
        },
      ],
    } as unknown as ToolbarInlineFormatFormDeclaration;
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(forged, {
        [TEXT_SIZE_STEP]: 0,
      }),
    ).toThrow(TypeError);
    expect(reads).toBe(0);
  });

  it("returns one fixed canonical remove input", () => {
    expect(createToolbarInlineFormatFormRemoveInputJson()).toBe(
      '{"operation":"remove"}',
    );
    expect(TOOLBAR_INLINE_FORMAT_FORM_REMOVE_INPUT_JSON).toBe(
      createToolbarInlineFormatFormRemoveInputJson(),
    );
  });

  it("escapes strings canonically without imposing a URL scheme policy", () => {
    const value = '  javascript:alert("quoted\\path")  ';
    const json = createToolbarInlineFormatFormSetInputJson(linkForm(), {
      [HREF]: value,
      [NEW_WINDOW]: false,
    });
    expect(json).toBe(
      '{"operation":"set","properties":[{"name":"example/href","value":"  javascript:alert(\\"quoted\\\\path\\")  "},{"name":"example/open-in-new-window","value":false}]}',
    );
    expect(JSON.parse(json)).toEqual({
      operation: "set",
      properties: [
        { name: HREF, value },
        { name: NEW_WINDOW, value: false },
      ],
    });
  });

  it("rejects CR and LF that a single-line URL presentation cannot retain", () => {
    for (const value of ["one\rtwo", "one\ntwo", "one\r\ntwo"]) {
      expect(() =>
        createToolbarInlineFormatFormSetInputJson(linkForm(), {
          [HREF]: value,
          [NEW_WINDOW]: false,
        }),
      ).toThrow(TypeError);
    }
  });

  it("measures astral Unicode by UTF-8 bytes", () => {
    const form = linkForm(4, 4);
    expect(
      createToolbarInlineFormatFormSetInputJson(form, {
        [HREF]: "😀",
        [NEW_WINDOW]: false,
      }),
    ).toContain('"value":"😀"');
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(linkForm(1, 3), {
        [HREF]: "😀",
        [NEW_WINDOW]: false,
      }),
    ).toThrow(RangeError);
  });

  it("rejects lower and upper string bounds without disclosing values", () => {
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(linkForm(1, 8), {
        [HREF]: "",
        [NEW_WINDOW]: false,
      }),
    ).toThrow(RangeError);

    const privateValue = "private-value-that-must-not-be-reported";
    let failure: unknown;
    try {
      createToolbarInlineFormatFormSetInputJson(linkForm(1, 8), {
        [HREF]: privateValue,
        [NEW_WINDOW]: false,
      });
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(RangeError);
    expect(String(failure)).not.toContain(privateValue);

    const preEncodingOverflow = "x".repeat(65_537);
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(linkForm(1, 65_536), {
        [HREF]: preEncodingOverflow,
        [NEW_WINDOW]: false,
      }),
    ).toThrow(RangeError);
  });

  it("rejects malformed UTF-16 and exact primitive type mismatches", () => {
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(linkForm(), {
        [HREF]: "\ud800",
        [NEW_WINDOW]: false,
      }),
    ).toThrow(TypeError);
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(linkForm(), {
        [HREF]: "https://example.test",
        [NEW_WINDOW]: 1,
      }),
    ).toThrow(TypeError);
  });

  it("rejects missing, extra, inherited, and symbol-keyed values", () => {
    const form = linkForm();
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(form, {
        [HREF]: "https://example.test",
      }),
    ).toThrow(TypeError);
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(form, {
        [HREF]: "https://example.test",
        [NEW_WINDOW]: false,
        "example/extra": true,
      }),
    ).toThrow(TypeError);

    const inherited = Object.create({
      [HREF]: "https://example.test",
    }) as Record<string, unknown>;
    inherited[NEW_WINDOW] = false;
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(form, inherited),
    ).toThrow(TypeError);

    const symbolic: Record<PropertyKey, unknown> = {
      [HREF]: "https://example.test",
      [NEW_WINDOW]: false,
      [Symbol("extra")]: true,
    };
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(form, symbolic),
    ).toThrow(TypeError);
  });

  it("never invokes value accessors and redacts hostile proxy failures", () => {
    const privateValue = "proxy-private-value";
    let getterCalls = 0;
    const accessor = {
      [NEW_WINDOW]: false,
      get [HREF]() {
        getterCalls += 1;
        return privateValue;
      },
    };
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(linkForm(), accessor),
    ).toThrow(TypeError);
    expect(getterCalls).toBe(0);

    const hostile = new Proxy(Object.create(null) as Record<string, unknown>, {
      ownKeys() {
        throw new Error(privateValue);
      },
    });
    let failure: unknown;
    try {
      createToolbarInlineFormatFormSetInputJson(linkForm(), hostile);
    } catch (error: unknown) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TypeError);
    expect(String(failure)).not.toContain(privateValue);
  });

  it("defensively rejects duplicate declarations and duplicate proxy keys", () => {
    const form = linkForm();
    const duplicateDeclaration = {
      ...form,
      fields: [form.fields[0], form.fields[0]],
    } as ToolbarInlineFormatFormDeclaration;
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(duplicateDeclaration, {
        [NEW_WINDOW]: false,
      }),
    ).toThrow(TypeError);

    const duplicateKeys = new Proxy(
      {
        [HREF]: "https://example.test",
        [NEW_WINDOW]: false,
      },
      {
        ownKeys() {
          return [HREF, HREF, NEW_WINDOW];
        },
      },
    );
    expect(() =>
      createToolbarInlineFormatFormSetInputJson(form, duplicateKeys),
    ).toThrow(TypeError);
  });

  it("accepts an exact null-prototype value record", () => {
    const values = Object.create(null) as Record<string, unknown>;
    values[HREF] = "https://example.test/null-prototype";
    values[NEW_WINDOW] = false;
    expect(
      createToolbarInlineFormatFormSetInputJson(linkForm(), values),
    ).toContain("https://example.test/null-prototype");
  });
});
