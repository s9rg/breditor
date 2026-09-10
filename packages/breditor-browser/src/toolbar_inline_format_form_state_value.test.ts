import { describe, expect, it } from "vitest";

import { createToolbarManifest } from "./toolbar_manifest.js";
import {
  decodeToolbarInlineFormatFormStateValue,
  TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_NAME,
  TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_VERSION,
} from "./toolbar_inline_format_form_state_value.js";

const form = createToolbarManifest({
  label: "Editor controls",
  controls: [
    {
      kind: "inlineFormatForm",
      stateId: "example/link-presence",
      label: "Link",
      formatKind: "example/link",
      intentId: "example/set-link-intent",
      fields: [
        {
          kind: "boolean",
          propertyName: "example/open-in-new-window",
          label: "Open in a new window",
          defaultValue: false,
        },
        {
          kind: "string",
          propertyName: "example/href",
          label: "URL",
          presentation: "url",
          autocomplete: "url",
          minimumUtf8Bytes: 1,
          maximumUtf8Bytes: 32,
        },
      ],
      applyLabel: "Apply",
      removeLabel: "Remove",
      closeLabel: "Close",
    },
  ],
}).controls[0]!;

if (form.kind !== "inlineFormatForm") throw new Error("fixture is invalid");

const colorForm = createToolbarManifest({
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
          propertyName: "example/rgb24",
          label: "Text color",
          presentation: "rgb24",
          minimum: 0,
          maximum: 16_777_215,
          defaultValue: 0,
        },
      ],
      applyLabel: "Apply",
      removeLabel: "Remove",
      closeLabel: "Close",
    },
  ],
}).controls[0]!;

if (colorForm.kind !== "inlineFormatForm") {
  throw new Error("color fixture is invalid");
}

const textSizeForm = createToolbarManifest({
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
      applyLabel: "Apply",
      removeLabel: "Reset",
      closeLabel: "Close",
    },
  ],
}).controls[0]!;

if (textSizeForm.kind !== "inlineFormatForm") {
  throw new Error("text size fixture is invalid");
}

const contract = () => ({
  name: TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_NAME,
  version: TOOLBAR_INLINE_FORMAT_FORM_STATE_VALUE_CONTRACT_VERSION,
});

