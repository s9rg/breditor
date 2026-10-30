/** A queued root may publish first; no unpublished revision child ever enters the base queue. */
import {SharedRelayError,object} from "../relay/validation.js";
import {keys,publication,same} from "../suggestions/validation.js";
import {suggestionDescriptor,suggestionEntry,suggestionDependencies} from "../suggestions/transport.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionTransport} from "../suggestions/transport_port.js";
import type {SuggestionSyncQueue} from "../suggestions/sync_queue.js";
export async function ensureRevisionPrevious<P extends SharedSelectionPolicy>(queue:SuggestionSyncQueue<P>,transport:SharedSuggestionTransport<P>,packet:string,check:()=>void):Promise<boolean> {
 const info=queue.core.readSuggestion(packet),known=queue.proposals().some(row=>row.id===info.id)?queue.status(info.id):null;if(known?.publication)return true;
 if(known?.publish){const response=await transport.requestSuggestion({kind:"suggestionPublish",packet});check();keys(response,"admission,kind");if(response["kind"]!=="suggestionAdmission")throw new SharedRelayError("suggestion_protocol_error");const admission=object(response["admission"]);
  if(admission["kind"]==="pending"){keys(admission,"kind,missing");suggestionDependencies(admission["missing"]);return false;}
  keys(admission,"descriptor,duplicate,kind,publication");if(admission["kind"]!=="durable"||typeof admission["duplicate"]!=="boolean")throw new SharedRelayError("suggestion_protocol_error");suggestionDescriptor(admission["descriptor"],queue.identity());await queue.receiveVerifiedPublication(info.id,publication(admission["publication"]));check();return true;
 }
 const response=await transport.requestSuggestion({kind:"suggestionRead",suggestionId:info.id});check();keys(response,"entry,kind,permissions");if(response["kind"]!=="suggestionEntry")throw new SharedRelayError("suggestion_protocol_error");if(response["entry"]===null)return false;
 const entry=suggestionEntry(response["entry"],queue.identity());if(!same(info,entry.publication.suggestion))throw new SharedRelayError("suggestion_receipt_mismatch");await queue.cacheVerifiedProposal(packet,entry.publication);check();return true;
}
