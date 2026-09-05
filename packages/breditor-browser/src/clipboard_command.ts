import {
  BASE_ACTION_IDS,
  noInputActionRequest,
  stringActionRequest,
  type EditorDeliveryToken,
  type EditorSelectionSync,
  type EngineCommandRequest,
} from "./editor_command.js";

/**
 * Creates the exact deletion admitted only after a cut write has succeeded.
 *
 * Clipboard serialization, writing, and cancellation remain browser-controller
 * responsibilities. This request retains no Event or DataTransfer capability.
 */
export function cutDeleteRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
): EngineCommandRequest {
  return noInputActionRequest(
    delivery,
    selection,
    Object.freeze({ kind: "clipboard", detail: "cut" }),
    BASE_ACTION_IDS.deleteSelection,
    "closeBefore",
  );
}

/**
 * Creates the exact insertion admitted from a sanitized plain-text paste.
 *
 * Reading DataTransfer data and reducing HTML to plain text happen before this
 * pure boundary. Empty, oversized, or ill-formed strings are rejected by the
 * shared browser command-text contract.
 */
export function pasteInsertRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  text: string,
): EngineCommandRequest {
  return stringActionRequest(
    delivery,
    selection,
    Object.freeze({ kind: "clipboard", detail: "paste" }),
    BASE_ACTION_IDS.insertPlainText,
    text,
    "closeBefore",
  );
}
