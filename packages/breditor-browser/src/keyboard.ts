import type { NestedListEditorCommandRequest, NestedListEditorDeliveryToken, NestedListEditorSelectionSync } from "./editor_command.js";
import {
  type FlatListEditorCommandRequest,
  type FlatListEditorDeliveryToken,
  type FlatListEditorSelectionSync,
  type EditorDeliveryToken,
  type EditorCommandRequest,
  type EditorSelectionSync,
} from "./editor_command.js";
import { nativeCommandBuilder, type NativeCommandRequest, type NativeDeliveryToken, type NativeSelectionSync } from "./native_command_builder.js";
import {
  compiledKeyboardShortcutBindingFor,
  DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
  isOwnedBrowserCompiledKeyboardShortcuts,
  keyboardShortcutCodeIdentity,
  type BrowserCompiledKeyboardShortcuts,
} from "./keyboard_shortcut_profile_contract.js";

/** Host-selected keyboard policy; Breditor never sniffs an operating system. */
export interface KeyboardTranslationPolicy {
  readonly editing: "beforeinputPrimary" | "structuralFallback";
  readonly primaryModifier: "control" | "meta";
  readonly shortcuts: "enabled" | "disabled";
}

/** Safe scalar snapshot read from one native keyboard event. */
export interface KeyboardSnapshot {
  readonly key: string;
  readonly code: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
  readonly altGraph: boolean;
}

/** Pure classification before cancellation and FIFO submission. */
export type KeyboardTranslation<R extends NativeCommandRequest = EditorCommandRequest> =
  | Readonly<{ kind: "command"; request: R }>
  | Readonly<{
      kind: "blocked";
      reason:
        | "unsupportedEditingShortcut"
        | "unsupportedLineBreak"
        | "textRequiresBeforeInput"
        | "repeatSuppressed";
    }>
  | Readonly<{
      kind: "native";
      reason: "beforeinputOwns" | "clipboardOwns" | "selectionOrPageCommand";
    }>
  | Readonly<{ kind: "composition" }>
  | Readonly<{ kind: "invalid" }>;

/** Translates only explicit shortcuts and an explicitly selected structural fallback. */
export function translateKeyDown(
  snapshot: KeyboardSnapshot,
  policy: KeyboardTranslationPolicy,
  compositionActive: boolean,
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  shortcuts: BrowserCompiledKeyboardShortcuts =
    DEFAULT_COMPILED_KEYBOARD_SHORTCUTS,
): KeyboardTranslation {
  return translateKeyboard(snapshot, policy, compositionActive, delivery, selection, shortcuts, false) as KeyboardTranslation;
}

/** Same shortcut policy with explicit hierarchical list command admission. @internal */
export function translateFlatListKeyDown(snapshot: KeyboardSnapshot, policy: KeyboardTranslationPolicy,
  compositionActive: boolean, delivery: FlatListEditorDeliveryToken, selection: FlatListEditorSelectionSync,
  shortcuts: BrowserCompiledKeyboardShortcuts = DEFAULT_COMPILED_KEYBOARD_SHORTCUTS): KeyboardTranslation<FlatListEditorCommandRequest> {
  return translateKeyboard(snapshot, policy, compositionActive, delivery, selection, shortcuts, true) as KeyboardTranslation<FlatListEditorCommandRequest>;
}

/** Explicit recursive-list translation using nested-only command admission. @internal */
export function translateNestedListKeyDown(snapshot: KeyboardSnapshot, policy: KeyboardTranslationPolicy,
  compositionActive: boolean, delivery: NestedListEditorDeliveryToken, selection: NestedListEditorSelectionSync,
  shortcuts: BrowserCompiledKeyboardShortcuts = DEFAULT_COMPILED_KEYBOARD_SHORTCUTS): KeyboardTranslation<NestedListEditorCommandRequest> {
  return translateKeyboard(snapshot, policy, compositionActive, delivery, selection, shortcuts, "nested") as KeyboardTranslation<NestedListEditorCommandRequest>;
}

