import {
  nativeContainsNode,
  nativeDocumentSelection,
  nativeHtmlHostFacts,
  nativeRangeFacts,
  nativeSelectionFacts,
  nativeSelectionGetRangeAt,
  nativeSelectionRemoveAllRanges,
} from "./html_host.js";

/**
 * Best-effort teardown of a wholly owned native selection before its subtree
 * becomes inert or is removed. Both directional and Range endpoints must be
 * inside; foreign and cross-host selections are never cleared. This changes no
 * semantic selection or history. WebKit can otherwise retain incoherent native
 * endpoints after a focused toolbar form is removed, blocking recovery startup.
 */
export function clearOwnedNativeSelection(root: HTMLElement): void {
  try {
    const document = nativeHtmlHostFacts(root)?.ownerDocument;
    if (document === undefined) return;
    const selection = nativeDocumentSelection(document);
    if (selection === null) return;
    const facts = nativeSelectionFacts(selection);
    if (facts.rangeCount !== 1 || facts.anchorNode === null || facts.focusNode === null) return;
    const range = nativeRangeFacts(nativeSelectionGetRangeAt(selection, 0));
    if ([facts.anchorNode, facts.focusNode, range.startContainer, range.endContainer]
      .every((node) => nativeContainsNode(root, node))) {
      nativeSelectionRemoveAllRanges(selection);
    }
  } catch {
    // Native cleanup failure must not prevent independent disposal/fault guards.
  }
}
