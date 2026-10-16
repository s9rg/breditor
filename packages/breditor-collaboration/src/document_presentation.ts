/** Explicit read-only shared-to-rendering projection. Document scope never enters an original view. */
import {presentationModel,type RichModel} from "@breditor/experimental-rich-content/rendering";
import type {RichEditorView} from "@breditor/experimental-rich-content";
import type {SharedEditorView,SharedSelectionPolicy} from "./types.js";
export function sharedPresentationModel<P extends SharedSelectionPolicy>(view:SharedEditorView<P>,policy:P):RichModel<P> {
 if(policy!=="original"&&policy!=="document-v1")throw Error("Unknown shared presentation selection policy");
 const document=policy==="document-v1";
 if(view.format!==(document?"breditor/shared-document-view":"breditor/shared-rich-view")||view.formatVersion!==1)throw Error("Use the explicitly selected native shared view family");
 if(document&&(!("selectionEditing" in view)||view.selectionEditing!=="document-v1"))throw Error("Shared document presentation requires its declared native family");
 // Only the transport/presentation format tag changes; all scope, AST, geometry and guards remain
 // the actual native values. Both branches retain their own original or document selection family.
 return presentationModel<P>({...view,format:document?"breditor/rich-document-view":"breditor/rich-view"} as RichEditorView<P>,policy);
}
