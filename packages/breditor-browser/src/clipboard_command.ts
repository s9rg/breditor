import {
  stagedClipboardRequest,
  type EditorDeliveryToken,
  type EditorCommandRequest,
  type EditorSelectionSync,
} from "./editor_command.js";

/** Clipboard event operations owned as staged requests in v0.0.53. */
export type ClipboardOperation = "copy" | "cut" | "paste";

/**
 * Translates an actual clipboard event, never its keyboard chord.
 *
 * The result contains no `DataTransfer`, DOM Event, serialized content, paste
 * action, or cut deletion. Those capabilities remain staged for the clipboard
 * integration checkpoint.
 */
export function translateClipboardCommand(
  operation: ClipboardOperation,
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
): EditorCommandRequest {
  return stagedClipboardRequest(
    delivery,
    selection,
    Object.freeze({ kind: "clipboard", detail: operation }),
    operation,
  );
}
