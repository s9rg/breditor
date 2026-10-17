/** One authenticated revision admission. Never substitutes ordinary publication of the child. */
import {SharedRelayError,object} from "../relay/validation.js";
import {keys,same} from "../suggestions/validation.js";
import {suggestionDependencies,suggestionEntry} from "../suggestions/transport.js";
import {revisionsDescriptor,revisionReceipt} from "./transport.js";
import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import type {SharedSuggestionRevisionInfo} from "../suggestion_types.js";
import type {SharedSuggestionRevisionRequest,SharedSuggestionRevisionRow} from "./types.js";
export async function submitRevision(request:(input:SharedSuggestionRevisionRequest)=>Promise<Record<string,unknown>>,identity:SharedSuggestionQueueIdentity,binding:string,row:SharedSuggestionRevisionRow,info:SharedSuggestionRevisionInfo):Promise<Pick<SharedSuggestionRevisionRow,"receipt"|"conflict">|null> {
 const response=await request({kind:"suggestionRevisionPublish",previousSuggestionId:info.previousSuggestionId,revisionPacket:row.packet});keys(response,"admission,kind");if(response["kind"]!=="suggestionRevisionAdmission")throw new SharedRelayError("suggestion_revision_protocol_error");
 const admission=object(response["admission"]);
 if(admission["kind"]==="pending"){keys(admission,"kind,missing");suggestionDependencies(admission["missing"]);return null;}
 if(admission["kind"]==="durable"){
  keys(admission,"descriptor,duplicate,kind,revision");if(typeof admission["duplicate"]!=="boolean")throw new SharedRelayError("suggestion_revision_protocol_error");revisionsDescriptor(admission["descriptor"],binding,identity);const receipt=revisionReceipt(admission["revision"],identity);
  if(!same(receipt.revision,info))throw new SharedRelayError("suggestion_revision_receipt_mismatch");return {receipt,conflict:null};
 }
 keys(admission,"kind,previous,successor");if(admission["kind"]!=="conflict")throw new SharedRelayError("suggestion_revision_protocol_error");
 const previous=suggestionEntry(admission["previous"],identity),successor=admission["successor"]===null?null:revisionReceipt(admission["successor"],identity);
 if(!previous.decision||previous.publication.suggestion.id!==info.previousSuggestionId||successor&&(!same(successor.previousDecision,previous.decision)||successor.revision.id===info.id))throw new SharedRelayError("suggestion_revision_receipt_mismatch");
 return {receipt:null,conflict:{decision:previous.decision,successor}};
}
