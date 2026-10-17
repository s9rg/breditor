import type {SharedDocumentSuggestionInfo,SharedSuggestionDependency,SharedWriterReceiptV2} from "./suggestion_types.js";
import type {SharedDocumentSuggestionEffectProof} from "./suggestion_effect_proof.js";
/** Pinned nonsecret lane/account binding. It is not a live permission or authentication token. */
export interface SharedReviewedHistoryIdentity {binding:string;principal:string;effectWriter:string}
export interface SharedDocumentSuggestionEffect {suggestionId:string;writerGroup:SharedWriterReceiptV2;semanticFrom:string}
/** ORIGINAL host-authenticated final decision. The deciding account is not the proposal author. */
export interface SharedOwnedSuggestionAcceptance {binding:string;sequence:string;principal:string;acceptingWriter:string;effect:SharedDocumentSuggestionEffect}
export type SharedSuggestionEffectSummary={kind:"pending";missing:readonly SharedSuggestionDependency[]}|{kind:"verified";suggestion:SharedDocumentSuggestionInfo;effect:SharedDocumentSuggestionEffect};
export type SharedSuggestionEffectVerification=Extract<SharedSuggestionEffectSummary,{kind:"pending"}>|{kind:"verified";proof:SharedDocumentSuggestionEffectProof};
/** Opaque generated native object, with no public native constructor. */
export interface SharedNativeSuggestionEffectProof {summary_json():string;free():void}
export interface SharedReviewedHistoryRustCapability {
 reviewed_history_version?():string;reviewed_history_enabled?():boolean;
 reviewed_history_identity_json?():string;adopted_suggestion_json?(id:string):string;
 enable_reviewed_history?(observed:unknown,identity:string):boolean;reviewed_checkpoint?():string;
 verify_document_suggestion_effect?(observed:unknown,packet:string,effect:string):SharedNativeSuggestionEffectProof;
 check_document_suggestion_effect_proof?(proof:SharedNativeSuggestionEffectProof):void;
 adopt_suggestion_history?(proof:SharedNativeSuggestionEffectProof,packet:string,acceptance:string):boolean;
}
