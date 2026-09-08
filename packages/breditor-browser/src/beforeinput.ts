import {
  BASE_ACTION_IDS,
  BASE_INTENT_IDS,
  browserCommandTextIsAdmissible,
  historyRequest,
  noInputActionRequest,
  noInputIntentRequest,
  stringActionRequest,
  type EditorDeliveryToken,
  type EditorCommandRequest,
  type EditorSelectionSync,
} from "./editor_command.js";

/** Safe scalar snapshot read from one native `beforeinput` event. */
export interface BeforeInputSnapshot {
  readonly inputType: string;
  readonly data: string | null;
  readonly isComposing: boolean;
}

/** Pure classification before cancellation and FIFO submission. */
export type BeforeInputTranslation =
  | Readonly<{ kind: "command"; request: EditorCommandRequest }>
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
  const safeSnapshot = snapshotBeforeInput(snapshot);
  if (safeSnapshot === null || typeof compositionActive !== "boolean") {
    return Object.freeze({ kind: "invalid" });
  }
  try {
    return translateSafeBeforeInput(safeSnapshot, compositionActive, delivery, selection);
  } catch {
    return Object.freeze({ kind: "invalid" });
  }
}

function translateSafeBeforeInput(
  snapshot: BeforeInputSnapshot,
  compositionActive: boolean,
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
): BeforeInputTranslation {
  if (compositionActive || snapshot.isComposing || isCompositionInputType(snapshot.inputType)) {
    return Object.freeze({ kind: "composition" });
  }

  switch (snapshot.inputType) {
    case "insertText":
    case "insertReplacementText":
      return browserCommandTextIsAdmissible(snapshot.data)
        ? command(textRequest(delivery, selection, snapshot.inputType, snapshot.data))
        : blocked("invalidText");
    case "insertParagraph":
      return command(
        noInputActionRequest(
          delivery,
          selection,
          source(snapshot.inputType),
          BASE_ACTION_IDS.insertParagraphBreak,
          "closeBefore",
        ),
      );
    case "deleteContentBackward":
      return command(
        noInputActionRequest(
          delivery,
          selection,
          source(snapshot.inputType),
          BASE_ACTION_IDS.deleteBackward,
        ),
      );
    case "deleteContentForward":
      return command(
        noInputActionRequest(
          delivery,
          selection,
          source(snapshot.inputType),
          BASE_ACTION_IDS.deleteForward,
        ),
      );
    case "deleteContent":
      return command(
        noInputActionRequest(
          delivery,
          selection,
          source(snapshot.inputType),
          BASE_ACTION_IDS.deleteSelection,
          "closeBefore",
        ),
      );
    case "formatBold":
      return command(
        noInputIntentRequest(
          delivery,
          selection,
          source(snapshot.inputType),
          BASE_INTENT_IDS.formatStrong,
          "closeBefore",
        ),
      );
    case "historyUndo":
      return command(
        historyRequest(delivery, selection, source(snapshot.inputType), "undo"),
      );
    case "historyRedo":
      return command(
        historyRequest(delivery, selection, source(snapshot.inputType), "redo"),
      );
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
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  inputType: "insertText" | "insertReplacementText",
  data: string,
) {
  const structural = data.includes("\n") || data.includes("\r");
  return stringActionRequest(
    delivery,
    selection,
    source(inputType),
    structural ? BASE_ACTION_IDS.insertPlainText : BASE_ACTION_IDS.insertText,
    data,
    structural ? "closeBefore" : "preserve",
  );
}

function source(detail: string): Readonly<{ kind: "beforeinput"; detail: string }> {
  return Object.freeze({ kind: "beforeinput", detail });
}

function command(request: EditorCommandRequest): BeforeInputTranslation {
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
