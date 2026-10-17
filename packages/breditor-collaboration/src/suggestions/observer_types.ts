import type {SharedRichEditor} from "../core.js";
import type {SharedProfileDescriptor} from "../profile.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRelayAuthentication,SharedRelayState} from "../relay/types.js";
import type {SharedSuggestionPermissions} from "../relay/suggestion_types.js";
import type {SharedSuggestionQueueIdentity} from "./types.js";
/** Separate host-protected observer credential. No document-author credential is present. */
export interface SharedSuggestionObserverIdentity extends SharedSuggestionQueueIdentity {readonly observerCredential:string}
export interface SharedSuggestionObserverRegistrationOptions extends SharedRelayAuthentication {
 writerTransport:"atomic-v2";
 saveIdentity:(identity:SharedSuggestionObserverIdentity)=>void|Promise<void>;
}
export interface SharedSuggestionObserverRegistration {
 readonly identity:SharedSuggestionObserverIdentity;readonly frame:string;
 readonly descriptor:SharedProfileDescriptor;readonly permissions:SharedSuggestionPermissions;
}
export interface SharedSuggestionObserverOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 identity:SharedSuggestionObserverIdentity;
 /** Existing durable source; neither source/core nor its local lease is owned by networking. */
 storage:{readonly core:SharedRichEditor<P>;save():void;flush():Promise<void>};
 getToken:(signal:AbortSignal)=>string|Promise<string>;
 autoConnect?:boolean;requestTimeoutMs?:number;reconnectMinimumMs?:number;reconnectMaximumMs?:number;
 onState?:(state:SharedRelayState)=>void;onError?:(error:Error&{readonly code:string})=>void;
}
