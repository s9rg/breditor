import {SharedRichEditor,createSharedDocumentEditor,SharedEditorError} from "../core.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import {nativeRestoreBinding} from "../native_restore_factory.js";
import type {SharedEditorOptions,SharedRustOwner,SharedSelectionPolicy} from "../types.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
import type {PreparedRecovery} from "../participant_recovery/prepare.js";
import {captureRecordedAssetReferences,type SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {participantReplayReaders} from "../participant_replay/record_readers.js";
const key=Object.freeze({}),states=new WeakMap<ParticipantOrigin,{core:SharedRichEditor<SharedSelectionPolicy>;document:string;review:string|undefined;guard:()=>void}>();
const unavailable=()=>new SharedEditorError("recovery_origin","The selected native recovery origin is unavailable or changed");

/** Internal opaque readonly native replay of the independently selected original file. */
export class ParticipantOrigin {
 private constructor(token:object,core:SharedRichEditor<SharedSelectionPolicy>,document:string,review:string|undefined,guard:()=>void){if(token!==key)throw unavailable();states.set(this,{core,document,review,guard});Object.freeze(this);}
 static async read(p:PreparedRecovery<SharedSelectionPolicy>):Promise<ParticipantOrigin>{
  p.guard();const source=p.expected.identity.source,chosen=p.session,o=chosen.options as unknown as Record<string,unknown>,document=p.records.get("document");if(document===undefined)throw unavailable();
  const policy=Object.freeze({history:source.history,rangeEditing:source.rangeEditing,selectionEditing:source.selectionEditing,richLanguage:source.richLanguage});
  let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
  try{
   const factory=chosen.kind==="document-selection"?o["restoreDocument"]:chosen.kind==="search-document"||chosen.kind==="search-paired"?o["restoreSearch"]:chosen.kind==="reviewed-paired"?o["restoreReviewed"]:o["restore"];
   if(typeof factory!=="function")throw unavailable();
   const binding=nativeRestoreBinding(factory,o);
   raw=await(binding.factory as (...args:unknown[])=>SharedRustOwner|Promise<SharedRustOwner>).call(binding.receiver,document,...(chosen.kind.includes("paired")?[policy]:chosen.kind==="document-selection"?[source.history]:chosen.kind==="search-document"?[]:[source.history,source.rangeEditing]));
   p.guard();initializeSharedReadOnly(raw,true);
   const editor:SharedEditorOptions<"original">={...(o["editor"] as SharedEditorOptions<"original">|undefined),...(o["reviewedHistory"]?{reviewedHistory:o["reviewedHistory"] as SharedReviewedHistoryIdentity}:{}),...(source.searchHistory?{searchHistory:"search-v1" as const}:{})};
   const owned=raw;raw=undefined;
   core=(source.selectionEditing==="document-v1"?createSharedDocumentEditor(owned,editor):new SharedRichEditor(owned,editor)) as SharedRichEditor<SharedSelectionPolicy>;
   if(source.history==="typing-v1")core.enableTypingHistory();
   if(source.rangeEditing==="general-v1")core.enableGeneralRanges();
   let review:string|undefined;
   if(chosen.kind.includes("paired")){
    const record=JSON.parse(p.records.get("paired-session")!);review=record.reviewCheckpointJson as string;
    core.enableReview({...o["review"] as {actor:string;principal:string;access:"read_only"},access:"read_only"},review);core.sealReviewPolicies(source.history,source.rangeEditing);
   }else{core.sealHistoryPolicy(source.history);core.sealRangePolicy(source.rangeEditing);}
   if(!core.supportsRecoveryOrigin()||core.view().readOnly!==true||core.checkpointJson()!==document||review!==undefined&&core.reviewCheckpoint()!==review)throw unavailable();
   p.guard();return new ParticipantOrigin(key,core,document,review,p.guard);
  }catch(error){core?.dispose();raw?.free();throw error;}
 }
 /** A live native origin, not a caller-supplied predicate or stored readiness DTO. */
 verify(current:SharedRichEditor<SharedSelectionPolicy>):void {
  if(!states.has(this))throw unavailable();
  const s=this.#live();
  SharedRichEditor.prototype.verifyRecoveryOrigin.call(current,s.core);this.#live();
  // Authority callbacks above may retire either owner. The final comparison has no callback gap.
  SharedRichEditor.prototype.verifyRecoveryOrigin.call(current,s.core);
 }
 #live(){const s=states.get(this);if(!s)throw unavailable();s.guard();if(states.get(this)!==s||s.core.view().readOnly!==true||s.core.checkpointJson()!==s.document||s.review!==undefined&&s.core.reviewCheckpoint()!==s.review)throw unavailable();return s;}
 /** Internal immutable archive replay with the same queue/receipt rules as live persistence. */
 capture(p:PreparedRecovery<SharedSelectionPolicy>):SharedAssetReferenceCapture{
  if(!states.has(this))throw unavailable();
  const s=this.#live(),readers=participantReplayReaders(p,s.core);return captureRecordedAssetReferences(s.core,readers,()=>{this.#live();p.guard();this.#live();});
 }
 dispose():void{const s=states.get(this);if(!s)return;states.delete(this);s.core.dispose();}
}
