import {
  DEFAULT_KEYBOARD_SHORTCUT_MANIFEST,
  createKeyboardShortcutManifest,
  isOwnedKeyboardShortcutManifest,
  type KeyboardShortcutManifest,
} from "./keyboard_shortcut_manifest.js";
import { BASE_INTENT_IDS } from "./editor_command.js";
import { BASE_TOOLBAR_STATE_IDS } from "./toolbar_manifest.js";
import {
  isOwnedBrowserCompiledProfileDescriptor,
  type BrowserCompiledProfileDescriptor,
  type BrowserProfileActionStateDescriptor,
  type BrowserProfileIntentDescriptor,
  type BrowserProfileStateContract,
} from "./wasm_profile_descriptor.js";

declare const COMPILED_KEYBOARD_SHORTCUTS_BRAND: unique symbol;

/** One descriptor-derived executable target. */
export type BrowserCompiledKeyboardShortcutTarget =
  | Readonly<{ kind: "intent"; intentId: string }>
  | Readonly<{ kind: "history"; operation: "undo" | "redo" }>;

/** One compiled chord with no executable callback or retained native event. */
export interface BrowserCompiledKeyboardShortcutBinding {
  readonly stateId: string;
  readonly code: string;
  readonly shift: boolean;
  readonly target: BrowserCompiledKeyboardShortcutTarget;
}

/** Opaque shortcut table compiled against one owned profile descriptor. */
export interface BrowserCompiledKeyboardShortcuts {
  readonly manifest: KeyboardShortcutManifest;
  readonly profileDescriptor: BrowserCompiledProfileDescriptor | undefined;
  readonly bindings: readonly BrowserCompiledKeyboardShortcutBinding[];
  readonly [COMPILED_KEYBOARD_SHORTCUTS_BRAND]: true;
}

interface CompiledMetadata {
  readonly byChord: ReadonlyMap<string, BrowserCompiledKeyboardShortcutBinding>;
  readonly byState: ReadonlyMap<
    string,
    readonly BrowserCompiledKeyboardShortcutBinding[]
  >;
}

const OWNED_COMPILED = new WeakSet<object>();
const COMPILED_METADATA = new WeakMap<object, CompiledMetadata>();

/**
 * Compiles state-addressed browser data into exact semantic intent/history work.
 *
 * Routed states must derive a no-input intent with the same observable contract.
 * History states derive their Rust-owned direction. Direct action states and
 * typed intents fail the whole compilation before native listeners are installed.
 */
export function compileKeyboardShortcutManifest(
  manifest: KeyboardShortcutManifest,
  profileDescriptor: BrowserCompiledProfileDescriptor,
): BrowserCompiledKeyboardShortcuts {
  if (
    !isOwnedKeyboardShortcutManifest(manifest) ||
    !isOwnedBrowserCompiledProfileDescriptor(profileDescriptor)
  ) {
    throw new TypeError("keyboard shortcut profile contract is invalid");
  }
  const states = new Map<string, BrowserProfileActionStateDescriptor>();
  for (const state of profileDescriptor.actionStates) states.set(state.id, state);
  const intents = new Map<string, BrowserProfileIntentDescriptor>();
  for (const intent of profileDescriptor.intents) intents.set(intent.id, intent);

  return compileResolvedKeyboardShortcuts(
    manifest,
    profileDescriptor,
    (stateId) => targetForState(states.get(stateId), intents),
  );
}

/**
 * Compiles only the base shortcuts whose semantic states exist in a profile.
 *
 * This is the high-level omitted-option policy. An explicitly supplied
 * manifest remains exact and never receives this compatibility filtering.
 */
export function compileCompatibleDefaultKeyboardShortcuts(
  profileDescriptor: BrowserCompiledProfileDescriptor,
): BrowserCompiledKeyboardShortcuts {
  if (!isOwnedBrowserCompiledProfileDescriptor(profileDescriptor)) {
    throw new TypeError("keyboard shortcut profile contract is invalid");
  }
  const states = new Map(
    profileDescriptor.actionStates.map((state) => [state.id, state] as const),
  );
  const intents = new Map(
    profileDescriptor.intents.map((intent) => [intent.id, intent] as const),
  );
  const manifest = createKeyboardShortcutManifest({
    shortcuts: DEFAULT_KEYBOARD_SHORTCUT_MANIFEST.shortcuts.filter(
      (shortcut) =>
        targetForState(states.get(shortcut.stateId), intents) !== undefined,
    ),
  });
  return compileKeyboardShortcutManifest(manifest, profileDescriptor);
}

/** Returns whether a value was minted by the checked shortcut compiler. */
export function isOwnedBrowserCompiledKeyboardShortcuts(
  value: unknown,
): value is BrowserCompiledKeyboardShortcuts {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      OWNED_COMPILED.has(value) &&
      COMPILED_METADATA.has(value)
    );
  } catch {
    return false;
  }
}

/** Resolves one exact physical-code chord. @internal */
export function compiledKeyboardShortcutBindingFor(
  compiled: BrowserCompiledKeyboardShortcuts,
  code: string,
  shift: boolean,
): BrowserCompiledKeyboardShortcutBinding | undefined {
  if (
    !isOwnedBrowserCompiledKeyboardShortcuts(compiled) ||
    typeof shift !== "boolean"
  ) {
    return undefined;
  }
  const identity = keyboardShortcutCodeIdentity(code);
  return identity === undefined
    ? undefined
    : COMPILED_METADATA.get(compiled)?.byChord.get(
        chordKey(identity, shift),
      );
}

