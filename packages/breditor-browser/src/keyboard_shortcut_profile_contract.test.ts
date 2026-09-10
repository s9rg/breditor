import { describe, expect, it } from "vitest";

import { BASE_INTENT_IDS } from "./editor_command.js";
import { createKeyboardShortcutManifest } from "./keyboard_shortcut_manifest.js";
import {
  DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
  compileCompatibleDefaultKeyboardShortcuts,
  compileKeyboardShortcutManifest,
  compiledKeyboardShortcutBindingFor,
  compiledKeyboardShortcutBindingsForState,
  isOwnedBrowserCompiledKeyboardShortcuts,
  keyboardShortcutCodeIdentity,
  type BrowserCompiledKeyboardShortcuts,
} from "./keyboard_shortcut_profile_contract.js";
import {
  consumeWasmCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type WasmCompiledProfileDescriptorView,
  type WasmProfileGenerationView,
} from "./wasm_profile_descriptor.js";

describe("keyboard shortcut profile contract", () => {
  it("derives the low-level base Bold target from the authoritative intent catalog", () => {
    expect(
      compiledKeyboardShortcutBindingFor(
        DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
        "KeyB",
        false,
      )?.target,
    ).toEqual({ kind: "intent", intentId: BASE_INTENT_IDS.formatStrong });
  });

  it("filters omitted base defaults against a custom profile", () => {
    const descriptor = ownedDescriptor();

    const compiled = compileCompatibleDefaultKeyboardShortcuts(descriptor);

    expect(compiled.profileDescriptor).toBe(descriptor);
    expect(compiled.manifest.shortcuts).toEqual([]);
    expect(compiled.bindings).toEqual([]);
  });

  it("derives no-input routed intents and exact history directions from an owned descriptor", () => {
    const descriptor = ownedDescriptor();
    const manifest = createKeyboardShortcutManifest({
      shortcuts: [
        shortcut("example/control-undo", "KeyU"),
        shortcut("example/control-emphasis", "KeyI"),
        shortcut("example/control-redo", "KeyR"),
      ],
    });

    const compiled = compileKeyboardShortcutManifest(manifest, descriptor);

    expect(compiled).toEqual({
      manifest,
      profileDescriptor: descriptor,
      bindings: [
        {
          stateId: "example/control-emphasis",
          code: "KeyI",
          shift: false,
          target: { kind: "intent", intentId: "example/format-emphasis" },
        },
        {
          stateId: "example/control-redo",
          code: "KeyR",
          shift: false,
          target: { kind: "history", operation: "redo" },
        },
        {
          stateId: "example/control-undo",
          code: "KeyU",
          shift: false,
          target: { kind: "history", operation: "undo" },
        },
      ],
    });
    expect(isOwnedBrowserCompiledKeyboardShortcuts(compiled)).toBe(true);
    expect(Object.isFrozen(compiled)).toBe(true);
    expect(Object.isFrozen(compiled.bindings)).toBe(true);
    expect(compiled.bindings.every(Object.isFrozen)).toBe(true);
    expect(compiled.bindings.every(({ target }) => Object.isFrozen(target))).toBe(
      true,
    );
  });

  it("builds exact O(1) chord and state indexes without exposing mutable arrays", () => {
    const compiled = compileKeyboardShortcutManifest(
      createKeyboardShortcutManifest({
        shortcuts: [
          {
            stateId: "example/control-emphasis",
            chords: [
              { code: "KeyI", shift: false },
              { code: "KeyI", shift: true },
            ],
          },
        ],
      }),
      ownedDescriptor(),
    );

    expect(compiledKeyboardShortcutBindingFor(compiled, "KeyI", false)).toMatchObject({
      stateId: "example/control-emphasis",
      shift: false,
      target: { kind: "intent", intentId: "example/format-emphasis" },
    });
    expect(compiledKeyboardShortcutBindingFor(compiled, "KeyI", true)).toMatchObject({
      stateId: "example/control-emphasis",
      shift: true,
    });
    expect(compiledKeyboardShortcutBindingFor(compiled, "KeyI", false)).not.toBe(
      compiledKeyboardShortcutBindingFor(compiled, "KeyI", true),
    );

    const stateBindings = compiledKeyboardShortcutBindingsForState(
      compiled,
      "example/control-emphasis",
    );
    expect(stateBindings).toEqual([
      expect.objectContaining({ code: "KeyI", shift: false }),
      expect.objectContaining({ code: "KeyI", shift: true }),
    ]);
    expect(Object.isFrozen(stateBindings)).toBe(true);
    expect(
      compiledKeyboardShortcutBindingsForState(compiled, "example/control-missing"),
    ).toEqual([]);
  });

  it.each([
    "example/control-direct",
    "example/control-link",
    "example/control-valued-history",
    "example/control-weird-history",
    "example/control-missing",
  ])("rejects non-executable shortcut state %s", (stateId) => {
    expect(() =>
      compileKeyboardShortcutManifest(
        createKeyboardShortcutManifest({ shortcuts: [shortcut(stateId, "KeyI")] }),
        ownedDescriptor(),
      ),
    ).toThrow(TypeError);
  });

  it("rejects forged manifests and forged descriptors at the ownership boundary", () => {
    const manifest = createKeyboardShortcutManifest({
      shortcuts: [shortcut("example/control-emphasis", "KeyI")],
    });
    const descriptor = ownedDescriptor();

    expect(() =>
      compileKeyboardShortcutManifest(
        { shortcuts: manifest.shortcuts },
        descriptor,
      ),
    ).toThrow(TypeError);
    expect(() =>
      compileKeyboardShortcutManifest(
        manifest,
        {
          schema: descriptor.schema,
          formats: descriptor.formats,
          intents: descriptor.intents,
          actionStates: descriptor.actionStates,
          inlineFormatSets: descriptor.inlineFormatSets,
        },
      ),
    ).toThrow(TypeError);
  });

  it("validates exact physical shortcut codes and fails closed for invalid or missing codes", () => {
    const compiled = compileKeyboardShortcutManifest(
      createKeyboardShortcutManifest({
        shortcuts: [shortcut("example/control-emphasis", "KeyI")],
      }),
      ownedDescriptor(),
    );

    expect(keyboardShortcutCodeIdentity("KeyI")).toBe("KeyI");
    expect(keyboardShortcutCodeIdentity("KeyA")).toBe("KeyA");
    expect(keyboardShortcutCodeIdentity("KeyZ")).toBe("KeyZ");
    for (const code of ["", "I", "Keyi", "KeyII", "Digit9", "Unidentified"]) {
      expect(keyboardShortcutCodeIdentity(code)).toBeUndefined();
      expect(compiledKeyboardShortcutBindingFor(compiled, code, false)).toBeUndefined();
    }
    expect(
      keyboardShortcutCodeIdentity(1 as unknown as string),
    ).toBeUndefined();

    expect(compiledKeyboardShortcutBindingFor(compiled, "KeyI", false)).toMatchObject({
      stateId: "example/control-emphasis",
    });
  });

  it("contains forged compiled values and invalid matcher inputs", () => {
    const forged = {
      manifest: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS.manifest,
      profileDescriptor: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS.profileDescriptor,
      bindings: DEFAULT_COMPILED_KEYBOARD_SHORTCUTS.bindings,
    } as BrowserCompiledKeyboardShortcuts;
    const hostile = new Proxy({}, {
      get: () => {
        throw new Error("must be contained");
      },
    });

    expect(isOwnedBrowserCompiledKeyboardShortcuts(forged)).toBe(false);
    expect(isOwnedBrowserCompiledKeyboardShortcuts(hostile)).toBe(false);
    expect(compiledKeyboardShortcutBindingFor(forged, "KeyB", false)).toBeUndefined();
    expect(compiledKeyboardShortcutBindingsForState(forged, "breditor/control-bold")).toEqual(
      [],
    );
    expect(
      compiledKeyboardShortcutBindingFor(
        DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
        "KeyB",
        1 as unknown as boolean,
      ),
    ).toBeUndefined();
  });
});

