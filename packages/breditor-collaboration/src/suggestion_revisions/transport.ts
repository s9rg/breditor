/** Closed transport metadata, not native source proof or current authentication. */
import {SharedRelayError,object,string,digest} from "../relay/validation.js";
import {keys,utf8,suggestionInfo,publication,decision,same} from "../suggestions/validation.js";
import {suggestionCursor} from "../suggestions/transport.js";
import type {SharedSuggestionRevisionInfo} from "../suggestion_types.js";
import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import type {SharedSuggestionRevisionsBinding,SharedSuggestionRevisionRequest,SharedSuggestionRevisionReceipt} from "./types.js";
export function revisionsBinding(input:SharedSuggestionRevisionsBinding):SharedSuggestionRevisionsBinding {
 const value=object(input);keys(value,"binding");const binding=string(value["binding"],64);
 if(!/^[a-f0-9]{64}$/.test(binding))throw new SharedRelayError("suggestion_revision_lane_mismatch");return Object.freeze({binding});
}
export function revisionsDescriptor(input:unknown,binding:string,identity:{room:string;binding:string}):void {
 const value=object(input);keys(value,"binding,document,format,formatVersion,suggestionBinding");
 if(value["format"]!=="breditor/relay-suggestion-revisions"||value["formatVersion"]!==1||value["document"]!==identity.room||value["binding"]!==binding||value["suggestionBinding"]!==identity.binding)throw new SharedRelayError("suggestion_revision_lane_mismatch");
}
export function revisionPacket(input:unknown):string{const packet=string(input,2101248);if(utf8(packet)>2101248)throw new SharedRelayError("suggestion_revision_packet_budget");return packet;}
export function revisionInfo(input:unknown):SharedSuggestionRevisionInfo {
 const value=object(input);keys(value,"id,previousSuggestionId,suggestion");const id=digest(value["id"]),previousSuggestionId=digest(value["previousSuggestionId"]),suggestion=suggestionInfo(value["suggestion"]);
 if(previousSuggestionId===suggestion.id||id===previousSuggestionId||id===suggestion.id)throw new SharedRelayError("suggestion_revision_identity");return {id,previousSuggestionId,suggestion};
}
export function revisionReceipt(input:unknown,identity:SharedSuggestionQueueIdentity):SharedSuggestionRevisionReceipt {
 const value=object(input);keys(value,"previousDecision,publication,revision,rootSuggestionId");
 const rootSuggestionId=digest(value["rootSuggestionId"]),revision=revisionInfo(value["revision"]),previousDecision=decision(value["previousDecision"],identity),published=publication(value["publication"]);
 if(previousDecision.decision!=="reject"||previousDecision.suggestionId!==revision.previousSuggestionId||previousDecision.principal!==revision.suggestion.author||!same(published.suggestion,revision.suggestion)||BigInt(published.sequence)!==BigInt(previousDecision.sequence)+1n||rootSuggestionId===revision.suggestion.id)throw new SharedRelayError("suggestion_revision_receipt_mismatch");
 return {rootSuggestionId,revision,previousDecision,publication:published};
}
/** Caller authority/bindings are never forwarded. Every payload is reconstructed and bounded. */
export function revisionRequest(input:SharedSuggestionRevisionRequest,binding:string):Record<string,unknown> {
 switch(input.kind){
  case "suggestionRevisionPublish":return {kind:input.kind,revision:{binding,previousSuggestionId:digest(input.previousSuggestionId),revisionPacket:revisionPacket(input.revisionPacket)}};
  case "suggestionRevisionSync":return {kind:input.kind,binding,cursor:input.cursor===null?null:suggestionCursor(input.cursor,binding)};
  case "suggestionRevisionRead":case "suggestionRevisionPacket":return {kind:input.kind,binding,revisionId:digest(input.revisionId)};
  case "suggestionRevisionSuccessor":return {kind:input.kind,binding,suggestionId:digest(input.suggestionId)};
  default:throw new SharedRelayError("invalid_request");
 }
}
