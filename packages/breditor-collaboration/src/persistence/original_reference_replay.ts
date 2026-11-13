/** Exact read-only replay of source-owned original journals. Continuation is
 * checked between replicas in the selected read runtime, never against a writer
 * from another Wasm instance and never by comparing only the final AST. */
import {SharedRichEditor,SharedEditorError,createSharedDocumentEditor} from '../core.js';
import type {SharedRustOwner,SharedSelectionPolicy,SharedEditorOptions,SharedHistoryPolicy,SharedRangePolicy} from '../types.js';
import type {SharedReviewedHistoryIdentity} from '../reviewed_history_types.js';
import type {PersistentPairedRecord} from './paired_record_read.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {sourceCoreMethods as native,sourceNativeRecoveryRead} from '../source_native_read.js';
import {admitPairedVersions,checkPairedNativeProgress} from './review_record_admission.js';
export interface OriginalReferenceNativeState{
 readonly slot:'committed'|'pending'|'live';readonly checkpoint:string;
 readonly history:SharedHistoryPolicy;readonly rangeEditing:SharedRangePolicy;
 readonly selectionEditing:SharedSelectionPolicy;readonly richLanguage:1|2|3;
 readonly searchHistory:'search-v1'|null;readonly reviewedHistory:SharedReviewedHistoryIdentity|null;
 readonly paired:PersistentPairedRecord|null;
}
export type OriginalReferenceRestore=(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
export type OriginalReferenceEditor=Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'|'reviewedHistory'|'searchHistory'|'segmentedHistory'>;
const fail=(suffix:string)=>new SharedEditorError('original_record_reference_'+suffix,'Use exact source-owned original journal replay');
const dispose=SharedRichEditor.prototype.dispose,verifyOrigin=SharedRichEditor.prototype.verifyRecoveryOrigin;
export async function replayOriginalReferenceState(state:OriginalReferenceNativeState,binding:ReturnType<typeof nativeRestoreBinding<OriginalReferenceRestore>>,editor:OriginalReferenceEditor|undefined,descriptor:string|undefined,guard:()=>void){
 guard();let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
 try{
  raw=await binding.factory.call(binding.receiver,state.checkpoint);guard();initializeSharedReadOnly(raw,true);
  const options={...editor,...(state.searchHistory?{searchHistory:state.searchHistory}:{}),...(state.reviewedHistory?{reviewedHistory:state.reviewedHistory}:{})};
  core=(state.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,options):new SharedRichEditor(raw,options)) as SharedRichEditor<SharedSelectionPolicy>;
  if(descriptor!==undefined&&JSON.stringify(sourceNativeRecoveryRead(core).descriptor())!==descriptor||
     core.richLanguageVersion()!==state.richLanguage)throw fail('factory');
  if(state.history==='typing-v1'&&native.view.call(core).historyGrouping!=='typing-v1')core.enableTypingHistory();
  if(state.rangeEditing==='general-v1'&&native.view.call(core).rangeEditing!=='general-v1')core.enableGeneralRanges();
  if(state.paired){const p=state.paired;core.enableReview({actor:p.reviewActor,principal:p.principal,access:'read_only'},p.reviewCheckpointJson);core.sealReviewPolicies(state.history,state.rangeEditing);admitPairedVersions(core,p.versions);if('relay'in p&&p.relay&&p.progress)checkPairedNativeProgress(core,p.relay,p.principal,p.progress);}
  else{core.sealHistoryPolicy(state.history);core.sealRangePolicy(state.rangeEditing);}
  const selected=core;let closed=false;
  const check=()=>{if(closed)throw fail('closed');guard();if(native.view.call(selected).readOnly!==true||native.checkpointJson.call(selected)!==state.checkpoint||(state.paired&&native.reviewCheckpoint.call(selected)!==state.paired.reviewCheckpointJson))throw fail('replay');guard();};
  check();return{core:selected,state,check,dispose(){if(closed)return;closed=true;dispose.call(selected);}};
 }catch(error){if(core)dispose.call(core);if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}
}
export type OriginalReferenceReplay=Awaited<ReturnType<typeof replayOriginalReferenceState>>;
export function verifyOriginalReferenceContinuation(next:OriginalReferenceReplay,previous:OriginalReferenceReplay):void{
 next.check();previous.check();verifyOrigin.call(next.core,previous.core);
 if(previous.state.paired?.versions.some((packet,i)=>next.state.paired?.versions[i]!==packet))throw fail('continuation');
 next.check();previous.check();
}
