import {
  browserInputActionIds,
  noInputActionRequest,
  stringActionRequest,
  type EditorDeliveryToken,
  type EditorSelectionSync,
  type EngineCommandRequest,
} from "./editor_command.js";
import { MAX_PLAIN_TEXT_PARAGRAPHS, normalizedParagraphCount } from "./plain_text_paragraph_count.js";

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
    browserInputActionIds(delivery).deleteSelection,
    "closeBefore",
  );
}

/**
 * Creates the exact insertion admitted from a sanitized plain-text paste.
 *
 * Reading DataTransfer data and reducing HTML to plain text happen before this
 * pure boundary. Empty, oversized, or ill-formed strings are rejected by the
 * shared browser command-text contract. The normalized source-paragraph count
 * must also fit Rust's plain-text input contract before dispatch can occur.
 */
export function pasteInsertRequest(
  delivery: EditorDeliveryToken,
  selection: EditorSelectionSync,
  text: string,
): EngineCommandRequest {
  const request = stringActionRequest(
    delivery,
    selection,
    Object.freeze({ kind: "clipboard", detail: "paste" }),
    browserInputActionIds(delivery).insertPlainText,
    text,
    "closeBefore",
  );
  // The generic factory has already rejected foreign, malformed and oversized
  // values, so counting cannot invoke coercion hooks or scan unbounded input.
  if (normalizedParagraphCount(text) > MAX_PLAIN_TEXT_PARAGRAPHS) {
    throw new RangeError("clipboard paste exceeds the source paragraph limit");
  }
  return request;
}
