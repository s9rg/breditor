import { BASE_TOOLBAR_STATE_IDS } from "./toolbar_manifest.js";

/** Exact maximum declarations possible in the closed physical-code/Shift domain. */
export const MAX_KEYBOARD_SHORTCUT_DECLARATIONS = 43;

/** Maximum aliases admitted for one semantic state. */
export const MAX_KEYBOARD_SHORTCUT_CHORDS_PER_DECLARATION = 4;

/** Exact number of non-reserved chords in the closed physical-code/Shift domain. */
export const MAX_KEYBOARD_SHORTCUT_CHORDS_TOTAL = 44;

/** Maximum ASCII length of one shortcut target state identity. */
export const MAX_KEYBOARD_SHORTCUT_STATE_ID_ASCII = 128;

/** One exact primary-modifier chord. */
export interface PrimaryKeyChord {
  /** One exact physical `KeyboardEvent.code` from `KeyA` through `KeyZ`. */
  readonly code: string;
  /** Whether Shift must also be pressed. Other modifiers must be absent. */
  readonly shift: boolean;
}

/** One semantic state and all of its shortcut aliases. */
export interface KeyboardShortcutDeclaration {
  /** Existing Rust-owned ActionStateId used to derive intent or history work. */
  readonly stateId: string;
  readonly chords: readonly PrimaryKeyChord[];
}

/** Immutable, bounded, callback-free shortcut presentation data. */
export interface KeyboardShortcutManifest {
  /** Canonical state-ID order, independent from registration order. */
  readonly shortcuts: readonly KeyboardShortcutDeclaration[];
}

const OWNED_MANIFESTS = new WeakSet<object>();
const RESERVED_NATIVE_CODES = new Set(["KeyA", "KeyC", "KeyV", "KeyX"]);
const RESERVED_CORE_CHORDS = new Map([
  ["0:KeyB", BASE_TOOLBAR_STATE_IDS.bold],
  ["0:KeyY", BASE_TOOLBAR_STATE_IDS.redo],
  ["0:KeyZ", BASE_TOOLBAR_STATE_IDS.undo],
  ["1:KeyZ", BASE_TOOLBAR_STATE_IDS.redo],
]);
const QUALIFIED_NAME = /^[a-z][a-z0-9._-]*\/[a-z][a-z0-9._-]*$/u;

/**
 * Copies, bounds, and canonicalizes a keyboard shortcut manifest.
 *
 * Clipboard and Select All letters remain browser-owned. Core Bold/history
 * chords may be omitted but cannot be rebound to another semantic state.
 * Duplicate states or chords reject the complete manifest; registration order
 * never selects a winner. No function, DOM object, event, or mutable caller
 * object is retained.
 */
export function createKeyboardShortcutManifest(
  value: unknown,
): KeyboardShortcutManifest {
  try {
    const manifest = exactDataRecord(value, ["shortcuts"], "shortcut manifest");
    const shortcuts = dataProperty(
      manifest,
      "shortcuts",
      "shortcut manifest declarations",
    );
    if (!Array.isArray(shortcuts)) {
      throw new TypeError("shortcut manifest declarations must be an array");
    }
    const count = exactArrayLength(
      shortcuts,
      "shortcut manifest declarations",
      MAX_KEYBOARD_SHORTCUT_DECLARATIONS,
    );

    const safeShortcuts: KeyboardShortcutDeclaration[] = [];
    const seenStateIds = new Set<string>();
    const seenChords = new Set<string>();
    let chordCount = 0;
    for (let index = 0; index < count; index += 1) {
      const declaration = snapshotDeclaration(
        dataProperty(shortcuts, String(index), `shortcut declaration ${index}`),
      );
      if (seenStateIds.has(declaration.stateId)) {
        throw new TypeError("keyboard shortcut state identity is duplicated");
      }
      seenStateIds.add(declaration.stateId);
      chordCount += declaration.chords.length;
      if (chordCount > MAX_KEYBOARD_SHORTCUT_CHORDS_TOTAL) {
        throw new RangeError(
          "shortcut manifest chord count is outside its fixed aggregate bound",
        );
      }
      for (const chord of declaration.chords) {
        const identity = chordKey(chord.code, chord.shift);
        if (seenChords.has(identity)) {
          throw new TypeError("keyboard shortcut chord is duplicated");
        }
        const reservedStateId = RESERVED_CORE_CHORDS.get(identity);
        if (
          reservedStateId !== undefined &&
          reservedStateId !== declaration.stateId
        ) {
          throw new TypeError("core keyboard shortcut chord is reserved");
        }
        seenChords.add(identity);
      }
      safeShortcuts.push(declaration);
    }
    safeShortcuts.sort((left, right) => compareAscii(left.stateId, right.stateId));

    const safeManifest: KeyboardShortcutManifest = Object.freeze({
      shortcuts: Object.freeze(safeShortcuts),
    });
    OWNED_MANIFESTS.add(safeManifest);
    return safeManifest;
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new TypeError("keyboard shortcut manifest is invalid");
  }
}

