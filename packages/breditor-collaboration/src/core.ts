import type {SharedRustOwner,SharedView,SharedDispatch,SharedPublication,SharedEditorOptions,SharedRemoteOptions,SharedOwnerDescriptor,SharedPresenceResolution,SharedWriterClock,SharedWriterGroups,RichSelection,FormatLiteral,ClipboardContent,PasteTarget,Navigation,NavigationResult} from "./types.js";
import type {RichInlineFormatStateRead} from "./types.js";
import type {SharedWriterGroupsV2} from "./types.js";
import type {RichClipboardTextProjection} from "./types.js";
import type {SharedSelectionPolicy,SharedEditorView} from "./types.js";
import type {RichClipboardTransfer} from "@breditor/experimental-rich-content";
import type {SharedReviewAccess,SharedReviewAction,SharedReviewGuard,SharedReviewImportOutcome,SharedReviewOutcome,SharedReviewPolicy,SharedReviewResolution,SharedReviewSnapshot,SharedReviewTarget,SharedReviewView,SharedReviewWriterClock,SharedReviewBatchReceipt,SharedReviewQuote} from "./review_types.js";
import type {SharedDocumentVersionInfo,SharedVersionComparison,SharedDocumentVersionSource} from "./version_types.js";
import {SharedDocumentVersionRestorePlan,nativeVersionPlan} from "./version_plan.js";
import type {SharedDocumentSuggestionDraft,SharedDocumentSuggestionInfo,SharedDocumentSuggestionPreparation,SharedDocumentSuggestionSource,SharedSuggestionPreparationSummary,SharedWriterReceiptV2,SharedWriterReceiptRetention,SharedSuggestionRevisionInfo,SharedSuggestionRevisionSource,SharedSuggestionFormatRebase,SharedSuggestionTextRebase,SharedSuggestionTextRebasePolicy} from "./suggestion_types.js";
import {SharedDocumentSuggestionPreview,nativeSuggestionPreview} from "./suggestion_preview.js";
import {SharedDocumentSuggestionEffectProof,nativeSuggestionEffectProof} from "./suggestion_effect_proof.js";
import {reviewedHistoryIdentity,sameReviewedHistory} from "./reviewed_history_validation.js";
import type {SharedReviewedHistoryIdentity,SharedOwnedSuggestionAcceptance,SharedDocumentSuggestionEffect,SharedSuggestionEffectSummary,SharedSuggestionEffectVerification} from "./reviewed_history_types.js";
import {sharedProtocolLanguage} from "./protocol.js";
import {encodeBlockLayoutPatch} from "@breditor/experimental-rich-content/rendering";
import type {RichSearchQuery,RichSearchReplacement,RichInputRuleOutcome} from "@breditor/experimental-rich-content";
import {SharedSearchResults,nativeSearchResults} from "./search_results.js";
export class SharedEditorError extends Error {
 constructor(readonly code:string,message:string){super(message);this.name="SharedEditorError";}
}
interface Pending {frame:string;bytes:number;resolve:(changed:boolean)=>void;reject:(reason:unknown)=>void;cleanup:()=>void}
const owners=new WeakSet<SharedRustOwner>();
/** Explicit typed entry point. Original constructors and durable sessions do not infer this policy. */
export function createSharedDocumentEditor(raw:SharedRustOwner,options:Omit<SharedEditorOptions<"document-v1">,"selectionEditing">={}):SharedRichEditor<"document-v1">{
 return new SharedRichEditor<"document-v1">(raw,{...options,selectionEditing:"document-v1"});
}
/** Owns the exact Rust observation and bounded remote queue; no replicated JS document exists. */
export class SharedRichEditor<P extends SharedSelectionPolicy="original"> {
 #raw:SharedRustOwner|undefined;#observation:ReturnType<SharedRustOwner["observe"]>|undefined;#view="";#descriptor="";
 #listeners=new Set<(event:SharedPublication<P>)=>void>();#queue:Pending[]=[];#bytes=0;#holds=0;#publishing=false;#draining=false;#retired=false;
 #options:SharedEditorOptions<P>;#maxFrames:number;#maxBytes:number;#fixedHistory:"explicit"|"typing-v1"|undefined;
 readonly #selectionPolicy:SharedSelectionPolicy;
 #fixedRanges:"original"|"general-v1"|undefined;
 #reviewEnabled=false;#reviewRevision=0n;#reviewListeners=new Set<(snapshot:SharedReviewSnapshot)=>void>();
 readonly #reviewOwner=Object.freeze({});
 #versionPlans=new Set<SharedDocumentVersionRestorePlan>();
 #suggestionPreviews=new Set<SharedDocumentSuggestionPreview>();
 #suggestionEffects=new Set<SharedDocumentSuggestionEffectProof>();
 #searches=new Set<SharedSearchResults>();
 readonly #searchHistory:boolean;
 constructor(raw:SharedRustOwner,...args:P extends "document-v1"?[options:SharedEditorOptions<P>&{selectionEditing:"document-v1"}]:[options?:SharedEditorOptions<P>]){
  const options=(args[0]??{}) as SharedEditorOptions<P>;
  if(owners.has(raw))throw new SharedEditorError("owner_reused","A Rust owner can only be transferred once");
  this.#options=options;this.#maxFrames=options.maxPendingFrames??64;this.#maxBytes=options.maxPendingBytes??8*1024*1024;
  this.#raw=raw;this.#selectionPolicy=options.selectionEditing??"original";this.#searchHistory=options.searchHistory==="search-v1";
  try{
   if(this.#selectionPolicy!=="original"&&this.#selectionPolicy!=="document-v1")throw new SharedEditorError("selection_policy","Expected selectionEditing original or document-v1");
   if(!Number.isSafeInteger(this.#maxFrames)||this.#maxFrames<1||this.#maxFrames>64||!Number.isSafeInteger(this.#maxBytes)||this.#maxBytes<1||this.#maxBytes>8*1024*1024)throw new SharedEditorError("queue_limits","Remote limits can only tighten defaults");
   if(typeof raw.descriptor_json!=="function")throw new SharedEditorError("owner_abi","Use the matching shared Rust owner");
   this.#descriptor=raw.descriptor_json();const descriptor=JSON.parse(this.#descriptor) as SharedOwnerDescriptor;
   if(raw.review_enabled?.()===true)throw new SharedEditorError("review_adoption","Transfer a document owner without an attached review lane, then explicitly enable/restore review through this facade");
   if(descriptor.format!=="breditor/shared-rich-owner"||sharedProtocolLanguage(descriptor)===undefined)throw new SharedEditorError("owner_abi","Unsupported shared Rust ABI/model/history revision");
   if(this.richLanguageVersion()===3&&!this.supportsBlockLayout())throw new SharedEditorError("layout_unavailable","Use matching native layout V3 commands and reads");
   if(this.#selectionPolicy==="document-v1"){
    if(!this.supportsDocumentSelection())throw new SharedEditorError("document_selection_unavailable","Use complete matching native document-selection capabilities");
    if(!raw.document_selection_enabled!()){const initial=raw.observe();try{raw.enable_document_selection!(initial);}finally{initial.free();}}
   }else if(raw.document_selection_enabled?.()===true)throw new SharedEditorError("selection_policy","Document-family recovery requires explicit selectionEditing document-v1");
   if(options.reviewedHistory!==undefined){
    const identity=reviewedHistoryIdentity(options.reviewedHistory);
    if(!this.supportsReviewedHistory())throw new SharedEditorError("reviewed_history_unavailable","Use complete matching native history/proof capabilities");
    if(!raw.reviewed_history_enabled!()){const initial=this.#observe(raw);try{raw.enable_reviewed_history!(initial,JSON.stringify(identity));}finally{initial.free();}}
    const actual=JSON.parse(raw.reviewed_history_identity_json!()) as SharedReviewedHistoryIdentity|null;
    if(!actual||!sameReviewedHistory(identity,reviewedHistoryIdentity(actual)))throw new SharedEditorError("reviewed_history_identity","Recovered native history has another identity");
   }else if(raw.reviewed_history_enabled?.()===true)throw new SharedEditorError("reviewed_history_policy","Reviewed recovery requires explicitly pinned reviewedHistory");
   if(options.searchHistory!==undefined&&options.searchHistory!=="search-v1")throw new SharedEditorError("search_history_policy","Expected explicit search-v1 history");
   if(this.#searchHistory){
    if(!this.supportsSearch())throw new SharedEditorError("search_unavailable","Use complete matching native search capabilities");
    if(!raw.search_history_enabled!()){const initial=this.#observe(raw);try{raw.enable_search_history!(initial);}finally{initial.free();}}
    if(!raw.search_history_enabled!())throw new SharedEditorError("search_history_policy","Native search history was not enabled");
   }else if(raw.search_history_enabled?.()===true)throw new SharedEditorError("search_history_policy","Search recovery requires explicitly selected search-v1 history");
   this.#observation=this.#observe(raw);this.#view=this.#observation.view_json();const view=this.view();
   if(options.reviewedHistory!==undefined?view.historyPolicy!=="reviewed-v1":view.historyPolicy!==undefined)throw new SharedEditorError("reviewed_history_policy","Native view must match explicitly selected reviewed history");
   if(view.format!==(this.#selectionPolicy==="document-v1"?"breditor/shared-document-view":"breditor/shared-rich-view")||view.formatVersion!==1)throw new SharedEditorError("owner_abi","Use the matching explicitly selected shared view family");
   if(this.#selectionPolicy==="document-v1"&&(!("selectionEditing" in view)||view.selectionEditing!=="document-v1"))throw new SharedEditorError("selection_policy","Native document view did not declare the selected scope policy");
   if(view.rangeEditing!==undefined&&(view.rangeEditing!=="general-v1"||!this.supportsGeneralRanges()))throw new SharedEditorError("general_range_unavailable","Use a complete matching native general-range owner");
   owners.add(raw);
  }
  catch(error){this.#observation?.free();this.#raw=undefined;raw.free();throw error;}
 }
 #live():SharedRustOwner{if(!this.#raw)throw new SharedEditorError("disposed","The shared editor is disposed");return this.#raw;}
 #observe(raw:SharedRustOwner):ReturnType<SharedRustOwner["observe"]>{return this.#selectionPolicy==="document-v1"?raw.observe_document!():raw.observe();}
 #check(revision?:string):void{this.#live();if(revision!==undefined&&revision!==this.view().revision)throw new SharedEditorError("stale_observation","The request was prepared from an older shared publication");}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* A callback cannot rewind committed content. */}}
 #notify(source:"local"|"remote"):void{for(const listener of [...this.#listeners]){if(!this.#raw)break;try{listener({source,view:this.view()});}catch(error){this.#report(error);}}this.#notifyReview();}
 #notifyReview():void{if(!this.#raw||!this.#reviewEnabled||!this.#reviewListeners.size)return;for(const listener of [...this.#reviewListeners]){if(!this.#raw)break;try{listener(this.reviewSnapshot());}catch(error){this.#report(error);}}}
 #run<T>(source:"local"|"remote",work:(raw:SharedRustOwner,observation:unknown)=>T,revision?:string,write=true):T{
  this.#check(revision);if(this.#retired)throw new SharedEditorError("retired","The shared writer is retired for durable closure");if(this.#publishing)throw new SharedEditorError("reentrant_publication","Publication callbacks cannot publish reentrantly");
  if(write&&this.view().readOnly===true)throw new SharedEditorError("read_only","The shared editor is read-only");
  const raw=this.#live(),before=this.#view,reviewBefore=this.#reviewRevision;this.#publishing=true;
  try{const result=work(raw,this.#observation);const next=this.#observe(raw),view=next.view_json();this.#observation?.free();this.#observation=next;this.#view=view;if(before!==view)this.#notify(source);else if(reviewBefore!==this.#reviewRevision)this.#notifyReview();return result;}
  finally{this.#publishing=false;if(!this.#draining)this.#flush();}
 }
 view():SharedEditorView<P>{this.#live();return JSON.parse(this.#view) as SharedEditorView<P>;}
 /** Both exclusive calls and version1 are required; old runtimes never match in JavaScript. */
 supportsMarkdownInputRules():boolean{const r=this.#live();return r.markdown_input_rules_version?.()==="1"&&[r.insert_plain_text_with_markdown_rules,r.insert_typing_text_with_markdown_rules].every(f=>typeof f==="function");}
 #markdownInput(method:"insert_plain_text_with_markdown_rules"|"insert_typing_text_with_markdown_rules",data:{text:string;namespace:string;clockMs?:string},revision?:string):RichInputRuleOutcome{
  const input=JSON.stringify(data);this.#check(revision);
  if(!this.supportsMarkdownInputRules())throw new SharedEditorError("input_rules_unavailable","Use complete matching native Markdown input rules");
  return this.#run("local",(raw,o)=>{const value=raw[method]!(o,input);if(value!=="unchanged"&&value!=="inserted"&&value!=="applied"&&value!=="refused")throw new SharedEditorError("owner_abi","Invalid native input-rule outcome");return value;},revision);
 }
 /** Refused is accepted input with a separate conversion refusal; never retry it. */
 insertPlainTextWithMarkdownRules(text:string,namespace:string,revision?:string):RichInputRuleOutcome{return this.#markdownInput("insert_plain_text_with_markdown_rules",{text,namespace},revision);}
 /** One SDK publication follows both native commits; callbacks cannot retarget the rule. */
 insertTypingTextWithMarkdownRules(text:string,clockMs:string,namespace:string,revision?:string):RichInputRuleOutcome{return this.#markdownInput("insert_typing_text_with_markdown_rules",{text,clockMs,namespace},revision);}
 /** Pure matching/navigation remains available without upgrading history or leaving read-only. */
 supportsSearch():boolean{const r=this.#live();return r.search_version?.()==="1"&&[r.find_text,r.check_search_results,r.select_search_match,r.replace_search_one,r.replace_search_all,r.search_history_enabled,r.enable_search_history,r.search_checkpoint].every(f=>typeof f==="function");}
 searchHistoryPolicy():"search-v1"|null{this.#live();return this.#searchHistory?"search-v1":null;}
 #searchOwner(revision?:string):SharedRustOwner{this.#check(revision);if(!this.supportsSearch())throw new SharedEditorError("search_unavailable","Use complete matching native search capabilities");return this.#live();}
 /** No query/template/matched text is copied into metadata or recovery records. */
 findText(query:RichSearchQuery,revision?:string):SharedSearchResults{const input=JSON.stringify(query),raw=this.#searchOwner(revision),native=raw.find_text!(this.#observation,input);let result:SharedSearchResults;result=new SharedSearchResults(this,native,()=>this.#searches.delete(result));this.#searches.add(result);return result;}
 checkSearchResults(result:SharedSearchResults,revision?:string):void{this.#searchOwner(revision).check_search_results!(this.#observation,nativeSearchResults(this,result));}
 selectSearchMatch(result:SharedSearchResults,index:string,revision?:string):boolean{this.#searchOwner(revision);return this.#run("local",(raw,o)=>raw.select_search_match!(o,nativeSearchResults(this,result),index),revision,false);}
 replaceSearchOne(result:SharedSearchResults,index:string,replacement:RichSearchReplacement,revision?:string):boolean{const input=JSON.stringify(replacement);this.#searchOwner(revision);this.#requireSearchHistory();return this.#run("local",(raw,o)=>raw.replace_search_one!(o,nativeSearchResults(this,result),index,input),revision);}
 replaceSearchAll(result:SharedSearchResults,replacement:RichSearchReplacement,revision?:string):boolean{const input=JSON.stringify(replacement);this.#searchOwner(revision);this.#requireSearchHistory();return this.#run("local",(raw,o)=>raw.replace_search_all!(o,nativeSearchResults(this,result),input),revision);}
 #requireSearchHistory():void{if(!this.#searchHistory)throw new SharedEditorError("search_history_required","Replacement requires explicit search-v1 history and its matching recovery factory");}
 /** Complete opt-in native pairing; old binaries must not fall back to JavaScript review state. */
 supportsReview():boolean{const r=this.#live();return r.review_version?.()==="1"&&[r.review_enabled,r.enable_review,r.capture_review_anchor,r.resolve_review_anchor,r.review_view_json,r.dispatch_review,r.undo_review,r.redo_review,r.set_review_access,r.receive_review,r.export_review,r.review_checkpoint].every(f=>typeof f==="function");}
 #requireReview():SharedRustOwner{const raw=this.#live();if(!this.#reviewEnabled||!this.supportsReview())throw new SharedEditorError("review_unavailable","Enable the complete matching native review lane first");return raw;}
 #checkReview(guard?:SharedReviewGuard):void{this.#requireReview();if(guard&&(guard.owner!==this.#reviewOwner||guard.reviewRevision!==this.#reviewRevision.toString()||guard.documentRevision!==this.view().revision))throw new SharedEditorError("stale_review","The request was prepared from an older document or review publication, or a foreign owner");}
 /** Host must hold a separate durable review-writer lease and authenticate this policy. No saved roles are trusted. */
 enableReview(policy:SharedReviewPolicy,checkpoint?:string,documentRevision?:string):void{if(!this.supportsReview())throw new SharedEditorError("review_unavailable","Use a complete matching native review runtime");if(this.#reviewEnabled)throw new SharedEditorError("review_enabled","This owner already has a review lane");if(this.#fixedHistory!==undefined)throw new SharedEditorError("review_persistence_unavailable","This sealed durable session stores document history only; use review-aware paired storage before enabling comments");this.#run("local",(raw,o)=>{raw.enable_review!(o,JSON.stringify(policy),checkpoint);this.#reviewEnabled=true;this.#reviewRevision++;},documentRevision,false);}
 reviewSnapshot():SharedReviewSnapshot{const r=this.#requireReview();return {owner:this.#reviewOwner,documentRevision:this.view().revision,reviewRevision:this.#reviewRevision.toString(),view:JSON.parse(r.review_view_json!(this.#observation)) as SharedReviewView};}
 subscribeReview(listener:(snapshot:SharedReviewSnapshot)=>void):()=>void{this.#requireReview();this.#reviewListeners.add(listener);return()=>this.#reviewListeners.delete(listener);}
 captureReviewAnchor(target:SharedReviewTarget,documentRevision?:string):string{this.#check(documentRevision);const r=this.#live();if(!this.supportsReview())throw new SharedEditorError("review_unavailable","Use matching native review anchors");return r.capture_review_anchor!(this.#observation,JSON.stringify(target));}
 resolveReviewAnchor(packet:string):SharedReviewResolution{const r=this.#live();if(!this.supportsReview())throw new SharedEditorError("review_unavailable","Use matching native review anchors");return JSON.parse(r.resolve_review_anchor!(packet)) as SharedReviewResolution;}
 /** Optional lazy read: older comment runtimes remain supported without fabricating historical text. */
 supportsReviewQuotes():boolean{const r=this.#live();return this.supportsReview()&&r.review_quote_version?.()==="1"&&typeof r.read_review_quote==="function";}
 readReviewQuote(packet:string):SharedReviewQuote{if(!this.supportsReviewQuotes())throw new SharedEditorError("review_quotes_unavailable","Use matching native historical review quotes");return JSON.parse(this.#live().read_review_quote!(packet)) as SharedReviewQuote;}
 dispatchReview(action:SharedReviewAction,guard?:SharedReviewGuard):SharedReviewOutcome{this.#checkReview(guard);return this.#run("local",(raw,o)=>{const result=JSON.parse(raw.dispatch_review!(o,JSON.stringify(action))) as SharedReviewOutcome;if(result.kind==="committed")this.#reviewRevision++;return result;},guard?.documentRevision,false);}
 undoReview(guard?:SharedReviewGuard):SharedReviewOutcome{return this.#reviewHistory(false,guard);}
 redoReview(guard?:SharedReviewGuard):SharedReviewOutcome{return this.#reviewHistory(true,guard);}
 #reviewHistory(redo:boolean,guard?:SharedReviewGuard):SharedReviewOutcome{this.#checkReview(guard);return this.#run("local",(raw,o)=>{const result=JSON.parse(redo?raw.redo_review!(o):raw.undo_review!(o)) as SharedReviewOutcome;if(result.kind==="committed")this.#reviewRevision++;return result;},guard?.documentRevision,false);}
 setReviewAccess(access:SharedReviewAccess,guard?:SharedReviewGuard):boolean{this.#checkReview(guard);return this.#run("local",(raw,o)=>{const changed=raw.set_review_access!(o,access);if(changed)this.#reviewRevision++;return changed;},guard?.documentRevision,false);}
 /** Host-authenticated policy is separate from event bytes; historical catchup needs its verified original grant. Pending is not an ack: retain/retry it. */
 receiveReview(frame:string,verified:SharedReviewPolicy,guard?:SharedReviewGuard):SharedReviewImportOutcome{this.#checkReview(guard);return this.#run("remote",(raw,o)=>{const result=JSON.parse(raw.receive_review!(o,JSON.stringify(verified),frame)) as SharedReviewImportOutcome;if(result.kind==="applied")this.#reviewRevision++;return result;},guard?.documentRevision,false);}
 exportReview(after="0"):string{return this.#requireReview().export_review!(this.#observation,after);}
 /** Additive capability; old comment-only runtimes never synthesize transport proofs in JS. */
 supportsReviewTransport():boolean{const r=this.#live();return this.supportsReview()&&r.review_transport_version?.()==="1"&&[r.local_review_clock,r.review_writer_clock,r.retained_review_receipt,r.export_review_through].every(f=>typeof f==="function");}
 #reviewTransportOwner():SharedRustOwner{const r=this.#requireReview();if(!this.supportsReviewTransport())throw new SharedEditorError("review_transport_unavailable","Use matching native review lineage proofs");return r;}
 localReviewClock():SharedReviewWriterClock{return JSON.parse(this.#reviewTransportOwner().local_review_clock!(this.#observation)) as SharedReviewWriterClock;}
 exportReviewThrough(after:string,through:string):string{return this.#reviewTransportOwner().export_review_through!(this.#observation,after,through);}
 reviewWriterClock(actor:string,principal:string,through?:string):SharedReviewWriterClock{return JSON.parse(this.#reviewTransportOwner().review_writer_clock!(this.#observation,JSON.stringify({actor,principal,...(through===undefined?{}:{through})}))) as SharedReviewWriterClock;}
 /** Proves only already-retained events. It never imports unknown input or acknowledges durability. */
 retainedReviewReceipt(frame:string,verified:SharedReviewPolicy):SharedReviewBatchReceipt{return JSON.parse(this.#reviewTransportOwner().retained_review_receipt!(this.#observation,JSON.stringify(verified),frame)) as SharedReviewBatchReceipt;}
 reviewCheckpoint(guard?:SharedReviewGuard):string{this.#checkReview(guard);return this.#requireReview().review_checkpoint!(this.#observation);}
 supportsDocumentVersions():boolean{const raw=this.#live();return raw.document_versions_version?.()==="1"&&[raw.capture_document_version,raw.read_document_version,raw.compare_document_version,raw.prepare_document_version_restore,raw.apply_document_version_restore].every(f=>typeof f==="function");}
 #versionOwner():SharedRustOwner{if(!this.supportsDocumentVersions())throw new SharedEditorError("versions_unavailable","Use complete matching native document versions");return this.#live();}
 /** Persist the immutable returned packet separately. Host author/time claims are not authentication. */
 captureVersion(name:string,author:string,createdAtMs:string,revision?:string):string{this.#check(revision);return this.#versionOwner().capture_document_version!(this.#observation,JSON.stringify({name,author,createdAtMs}));}
 readVersion(packet:string):SharedDocumentVersionInfo{return JSON.parse(this.#versionOwner().read_document_version!(packet)) as SharedDocumentVersionInfo;}
 supportsVersionSourceProofs():boolean{const r=this.#live();return this.supportsDocumentVersions()&&r.document_version_source_version?.()==="1"&&typeof r.verify_document_version_source==="function";}
 /** Prove source content without granting author rights or treating this read as server acceptance. */
 verifyVersionSource(packet:string):SharedDocumentVersionSource{if(!this.supportsVersionSourceProofs())throw new SharedEditorError("version_source_unavailable","Use matching native historical version proofs");return JSON.parse(this.#live().verify_document_version_source!(packet)) as SharedDocumentVersionSource;}
 compareVersion(packet:string,revision?:string):SharedVersionComparison{this.#check(revision);return JSON.parse(this.#versionOwner().compare_document_version!(this.#observation,packet)) as SharedVersionComparison;}
 /** Prefix is consumed even if preparation fails or its preview is never applied. No accepted state changes. */
 prepareVersionRestore(packet:string,prefix:string,revision?:string):SharedDocumentVersionRestorePlan{this.#check(revision);if(this.#retired||this.#publishing)throw new SharedEditorError("version_preview_unavailable","Cannot prepare a restore while retired or publishing");const raw=this.#versionOwner().prepare_document_version_restore!(this.#observation,packet,prefix);let plan:SharedDocumentVersionRestorePlan;plan=new SharedDocumentVersionRestorePlan(this,raw,()=>this.#versionPlans.delete(plan));this.#versionPlans.add(plan);return plan;}
 /** Rust rejects a stale/foreign proof before publication. Current comment history is not restored. */
 applyVersionRestore(plan:SharedDocumentVersionRestorePlan):boolean{return this.#run("local",()=>this.#versionOwner().apply_document_version_restore!(nativeVersionPlan(this,plan)));}
 /** Proposals always use Rust source witnesses and semantic previews, never a JavaScript AST diff. */
 supportsDocumentSuggestions():boolean{const r=this.#live();return r.document_suggestions_version?.()==="1"&&[r.capture_document_suggestion,r.read_document_suggestion,r.verify_document_suggestion_source,r.prepare_document_suggestion,r.check_document_suggestion_preview,r.retained_writer_receipt_v2].every(f=>typeof f==="function");}
 #suggestionOwner():SharedRustOwner{if(!this.supportsDocumentSuggestions())throw new SharedEditorError("suggestions_unavailable","Use complete matching native suggestion capture, preview and receipt reads");return this.#live();}
 /** Pure capture, including read-only documents. Returned attribution still requires host authentication. */
 captureSuggestion(title:string,author:string,createdAtMs:string,draft:SharedDocumentSuggestionDraft,revision?:string):string{this.#check(revision);return this.#suggestionOwner().capture_document_suggestion!(this.#observation,JSON.stringify({title,author,createdAtMs,draft}));}
 /** Separate pure capability. No JS floor counting, accepted edits or fallback on older binaries. */
 supportsSuggestionGeneralText():boolean{const r=this.#live();return this.supportsDocumentSuggestions()&&r.suggestion_general_text_version?.()==="1"&&typeof r.plan_suggestion_general_text==="function";}
 /** Native protected-range draft with exact host-reserved floors, including read-only sources.
  * Prefixes stay consumed on refusal/discard; capture this result against the same revision. */
 planSuggestionGeneralText(selection:Extract<RichSelection,{kind:"text"}>,runs:readonly {text:string;formatsJson:string}[],prefix:string,revision?:string):SharedDocumentSuggestionDraft{this.#check(revision);if(!this.supportsSuggestionGeneralText())throw new SharedEditorError("suggestion_general_text_unavailable","Use matching native pure protected-range proposal planning");return JSON.parse(this.#live().plan_suggestion_general_text!(this.#observation,JSON.stringify({selection,runs,prefix}))) as SharedDocumentSuggestionDraft;}
 readSuggestion(packet:string):SharedDocumentSuggestionInfo{return JSON.parse(this.#suggestionOwner().read_document_suggestion!(packet)) as SharedDocumentSuggestionInfo;}
 verifySuggestionSource(packet:string):SharedDocumentSuggestionSource{return JSON.parse(this.#suggestionOwner().verify_document_suggestion_source!(packet)) as SharedDocumentSuggestionSource;}
 /** Optional immutable revisions never change the old complete proposal capability. */
 supportsSuggestionRevisions():boolean{const r=this.#live();return this.supportsDocumentSuggestions()&&r.document_suggestion_revisions_version?.()==="1"&&[r.capture_document_suggestion_revision,r.read_document_suggestion_revision,r.verify_document_suggestion_revision,r.document_suggestion_revision_packet].every(f=>typeof f==="function");}
 #revisionOwner():SharedRustOwner{if(!this.supportsSuggestionRevisions())throw new SharedEditorError("suggestion_revisions_unavailable","Use complete matching native immutable revision proofs");return this.#live();}
 /** Full replacement intent at the accepted source, not a delta against a proposed document.
  * The predecessor fixes attribution. No publication, accepted mutation or Accept occurs here. */
 captureSuggestionRevision(previousPacketJson:string,title:string,createdAtMs:string,draft:SharedDocumentSuggestionDraft,revision?:string):string{this.#check(revision);return this.#revisionOwner().capture_document_suggestion_revision!(this.#observation,JSON.stringify({previousPacketJson,title,createdAtMs,draft}));}
 readSuggestionRevision(previousPacket:string,packet:string):SharedSuggestionRevisionInfo{return JSON.parse(this.#revisionOwner().read_document_suggestion_revision!(previousPacket,packet)) as SharedSuggestionRevisionInfo;}
 verifySuggestionRevision(previousPacket:string,packet:string):SharedSuggestionRevisionSource{return JSON.parse(this.#revisionOwner().verify_document_suggestion_revision!(previousPacket,packet)) as SharedSuggestionRevisionSource;}
 /** Exact unchanged V1 child bytes. Never independently publish these instead of the revision. */
 revisionSuggestionPacket(previousPacket:string,packet:string):string{return this.#revisionOwner().document_suggestion_revision_packet!(previousPacket,packet);}
 /** Separate pure marker; older complete revision runtimes keep their existing behavior. */
 supportsSuggestionFormatRebase():boolean{const r=this.#live();return this.supportsSuggestionRevisions()&&r.suggestion_format_rebase_version?.()==="1"&&typeof r.rebase_document_suggestion_format==="function";}
 /** Capture an original-character formatting revision, never an accepted edit or JS range diff. */
 rebaseSuggestionFormat(previousPacketJson:string,title:string,createdAtMs:string,revision?:string):SharedSuggestionFormatRebase{this.#check(revision);if(!this.supportsSuggestionFormatRebase())throw new SharedEditorError("suggestion_format_rebase_unavailable","Use matching native formatting rebase proofs");return JSON.parse(this.#live().rebase_document_suggestion_format!(this.#observation,JSON.stringify({previousPacketJson,title,createdAtMs}))) as SharedSuggestionFormatRebase;}
 /** Separate pure pair; text policy, scalar identity and structural consequences stay native. */
 supportsSuggestionTextRebase():boolean{const r=this.#live();return this.supportsSuggestionRevisions()&&r.suggestion_text_rebase_version?.()==="1"&&typeof r.rebase_document_suggestion_text==="function";}
 /** Prefixes must be durably reserved by the host, including on refusal/discard. No accepted
  * edits or history-family enablement occur; the predecessor fixes scope and attribution. */
 rebaseSuggestionText(previousPacketJson:string,title:string,createdAtMs:string,prefix:string,policy:SharedSuggestionTextRebasePolicy,revision?:string):SharedSuggestionTextRebase{this.#check(revision);if(!this.supportsSuggestionTextRebase())throw new SharedEditorError("suggestion_text_rebase_unavailable","Use matching native complete-text rebase proofs");return JSON.parse(this.#live().rebase_document_suggestion_text!(this.#observation,JSON.stringify({previousPacketJson,title,createdAtMs,prefix,policy}))) as SharedSuggestionTextRebase;}
 /** A ready handle is source-bound, not an Accept command. Pending/conflicting native handles are released immediately. */
 prepareSuggestion(packet:string,revision?:string):SharedDocumentSuggestionPreparation{
  this.#check(revision);if(this.#retired||this.#publishing)throw new SharedEditorError("suggestion_preview_unavailable","Cannot prepare while retired or publishing");
  const raw=this.#suggestionOwner().prepare_document_suggestion!(this.#observation,packet);let summary:SharedSuggestionPreparationSummary;
  try{summary=JSON.parse(raw.summary_json()) as SharedSuggestionPreparationSummary;if(summary.kind!=="ready"&&summary.kind!=="pending"&&summary.kind!=="conflict")throw new SharedEditorError("suggestion_preview_invalid","Native preparation did not declare a result");}catch(error){raw.free();throw error;}
  if(summary.kind!=="ready"){raw.free();return summary;}
  let preview:SharedDocumentSuggestionPreview;preview=new SharedDocumentSuggestionPreview(this,raw,summary,()=>this.#suggestionPreviews.delete(preview));this.#suggestionPreviews.add(preview);return {kind:"ready",preview};
 }
 checkSuggestionPreview(preview:SharedDocumentSuggestionPreview,suggestionId?:string):void{const prepared=nativeSuggestionPreview(this,preview);this.#suggestionOwner().check_document_suggestion_preview!(prepared.raw,suggestionId??prepared.id);}
 /** Checks native retained operations only; the caller must authenticate the server decision separately. */
 retainedWriterReceiptV2(receipt:SharedWriterReceiptV2):SharedWriterReceiptRetention{return JSON.parse(this.#suggestionOwner().retained_writer_receipt_v2!(JSON.stringify(receipt))) as SharedWriterReceiptRetention;}
 /** Complete native pairing only. No JS operation/AST fallback is permitted. */
 supportsReviewedHistory():boolean{const r=this.#live();return r.reviewed_history_version?.()==="1"&&[r.reviewed_history_enabled,r.reviewed_history_identity_json,r.adopted_suggestion_json,r.enable_reviewed_history,r.reviewed_checkpoint,r.verify_document_suggestion_effect,r.check_document_suggestion_effect_proof,r.adopt_suggestion_history].every(f=>typeof f==="function");}
 #reviewedOwner():SharedRustOwner{if(!this.supportsReviewedHistory())throw new SharedEditorError("reviewed_history_unavailable","Use matching native reviewed history");return this.#live();}
 reviewedHistoryIdentity():SharedReviewedHistoryIdentity|null{const r=this.#live();return r.reviewed_history_enabled?.()===true?reviewedHistoryIdentity(JSON.parse(this.#reviewedOwner().reviewed_history_identity_json!()) as SharedReviewedHistoryIdentity):null;}
 adoptedSuggestion(id:string):SharedOwnedSuggestionAcceptance|null{return JSON.parse(this.#reviewedOwner().adopted_suggestion_json!(id)) as SharedOwnedSuggestionAcceptance|null;}
 /** Pure semantic verification, including read-only. Final server authority remains separate. */
 verifySuggestionEffect(packet:string,effect:SharedDocumentSuggestionEffect,revision?:string):SharedSuggestionEffectVerification{
  this.#check(revision);if(this.#retired||this.#publishing)throw new SharedEditorError("suggestion_effect_unavailable","Cannot verify while retired or publishing");
  const raw=this.#reviewedOwner().verify_document_suggestion_effect!(this.#observation,packet,JSON.stringify(effect));let summary:SharedSuggestionEffectSummary;
  try{summary=JSON.parse(raw.summary_json()) as SharedSuggestionEffectSummary;if(summary.kind!=="verified"&&summary.kind!=="pending")throw new SharedEditorError("suggestion_effect_invalid","Native proof did not declare a result");}catch(error){raw.free();throw error;}
  if(summary.kind==="pending"){raw.free();return summary;}
  let proof:SharedDocumentSuggestionEffectProof;proof=new SharedDocumentSuggestionEffectProof(this,raw,summary,()=>this.#suggestionEffects.delete(proof));this.#suggestionEffects.add(proof);return {kind:"verified",proof};
 }
 checkSuggestionEffect(proof:SharedDocumentSuggestionEffectProof):void{this.#reviewedOwner().check_document_suggestion_effect_proof!(nativeSuggestionEffectProof(this,proof));}
 /** Caller authenticates the ORIGINAL owned server decision first. No accepted command is rerun. */
 adoptSuggestionHistory(proof:SharedDocumentSuggestionEffectProof,packet:string,acceptance:SharedOwnedSuggestionAcceptance):boolean{return this.#run("local",()=>this.#reviewedOwner().adopt_suggestion_history!(nativeSuggestionEffectProof(this,proof),packet,JSON.stringify(acceptance)),undefined,false);}
 /** Immutable for this facade's lifetime; recovery must select the same family explicitly. */
 selectionPolicy():P{this.#live();return this.#selectionPolicy as P;}
 supportsDocumentSelection():boolean{const raw=this.#live();return raw.document_selection_version?.()==="1"&&raw.document_typing_version?.()==="1"&&[raw.document_selection_enabled,raw.enable_document_selection,raw.observe_document,raw.document_view_json,raw.select_document,raw.copy_document_clipboard,raw.replace_document_plain_text,raw.replace_document_typing_text,raw.document_checkpoint,raw.document_typing_checkpoint].every(method=>typeof method==="function");}
 #documentOwner():SharedRustOwner{if(this.#selectionPolicy!=="document-v1"||!this.supportsDocumentSelection())throw new SharedEditorError("selection_policy","Use explicit selectionEditing document-v1 with matching native capabilities");return this.#live();}
 /** Local scope publication, not shared content; read-only selection remains allowed. */
 selectDocument(this:SharedRichEditor<"document-v1">,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#documentOwner().select_document!(o),revision,false);}
 supportsDocumentNavigation():boolean{const raw=this.#live();return this.supportsDocumentSelection()&&raw.document_navigation_version?.()==="1"&&typeof raw.collapse_document_selection==="function";}
 /** Separate paired capability; older document owners remain usable for their existing commands. */
 supportsDocumentTools():boolean{const raw=this.#live();return this.supportsDocumentSelection()&&raw.document_tools_version?.()==="1"&&[raw.document_selection_coverage_json,raw.document_selection_format_state_json,raw.document_block_layout_state_json,raw.change_document_selection_formats,raw.change_document_selection_layout].every(method=>typeof method==="function");}
 collapseDocumentSelection(this:SharedRichEditor<"document-v1">,side:"before"|"after",revision?:string):boolean{return this.#run("local",(_raw,o)=>{const raw=this.#documentOwner();if(!this.supportsDocumentNavigation())throw new SharedEditorError("document_navigation_unavailable","Use matching native document edge navigation");return raw.collapse_document_selection!(o,side);},revision,false);}
 replaceDocumentPlainText(this:SharedRichEditor<"document-v1">,paragraph:string,text:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#documentOwner().replace_document_plain_text!(o,JSON.stringify({paragraph,text})),revision);}
 replaceDocumentTypingText(this:SharedRichEditor<"document-v1">,paragraph:string,text:string,clockMs:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#documentOwner().replace_document_typing_text!(o,JSON.stringify({paragraph,text,clockMs})),revision);}
 copyDocument(this:SharedRichEditor<"document-v1">):ClipboardContent|null{return JSON.parse(this.#documentOwner().copy_document_clipboard!(this.#observation)) as ClipboardContent|null;}
 /** Rich paste is separately negotiated; earlier document-selection runtimes still work. */
 supportsDocumentClipboard():boolean{const raw=this.#live();return this.supportsDocumentSelection()&&raw.document_clipboard_version?.()==="1"&&typeof raw.paste_document_clipboard==="function";}
 /** Prefix must be permanently reserved on success, refusal and Undo. No plain-text fallback. */
 pasteDocumentClipboard(this:SharedRichEditor<"document-v1">,clipboardJson:string,prefix:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>{const raw=this.#documentOwner();if(!this.supportsDocumentClipboard())throw new SharedEditorError("document_clipboard_unavailable","Use matching native whole-document rich paste");return raw.paste_document_clipboard!(o,JSON.stringify({clipboardJson,prefix}));},revision);}
 descriptor():SharedOwnerDescriptor{this.#live();return JSON.parse(this.#descriptor) as SharedOwnerDescriptor;}
 richLanguageVersion():1|2|3{const language=sharedProtocolLanguage(this.descriptor());if(language===undefined)throw new SharedEditorError("owner_abi","Unsupported shared native language");return language;}
 documentJson():string{return this.view().documentJson;}
 /** Read the same core property-state contract under the current opaque observation. */
 supportsInlineFormatState():boolean{return typeof this.#live().inline_format_state_json==="function";}
 supportsStandardInlineControls():boolean{return this.supportsInlineFormatState()&&typeof this.#live().caret_formats_json==="function";}
 supportsInlinePropertyPatches():boolean{return typeof this.#live().patch_inline_format_properties==="function";}
 supportsReadOnly():boolean{const raw=this.#live();return typeof raw.read_only_version==="function"&&raw.read_only_version()==="1"&&typeof raw.set_read_only==="function";}
 supportsCodeExit():boolean{const raw=this.#live();return typeof raw.code_exit_version==="function"&&raw.code_exit_version()==="1"&&typeof raw.exit_code_block==="function";}
 supportsFlowNavigation():boolean{const raw=this.#live();return typeof raw.flow_navigation_version==="function"&&raw.flow_navigation_version()==="1"&&typeof raw.navigate_flow==="function"&&typeof raw.insert_paragraph_adjacent==="function";}
 supportsAtomEditing():boolean{const raw=this.#live();return typeof raw.atom_edit_version==="function"&&raw.atom_edit_version()==="1"&&typeof raw.delete_atom==="function"&&typeof raw.replace_atom_plain_text==="function"&&typeof raw.replace_atom_typing_text==="function";}
 supportsGeneralRanges():boolean{const raw=this.#live();return typeof raw.general_range_version==="function"&&raw.general_range_version()==="1"&&[raw.enable_general_ranges,raw.replace_general_range_text,raw.replace_general_range_plain_text,raw.replace_general_range_typing_text,raw.general_checkpoint,raw.general_typing_checkpoint].every(method=>typeof method==="function");}
 /** Separate exact capability; older general-range runtimes must not reinterpret an opaque clipboard. */
 supportsGeneralInlinePaste():boolean{const raw=this.#live();return this.supportsGeneralRanges()&&typeof raw.general_inline_paste_version==="function"&&raw.general_inline_paste_version()==="1"&&typeof raw.paste_general_inline_clipboard==="function";}
 pasteGeneralInlineClipboard(selection:Extract<RichSelection,{kind:"text"}>,clipboardJson:string,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsGeneralInlinePaste())throw new SharedEditorError("general_inline_paste_unavailable","Use matching native general inline clipboard paste");return raw.paste_general_inline_clipboard!(o,JSON.stringify({selection,clipboardJson,prefix}));},revision);}
 supportsGeneralFlowPaste():boolean{const raw=this.#live();return this.supportsGeneralRanges()&&typeof raw.general_flow_paste_version==="function"&&raw.general_flow_paste_version()==="1"&&typeof raw.paste_general_flow_clipboard==="function";}
 supportsGeneralParagraph():boolean{const raw=this.#live();return this.supportsGeneralRanges()&&typeof raw.general_paragraph_version==="function"&&raw.general_paragraph_version()==="1"&&typeof raw.insert_general_paragraph==="function";}
 insertGeneralParagraph(selection:Extract<RichSelection,{kind:"text"}>,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsGeneralParagraph())throw new SharedEditorError("general_paragraph_unavailable","Use matching native general paragraph editing");return raw.insert_general_paragraph!(o,JSON.stringify({selection,prefix}));},revision);}
 pasteGeneralFlowClipboard(selection:Extract<RichSelection,{kind:"text"}>,clipboardJson:string,right:string,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsGeneralFlowPaste())throw new SharedEditorError("general_flow_paste_unavailable","Use matching native general rich-flow clipboard paste");return raw.paste_general_flow_clipboard!(o,JSON.stringify({selection,clipboardJson,right,prefix}));},revision);}
 #generalOwner():SharedRustOwner{if(!this.supportsGeneralRanges())throw new SharedEditorError("general_range_unavailable","Use a matching native general-range owner");return this.#live();}
 /** Explicit one-way native admission. Durable hosts must bind the matching save family first. */
 enableGeneralRanges(revision?:string):boolean{return this.#run("local",(_raw,o)=>{if(this.#fixedRanges==="original")throw new SharedEditorError("range_policy","This durable session's range policy is immutable");return this.#generalOwner().enable_general_ranges!(o);},revision,false);}
 /** Durable storage binds this independently from natural/explicit history. */
 sealRangePolicy(policy:"original"|"general-v1"):void{this.#live();if((policy!=="original"&&policy!=="general-v1")||(this.#fixedRanges!==undefined&&this.#fixedRanges!==policy)||(this.view().rangeEditing??"original")!==policy)throw new SharedEditorError("range_policy","Range policy does not match the native owner");this.#fixedRanges=policy;}
 replaceGeneralRangeText(selection:Extract<RichSelection,{kind:"text"}>,runs:readonly {text:string;formatsJson:string}[],prefix:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#generalOwner().replace_general_range_text!(o,JSON.stringify({selection,runs,prefix})),revision);}
 replaceGeneralRangePlainText(selection:Extract<RichSelection,{kind:"text"}>,text:string,prefix:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#generalOwner().replace_general_range_plain_text!(o,JSON.stringify({selection,text,prefix})),revision);}
 replaceGeneralRangeTypingText(selection:Extract<RichSelection,{kind:"text"}>,text:string,prefix:string,clockMs:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#generalOwner().replace_general_range_typing_text!(o,JSON.stringify({selection,text,prefix,clockMs})),revision);}
 supportsSelectionFormatting():boolean{const raw=this.#live();return typeof raw.selection_formatting_version==="function"&&raw.selection_formatting_version()==="1"&&typeof raw.selection_coverage_json==="function"&&typeof raw.selection_format_state_json==="function"&&typeof raw.change_selection_formats==="function";}
 supportsBlockLayout():boolean{const raw=this.#live();return this.richLanguageVersion()===3&&typeof raw.block_layout_version==="function"&&raw.block_layout_version()==="1"&&typeof raw.block_layout_state_json==="function"&&typeof raw.change_selection_layout==="function";}
 blockLayoutState():import("@breditor/experimental-rich-content").RichBlockLayoutStateRead{if(!this.supportsBlockLayout())throw new SharedEditorError("layout_unavailable","Use an explicitly selected matching native layout V3 owner");const raw=this.#live();return JSON.parse(this.#selectionPolicy==="document-v1"&&this.supportsDocumentTools()?raw.document_block_layout_state_json!(this.#observation):raw.block_layout_state_json!(this.#observation)) as import("@breditor/experimental-rich-content").RichBlockLayoutStateRead;}
 changeSelectionLayout(patch:import("@breditor/experimental-rich-content").RichBlockLayoutPatch,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsBlockLayout())throw new SharedEditorError("layout_unavailable","Use matching native layout V3 commands and reads");const input=encodeBlockLayoutPatch(patch);return this.#selectionPolicy==="document-v1"&&this.supportsDocumentTools()?raw.change_document_selection_layout!(o,input):raw.change_selection_layout!(o,input);},revision);}
 selectionCoverage(scope:"selection"|"document"="selection"):import("@breditor/experimental-rich-content").RichSelectionCoverageRead{if(!this.supportsSelectionFormatting())throw new SharedEditorError("selection_formatting_unavailable","Use a matching native selection-formatting owner");const raw=this.#live();return JSON.parse(this.#selectionPolicy==="document-v1"&&this.supportsDocumentTools()?raw.document_selection_coverage_json!(this.#observation,scope):raw.selection_coverage_json!(this.#observation,scope)) as import("@breditor/experimental-rich-content").RichSelectionCoverageRead;}
 selectionFormatState(kind:string):import("@breditor/experimental-rich-content").RichSelectionFormatStateRead{if(!this.supportsSelectionFormatting())throw new SharedEditorError("selection_formatting_unavailable","Use a matching native selection-formatting owner");const raw=this.#live();return JSON.parse(this.#selectionPolicy==="document-v1"&&this.supportsDocumentTools()?raw.document_selection_format_state_json!(this.#observation,kind):raw.selection_format_state_json!(this.#observation,kind)) as import("@breditor/experimental-rich-content").RichSelectionFormatStateRead;}
 changeSelectionFormats(changes:readonly import("@breditor/experimental-rich-content").RichSelectionFormatChange[],revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsSelectionFormatting())throw new SharedEditorError("selection_formatting_unavailable","Use a matching native selection-formatting owner");const input=JSON.stringify({changes});return this.#selectionPolicy==="document-v1"&&this.supportsDocumentTools()?raw.change_document_selection_formats!(o,input):raw.change_selection_formats!(o,input);},revision);}
 deleteAtom(paragraph:string,movement:"before"|"after",revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsAtomEditing())throw new SharedEditorError("atom_edit_unavailable","Use a matching native atom-edit owner");return raw.delete_atom!(o,paragraph,movement);},revision);}
 replaceAtomPlainText(paragraph:string,text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsAtomEditing())throw new SharedEditorError("atom_edit_unavailable","Use a matching native atom-edit owner");return raw.replace_atom_plain_text!(o,paragraph,text);},revision);}
 replaceAtomTypingText(paragraph:string,text:string,clockMs:string,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsAtomEditing())throw new SharedEditorError("atom_edit_unavailable","Use a matching native atom-edit owner");return raw.replace_atom_typing_text!(o,paragraph,text,clockMs);},revision);}
 /** Logical before/after is not visual/bidi arrow layout; this publication never authors content. */
 navigateFlow(movement:"before"|"after",revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsFlowNavigation())throw new SharedEditorError("flow_navigation_unavailable","Use a matching native flow-navigation owner");return raw.navigate_flow!(o,movement);},revision,false);}
 insertParagraphAdjacent(paragraph:string,side:"before"|"after",revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsFlowNavigation())throw new SharedEditorError("flow_navigation_unavailable","Use a matching native flow-navigation owner");return raw.insert_paragraph_adjacent!(o,paragraph,side);},revision);}
 /** Named native planning only: no fallback to a JavaScript flow transaction. */
 exitCodeBlock(paragraph:string,revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!this.supportsCodeExit())throw new SharedEditorError("code_exit_unavailable","Use a matching native code-exit owner");return raw.exit_code_block!(o,paragraph);},revision);}
 setReadOnly(value:boolean,revision?:string):boolean{if(typeof value!=="boolean")throw new TypeError("readOnly must be Boolean");return this.#run("local",(raw,o)=>{if(!this.supportsReadOnly())throw new SharedEditorError("read_only_unavailable","Use a matching native owner with read-only enforcement");return raw.set_read_only!(o,value);},revision,false);}
 /** Field-only intent is planned and admitted in Rust, never lowered from a mutable JS AST. */
 patchInlineFormatProperties(request:{format:FormatLiteral;properties:readonly string[];targets:readonly {block:string;offset:number;length:number}[]},revision?:string):boolean{return this.#run("local",(raw,o)=>{if(!raw.patch_inline_format_properties)throw new SharedEditorError("property_patch_unavailable","Use a matching Rust owner with inline property-patch support");return raw.patch_inline_format_properties(o,JSON.stringify({formatsJson:JSON.stringify([request.format]),properties:request.properties,targets:request.targets}));},revision);}
 caretFormats():readonly FormatLiteral[]{const raw=this.#live();if(!raw.caret_formats_json)throw new SharedEditorError("caret_formats_unavailable","Use a matching Rust owner with caret-format reads");return JSON.parse(raw.caret_formats_json(this.#observation)) as FormatLiteral[];}
 inlineFormatState(kind:string):RichInlineFormatStateRead{const raw=this.#live();if(!raw.inline_format_state_json)throw new SharedEditorError("inline_state_unavailable","Use a matching Rust owner with formatting-state support");if(typeof kind!=="string"||kind.length>128)throw new SharedEditorError("inline_state_kind","Expected a bounded declared format kind");return JSON.parse(raw.inline_format_state_json(this.#observation,kind)) as RichInlineFormatStateRead;}
 supportsTypingHistory():boolean{const raw=this.#live();return typeof raw.typing_history_version==="function"&&raw.typing_history_version()==="1"&&[raw.enable_typing_history,raw.close_typing_group,raw.insert_typing_text,raw.delete_typing_range,raw.typing_checkpoint].every(method=>typeof method==="function");}
 #typingOwner():SharedRustOwner{if(!this.supportsTypingHistory())throw new SharedEditorError("typing_history_unavailable","Use a matching native shared typing-history owner");return this.#live();}
 enableTypingHistory(revision?:string):boolean{return this.#run("local",(_raw,o)=>{if(this.#fixedHistory==="explicit")throw new SharedEditorError("history_policy","This durable session's history policy is immutable");return this.#typingOwner().enable_typing_history!(o);},revision,false);}
 /** An owning durable session seals its selected policy after native admission, not its content. */
 sealHistoryPolicy(policy:"explicit"|"typing-v1"):void{this.#live();if(this.#reviewEnabled)throw new SharedEditorError("review_persistence_unavailable","Review requires separately declared paired durable storage");if((policy!=="explicit"&&policy!=="typing-v1")||(this.#fixedHistory!==undefined&&this.#fixedHistory!==policy)||(this.view().historyGrouping==="typing-v1"?"typing-v1":"explicit")!==policy)throw new SharedEditorError("history_policy","History policy does not match the native owner");this.#fixedHistory=policy;}
 /** Explicit paired-record lifecycle only. The old document-only sealing path continues to refuse review. */
 sealReviewPolicies(history:"explicit"|"typing-v1",ranges:"original"|"general-v1"):void{this.#requireReview();if((history!=="explicit"&&history!=="typing-v1")||(this.#fixedHistory!==undefined&&this.#fixedHistory!==history)||(this.view().historyGrouping==="typing-v1"?"typing-v1":"explicit")!==history)throw new SharedEditorError("history_policy","Review history policy does not match the native owner");this.sealRangePolicy(ranges);this.#fixedHistory=history;}
 closeTypingGroup(revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#typingOwner().close_typing_group!(o),revision,false);}
 /** Named user input only; programmatic type/paste/composition remain explicit. */
 typeUser(text:string,clockMs:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#typingOwner().insert_typing_text!(o,JSON.stringify({text,clockMs})),revision);}
 deleteUserRange(selection:Extract<RichSelection,{kind:"text"}>,direction:"backward"|"forward",clockMs:string,revision?:string):boolean{return this.#run("local",(_raw,o)=>this.#typingOwner().delete_typing_range!(o,JSON.stringify({selection,direction,clockMs})),revision);}
 checkpointJson():string{const view=this.view();if(this.#searchHistory)return this.#live().search_checkpoint!();if(view.historyPolicy==="reviewed-v1")return this.#reviewedOwner().reviewed_checkpoint!();if(this.#selectionPolicy==="document-v1")return view.historyGrouping==="typing-v1"?this.#documentOwner().document_typing_checkpoint!():this.#documentOwner().document_checkpoint!();if(view.rangeEditing==="general-v1")return view.historyGrouping==="typing-v1"?this.#generalOwner().general_typing_checkpoint!():this.#generalOwner().general_checkpoint!();return view.historyGrouping==="typing-v1"?this.#typingOwner().typing_checkpoint!():this.#live().checkpoint();}
 updateFrame():string{return this.#live().update_frame();}
 /** Separate read capability; neither method publishes, imports content or changes local UI. */
 supportsDocumentPresence():boolean{const raw=this.#live();return this.supportsDocumentSelection()&&raw.document_presence_version?.()==="1"&&typeof raw.document_presence_frame==="function"&&typeof raw.resolve_document_presence==="function";}
 supportsPresence():boolean{const raw=this.#live();return this.#selectionPolicy==="document-v1"?this.supportsDocumentPresence():typeof raw.presence_frame==="function"&&typeof raw.resolve_presence==="function";}
 presenceFrame():string{const raw=this.#live();if(!this.supportsPresence())throw new SharedEditorError("presence_unavailable","Use a Rust owner with the explicitly selected causal presence capability");return this.#selectionPolicy==="document-v1"?raw.document_presence_frame!(this.#observation):raw.presence_frame!(this.#observation);}
 resolvePresence(frame:string):SharedPresenceResolution<P>{const raw=this.#live();if(!this.supportsPresence())throw new SharedEditorError("presence_unavailable","Use a Rust owner with the explicitly selected causal presence capability");return JSON.parse(this.#selectionPolicy==="document-v1"?raw.resolve_document_presence!(frame):raw.resolve_presence!(frame)) as SharedPresenceResolution<P>;}
 supportsWriterTransport():boolean{const raw=this.#live();return typeof raw.writer_groups==="function"&&typeof raw.writer_clock==="function";}
 /** Explicit V2 reads never fall back to packing-dependent original digests. */
 supportsWriterTransportV2():boolean{const raw=this.#live();return typeof raw.writer_transport_v2_version==="function"&&raw.writer_transport_v2_version()==="2"&&typeof raw.writer_groups_v2==="function"&&typeof raw.writer_clock_v2==="function";}
 writerGroupsV2(after:string,revision?:string):SharedWriterGroupsV2{this.#check(revision);const raw=this.#live();if(!this.supportsWriterTransportV2())throw new SharedEditorError("writer_transport_v2_unavailable","Use matching native packing-independent writer transport");if(typeof after!=="string"||after.length>10)throw new SharedEditorError("writer_counter","Expected a bounded decimal author counter");return JSON.parse(raw.writer_groups_v2!(this.#observation,after)) as SharedWriterGroupsV2;}
 writerClockV2(writer:string):SharedWriterClock{const raw=this.#live();if(!this.supportsWriterTransportV2())throw new SharedEditorError("writer_transport_v2_unavailable","Use matching native packing-independent writer transport");if(typeof writer!=="string"||writer.length>20)throw new SharedEditorError("writer_identity","Expected a bounded decimal writer identity");return JSON.parse(raw.writer_clock_v2!(writer)) as SharedWriterClock;}
 writerGroups(after:string,revision?:string):SharedWriterGroups{this.#check(revision);const raw=this.#live();if(!raw.writer_groups)throw new SharedEditorError("writer_transport_unavailable","Use a Rust owner with single-writer transport support");if(typeof after!=="string"||after.length>10)throw new SharedEditorError("writer_counter","Expected a bounded decimal author counter");return JSON.parse(raw.writer_groups(this.#observation,after)) as SharedWriterGroups;}
 writerClock(writer:string):SharedWriterClock{const raw=this.#live();if(!raw.writer_clock)throw new SharedEditorError("writer_transport_unavailable","Use a Rust owner with single-writer transport support");if(typeof writer!=="string"||writer.length>20)throw new SharedEditorError("writer_identity","Expected a bounded decimal writer identity");return JSON.parse(raw.writer_clock(writer)) as SharedWriterClock;}
 subscribe(listener:(event:SharedPublication<P>)=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 /** Hold remote publication across input/composition/callback queues. Release is idempotent. */
 holdRemotes():()=>void{this.#live();if(this.#retired)throw new SharedEditorError("retired","The shared writer is retired for durable closure");if(this.#holds>=128)throw new SharedEditorError("hold_limit","Too many nested remote holds");this.#holds++;let held=true;return()=>{if(!held)return;held=false;this.#holds--;this.#flush();};}
 dispatch(request:SharedDispatch,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.dispatch(o,JSON.stringify(request)),revision);}
 select(selection:RichSelection|null,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.set_selection(o,JSON.stringify(selection)),revision,false);}
 setPendingFormats(formats:readonly FormatLiteral[]|null,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.set_pending_formats(o,JSON.stringify(formats)),revision);}
 type(text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.insert_plain_text(o,text),revision);}
 /** One LF in the current text selection; old ABI owners retain their identical plain-input path. */
 hardBreak(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.insert_hard_break?raw.insert_hard_break(o):raw.insert_plain_text(o,"\n"),revision);}
 replace(selection:Extract<RichSelection,{kind:"text"}>,text:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.replace_plain_text(o,JSON.stringify(selection),text),revision);}
 paste(fragment:string,target:PasteTarget,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.paste_clipboard_namespace(o,fragment,JSON.stringify(target),prefix),revision);}
 pasteAtText(fragment:string,right:string,prefix:string,revision?:string):boolean{return this.#run("local",(raw,o)=>raw.paste_flow_at_text_namespace(o,fragment,right,prefix),revision);}
 navigate(movement:Navigation,extend=false,revision?:string):NavigationResult{return this.#run("local",(raw,o)=>JSON.parse(raw.navigate_grid(o,movement,extend)) as NavigationResult,revision,false);}
 copy():ClipboardContent|null{const raw=this.#live();return JSON.parse(raw.copy_clipboard(this.#observation)) as ClipboardContent|null;}
 /** Explicit read capability, independent of range authoring policy and read-only state. */
 supportsGeneralCopy():boolean{const raw=this.#live();return typeof raw.general_copy_version==="function"&&raw.general_copy_version()==="1"&&typeof raw.copy_general_clipboard==="function";}
 copyGeneral():ClipboardContent|null{const raw=this.#live();if(!this.supportsGeneralCopy())throw new SharedEditorError("general_copy_unavailable","Use matching native general clipboard copy");return JSON.parse(raw.copy_general_clipboard!(this.#observation)) as ClipboardContent|null;}
 supportsClipboardInterchange():boolean{const raw=this.#live();return raw.clipboard_interchange_version?.()==="1"&&typeof raw.admit_clipboard_root==="function"&&typeof raw.validate_clipboard==="function";}
 admitClipboardRoot(kind:"text"|"flow"|"grid",rootJson:string):RichClipboardTransfer{const raw=this.#live();if(!this.supportsClipboardInterchange())throw new SharedEditorError("clipboard_interchange_unavailable","Use matching native clipboard interchange");return JSON.parse(raw.admit_clipboard_root!(kind,rootJson)) as RichClipboardTransfer;}
 validateClipboard(clipboardJson:string):RichClipboardTransfer{const raw=this.#live();if(!this.supportsClipboardInterchange())throw new SharedEditorError("clipboard_interchange_unavailable","Use matching native clipboard interchange");return JSON.parse(raw.validate_clipboard!(clipboardJson)) as RichClipboardTransfer;}
 supportsClipboardTextPolicy():boolean{const raw=this.#live();return typeof raw.clipboard_text_policy_version==="function"&&raw.clipboard_text_policy_version()==="1"&&typeof raw.project_clipboard_text==="function";}
 /** Pure native policy read; callers still submit its text with the same revision guard. */
 projectClipboardText(selection:Extract<RichSelection,{kind:"text"}>,clipboardJson:string,revision?:string):RichClipboardTextProjection|null{this.#check(revision);const raw=this.#live();if(!this.supportsClipboardTextPolicy())throw new SharedEditorError("clipboard_text_policy_unavailable","Use matching native clipboard text policy");return JSON.parse(raw.project_clipboard_text!(this.#observation,JSON.stringify({selection,clipboardJson}))) as RichClipboardTextProjection|null;}
 undo(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.undo_observed(o),revision);}
 redo(revision?:string):boolean{return this.#run("local",(raw,o)=>raw.redo_observed(o),revision);}
 /** Resolves only after Rust admission. A hold queues bytes, not a guessed document mutation. */
 receiveFrame(frame:string,options:SharedRemoteOptions={}):Promise<boolean>{
  this.#live();if(this.#retired)return Promise.reject(new SharedEditorError("retired","The shared writer is retired before remote admission"));if(typeof frame!=="string")return Promise.reject(new SharedEditorError("remote_type","A remote frame must be an exact JSON string"));const bytes=new TextEncoder().encode(frame).byteLength;
  if(options.signal?.aborted)return Promise.reject(new SharedEditorError("remote_cancelled","Queued remote publication was cancelled"));
  if(bytes>5*1024*1024||this.#queue.length>=this.#maxFrames||this.#bytes+bytes>this.#maxBytes)return Promise.reject(new SharedEditorError("remote_queue_full","Pending remote updates exceed their bounded queue"));
  return new Promise((resolve,reject)=>{
   const signal=options.signal,entry:Pending={frame,bytes,resolve,reject,cleanup:()=>signal?.removeEventListener("abort",cancel)};
   const cancel=()=>{const index=this.#queue.indexOf(entry);if(index<0)return;this.#queue.splice(index,1);this.#bytes-=bytes;entry.cleanup();reject(new SharedEditorError("remote_cancelled","Queued remote publication was cancelled"));};
   this.#queue.push(entry);this.#bytes+=bytes;signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)cancel();this.#flush();
  });
 }
 pendingRemote():Readonly<{frames:number;bytes:number}>{this.#live();return {frames:this.#queue.length,bytes:this.#bytes};}
 #flush():void{
  if(!this.#raw||this.#retired||this.#holds||this.#publishing||this.#draining)return;this.#draining=true;
   try{while(this.#raw&&!this.#retired&&!this.#holds&&this.#queue.length){const next=this.#queue.shift()!;this.#bytes-=next.bytes;next.cleanup();try{const before=this.#view;this.#run("remote",raw=>raw.receive_frame(next.frame),undefined,false);next.resolve(before!==this.#view);}catch(error){next.reject(error);this.#report(error);}}}
  finally{this.#draining=false;}
 }
 /** Permanent UI/transport retirement, not document read-only mode. Reads survive until explicit disposal. */
 retire():void{
  this.#live();if(this.#retired)return;this.#retired=true;
  const pending=this.#queue;this.#queue=[];this.#bytes=0;
  const error=new SharedEditorError("retired","The shared writer retired before queued remote admission");
  for(const entry of pending){entry.cleanup();entry.reject(error);}
 }
 dispose():void{if(!this.#raw)return;const raw=this.#raw;this.#raw=undefined;this.#listeners.clear();this.#reviewListeners.clear();for(const result of [...this.#searches])result.dispose();for(const plan of [...this.#versionPlans])plan.dispose();for(const preview of [...this.#suggestionPreviews])preview.dispose();for(const proof of [...this.#suggestionEffects])proof.dispose();const error=new SharedEditorError("disposed","The shared editor was disposed before remote admission");for(const entry of this.#queue){entry.cleanup();entry.reject(error);}this.#queue=[];this.#bytes=0;this.#observation?.free();this.#observation=undefined;raw.free();}
}
