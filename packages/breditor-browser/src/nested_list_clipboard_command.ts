import { nestedListCommandRequest, nestedListBrowserInputActionIds,
  type NestedListEditorCommandRequest, type NestedListEditorDeliveryToken,
  type NestedListEditorSelectionSync } from "./editor_command.js";
import { MAX_PLAIN_TEXT_PARAGRAPHS, normalizedParagraphCount } from "./plain_text_paragraph_count.js";

/** Exact nested-list-aware deletion, admitted only after clipboard writes and cancellation. @internal */
export function nestedListCutDeleteRequest(delivery: NestedListEditorDeliveryToken,
  selection: NestedListEditorSelectionSync): NestedListEditorCommandRequest {
  return nestedListCommandRequest(delivery, selection, {kind: "clipboard", detail: "cut"},
    {kind: "action", actionId: nestedListBrowserInputActionIds(delivery).deleteSelection, input: {kind: "none"}}, "closeBefore");
}

/**
 * Inserts bounded plain text into the actual list hierarchy, in one undo group.
 * Rust determines list splitting/joining. No structural HTML is accepted here.
 * Source paragraph limits remain identical to the existing clipboard contract.
 * @internal
 */
export function nestedListPasteInsertRequest(delivery: NestedListEditorDeliveryToken,
  selection: NestedListEditorSelectionSync, text: string): NestedListEditorCommandRequest {
  const request = nestedListCommandRequest(delivery, selection, {kind: "clipboard", detail: "paste"},
    {kind: "action", actionId: nestedListBrowserInputActionIds(delivery).insertPlainText,
      input: {kind: "string", value: text}}, "closeBefore");
  // Canonical admission has checked type/size/Unicode before this bounded scan.
  if (normalizedParagraphCount(text) > MAX_PLAIN_TEXT_PARAGRAPHS) {
    throw new RangeError("clipboard paste exceeds the source paragraph limit");
  }
  return request;
}
