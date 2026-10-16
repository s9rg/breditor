/** Exact opt-in browser capability proof; never adapt an extended view into an original owner. */
import type {RichCoreEditor,RichDocumentCoreEditor,RichSelectionPolicy} from "./core.js";
export function requireDocumentBrowserCore(core:RichCoreEditor<RichSelectionPolicy>):RichDocumentCoreEditor {
 const extended=core as Partial<RichDocumentCoreEditor>;
 if(core.selectionPolicy?.()!=="document-v1"||extended.supportsDocumentSelection?.()!==true||extended.supportsDocumentClipboard?.()!==true||extended.supportsDocumentNavigation?.()!==true||core.supportsGeneralRanges?.()!==true||core.supportsGeneralCopy?.()!==true||core.supportsGeneralInlinePaste?.()!==true||core.supportsGeneralFlowPaste?.()!==true||core.supportsGeneralParagraph?.()!==true||[extended.selectDocument,extended.copyDocument,extended.pasteDocumentClipboard,extended.replaceDocumentPlainText,extended.replaceDocumentTypingText,extended.collapseDocumentSelection].some(method=>typeof method!=="function"))throw Error("Use a complete explicitly selected native document browser owner");
 return core as RichDocumentCoreEditor;
}
