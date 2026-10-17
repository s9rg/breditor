/** Pure same-creator capture against a retained predecessor and the current accepted source. */
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionQueue} from "../suggestions/queue.js";
import type {SharedSuggestionRevisionDraft} from "./types.js";
export function captureRevision<P extends SharedSelectionPolicy>(queue:SharedSuggestionQueue<P>,input:SharedSuggestionRevisionDraft):{previousPacket:string;packet:string} {
 const core=queue.core,previousPacket=queue.packet(input.previousSuggestionId),previous=core.readSuggestion(previousPacket);
 if(previous.author!==queue.identity().principal||queue.status(previous.id).decision)throw new SharedRelayError("suggestion_revision_predecessor_final_or_foreign");
 return {previousPacket,packet:core.captureSuggestionRevision(previousPacket,input.title,input.createdAtMs,input.draft,input.revision)};
}
