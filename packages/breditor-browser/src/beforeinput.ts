import type { NestedListEditorCommandRequest, NestedListEditorDeliveryToken, NestedListEditorSelectionSync } from "./editor_command.js";
import {
  BASE_INTENT_IDS,
  browserCommandTextIsAdmissible,
  type FlatListEditorCommandRequest,
  type FlatListEditorDeliveryToken,
  type FlatListEditorSelectionSync,
  type EditorDeliveryToken,
  type EditorCommandRequest,
  type EditorSelectionSync,
} from "./editor_command.js";
import { nativeCommandBuilder, type NativeCommandRequest, type NativeDeliveryToken, type NativeSelectionSync } from "./native_command_builder.js";

/** Safe scalar snapshot read from one native `beforeinput` event. */
export interface BeforeInputSnapshot {
  readonly inputType: string;
  readonly data: string | null;
  readonly isComposing: boolean;
}

/** Pure classification before cancellation and FIFO submission. */
export type BeforeInputTranslation<R extends NativeCommandRequest = EditorCommandRequest> =
  | Readonly<{ kind: "command"; request: R }>
  | Readonly<{ kind: "clipboardEcho"; operation: "cut" | "paste" }>
  | Readonly<{
      kind: "blocked";
      reason: "unsupportedInputType" | "invalidText";
    }>
  | Readonly<{ kind: "composition" }>
  | Readonly<{ kind: "invalid" }>;

/**
 * Converts browser editing syntax to Breditor's own semantic commands.
 *
 * This function never calls DOM APIs and never infers text from a key event.
 * Unsupported input types remain explicit so the caller can suppress their
 * native DOM mutation without pretending the command was handled.
 */
export function translateBeforeInput(
  snapshot: BeforeInputSnapshot,
  compositionActive: boolean,
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
): BeforeInputTranslation {
  return translateInput(snapshot, compositionActive, delivery, selection, false) as BeforeInputTranslation;
}

/** Explicit list syntax translation; no legacy token or flattened selection. @internal */
export function translateFlatListBeforeInput(snapshot: BeforeInputSnapshot, compositionActive: boolean,
  delivery: FlatListEditorDeliveryToken, selection: FlatListEditorSelectionSync): BeforeInputTranslation<FlatListEditorCommandRequest> {
  return translateInput(snapshot, compositionActive, delivery, selection, true) as BeforeInputTranslation<FlatListEditorCommandRequest>;
}

/** Explicit recursive-list translation using nested-only command admission. @internal */
export function translateNestedListBeforeInput(snapshot: BeforeInputSnapshot, compositionActive: boolean,
  delivery: NestedListEditorDeliveryToken, selection: NestedListEditorSelectionSync): BeforeInputTranslation<NestedListEditorCommandRequest> {
  return translateInput(snapshot, compositionActive, delivery, selection, "nested") as BeforeInputTranslation<NestedListEditorCommandRequest>;
}

function translateInput(snapshot: BeforeInputSnapshot, compositionActive: boolean,
  delivery: NativeDeliveryToken, selection: NativeSelectionSync, flatLists: boolean | "nested"): BeforeInputTranslation<NativeCommandRequest> {
  const safeSnapshot = snapshotBeforeInput(snapshot);
  if (safeSnapshot === null || typeof compositionActive !== "boolean") {
    return Object.freeze({ kind: "invalid" });
  }
  try {
    return translateSafeBeforeInput(safeSnapshot, compositionActive, delivery, selection, flatLists);
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
}

function translateSafeBeforeInput(
  snapshot: BeforeInputSnapshot,
  compositionActive: boolean,
  delivery: NativeDeliveryToken,
  selection: NativeSelectionSync,
  flatLists: boolean | "nested",
): BeforeInputTranslation<NativeCommandRequest> {
  if (compositionActive || snapshot.isComposing || isCompositionInputType(snapshot.inputType)) {
    return Object.freeze({ kind: "composition" });
  }

  const builder = nativeCommandBuilder(flatLists, delivery, selection);
  const action = (actionId: string, history: "preserve" | "closeBefore" = "preserve") =>
    command(builder.request(source(snapshot.inputType), {kind: "action", actionId, input: {kind: "none"}}, history));
  const intent = (intentId: string) => command(builder.request(source(snapshot.inputType),
    {kind: "intent", intentId, input: {kind: "none"}}, "closeBefore"));
  switch (snapshot.inputType) {
    case "insertText":
    case "insertReplacementText":
      return browserCommandTextIsAdmissible(snapshot.data)
        ? command(textRequest(builder, snapshot.inputType, snapshot.data))
        : blocked("invalidText");
    case "insertParagraph":
      return action(builder.actionIds().insertParagraphBreak, "closeBefore");
    case "deleteContentBackward":
      return action(builder.actionIds().deleteBackward);
    case "deleteContentForward":
      return action(builder.actionIds().deleteForward);
    case "deleteContent":
      return action(builder.actionIds().deleteSelection, "closeBefore");
    case "formatBold":
      return intent(BASE_INTENT_IDS.formatStrong);
    case "formatRemove":
      return intent(BASE_INTENT_IDS.clearInlineFormatting);
    case "historyUndo":
      return command(builder.request(source(snapshot.inputType), {kind: "history", operation: "undo"}));
    case "historyRedo":
      return command(builder.request(source(snapshot.inputType), {kind: "history", operation: "redo"}));
    case "deleteByCut":
      return Object.freeze({ kind: "clipboardEcho", operation: "cut" });
    case "insertFromPaste":
    case "insertFromPasteAsQuotation":
      return Object.freeze({ kind: "clipboardEcho", operation: "paste" });
    default:
      return blocked("unsupportedInputType");
  }
}

function isCompositionInputType(inputType: string): boolean {
  return (
    inputType === "insertCompositionText" ||
    inputType === "deleteCompositionText" ||
    inputType === "insertFromComposition" ||
    inputType === "deleteByComposition"
  );
}

function textRequest(
  builder: ReturnType<typeof nativeCommandBuilder>,
  inputType: "insertText" | "insertReplacementText",
  data: string,
) {
  const structural = data.includes("\n") || data.includes("\r");
  return builder.request(
    source(inputType),
    {kind: "action", actionId: structural ? builder.actionIds().insertPlainText : builder.actionIds().insertText,
      input: {kind: "string", value: data}},
    structural ? "closeBefore" : "preserve",
  );
}

function source(detail: string): Readonly<{ kind: "beforeinput"; detail: string }> {
  return Object.freeze({ kind: "beforeinput", detail });
}

function command(request: NativeCommandRequest): BeforeInputTranslation<NativeCommandRequest> {
  return Object.freeze({ kind: "command", request });
}

function blocked(reason: "unsupportedInputType" | "invalidText"): BeforeInputTranslation {
  return Object.freeze({ kind: "blocked", reason });
}

function snapshotBeforeInput(value: unknown): BeforeInputSnapshot | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const keys = ["inputType", "data", "isComposing"] as const;
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== keys.length ||
      ownKeys.some((key) => typeof key !== "string" || !keys.includes(key as typeof keys[number]))
    ) {
      return null;
    }
    const fields: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return null;
      }
      fields[key] = descriptor.value;
    }
    if (
      typeof fields["inputType"] !== "string" ||
      fields["inputType"].length > 256 ||
      (typeof fields["data"] !== "string" && fields["data"] !== null) ||
      typeof fields["isComposing"] !== "boolean"
    ) {
      return null;
    }
    return Object.freeze({
      inputType: fields["inputType"],
      data: fields["data"],
      isComposing: fields["isComposing"],
    });
  } catch {
    return null;
  }
}