describe("decodeToolbarInlineFormatFormStateValue", () => {
  it("copies an exact canonical uniform Set payload without URL normalization", () => {
    const source = {
      status: "uniform",
      contract: contract(),
      value: {
        operation: "set",
        properties: [
          { name: "example/href", value: "not a URL" },
          { name: "example/open-in-new-window", value: true },
        ],
      },
    };

    const result = decodeToolbarInlineFormatFormStateValue(form, source);

    expect(result).toEqual({
      status: "uniform",
      fields: [
        { name: "example/href", value: "not a URL" },
        { name: "example/open-in-new-window", value: true },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    source.value.properties[0]!.value = "changed";
    expect(result).toEqual({
      status: "uniform",
      fields: [
        { name: "example/href", value: "not a URL" },
        { name: "example/open-in-new-window", value: true },
      ],
    });
  });

  it.each(["unset", "mixed"] as const)("accepts exact %s state", (status) => {
    expect(
      decodeToolbarInlineFormatFormStateValue(form, {
        status,
        contract: contract(),
      }),
    ).toEqual({ status });
  });

  it("copies an exact RGB24 integer and rejects noncanonical numbers", () => {
    const value = (rgb24: unknown) => ({
      status: "uniform",
      contract: contract(),
      value: {
        operation: "set",
        properties: [{ name: "example/rgb24", value: rgb24 }],
      },
    });
    expect(
      decodeToolbarInlineFormatFormStateValue(colorForm, value(0x12abef)),
    ).toEqual({
      status: "uniform",
      fields: [{ name: "example/rgb24", value: 0x12abef }],
    });
    for (const rgb24 of [-0, -1, 16_777_216, 1.5, "1223663", null]) {
      expect(
        decodeToolbarInlineFormatFormStateValue(colorForm, value(rgb24)),
      ).toBeNull();
    }
  });

  it("copies every integer-select value and rejects values outside its domain", () => {
    const value = (step: unknown) => ({
      status: "uniform",
      contract: contract(),
      value: {
        operation: "set",
        properties: [{ name: "example/text-size-step", value: step }],
      },
    });
    for (const step of [0, 1, 2]) {
      expect(
        decodeToolbarInlineFormatFormStateValue(textSizeForm, value(step)),
      ).toEqual({
        status: "uniform",
        fields: [{ name: "example/text-size-step", value: step }],
      });
    }
    for (const step of [-0, -1, 3, 1.5, "1", null]) {
      expect(
        decodeToolbarInlineFormatFormStateValue(textSizeForm, value(step)),
      ).toBeNull();
    }
  });

  it("defensively rejects forged integer-select declaration shapes", () => {
    const field = textSizeForm.fields[0];
    if (field?.kind !== "integer" || field.presentation !== "select") {
      throw new Error("missing integer select fixture");
    }
    const value = {
      status: "uniform",
      contract: contract(),
      value: {
        operation: "set",
        properties: [{ name: "example/text-size-step", value: 1 }],
      },
    };
    const forged = {
      ...textSizeForm,
      fields: [{ ...field, options: field.options.slice(0, 2) }],
    } as typeof textSizeForm;
    expect(decodeToolbarInlineFormatFormStateValue(forged, value)).toBeNull();

    let reads = 0;
    const hostileOptions = new Proxy(field.options, {
      getOwnPropertyDescriptor() {
        reads += 1;
        throw new Error("private option descriptor");
      },
    });
    const hostile = {
      ...textSizeForm,
      fields: [{ ...field, options: hostileOptions }],
    } as typeof textSizeForm;
    expect(decodeToolbarInlineFormatFormStateValue(hostile, value)).toBeNull();
    expect(reads).toBeGreaterThan(0);
  });

  it("rejects wrong contracts, unsupported states, and extra fields", () => {
    expect(
      decodeToolbarInlineFormatFormStateValue(form, {
        status: "unset",
        contract: { ...contract(), version: 2 },
      }),
    ).toBeNull();
    expect(
      decodeToolbarInlineFormatFormStateValue(form, { status: "unsupported" }),
    ).toBeNull();
    expect(
      decodeToolbarInlineFormatFormStateValue(form, {
        status: "mixed",
        contract: contract(),
        value: null,
      }),
    ).toBeNull();
  });

  it("rejects non-canonical, incomplete, duplicate, and ill-typed properties", () => {
    const value = (properties: unknown[]) => ({
      status: "uniform",
      contract: contract(),
      value: { operation: "set", properties },
    });
    expect(
      decodeToolbarInlineFormatFormStateValue(
        form,
        value([
          { name: "example/open-in-new-window", value: true },
          { name: "example/href", value: "x" },
        ]),
      ),
    ).toBeNull();
    expect(
      decodeToolbarInlineFormatFormStateValue(
        form,
        value([{ name: "example/href", value: "x" }]),
      ),
    ).toBeNull();
    expect(
      decodeToolbarInlineFormatFormStateValue(
        form,
        value([
          { name: "example/href", value: "x" },
          { name: "example/href", value: "y" },
        ]),
      ),
    ).toBeNull();
    expect(
      decodeToolbarInlineFormatFormStateValue(
        form,
        value([
          { name: "example/href", value: "x" },
          { name: "example/open-in-new-window", value: "true" },
        ]),
      ),
    ).toBeNull();
  });

  it("rejects accessors and invalid or out-of-bounds Unicode", () => {
    const accessor = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(accessor, "status", { get: () => "unset" });
    Object.defineProperty(accessor, "contract", { value: contract() });
    expect(decodeToolbarInlineFormatFormStateValue(form, accessor)).toBeNull();

    const value = (text: string) => ({
      status: "uniform",
      contract: contract(),
      value: {
        operation: "set",
        properties: [
          { name: "example/href", value: text },
          { name: "example/open-in-new-window", value: false },
        ],
      },
    });
    expect(
      decodeToolbarInlineFormatFormStateValue(form, value("\ud800")),
    ).toBeNull();
    expect(
      decodeToolbarInlineFormatFormStateValue(form, value("x".repeat(33))),
    ).toBeNull();
  });
});
