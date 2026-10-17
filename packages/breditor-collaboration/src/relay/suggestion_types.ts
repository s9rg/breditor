import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
/** Exact separately enabled host lane. This contains no credential or live permission. */
export type SharedSuggestionRelayBinding=Pick<SharedSuggestionQueueIdentity,"binding"|"effectWriter">;
export interface SharedSuggestionPermissions {
 readonly role:"propose"|"review"|null;
 readonly canPropose:boolean;readonly canAccept:boolean;readonly canReject:boolean;
}
export interface SharedSuggestionRelayState {
 readonly ready:boolean;readonly revision:number;readonly documentRevision:number;readonly permissions:SharedSuggestionPermissions|null;
}
/** A bounded extension on the EXISTING authenticated document socket; never another resume. */
export type SharedSuggestionRelayRequest=
 |{kind:"suggestionPublish";packet:string}
 |{kind:"suggestionDecide";suggestionId:string;decision:"accept"|"reject"}
 |{kind:"suggestionRead"|"suggestionPacket";suggestionId:string}
 |{kind:"suggestionSync";cursor:SharedSuggestionsCursor|null};
export interface SharedSuggestionsCursor {binding:string;after:string;through:string}
