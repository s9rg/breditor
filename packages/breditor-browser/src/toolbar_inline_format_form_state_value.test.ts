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
