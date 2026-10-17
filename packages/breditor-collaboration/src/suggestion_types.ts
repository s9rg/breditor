import type {SharedCommand,SharedNode,RichSelection} from "./types.js";
import type {SharedVersionChange,SharedVersionAsset} from "./version_types.js";
import type {SharedDocumentSuggestionPreview} from "./suggestion_preview.js";
/** Descriptive immutable attribution; authentic publication is a separate host decision. */
export interface SharedDocumentSuggestionInfo {id:string;title:string;author:string;createdAtMs:string}
export interface SharedSuggestionDependency {writer:string;counter:string}
export type SharedSuggestionConflictTarget=
 |{kind:"document"}|{kind:"block"|"characters"|"header";block:string}
 |{kind:"children";parent:string|null}|{kind:"property";block:string;property:string}
 |{kind:"column";block:string;column:string};
export interface SharedSuggestionGeneralRange {range:Extract<SharedCommand,{kind:"replace_text_range"}>["data"];empty:readonly string[]}
/** Separate proposal-only command types do not widen the original ordinary-dispatch DTO. */
export type SharedSuggestionCommand=SharedCommand
 |{kind:"insert_general_paragraph_v1";data:{selection:RichSelection;prefix:string}}
 |{kind:"paste_general_flow_at_text_v1";data:{deletion:SharedSuggestionGeneralRange;right:string;nodes:readonly SharedNode[]}}
 |{kind:"replace_document_plain_text_v1";data:{paragraph:string;text:string}}
 |{kind:"paste_document_clipboard_v1";data:{clipboard_json:string;prefix:string}}
 |{kind:"change_document_formats_v1";data:{changes_json:string}}
 |{kind:"change_document_layout_v1";data:{patch_json:string}};
type DocumentOnlyCommand=Extract<SharedSuggestionCommand,{kind:"replace_document_plain_text_v1"|"paste_document_clipboard_v1"|"change_document_formats_v1"|"change_document_layout_v1"}>;
/** Original typed intent; an absent caret is never whole-document scope. Fresh IDs remain host-owned. */
export type SharedDocumentSuggestionDraft=
 |{scope:"commands";edit:{kind:"commands";data:readonly Exclude<SharedSuggestionCommand,DocumentOnlyCommand>[]}|{kind:"general_text";data:SharedSuggestionGeneralRange}}
 |{scope:"document";edit:{kind:"commands";data:readonly SharedSuggestionCommand[]}|{kind:"general_text";data:SharedSuggestionGeneralRange}};
export type SharedDocumentSuggestionSource=
 |{kind:"pending";missing:readonly SharedSuggestionDependency[]}
 |{kind:"verified";info:SharedDocumentSuggestionInfo;clocks:readonly SharedSuggestionDependency[]};
export interface SharedSuggestionPreviewSummary {
 kind:"ready";suggestion:SharedDocumentSuggestionInfo;changes:readonly SharedVersionChange[];
 beforeAssets:readonly SharedVersionAsset[];afterAssets:readonly SharedVersionAsset[];
}
export type SharedSuggestionPreparationSummary=SharedSuggestionPreviewSummary
 |{kind:"pending";missing:readonly SharedSuggestionDependency[]}
 |{kind:"conflict";targets:readonly SharedSuggestionConflictTarget[]};
export type SharedDocumentSuggestionPreparation=
 |{kind:"ready";preview:SharedDocumentSuggestionPreview}
 |Exclude<SharedSuggestionPreparationSummary,{kind:"ready"}>;
/** This is operation identity, not a signed receipt, semantic boundary proof or Undo ownership. */
export interface SharedWriterReceiptV2 {writer:string;from:string;through:string;prefixDigest:string;groupDigest:string}
export type SharedWriterReceiptRetention=
 |{kind:"pending";missing:SharedSuggestionDependency}
 |{kind:"verified";receipt:SharedWriterReceiptV2};
/** Generated native opaque preparation; no public native constructor or mutable accepted state. */
export interface SharedNativeSuggestionPreparation {summary_json():string;document_json():string;free():void}
/** Complete additive pure proposal pair. No browser-side acceptance/effect executor is exposed. */
export interface SharedSuggestionsRustCapability {
 document_suggestions_version?():string;
 capture_document_suggestion?(observed:unknown,input:string):string;
 read_document_suggestion?(input:string):string;
 verify_document_suggestion_source?(input:string):string;
 prepare_document_suggestion?(observed:unknown,input:string):SharedNativeSuggestionPreparation;
 check_document_suggestion_preview?(prepared:SharedNativeSuggestionPreparation,suggestionId:string):void;
 retained_writer_receipt_v2?(input:string):string;
 /** Additive pure namespace planner. Older complete suggestion runtimes keep their V1 meanings. */
 suggestion_general_text_version?():string;
 plan_suggestion_general_text?(observed:unknown,input:string):string;
}