interface IntentFixture {
  readonly id: string;
  readonly inputKind: "none" | "typed";
  readonly inputName?: string;
  readonly inputVersion?: number;
  readonly activation: "stateless" | "tracked";
  readonly valueName?: string;
  readonly valueVersion?: number;
}

interface StateFixture {
  readonly id: string;
  readonly sourceKind: "direct" | "routed" | "history";
  readonly actionId?: string;
  readonly intentId?: string;
  readonly direction?: "undo" | "redo";
  readonly activation: "stateless" | "tracked";
  readonly valueName?: string;
  readonly valueVersion?: number;
}

class Generation implements WasmProfileGenerationView {
  matches(other: WasmProfileGenerationView): boolean {
    return other === this;
  }
  free(): void {}
}

function ownedDescriptor(): BrowserCompiledProfileDescriptor {
  const generation = new Generation();
  const intents: readonly IntentFixture[] = [
    {
      id: "example/format-emphasis",
      inputKind: "none",
      activation: "tracked",
    },
    {
      id: "example/set-link",
      inputKind: "typed",
      inputName: "example/link-input",
      inputVersion: 1,
      activation: "tracked",
      valueName: "example/link-value",
      valueVersion: 1,
    },
  ];
  const states: readonly StateFixture[] = [
    {
      id: "example/control-direct",
      sourceKind: "direct",
      actionId: "example/toggle-direct",
      activation: "stateless",
    },
    {
      id: "example/control-emphasis",
      sourceKind: "routed",
      intentId: "example/format-emphasis",
      activation: "tracked",
    },
    {
      id: "example/control-link",
      sourceKind: "routed",
      intentId: "example/set-link",
      activation: "tracked",
      valueName: "example/link-value",
      valueVersion: 1,
    },
    {
      id: "example/control-redo",
      sourceKind: "history",
      direction: "redo",
      activation: "stateless",
    },
    {
      id: "example/control-undo",
      sourceKind: "history",
      direction: "undo",
      activation: "stateless",
    },
    {
      id: "example/control-valued-history",
      sourceKind: "history",
      direction: "undo",
      activation: "stateless",
      valueName: "example/history-value",
      valueVersion: 1,
    },
    {
      id: "example/control-weird-history",
      sourceKind: "history",
      direction: "undo",
      activation: "tracked",
    },
  ];
  const noEntry = (): undefined => undefined;
  const view: WasmCompiledProfileDescriptorView = {
    schemaName: "example/profile",
    schemaVersion: 1,
    schemaFingerprint: `sha256:${"7".repeat(64)}`,
    formatCount: 0,
    intentCount: intents.length,
    actionStateCount: states.length,
    inlineFormatSetCount: 0,
    formatKind: noEntry,
    formatRevision: noEntry,
    formatPropertyCount: noEntry,
    formatPropertyName: noEntry,
    formatPropertyPresence: noEntry,
    formatPropertyValueType: noEntry,
    formatPropertyIntegerMinimum: noEntry,
    formatPropertyIntegerMaximum: noEntry,
    formatPropertyStringMinimumUtf8Bytes: noEntry,
    formatPropertyStringMaximumUtf8Bytes: noEntry,
    intentId: (index) => intents[index]?.id,
    intentInputKind: (index) => intents[index]?.inputKind,
    intentInputContractName: (index) => intents[index]?.inputName,
    intentInputContractVersion: (index) => intents[index]?.inputVersion,
    intentActivationContract: (index) => intents[index]?.activation,
    intentValueContractName: (index) => intents[index]?.valueName,
    intentValueContractVersion: (index) => intents[index]?.valueVersion,
    actionStateId: (index) => states[index]?.id,
    actionStateSourceKind: (index) => states[index]?.sourceKind,
    actionStateSourceActionId: (index) => states[index]?.actionId,
    actionStateSourceIntentId: (index) => states[index]?.intentId,
    actionStateHistoryDirection: (index) => states[index]?.direction,
    actionStateActivationContract: (index) => states[index]?.activation,
    actionStateValueContractName: (index) => states[index]?.valueName,
    actionStateValueContractVersion: (index) => states[index]?.valueVersion,
    inlineFormatSetFormatKind: noEntry,
    inlineFormatSetIntentId: noEntry,
    inlineFormatSetActionStateId: noEntry,
    matchesProfileGeneration: (candidate) => candidate === generation,
    free(): void {},
  };
  const consumed = consumeWasmCompiledProfileDescriptor(generation, view);
  if (!consumed.ok) throw new Error("shortcut profile descriptor fixture failed");
  return consumed.descriptor;
}

function shortcut(stateId: string, code: string, shift = false) {
  return { stateId, chords: [{ code, shift }] };
}
