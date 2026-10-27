/** Obtain ABI descriptors from actual fresh readonly native replay. Neither
 * the descriptor nor the temporary core acquires a source or author lease. */
import {SharedRichEditor,createSharedDocumentEditor} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {originalReferenceNativeStates} from '../persistence/original_record_reference_capture.js';
import type {OriginalNativeRecords} from '../persistence/original_record_read.js';
import type {PersistentPairedMetadata} from '../persistence/paired_record_read.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {replayLocalOperationRecovery} from '../independent_local_operation/portable_replay.js';
import {replayPortableRecovery} from '../independent_operation/portable_replay.js';
import type {SharedRustOwner,SharedSelectionPolicy} from '../types.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import type {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {RoomExecutionReadScope} from './read_scope.js';
import {fail} from './policy.js';
const dispose=SharedRichEditor.prototype.dispose;
export async function executionNativeDescriptors(source:Loaded,scope:RoomExecutionReadScope):Promise<ReadonlyMap<string,string>>{
 const result=new Map<string,string>();
 for(const entry of source.catalog().participants){scope.check();const chosen=scope.reads.find(row=>row.id===entry.id);if(!chosen)throw fail('room_execution_policy');const record=await source.records(entry.id),value=recordLiveBasis(entry.family,record);scope.check();
  if(entry.family==='original'||entry.family==='generation'){
   const rows=value as readonly {kind:string;json:string}[],checkpoint=rows.find(row=>row.kind==='document')?.json;if(typeof checkpoint!=='string')throw fail();
   const read=chosen.read as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>&Pick<GenerationRecordReferenceOptions,'restoreSegmented'>,restore=entry.family==='original'?read.restore:read.restoreSegmented,binding=nativeRestoreBinding(restore,read),selection=entry.family==='original'?entry.selection.identity.source.selectionEditing:entry.selection.identity.source.native.selectionEditing;let raw:SharedRustOwner|undefined,core:SharedRichEditor<SharedSelectionPolicy>|undefined;
   const features=entry.family==='generation'?entry.selection.identity.source.native:originalReferenceNativeStates((record as {source:{native:OriginalNativeRecords|PersistentPairedMetadata}}).source.native).find(row=>row.slot==='live')!;if(!features)throw fail();const editor={...read.editor,...(features.searchHistory?{searchHistory:features.searchHistory}:{}),...(features.reviewedHistory?{reviewedHistory:features.reviewedHistory}:{}),...(entry.family==='generation'?{segmentedHistory:'segmented-v1' as const}:{})};
   try{raw=await binding.factory.call(binding.receiver,checkpoint);scope.check();initializeSharedReadOnly(raw,true);core=(selection==='document-v1'?createSharedDocumentEditor(raw,editor):new SharedRichEditor(raw,editor)) as SharedRichEditor<SharedSelectionPolicy>;scope.check();result.set(entry.id,JSON.stringify(sourceNativeRecoveryRead(core).descriptor()));}finally{if(core)dispose.call(core);if(raw)freeUnclaimedSharedRustOwner(raw);}
  }else if(entry.family==='independent-local'||entry.family==='local-operation-snapshot'||entry.family==='local-operation-flat'){
   const expected=entry.family==='independent-local'?entry.selection:entry.selection.original,read=chosen.read as Readonly<{session:SharedIndependentRecoveryFactory}>,replica=await replayLocalOperationRecovery(expected,read.session,value as SharedIndependentHistoryRecovery,scope.check);try{replica.check();result.set(entry.id,JSON.stringify(sourceNativeRecoveryRead(replica.core).descriptor()));scope.check();}finally{replica.dispose();}
  }else{const read=chosen.read as Readonly<{session:SharedIndependentDeliveryOptions}>,replica=await replayPortableRecovery(read.session,value as SharedIndependentDeliveryRecovery,scope.check);try{replica.check();result.set(entry.id,JSON.stringify(sourceNativeRecoveryRead(replica.core).descriptor()));scope.check();}finally{replica.dispose();}}
 }
 scope.check();return result;
}
