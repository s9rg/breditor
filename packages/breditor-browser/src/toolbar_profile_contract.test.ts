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
    matchesProfileGeneration: (candidate) => candidate === generation,
    free(): void {},
  };
  const consumed = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!consumed.ok) throw new Error("profile descriptor fixture failed");
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
});
