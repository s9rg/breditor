import { describe, expect, it } from "vitest";

import { createToolbarManifest } from "./toolbar_manifest.js";
import { toolbarManifestMatchesProfileDescriptor } from "./toolbar_profile_contract.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

class Generation implements WasmProfileGenerationView {
  readonly identity = Object.freeze({});
  matches(other: WasmProfileGenerationView): boolean {
    return other instanceof Generation && other.identity === this.identity;
  }
  free(): void {}
}

function descriptor(): BrowserCompiledProfileDescriptor {
  const generation = new Generation();
  const stateIds = ["example/bold", "example/redo", "example/undo"] as const;
  const stateDirections = [undefined, "redo", "undo"] as const;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/profile",
    schemaVersion: 1,
    schemaFingerprint: `sha256:${"1".repeat(64)}`,
    formatCount: 0,
    intentCount: 1,
    actionStateCount: 3,
    inlineFormatSetCount: 0,
    formatKind: () => undefined,
    formatRevision: () => undefined,
    formatPropertyCount: () => undefined,
    formatPropertyName: () => undefined,
    formatPropertyPresence: () => undefined,
    formatPropertyValueType: () => undefined,
    formatPropertyIntegerMinimum: () => undefined,
    formatPropertyIntegerMaximum: () => undefined,
    formatPropertyStringMinimumUtf8Bytes: () => undefined,
    formatPropertyStringMaximumUtf8Bytes: () => undefined,
    intentId: (index) => index === 0 ? "example/format-strong" : undefined,
    intentInputKind: (index) => index === 0 ? "none" : undefined,
    intentInputContractName: () => undefined,
    intentInputContractVersion: () => undefined,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: () => undefined,
    intentValueContractVersion: () => undefined,
    actionStateId: (index) => stateIds[index],
    actionStateSourceKind: (index) =>
      index === 0 ? "routed" : stateIds[index] === undefined ? undefined : "history",
    actionStateSourceActionId: () => undefined,
    actionStateSourceIntentId: (index) => index === 0 ? "example/format-strong" : undefined,
    actionStateHistoryDirection: (index) => stateDirections[index],
    actionStateActivationContract: (index) =>
      index === 0 ? "tracked" : stateIds[index] === undefined ? undefined : "stateless",
    actionStateValueContractName: () => undefined,
    actionStateValueContractVersion: () => undefined,
    inlineFormatSetFormatKind: () => undefined,
    inlineFormatSetIntentId: () => undefined,
    inlineFormatSetActionStateId: () => undefined,
    matchesProfileGeneration: (candidate) => candidate === generation,
    free(): void {},
  };
  const consumed = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!consumed.ok) throw new Error("profile descriptor fixture failed");
  return consumed.descriptor;
}

type FormProfileProperty = Readonly<{
  name: string;
  presence: "required" | "optional";
  valueType:
    | Readonly<{ kind: "boolean" }>
    | Readonly<{ kind: "integer"; minimum: number; maximum: number }>
    | Readonly<{
        kind: "string";
        minimumUtf8Bytes: number;
        maximumUtf8Bytes: number;
      }>;
}>;

const FORM_PROPERTIES: readonly FormProfileProperty[] = Object.freeze([
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
]);

