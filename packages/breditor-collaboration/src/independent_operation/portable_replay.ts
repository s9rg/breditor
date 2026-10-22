/** A temporary exact read-only native replay. It never acquires an author lease or opens storage. */
import {SharedRichEditor,createSharedDocumentEditor} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {IndependentDeliveryCompanion} from '../independent_delivery/companion.js';
import {independentOptionsIdentity} from '../independent_history/identity.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {SharedEditorOptions,SharedSelectionPolicy,SharedRustOwner} from '../types.js';
import {operationJournalFailure as fail} from './journal_failure.js';
import {forwardProgress} from '../segmented_relay/validation.js';
const dispose=SharedRichEditor.prototype.dispose;
const verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
/** Every selected later state continues the previous two native lanes and local versions.
 * Retained queue rows may legitimately be stopped/forgotten; they are not resurrected here. */
export function verifyPortableContinuation(newer:Awaited<ReturnType<typeof replayPortableRecovery>>,later:SharedIndependentDeliveryRecovery,older:Awaited<ReturnType<typeof replayPortableRecovery>>,before:SharedIndependentDeliveryRecovery):void{
 older.check();newer.check();const verify=later.source.identity.documentHistory==='original'?verifyOriginal:verifySegmented;verify.call(newer.core,older.core);for(const packet of before.source.versions)if(!later.source.versions.includes(packet))throw fail('independent_operation_backup_continuation');forwardProgress(before.relay,later.relay);older.check();newer.check();
}
export async function replayPortableRecovery<P extends SharedSelectionPolicy>(options:SharedIndependentDeliveryOptions<P>,recovery:SharedIndependentDeliveryRecovery,check:()=>void){
 check();const id=recovery.source.identity;if(JSON.stringify(independentOptionsIdentity(options))!==JSON.stringify(id))throw fail('independent_operation_read_factory');const history=options.documentHistory,restore=history.kind==='original'?history.restoreOriginal:history.restoreSegmented,binding=nativeRestoreBinding(restore,history);let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
 try{
  raw=await binding.factory.call(binding.receiver,recovery.source.documentCheckpoint);check();initializeSharedReadOnly(raw,true);const owned=raw;raw=undefined;
  const editor={...options.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1' as const}:{})} as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
  core=(id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(owned,editor):new SharedRichEditor(owned,editor)) as SharedRichEditor<SharedSelectionPolicy>;
  if(core.richLanguageVersion()!==id.native.richLanguage)throw fail();if(id.native.history==='typing-v1'&&native.view.call(core).historyGrouping!=='typing-v1')core.enableTypingHistory();if(id.native.rangeEditing==='general-v1'&&native.view.call(core).rangeEditing!=='general-v1')core.enableGeneralRanges();
  const review={...options.review,access:'read_only' as const};if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(review,recovery.source.reviewCheckpoint);else core.enableReview(review,recovery.source.reviewCheckpoint);core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);
  const companion=new IndependentDeliveryCompanion(options,recovery);companion.admit(core);companion.releaseRecords();for(const packet of recovery.source.versions)native.readVersion.call(core,packet);
  const selected=core,live=()=>{check();if(native.view.call(selected).readOnly!==true||native.checkpointJson.call(selected)!==recovery.source.documentCheckpoint||(id.reviewHistory==='original'?native.reviewCheckpoint:native.reviewSegmentedCheckpoint).call(selected)!==recovery.source.reviewCheckpoint)throw fail('independent_operation_read_changed');check();};live();let closed=false;
  return Object.freeze({core:selected,check:()=>{if(closed)throw fail('independent_operation_read_closed');live();},dispose:()=>{if(closed)return;closed=true;dispose.call(selected);}});
 }catch(error){if(core)dispose.call(core);raw?.free();throw error;}
}
