/** Original dependent queues copied from a genuine replay, followed by final native continuity. */
import {SharedParticipantReplay} from "./read.js";
import {SharedParticipantReplayError} from "./errors.js";
import {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {SharedRelayError} from "../relay/validation.js";
import {checkQueueRecord} from "../suggestions/database.js";
import {checkRevisionRecord} from "../suggestion_revisions/database.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueRecord} from "../suggestions/types.js";
import type {SharedSuggestionRevisionsRecord} from "../suggestion_revisions/types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
export function replayRevisionRecords<P extends SharedSelectionPolicy>(replay:SharedParticipantReplay,current:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,binding:string,history?:"reviewed-v1"):{queue:SharedSuggestionQueueRecord;record:SharedSuggestionRevisionsRecord}{
 try{const source=SharedParticipantReplay.prototype.references.call(replay),rows=SharedAssetReferenceCapture.prototype.records.call(source),q=rows.find(r=>r.kind==="suggestions")?.json,r=rows.find(r=>r.kind==="suggestion-revisions")?.json;
  if(q===undefined||r===undefined)throw new SharedRelayError("suggestion_recovery_source");const queue=checkQueueRecord(JSON.parse(q),identity,history),record=checkRevisionRecord(JSON.parse(r),identity,binding);SharedParticipantReplay.prototype.verifyCurrent.call(replay,current);return{queue,record};
 }catch(error){if(error instanceof SharedParticipantReplayError||error instanceof SharedRelayError)throw error;throw new SharedRelayError("suggestion_recovery_source");}
}
