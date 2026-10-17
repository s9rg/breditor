/** Authenticated publication/decision receipts bridge back to the unchanged proposal queue. */
import {SharedRelayError} from "../relay/validation.js";
import {keys,same} from "../suggestions/validation.js";
import {suggestionEntry} from "../suggestions/transport.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionTransport} from "../suggestions/transport_port.js";
import type {SharedSuggestionQueue} from "../suggestions/queue.js";
import type {SharedSuggestionRevisionReceipt} from "./types.js";
export async function bridgeRevision<P extends SharedSelectionPolicy>(queue:SharedSuggestionQueue<P>,transport:SharedSuggestionTransport<P>,previousPacket:string,packet:string,receipt:SharedSuggestionRevisionReceipt,check:()=>void):Promise<void> {
 const response=await transport.requestSuggestion({kind:"suggestionRead",suggestionId:receipt.revision.previousSuggestionId});check();keys(response,"entry,kind,permissions");if(response["kind"]!=="suggestionEntry"||response["entry"]===null)throw new SharedRelayError("suggestion_revision_server_rollback");
 const previous=suggestionEntry(response["entry"],queue.identity());if(previous.publication.suggestion.id!==receipt.revision.previousSuggestionId||!same(previous.decision,receipt.previousDecision))throw new SharedRelayError("suggestion_revision_receipt_mismatch");
 await queue.cacheVerifiedProposal(previousPacket,previous.publication);check();await queue.receiveVerifiedDecision(receipt.revision.previousSuggestionId,receipt.previousDecision);check();
 const child=queue.core.revisionSuggestionPacket(previousPacket,packet);await queue.cacheVerifiedProposal(child,receipt.publication);check();
}
