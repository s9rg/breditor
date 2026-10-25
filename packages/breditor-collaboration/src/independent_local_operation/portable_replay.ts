/** Exact local-only native replay. No delivery companion, persistent store or
 * author lease is created, and a native history is never reconstructed from AST. */
import {SharedRichEditor,createSharedDocumentEditor} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {sourceCoreMethods as native} from '../source_native_read.js';
import {coreReadStamp} from '../core_read_stamp.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {checkIndependentRecords,independentRecords} from '../independent_source/records.js';
import {freezeGeneration} from '../generation_source/identity.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentParticipantSelection} from '../independent_participant/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedEditorOptions,SharedSelectionPolicy,SharedRustOwner} from '../types.js';
import {localJournalFailure as fail} from './journal_failure.js';
const dispose=SharedRichEditor.prototype.dispose,verifyOriginal=SharedRichEditor.prototype.verifyRecoveryOrigin,verifySegmented=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
export type LocalPortableReplay=Awaited<ReturnType<typeof replayLocalOperationRecovery>>;
/** Snapshot native strings, identity and executable factories before invoking
 * authority or awaiting the actual host factory. Returned owners stay read-only. */
export async function replayLocalOperationRecovery<P extends SharedSelectionPolicy>(selected:SharedIndependentParticipantSelection,factory:SharedIndependentRecoveryFactory<P>,provided:SharedIndependentHistoryRecovery,check:()=>void){
 const expected=independentParticipantSelection(selected),options=snapshotIndependentRecoveryFactory(expected,factory);
 if(!provided||typeof provided!=='object'||provided.format!=='breditor/shared-independent-history-recovery'||provided.formatVersion!==1||JSON.stringify(provided.identity)!==JSON.stringify(expected.identity.source))throw fail('independent_local_operation_read_factory');
 const rows=independentRecords(provided),recovery=freezeGeneration(await checkIndependentRecords(expected.identity.source,rows));check();
 const id=recovery.identity,history=options.documentHistory,restore=history.kind==='original'?history.restoreOriginal:history.restoreSegmented,binding=nativeRestoreBinding(restore,history);let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
 try{
  raw=await binding.factory.call(binding.receiver,recovery.documentCheckpoint);check();initializeSharedReadOnly(raw,true);
  const editor={...options.editor,...(id.native.searchHistory?{searchHistory:id.native.searchHistory}:{}),...(id.native.reviewedHistory?{reviewedHistory:id.native.reviewedHistory}:{}),...(id.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1' as const}:{})} as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
  core=(id.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,editor):new SharedRichEditor(raw,editor)) as SharedRichEditor<SharedSelectionPolicy>;
  if(core.richLanguageVersion()!==id.native.richLanguage)throw fail('independent_local_operation_read_factory');if(id.native.history==='typing-v1'&&native.view.call(core).historyGrouping!=='typing-v1')core.enableTypingHistory();if(id.native.rangeEditing==='general-v1'&&native.view.call(core).rangeEditing!=='general-v1')core.enableGeneralRanges();
  if(id.reviewHistory==='segmented-v1')core.enableSegmentedReview(options.review,recovery.reviewCheckpoint);else core.enableReview(options.review,recovery.reviewCheckpoint);core.sealIndependentHistoryPolicies(id.documentHistory,id.reviewHistory,id.native.history,id.native.rangeEditing);
  const versions=new Set<string>();for(const packet of recovery.versions){const info=native.readVersion.call(core,packet);if(versions.has(info.id))throw fail('independent_local_operation_versions');versions.add(info.id);}const owned=core;let closed=false;
  const verify=()=>{if(closed)throw fail('independent_local_operation_read_closed');if(native.view.call(owned).readOnly!==true||native.checkpointJson.call(owned)!==recovery.documentCheckpoint||(id.reviewHistory==='original'?native.reviewCheckpoint:native.reviewSegmentedCheckpoint).call(owned)!==recovery.reviewCheckpoint)throw fail('independent_local_operation_read_changed');};
  const live=()=>{if(closed)throw fail('independent_local_operation_read_closed');check();verify();check();verify();};
  live();const stamp=coreReadStamp(owned);
  /** SDK-private liveness of this already admitted, held readonly replica.
   * No checkpoint encoding or host authority callback. This is not byte
   * admission: full check() stays unchanged and must fence actual data reads,
   * lineage verification and publication. The kernel never exposes its anchor. */
  const current=()=>{if(closed)throw fail('independent_local_operation_read_closed');const actual=coreReadStamp(owned);if(actual.document!==stamp.document||actual.review!==stamp.review||native.view.call(owned).readOnly!==true)throw fail('independent_local_operation_read_changed');};
  current();return Object.freeze({core:owned,recovery,check:live,checkCurrent:current,dispose:()=>{if(closed)return;closed=true;dispose.call(owned);}});
 }catch(error){if(core)dispose.call(core);if(raw)freeUnclaimedSharedRustOwner(raw);throw error;}
}
/** Both histories and immutable local versions must continue the preceding cut.
 * Sharing an original ancestor alone does not establish this order. */
export function verifyLocalOperationContinuation(newer:LocalPortableReplay,older:LocalPortableReplay):void{
 older.check();newer.check();if(JSON.stringify(newer.recovery.identity)!==JSON.stringify(older.recovery.identity))throw fail('independent_local_operation_backup_continuation');
 const verify=newer.recovery.identity.documentHistory==='original'?verifyOriginal:verifySegmented;verify.call(newer.core,older.core);if(newer.recovery.versions.length<older.recovery.versions.length||older.recovery.versions.some((packet,index)=>newer.recovery.versions[index]!==packet))throw fail('independent_local_operation_backup_continuation');older.check();newer.check();verify.call(newer.core,older.core);
}