function inlineFormatFormDescriptor(
  properties: readonly FormProfileProperty[] = FORM_PROPERTIES,
  includeSet = true,
): BrowserCompiledProfileDescriptor {
  const generation = new Generation();
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/profile",
    schemaVersion: 1,
    schemaFingerprint: `sha256:${"2".repeat(64)}`,
    formatCount: 1,
    intentCount: 1,
    actionStateCount: 1,
    inlineFormatSetCount: includeSet ? 1 : 0,
    formatKind: (index) => index === 0 ? "example/link" : undefined,
    formatRevision: (index) => index === 0 ? 1 : undefined,
    formatPropertyCount: (index) => index === 0 ? properties.length : undefined,
    formatPropertyName: (formatIndex, propertyIndex) =>
      formatIndex === 0 ? properties[propertyIndex]?.name : undefined,
    formatPropertyPresence: (formatIndex, propertyIndex) =>
      formatIndex === 0 ? properties[propertyIndex]?.presence : undefined,
    formatPropertyValueType: (formatIndex, propertyIndex) =>
      formatIndex === 0 ? properties[propertyIndex]?.valueType.kind : undefined,
    formatPropertyIntegerMinimum: (formatIndex, propertyIndex) => {
      const valueType = formatIndex === 0
        ? properties[propertyIndex]?.valueType
        : undefined;
      return valueType?.kind === "integer" ? valueType.minimum : undefined;
    },
    formatPropertyIntegerMaximum: (formatIndex, propertyIndex) => {
      const valueType = formatIndex === 0
        ? properties[propertyIndex]?.valueType
        : undefined;
      return valueType?.kind === "integer" ? valueType.maximum : undefined;
    },
    formatPropertyStringMinimumUtf8Bytes: (formatIndex, propertyIndex) => {
      const valueType = formatIndex === 0
        ? properties[propertyIndex]?.valueType
        : undefined;
      return valueType?.kind === "string"
        ? valueType.minimumUtf8Bytes
        : undefined;
    },
    formatPropertyStringMaximumUtf8Bytes: (formatIndex, propertyIndex) => {
      const valueType = formatIndex === 0
        ? properties[propertyIndex]?.valueType
        : undefined;
      return valueType?.kind === "string"
        ? valueType.maximumUtf8Bytes
        : undefined;
    },
    intentId: (index) => index === 0 ? "example/set-link-intent" : undefined,
    intentInputKind: (index) => index === 0 ? "typed" : undefined,
    intentInputContractName: (index) =>
      index === 0 ? "breditor/set-inline-format-input" : undefined,
    intentInputContractVersion: (index) => index === 0 ? 1 : undefined,
    intentActivationContract: (index) => index === 0 ? "tracked" : undefined,
    intentValueContractName: () => undefined,
    intentValueContractVersion: () => undefined,
    actionStateId: (index) => index === 0 ? "example/link-presence" : undefined,
    actionStateSourceKind: (index) => index === 0 ? "routed" : undefined,
    actionStateSourceActionId: () => undefined,
    actionStateSourceIntentId: (index) =>
      index === 0 ? "example/set-link-intent" : undefined,
    actionStateHistoryDirection: () => undefined,
    actionStateActivationContract: (index) =>
      index === 0 ? "tracked" : undefined,
    actionStateValueContractName: () => undefined,
    actionStateValueContractVersion: () => undefined,
    inlineFormatSetFormatKind: (index) =>
      includeSet && index === 0 ? "example/link" : undefined,
    inlineFormatSetIntentId: (index) =>
      includeSet && index === 0 ? "example/set-link-intent" : undefined,
    inlineFormatSetActionStateId: (index) =>
      includeSet && index === 0 ? "example/link-presence" : undefined,
    matchesProfileGeneration: (candidate) => candidate === generation,
    free(): void {},
  };
  const consumed = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!consumed.ok) throw new Error("inline-format form descriptor fixture failed");
  return consumed.descriptor;
}

function manifest(overrides: Record<string, unknown> = {}) {
  return createToolbarManifest({
    label: "Controls",
    controls: [
      {
        kind: "button",
        stateId: "example/bold",
        label: "Bold",
        activation: "tracked",
        command: { kind: "intent", intentId: "example/format-strong" },
        ...overrides,
      },
      {
        kind: "button",
        stateId: "example/undo",
        label: "Undo",
        activation: "stateless",
        command: { kind: "history", operation: "undo" },
      },
    ],
  });
}