function translateKeyboard(snapshot: KeyboardSnapshot, policy: KeyboardTranslationPolicy, compositionActive: boolean,
  delivery: NativeDeliveryToken, selection: NativeSelectionSync, shortcuts: BrowserCompiledKeyboardShortcuts,
  flatLists: boolean | "nested"): KeyboardTranslation<NativeCommandRequest> {
  const safeSnapshot = snapshotKeyboard(snapshot);
  const safePolicy = snapshotPolicy(policy);
  if (
    safeSnapshot === null ||
    safePolicy === null ||
    typeof compositionActive !== "boolean" ||
    !isOwnedBrowserCompiledKeyboardShortcuts(shortcuts)
  ) {
    return Object.freeze({ kind: "invalid" });
  }
  try {
    return translateSafeKeyDown(
      safeSnapshot,
      safePolicy,
      compositionActive,
      delivery,
      selection,
      shortcuts,
      flatLists,
    );
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
}

function translateSafeKeyDown(
  snapshot: KeyboardSnapshot,
  policy: KeyboardTranslationPolicy,
  compositionActive: boolean,
  delivery: NativeDeliveryToken,
  selection: NativeSelectionSync,
  shortcuts: BrowserCompiledKeyboardShortcuts,
  flatLists: boolean | "nested",
): KeyboardTranslation<NativeCommandRequest> {
  if (
    compositionActive ||
    snapshot.isComposing ||
    snapshot.keyCode === 229 ||
    snapshot.key === "Dead" ||
    snapshot.key === "Process"
  ) {
    return Object.freeze({ kind: "composition" });
  }
  if (snapshot.altGraph) {
    return native("selectionOrPageCommand");
  }

  const builder = nativeCommandBuilder(flatLists, delivery, selection);

  const primary = policy.primaryModifier === "meta" ? snapshot.metaKey : snapshot.ctrlKey;
  const secondaryPrimary =
    policy.primaryModifier === "meta" ? snapshot.ctrlKey : snapshot.metaKey;
  if (primary && !secondaryPrimary && !snapshot.altKey) {
    if (keyIs(snapshot, "c") || keyIs(snapshot, "x") || keyIs(snapshot, "v")) {
      return native("clipboardOwns");
    }
    if (keyIs(snapshot, "a")) {
      return native("selectionOrPageCommand");
    }
    const binding = compiledKeyboardShortcutBindingFor(
      shortcuts,
      snapshot.code,
      snapshot.shiftKey,
    );
    if (binding !== undefined) {
      if (policy.shortcuts === "disabled") {
        return blocked("unsupportedEditingShortcut");
      }
      const source = keyboardSource(snapshot, policy.primaryModifier);
      if (binding.target.kind === "history") {
        return command(
          builder.request(source, {kind: "history", operation: binding.target.operation}),
        );
      }
      return snapshot.repeat
        ? blocked("repeatSuppressed")
        : command(
            builder.request(source, {kind: "intent", intentId: binding.target.intentId, input: {kind: "none"}}, "closeBefore"),
          );
    }
    if (isUnsupportedNativeEditingShortcut(snapshot)) {
      return blocked("unsupportedEditingShortcut");
    }
    return native("selectionOrPageCommand");
  }

  if (policy.editing === "beforeinputPrimary") {
    return native("beforeinputOwns");
  }
  if (snapshot.ctrlKey || snapshot.metaKey || snapshot.altKey) {
    return native("selectionOrPageCommand");
  }

  const source = keyboardSource(snapshot, "none");
  if (snapshot.key === "Backspace") {
    return command(
      builder.request(source, {kind: "action", actionId: builder.actionIds().deleteBackward, input: {kind: "none"}}),
    );
  }
  if (snapshot.key === "Delete") {
    return command(
      builder.request(source, {kind: "action", actionId: builder.actionIds().deleteForward, input: {kind: "none"}}),
    );
  }
  if (snapshot.key === "Enter") {
    return snapshot.shiftKey
      ? blocked("unsupportedLineBreak")
      : command(
          builder.request(source, {kind: "action", actionId: builder.actionIds().insertParagraphBreak, input: {kind: "none"}}, "closeBefore"),
        );
  }
  if (isPotentialTextKey(snapshot.key)) {
    return blocked("textRequiresBeforeInput");
  }
  return native("selectionOrPageCommand");
}

function keyboardSource(
  snapshot: KeyboardSnapshot,
  primary: "control" | "meta" | "none",
): Readonly<{ kind: "keyboard"; detail: string }> {
  const modifiers = [
    primary === "control" ? "Ctrl" : primary === "meta" ? "Meta" : "",
    snapshot.shiftKey ? "Shift" : "",
    snapshot.altKey ? "Alt" : "",
  ].filter((value) => value.length > 0);
  return Object.freeze({
    kind: "keyboard",
    detail: [...modifiers, safeKeyIdentity(snapshot)].join("+"),
  });
}

function safeKeyIdentity(snapshot: KeyboardSnapshot): string {
  const candidate = snapshot.code.length > 0 ? snapshot.code : snapshot.key;
  return candidate.length <= 64 && !/[\u0000-\u001f\u007f]/u.test(candidate)
    ? candidate
    : "Unidentified";
}

function keyIs(snapshot: KeyboardSnapshot, lower: string): boolean {
  return keyboardShortcutCodeIdentity(snapshot.code) ===
    `Key${lower.toUpperCase()}`;
}

function isUnsupportedNativeEditingShortcut(
  snapshot: KeyboardSnapshot,
): boolean {
  const letter = conservativeNativeEditingLetter(snapshot);
  return (
    (!snapshot.shiftKey &&
      (letter === "b" ||
        letter === "i" ||
        letter === "u" ||
        letter === "y")) ||
    letter === "z"
  );
}

function conservativeNativeEditingLetter(
  snapshot: KeyboardSnapshot,
): string | undefined {
  const physical = keyboardShortcutCodeIdentity(snapshot.code);
  if (physical !== undefined && /^Key[BIUYZ]$/u.test(physical)) {
    return physical.slice(3).toLowerCase();
  }
  if (snapshot.key.length !== 1 || snapshot.key.charCodeAt(0) > 0x7f) {
    return undefined;
  }
  const logical = snapshot.key.toLowerCase();
  return /^[biuyz]$/u.test(logical) ? logical : undefined;
}

function isPotentialTextKey(key: string): boolean {
  return key.length === 1 || key === "Unidentified";
}

function command(request: NativeCommandRequest): KeyboardTranslation<NativeCommandRequest> {
  return Object.freeze({ kind: "command", request });
}

function blocked(reason: Extract<KeyboardTranslation, { kind: "blocked" }>["reason"]): KeyboardTranslation {
  return Object.freeze({ kind: "blocked", reason });
}

function native(reason: Extract<KeyboardTranslation, { kind: "native" }>["reason"]): KeyboardTranslation {
  return Object.freeze({ kind: "native", reason });
}

function snapshotKeyboard(value: unknown): KeyboardSnapshot | null {
  const snapshot = readDataRecord(value, [
    "key",
    "code",
    "altKey",
    "ctrlKey",
    "metaKey",
    "shiftKey",
    "repeat",
    "isComposing",
    "keyCode",
    "altGraph",
  ]);
  if (
    snapshot === null ||
    typeof snapshot["key"] !== "string" ||
    typeof snapshot["code"] !== "string" ||
    snapshot["key"].length > 128 ||
    snapshot["code"].length > 128 ||
    typeof snapshot["altKey"] !== "boolean" ||
    typeof snapshot["ctrlKey"] !== "boolean" ||
    typeof snapshot["metaKey"] !== "boolean" ||
    typeof snapshot["shiftKey"] !== "boolean" ||
    typeof snapshot["repeat"] !== "boolean" ||
    typeof snapshot["isComposing"] !== "boolean" ||
    !Number.isSafeInteger(snapshot["keyCode"]) ||
    typeof snapshot["altGraph"] !== "boolean"
  ) {
    return null;
  }
  return Object.freeze({
    key: snapshot["key"],
    code: snapshot["code"],
    altKey: snapshot["altKey"],
    ctrlKey: snapshot["ctrlKey"],
    metaKey: snapshot["metaKey"],
    shiftKey: snapshot["shiftKey"],
    repeat: snapshot["repeat"],
    isComposing: snapshot["isComposing"],
    keyCode: snapshot["keyCode"] as number,
    altGraph: snapshot["altGraph"],
  });
}

function snapshotPolicy(value: unknown): KeyboardTranslationPolicy | null {
  const policy = readDataRecord(value, ["editing", "primaryModifier", "shortcuts"]);
  if (
    policy === null ||
    (policy["editing"] !== "beforeinputPrimary" &&
      policy["editing"] !== "structuralFallback") ||
    (policy["primaryModifier"] !== "control" && policy["primaryModifier"] !== "meta") ||
    (policy["shortcuts"] !== "enabled" && policy["shortcuts"] !== "disabled")
  ) {
    return null;
  }
  return Object.freeze({
    editing: policy["editing"],
    primaryModifier: policy["primaryModifier"],
    shortcuts: policy["shortcuts"],
  });
}

function readDataRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key))
    ) {
      return null;
    }
    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}
