import type {SharedSuggestionRevisionInfo,SharedDocumentSuggestionDraft} from "../suggestion_types.js";
import type {SharedSuggestionDecision,SharedSuggestionPublication,SharedSuggestionQueueOptions} from "../suggestions/types.js";
import type {SharedSuggestionsCursor} from "../relay/suggestion_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionQueue} from "../suggestions/queue.js";
import type {SharedSuggestionTransport} from "../suggestions/transport_port.js";
/** Explicit separately enabled lane; not a current grant, document lease or credential. */
export interface SharedSuggestionRevisionsBinding {binding:string}
export interface SharedSuggestionRevisionReceipt {
 rootSuggestionId:string;revision:SharedSuggestionRevisionInfo;
 previousDecision:SharedSuggestionDecision;publication:SharedSuggestionPublication;
}
/** A bounded request on the borrowed suggestion connection. Binding comes from its options. */
export type SharedSuggestionRevisionRequest=
 |{kind:"suggestionRevisionPublish";previousSuggestionId:string;revisionPacket:string}
 |{kind:"suggestionRevisionSync";cursor:SharedSuggestionsCursor|null}
 |{kind:"suggestionRevisionRead"|"suggestionRevisionPacket";revisionId:string}
 |{kind:"suggestionRevisionSuccessor";suggestionId:string};
/** Separate outbox family retains exact bytes even when another decision wins. */
export interface SharedSuggestionRevisionRow {
 previousPacket:string;packet:string;retry:boolean;
 receipt:SharedSuggestionRevisionReceipt|null;
 conflict:{decision:SharedSuggestionDecision;successor:SharedSuggestionRevisionReceipt|null}|null;
}
export interface SharedSuggestionRevisionsRecord {
 format:"breditor/shared-suggestion-revisions";formatVersion:1;
 identity:ReturnType<SharedSuggestionQueue["identity"]>;binding:string;
 retained:readonly SharedSuggestionRevisionRow[];
}
export interface SharedSuggestionRevisionsOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 database:string;binding:string;queue:SharedSuggestionQueue<P>;transport:SharedSuggestionTransport<P>;
 storage:SharedSuggestionQueueOptions<P>["storage"];autoStart?:boolean;
 onError?:(error:Error&{readonly code:string})=>void;
}
export interface SharedSuggestionRevisionDraft {previousSuggestionId:string;title:string;createdAtMs:string;draft:SharedDocumentSuggestionDraft;revision?:string}
