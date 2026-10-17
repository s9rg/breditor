/** Validate the explicitly selected native source family without changing transport or cache formats. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {checkCheckpoint,checkDocumentCheckpoint} from "./session_database.js";
import {checkReviewedCheckpoint} from "./reviewed_checkpoint.js";
export function checkSourceCheckpoint<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,room:string,writer:string):void {
 const view=core.view(),history=view.historyGrouping==="typing-v1"?"typing-v1":"explicit",identity=core.reviewedHistoryIdentity?.()??null;
 if(identity){checkReviewedCheckpoint(core.checkpointJson(),room,writer,identity,core.richLanguageVersion(),history,view.rangeEditing??"original",core.selectionPolicy());return;}
 if(core.selectionPolicy()==="document-v1")checkDocumentCheckpoint(core.checkpointJson(),room,writer,core.richLanguageVersion(),history);
 else checkCheckpoint(core.checkpointJson(),room,writer,core.richLanguageVersion(),history,view.rangeEditing??"original");
}
