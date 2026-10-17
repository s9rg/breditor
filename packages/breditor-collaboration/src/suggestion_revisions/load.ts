/** Lazy exact envelope download. Native code alone admits the predecessor/child relation and source. */
import {SharedRelayError} from "../relay/validation.js";
import {keys,packetText,same} from "../suggestions/validation.js";
import {revisionPacket} from "./transport.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionTransport} from "../suggestions/transport_port.js";
import type {SharedSuggestionRevisionReceipt} from "./types.js";
export async function loadRevision<P extends SharedSelectionPolicy>(core:SharedRichEditor<P>,transport:SharedSuggestionTransport<P>,receipt:SharedSuggestionRevisionReceipt,check:()=>void){
 const response=await transport.requestSuggestionRevision!({kind:"suggestionRevisionPacket",revisionId:receipt.revision.id});check();keys(response,"kind,packet");if(response["kind"]!=="suggestionRevisionPacket"||response["packet"]===null)throw new SharedRelayError("suggestion_revision_server_rollback");const packet=revisionPacket(response["packet"]);
 const parent=await transport.requestSuggestion({kind:"suggestionPacket",suggestionId:receipt.revision.previousSuggestionId});check();keys(parent,"kind,packet");if(parent["kind"]!=="suggestionPacket"||parent["packet"]===null)throw new SharedRelayError("suggestion_revision_server_rollback");const previousPacket=packetText(parent["packet"]),info=core.readSuggestionRevision(previousPacket,packet);
 if(!same(info,receipt.revision))throw new SharedRelayError("suggestion_revision_receipt_mismatch");const source=core.verifySuggestionRevision(previousPacket,packet),childPacket=core.revisionSuggestionPacket(previousPacket,packet);return {revision:info,packet,previousPacket,childPacket,source};
}