function inlineFormatFormManifest(
  fields: readonly Record<string, unknown>[] = [
    {
      kind: "boolean",
      propertyName: "example/open-in-new-window",
      label: "Open in new window",
      defaultValue: false,
    },
    {
      kind: "string",
      propertyName: "example/href",
      label: "Address",
      presentation: "url",
      autocomplete: "url",
      minimumUtf8Bytes: 1,
      maximumUtf8Bytes: 2_048,
    },
  ],
  overrides: Record<string, unknown> = {},
) {
  return createToolbarManifest({
    label: "Controls",
    controls: [
      {
        kind: "inlineFormatForm",
        stateId: "example/link-presence",
        label: "Link",
        formatKind: "example/link",
        intentId: "example/set-link-intent",
        fields,
        applyLabel: "Apply",
        removeLabel: "Remove",
        closeLabel: "Close",
        ...overrides,
      },
    ],
  });
}

describe("toolbarManifestMatchesProfileDescriptor", () => {
  it("accepts exact no-input routed intents and exact history controls", () => {
    expect(toolbarManifestMatchesProfileDescriptor(manifest(), descriptor())).toBe(true);
  });

  it("rejects foreign values and missing or cross-wired profile entries", () => {
    const profile = descriptor();
    expect(toolbarManifestMatchesProfileDescriptor({}, profile)).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(manifest(), {})).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(manifest({
      stateId: "example/missing",
    }), profile)).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(manifest({
      command: { kind: "intent", intentId: "example/missing" },
    }), profile)).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(manifest({
      activation: "stateless",
    }), profile)).toBe(false);
  });

  it("keeps direct concrete actions on the advanced-only toolbar path", () => {
    const direct = manifest({
      command: {
        kind: "action",
        actionId: "example/toggle-strong",
        input: { kind: "none" },
        history: "closeBefore",
      },
    });
    expect(toolbarManifestMatchesProfileDescriptor(direct, descriptor())).toBe(false);
  });

  it("accepts an exact property-aware inline-format set surface", () => {
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(),
      inlineFormatFormDescriptor(),
    )).toBe(true);
  });

  it("requires the same format, typed intent, routed state, and generated set surface", () => {
    const profile = inlineFormatFormDescriptor();
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(undefined, { formatKind: "example/missing" }),
      profile,
    )).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(undefined, { intentId: "example/missing" }),
      profile,
    )).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(undefined, { stateId: "example/missing" }),
      profile,
    )).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(),
      inlineFormatFormDescriptor(FORM_PROPERTIES, false),
    )).toBe(false);
  });

  it("requires exact complete required string/Boolean property coverage", () => {
    const profile = inlineFormatFormDescriptor();
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest([
        {
          kind: "string",
          propertyName: "example/href",
          label: "Address",
          presentation: "url",
          autocomplete: "url",
          minimumUtf8Bytes: 1,
          maximumUtf8Bytes: 2_047,
        },
        {
          kind: "boolean",
          propertyName: "example/open-in-new-window",
          label: "Open in new window",
          defaultValue: false,
        },
      ]),
      profile,
    )).toBe(false);
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest([
        {
          kind: "string",
          propertyName: "example/href",
          label: "Address",
          presentation: "url",
          autocomplete: "url",
          minimumUtf8Bytes: 1,
          maximumUtf8Bytes: 2_048,
        },
      ]),
      profile,
    )).toBe(false);

    const optionalProperties: readonly FormProfileProperty[] = [
      FORM_PROPERTIES[0]!,
      { ...FORM_PROPERTIES[1]!, presence: "optional" },
    ];
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(),
      inlineFormatFormDescriptor(optionalProperties),
    )).toBe(false);

    const integerProperties: readonly FormProfileProperty[] = [
      FORM_PROPERTIES[0]!,
      {
        name: "example/open-in-new-window",
        presence: "required",
        valueType: { kind: "integer", minimum: 0, maximum: 1 },
      },
    ];
    expect(toolbarManifestMatchesProfileDescriptor(
      inlineFormatFormManifest(),
      inlineFormatFormDescriptor(integerProperties),
    )).toBe(false);
  });
});
