/** Copy an exact original queue only after genuine private replay and current native continuity. */
import {SharedParticipantReplay} from "./read.js";
import {SharedParticipantReplayError} from "./errors.js";
import {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {SharedRelayError} from "../relay/validation.js";
import {checkQueueRecord} from "../suggestions/database.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueRecord} from "../suggestions/types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
export function replaySuggestionRecord<P extends SharedSelectionPolicy>(replay:SharedParticipantReplay,current:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,history?:"reviewed-v1"):SharedSuggestionQueueRecord{
 try{const source=SharedParticipantReplay.prototype.references.call(replay),rows=SharedAssetReferenceCapture.prototype.records.call(source),text=rows.find(r=>r.kind==="suggestions")?.json;
  if(text===undefined)throw new SharedRelayError("suggestion_recovery_source");const record=checkQueueRecord(JSON.parse(text),identity,history);SharedParticipantReplay.prototype.verifyCurrent.call(replay,current);return record;
 }catch(error){if(error instanceof SharedParticipantReplayError||error instanceof SharedRelayError)throw error;throw new SharedRelayError("suggestion_recovery_source");}
}
