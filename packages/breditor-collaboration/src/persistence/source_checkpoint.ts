/** Validate the explicitly selected native source family without changing transport or cache formats. */
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import {checkCheckpoint,checkDocumentCheckpoint} from "./session_database.js";
import {checkReviewedCheckpoint} from "./reviewed_checkpoint.js";
import {checkSearchCheckpoint} from "./search_checkpoint.js";
import {usesIndependentHistoryStorage} from '../independent_history/native_port.js';
import {SharedEditorError} from '../core.js';
export function checkSourceCheckpoint<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,room:string,writer:string):void {
 const view=core.view(),history=view.historyGrouping==="typing-v1"?"typing-v1":"explicit",identity=core.reviewedHistoryIdentity?.()??null;
 if(usesIndependentHistoryStorage(core))throw new SharedEditorError('independent_delivery_required','Use a matching independently owned delivery adapter; original document bytes do not select its paired storage family');
 if(core.searchHistoryPolicy?.()==="search-v1"){checkSearchCheckpoint(core.checkpointJson(),room,writer,core.richLanguageVersion(),history,view.rangeEditing??"original",core.selectionPolicy(),identity);return;}
 if(identity){checkReviewedCheckpoint(core.checkpointJson(),room,writer,identity,core.richLanguageVersion(),history,view.rangeEditing??"original",core.selectionPolicy());return;}
 if(core.selectionPolicy()==="document-v1")checkDocumentCheckpoint(core.checkpointJson(),room,writer,core.richLanguageVersion(),history);
 else checkCheckpoint(core.checkpointJson(),room,writer,core.richLanguageVersion(),history,view.rangeEditing??"original");
}