/** Returns compiled aliases for one state without exposing a mutable map. @internal */
export function compiledKeyboardShortcutBindingsForState(
  compiled: BrowserCompiledKeyboardShortcuts,
  stateId: string,
): readonly BrowserCompiledKeyboardShortcutBinding[] {
  if (!isOwnedBrowserCompiledKeyboardShortcuts(compiled)) {
    return Object.freeze([]);
  }
  return COMPILED_METADATA.get(compiled)?.byState.get(stateId) ?? Object.freeze([]);
}

/** Admits only a standards-defined physical letter-code identity. @internal */
export function keyboardShortcutCodeIdentity(code: string): string | undefined {
  return typeof code === "string" && /^Key[A-Z]$/u.test(code)
    ? code
    : undefined;
}

/** Base compiled table retained for low-level callers which omit a custom map. */
export const DEFAULT_COMPILED_KEYBOARD_SHORTCUTS: BrowserCompiledKeyboardShortcuts =
  compileResolvedKeyboardShortcuts(
    DEFAULT_KEYBOARD_SHORTCUT_MANIFEST,
    undefined,
    (stateId) => {
      if (stateId === BASE_TOOLBAR_STATE_IDS.bold) {
        return Object.freeze({
          kind: "intent" as const,
          intentId: BASE_INTENT_IDS.formatStrong,
        });
      }
      if (stateId === BASE_TOOLBAR_STATE_IDS.undo) {
        return Object.freeze({ kind: "history" as const, operation: "undo" as const });
      }
      if (stateId === BASE_TOOLBAR_STATE_IDS.redo) {
        return Object.freeze({ kind: "history" as const, operation: "redo" as const });
      }
      return undefined;
    },
  );

function compileResolvedKeyboardShortcuts(
  manifest: KeyboardShortcutManifest,
  profileDescriptor: BrowserCompiledProfileDescriptor | undefined,
  resolve: (
    stateId: string,
  ) => BrowserCompiledKeyboardShortcutTarget | undefined,
): BrowserCompiledKeyboardShortcuts {
  const bindings: BrowserCompiledKeyboardShortcutBinding[] = [];
  const byChord = new Map<string, BrowserCompiledKeyboardShortcutBinding>();
  const mutableByState = new Map<string, BrowserCompiledKeyboardShortcutBinding[]>();
  for (const shortcut of manifest.shortcuts) {
    const target = resolve(shortcut.stateId);
    if (target === undefined) {
      throw new TypeError("keyboard shortcut state is not executable");
    }
    const stateBindings: BrowserCompiledKeyboardShortcutBinding[] = [];
    for (const chord of shortcut.chords) {
      const binding: BrowserCompiledKeyboardShortcutBinding = Object.freeze({
        stateId: shortcut.stateId,
        code: chord.code,
        shift: chord.shift,
        target,
      });
      bindings.push(binding);
      stateBindings.push(binding);
      byChord.set(chordKey(chord.code, chord.shift), binding);
    }
    mutableByState.set(shortcut.stateId, stateBindings);
  }
  bindings.sort((left, right) =>
    left.code === right.code
      ? left.shift === right.shift
        ? compareAscii(left.stateId, right.stateId)
        : Number(left.shift) - Number(right.shift)
      : compareAscii(left.code, right.code),
  );
  const byState = new Map<string, readonly BrowserCompiledKeyboardShortcutBinding[]>();
  for (const [stateId, stateBindings] of mutableByState) {
    byState.set(stateId, Object.freeze(stateBindings));
  }
  const compiled: BrowserCompiledKeyboardShortcuts = Object.freeze({
    manifest,
    profileDescriptor,
    bindings: Object.freeze(bindings),
  }) as BrowserCompiledKeyboardShortcuts;
  OWNED_COMPILED.add(compiled);
  COMPILED_METADATA.set(compiled, Object.freeze({ byChord, byState }));
  return compiled;
}

function targetForState(
  state: BrowserProfileActionStateDescriptor | undefined,
  intents: ReadonlyMap<string, BrowserProfileIntentDescriptor>,
): BrowserCompiledKeyboardShortcutTarget | undefined {
  if (state?.source.kind === "history") {
    return state.state.activation === "stateless" && state.state.value === undefined
      ? Object.freeze({
          kind: "history" as const,
          operation: state.source.direction,
        })
      : undefined;
  }
  if (state?.source.kind !== "routed") return undefined;
  const intent = intents.get(state.source.intentId);
  return intent !== undefined &&
      intent.input.kind === "none" &&
      stateContractsEqual(state.state, intent.state)
    ? Object.freeze({ kind: "intent" as const, intentId: intent.id })
    : undefined;
}

function stateContractsEqual(
  left: BrowserProfileStateContract,
  right: BrowserProfileStateContract,
): boolean {
  return (
    left.activation === right.activation &&
    (left.value === undefined
      ? right.value === undefined
      : right.value !== undefined &&
        left.value.name === right.value.name &&
        left.value.version === right.value.version)
  );
}

function chordKey(code: string, shift: boolean): string {
  return `${shift ? "1" : "0"}:${code}`;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
