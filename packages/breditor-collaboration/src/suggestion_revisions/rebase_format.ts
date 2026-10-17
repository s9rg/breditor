/** Pure native original-character rebase against one exact retained same-creator predecessor. */
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionQueue} from "../suggestions/queue.js";
import type {SharedSuggestionFormatRebaseDraft} from "./types.js";
export function captureFormatRevision<P extends SharedSelectionPolicy>(queue:SharedSuggestionQueue<P>,input:SharedSuggestionFormatRebaseDraft){
 const core=queue.core,previousPacket=queue.packet(input.previousSuggestionId),previous=core.readSuggestion(previousPacket);
 if(previous.author!==queue.identity().principal||queue.status(previous.id).decision)throw new SharedRelayError("suggestion_revision_predecessor_final_or_foreign");
 return {previousPacket,result:core.rebaseSuggestionFormat(previousPacket,input.title,input.createdAtMs,input.revision)};
}