/** Returns whether a value was minted by the shortcut manifest compiler. */
export function isOwnedKeyboardShortcutManifest(
  value: unknown,
): value is KeyboardShortcutManifest {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      OWNED_MANIFESTS.has(value)
    );
  } catch {
    return false;
  }
}

/** Base Bold and history shortcuts used when no custom manifest is supplied. */
export const DEFAULT_KEYBOARD_SHORTCUT_MANIFEST: KeyboardShortcutManifest =
  createKeyboardShortcutManifest({
    shortcuts: [
      {
        stateId: BASE_TOOLBAR_STATE_IDS.bold,
        chords: [{ code: "KeyB", shift: false }],
      },
      {
        stateId: BASE_TOOLBAR_STATE_IDS.undo,
        chords: [{ code: "KeyZ", shift: false }],
      },
      {
        stateId: BASE_TOOLBAR_STATE_IDS.redo,
        chords: [
          { code: "KeyZ", shift: true },
          { code: "KeyY", shift: false },
        ],
      },
    ],
  });

function snapshotDeclaration(value: unknown): KeyboardShortcutDeclaration {
  const declaration = exactDataRecord(
    value,
    ["stateId", "chords"],
    "shortcut declaration",
  );
  const stateId = dataProperty(
    declaration,
    "stateId",
    "shortcut state identity",
  );
  const chords = dataProperty(declaration, "chords", "shortcut chords");
  if (
    typeof stateId !== "string" ||
    stateId.length > MAX_KEYBOARD_SHORTCUT_STATE_ID_ASCII ||
    !QUALIFIED_NAME.test(stateId)
  ) {
    throw new TypeError("keyboard shortcut state identity is invalid");
  }
  if (!Array.isArray(chords)) {
    throw new TypeError("keyboard shortcut chords must be an array");
  }
  const chordCount = exactArrayLength(
    chords,
    "keyboard shortcut chords",
    MAX_KEYBOARD_SHORTCUT_CHORDS_PER_DECLARATION,
  );
  if (chordCount < 1) {
    throw new RangeError(
      "shortcut declaration chord count is outside its fixed bounds",
    );
  }
  const safeChords: PrimaryKeyChord[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < chordCount; index += 1) {
    const chord = snapshotChord(
      dataProperty(chords, String(index), `shortcut chord ${index}`),
    );
    const identity = chordKey(chord.code, chord.shift);
    if (seen.has(identity)) {
      throw new TypeError("keyboard shortcut chord is duplicated");
    }
    seen.add(identity);
    safeChords.push(chord);
  }
  safeChords.sort((left, right) =>
    left.code === right.code
      ? Number(left.shift) - Number(right.shift)
      : compareAscii(left.code, right.code),
  );
  return Object.freeze({ stateId, chords: Object.freeze(safeChords) });
}

function snapshotChord(value: unknown): PrimaryKeyChord {
  const chord = exactDataRecord(value, ["code", "shift"], "shortcut chord");
  const code = dataProperty(chord, "code", "shortcut physical code");
  const shift = dataProperty(chord, "shift", "shortcut Shift state");
  if (
    typeof code !== "string" ||
    !/^Key[A-Z]$/u.test(code) ||
    RESERVED_NATIVE_CODES.has(code) ||
    typeof shift !== "boolean"
  ) {
    throw new TypeError("keyboard shortcut chord is invalid");
  }
  return Object.freeze({ code, shift });
}

function chordKey(code: string, shift: boolean): string {
  return `${shift ? "1" : "0"}:${code}`;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactArrayLength(
  value: unknown[],
  description: string,
  maximum: number,
): number {
  const length = dataProperty(value, "length", `${description} length`);
  if (
    typeof length !== "number" ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    Object.is(length, -0)
  ) {
    throw new TypeError(`${description} length is invalid`);
  }
  if (length > maximum) {
    throw new RangeError(`${description} count is outside its fixed bounds`);
  }
  const allowed = new Set(["length"]);
  for (let index = 0; index < length; index += 1) allowed.add(String(index));
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== allowed.size ||
    keys.some((key) => typeof key !== "string" || !allowed.has(key))
  ) {
    throw new TypeError(`${description} shape is invalid`);
  }
  return length;
}

function exactDataRecord(
  value: unknown,
  keys: readonly string[],
  description: string,
): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${description} must be an object`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== keys.length ||
    ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
  ) {
    throw new TypeError(`${description} shape is invalid`);
  }
  return value;
}

function dataProperty(
  value: object,
  key: string,
  description: string,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new TypeError(`${description} must be an own data property`);
  }
  return descriptor.value;
}
