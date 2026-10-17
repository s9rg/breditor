import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedDocumentSuggestionInfo,SharedWriterReceiptV2} from "../suggestion_types.js";
/** Nonsecret exact queue lineage. Credentials and live grants must remain host-owned and separate. */
export interface SharedSuggestionQueueIdentity {
 endpoint:string;principal:string;room:string;binding:string;documentWriter:string;
 effectWriter:string;writerTransport:"atomic-v2";
}
export interface SharedSuggestionPublication {sequence:string;suggestion:SharedDocumentSuggestionInfo}
export interface SharedSuggestionDecision {
 sequence:string;suggestionId:string;principal:string;acceptingWriter?:string;decision:"accept"|"reject";
 effect:{writerGroup:SharedWriterReceiptV2;semanticFrom:string}|null;
}
/** A locally durable choice is an intent, never a finalized server decision. */
export interface SharedSuggestionDecisionIntent {requested:"accept"|"reject";queuedAtMs:string;retry:boolean}
export interface SharedRetainedSuggestion {
 packet:string;origin:"local"|"remote";publish:boolean;publication:SharedSuggestionPublication|null;
 intent:SharedSuggestionDecisionIntent|null;decision:SharedSuggestionDecision|null;
}
/** Separate closed recovery family; old document/review/cache records are never upgraded implicitly. */
export interface SharedSuggestionQueueRecord {
 format:"breditor/shared-suggestion-queue"|"breditor/shared-owned-suggestion-queue";formatVersion:1;identity:SharedSuggestionQueueIdentity;
 retained:readonly SharedRetainedSuggestion[];
}
export interface SharedSuggestionQueueOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 database:string;identity:SharedSuggestionQueueIdentity;
 /** Explicit new queue family; requires reviewed-aware native source storage and exact account/device. */
 ownedHistory?:"reviewed-v1";
 /** The native journal owner remains authoritative and is saved before this dependent queue. */
 storage:{readonly core:SharedRichEditor<P>;save():void;flush():Promise<void>};
}
export interface SharedSuggestionQueueStatus {
 localSaved:boolean;publish:boolean;intent:SharedSuggestionDecisionIntent|null;
 publication:SharedSuggestionPublication|null;decision:SharedSuggestionDecision|null;
}
