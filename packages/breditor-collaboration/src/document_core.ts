/** Runtime proof for explicit shared document browser integration; no old-core fallback. */
import type {SharedRichEditor} from "./core.js";
import type {SharedSelectionPolicy} from "./types.js";
export function requireSharedDocumentBrowserCore<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>):SharedRichEditor<"document-v1"> {
 if(core.selectionPolicy()!=="document-v1"||!core.supportsDocumentSelection()||!core.supportsDocumentClipboard()||!core.supportsDocumentNavigation()||!core.supportsDocumentTools()||!core.supportsGeneralRanges()||!core.supportsGeneralCopy()||!core.supportsGeneralInlinePaste()||!core.supportsGeneralFlowPaste()||!core.supportsGeneralParagraph())throw Error("Use a complete explicitly selected native shared document browser owner");
 // The facade's policy is immutable; the native family proof above is the only generic boundary.
 return core as unknown as SharedRichEditor<"document-v1">;
}
