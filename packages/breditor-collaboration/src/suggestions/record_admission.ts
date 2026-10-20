/** Pure original queue admission, shared by live persistence and private archive replay. */
import {SharedRelayError} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {sameReviewedHistory} from "../reviewed_history_validation.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedOwnedSuggestionAcceptance} from "../reviewed_history_types.js";
import type {SharedDocumentSuggestionInfo} from "../suggestion_types.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueRecord,SharedRetainedSuggestion,SharedSuggestionDecision} from "./types.js";
import {same} from "./validation.js";

export function checkSuggestionSourcePolicy<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,history?:"reviewed-v1"):void{
 if(!core.supportsDocumentSuggestions())throw new SharedRelayError("suggestions_unavailable");
 const owned=core.reviewedHistoryIdentity?.()??null;
 if(history==="reviewed-v1"?(!core.supportsReviewedHistory()||!owned||!sameReviewedHistory(owned,{binding:identity.binding,principal:identity.principal,effectWriter:identity.effectWriter})):owned!==null)throw new SharedRelayError("suggestion_history_source");
}
export function checkSuggestionRecordSource<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,history?:"reviewed-v1"):void{checkSuggestionSourcePolicy(core,identity,history);checkSourceCheckpoint(core,identity.room,identity.documentWriter);}
export function ownedSuggestionAcceptance(identity:SharedSuggestionQueueIdentity,history:"reviewed-v1"|undefined,received:SharedSuggestionDecision|null):SharedOwnedSuggestionAcceptance|null{
 if(history!=="reviewed-v1"||received?.decision!=="accept"||!received.effect||received.principal!==identity.principal||received.acceptingWriter!==identity.documentWriter)return null;
 return {binding:identity.binding,sequence:received.sequence,principal:received.principal,acceptingWriter:received.acceptingWriter,effect:{suggestionId:received.suggestionId,writerGroup:received.effect.writerGroup,semanticFrom:received.effect.semanticFrom}};
}
export function admitSuggestionRecord<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,record:SharedSuggestionQueueRecord,history?:"reviewed-v1"):Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>{
 const result=new Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>();
 for(const row of record.retained){const info=core.readSuggestion(row.packet);if(result.has(info.id))throw new SharedRelayError("suggestion_queue_duplicate");const source=core.verifySuggestionSource(row.packet);
  if(row.origin==="local"&&(info.author!==record.identity.principal||source.kind!=="verified"))throw new SharedRelayError("suggestion_local_source_missing");
  if(row.publication&&!same(row.publication.suggestion,info)||row.decision&&row.decision.suggestionId!==info.id)throw new SharedRelayError("suggestion_receipt_mismatch");
  if(row.decision?.effect&&core.retainedWriterReceiptV2(row.decision.effect.writerGroup).kind!=="verified")throw new SharedRelayError("suggestion_effect_not_retained");
  const owned=ownedSuggestionAcceptance(record.identity,history,row.decision);
  if(owned&&!same(core.adoptedSuggestion(info.id),owned))throw new SharedRelayError("suggestion_owned_history_missing");
  result.set(info.id,{info,row});
 }return result;
}
