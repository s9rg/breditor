import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRelayState} from "../relay/types.js";
import type {SharedSuggestionRelayRequest,SharedSuggestionRelayState} from "../relay/suggestion_types.js";
import type {SharedSuggestionQueueIdentity} from "./types.js";
import type {SharedSuggestionRevisionRequest} from "../suggestion_revisions/types.js";
/** Borrowed connection contract. A metadata observer must never acquire an author lease merely
 * to satisfy flush; it saves its source and confirms its permanent zero authored prefix instead. */
export interface SharedSuggestionTransport<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly suggestionDecisionMode?:"observer";
 checkSuggestionQueue(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity):void;
 state():SharedRelayState;suggestionState():SharedSuggestionRelayState;
 subscribe(listener:()=>void):()=>void;
 connect():Promise<void>;flush():Promise<void>;refreshDocument():Promise<void>;
 requestSuggestion(request:SharedSuggestionRelayRequest):Promise<Record<string,unknown>>;
 /** Absent on older/custom transports. No independent child-publication fallback is allowed. */
 checkSuggestionRevisions?(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,binding:string):void;
 suggestionRevisionsReady?():boolean;
 requestSuggestionRevision?(request:SharedSuggestionRevisionRequest):Promise<Record<string,unknown>>;
}
