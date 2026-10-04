import { flatListCommandRequest, flatListBrowserInputActionIds,
  type FlatListEditorCommandRequest, type FlatListEditorDeliveryToken,
  type FlatListEditorSelectionSync } from "./editor_command.js";
import { MAX_PLAIN_TEXT_PARAGRAPHS, normalizedParagraphCount } from "./plain_text_paragraph_count.js";

/** Exact list-aware deletion, admitted only after clipboard writes and cancellation. @internal */
export function flatListCutDeleteRequest(delivery: FlatListEditorDeliveryToken,
  selection: FlatListEditorSelectionSync): FlatListEditorCommandRequest {
  return flatListCommandRequest(delivery, selection, {kind: "clipboard", detail: "cut"},
    {kind: "action", actionId: flatListBrowserInputActionIds(delivery).deleteSelection, input: {kind: "none"}}, "closeBefore");
}

/**
 * Inserts bounded plain text into the actual list hierarchy, in one undo group.
 * Rust determines list splitting/joining. No structural HTML is accepted here.
 * Source paragraph limits remain identical to the existing clipboard contract.
 * @internal
 */
export function flatListPasteInsertRequest(delivery: FlatListEditorDeliveryToken,
  selection: FlatListEditorSelectionSync, text: string): FlatListEditorCommandRequest {
  const request = flatListCommandRequest(delivery, selection, {kind: "clipboard", detail: "paste"},
    {kind: "action", actionId: flatListBrowserInputActionIds(delivery).insertPlainText,
      input: {kind: "string", value: text}}, "closeBefore");
  // Canonical admission has checked type/size/Unicode before this bounded scan.
  if (normalizedParagraphCount(text) > MAX_PLAIN_TEXT_PARAGRAPHS) {
    throw new RangeError("clipboard paste exceeds the source paragraph limit");
  }
  return request;
}
