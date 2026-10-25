/** SDK-private native ancestry proof for two COMPLETE admitted cuts. Replays
 * both sides through the SAME explicitly selected read factories, then uses
 * actual native document/comment continuity. AST equality is never a fallback.
 *
 * This proves native order and immutable local-version/relay progress; it does
 * not manufacture source custody, availability of every retained packet,
 * permission, a mutable native owner or authenticated room activation. */
import {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {nativeRestoreBinding} from '../native_restore_factory.js';
import {originalReferenceNativeStates,type OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {OriginalNativeRecords} from '../persistence/original_record_read.js';
import type {PersistentPairedMetadata} from '../persistence/paired_record_read.js';
import {replayOriginalReferenceState,verifyOriginalReferenceContinuation} from '../persistence/original_reference_replay.js';
import {generationIdentity} from '../generation_source/identity.js';
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord} from '../generation_source/contract.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import {replayGenerationReferenceRecords} from '../generation_source/record_reference_capture.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation} from '../independent_local_operation/portable_replay.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {replayPortableRecovery,verifyPortableContinuation} from '../independent_operation/portable_replay.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {forwardProgress} from '../segmented_relay/validation.js';
import type {SharedSegmentedRelayRecovery} from '../segmented_relay/contract.js';
import {fail} from './manifest.js';
const readRoot=PhysicalRoomRecordCutArchive.prototype.root,records=PhysicalRoomRecordCutArchive.prototype.records,verifyGeneration=SharedRichEditor.prototype.verifySegmentedRecoveryOrigin;
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail('selected_current_policy');return value as Record<string,unknown>;};
export async function verifySelectedRoomNativeContinuation<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[],guard:()=>void):Promise<void>{
 const chosen=snapshotPhysicalHistoryReadOptions(provided),oldRoot=readRoot.call(before),root=readRoot.call(after);if(JSON.stringify(oldRoot)!==JSON.stringify(root)||chosen.reads.length!==root.participants.length||clients.length!==root.participants.length||new Set(clients.map(row=>row.id)).size!==clients.length)throw fail();
 const catalog=parsePhysicalCatalogV3Manifest(root.source.manifest),check=()=>{guard();chosen.checkAuthority();guard();};check();
 for(const row of root.participants){
  const selected=chosen.reads.find(value=>value.id===row.id),client=clients.find(value=>value.id===row.id),entry=catalog.participants.find(value=>value.id===row.id);if(!selected||!client||client.family!==row.family||!entry||entry.family!==row.family)throw fail();
  const older=await records.call(before,row.id),newer=await records.call(after,row.id);check();const left=object(object(older)['source']),right=object(object(newer)['source']),descriptor=JSON.stringify(sourceNativeRecoveryRead(client.core).descriptor());
  if(row.family==='original'){
   const options=selected.read as Omit<OriginalRecordReferenceOptions<P>,'source'|'checkAuthority'>,binding=nativeRestoreBinding(options.restore,options),a=originalReferenceNativeStates(left['native'] as OriginalNativeRecords|PersistentPairedMetadata).find(state=>state.slot==='live'),b=originalReferenceNativeStates(right['native'] as OriginalNativeRecords|PersistentPairedMetadata).find(state=>state.slot==='live');if(!a||!b)throw fail();
   const previous=await replayOriginalReferenceState(a,binding,options.editor,descriptor,check);try{const next=await replayOriginalReferenceState(b,binding,options.editor,descriptor,check);try{verifyOriginalReferenceContinuation(next,previous);check();}finally{next.dispose();}}finally{previous.dispose();}
  }else if(row.family==='generation'){
   const options=selected.read as Omit<GenerationRecordReferenceOptions<P>,'source'|'checkAuthority'>,identity=generationIdentity(left['identity'] as SharedGenerationSourceIdentity);if(JSON.stringify(identity)!==JSON.stringify(generationIdentity(right['identity'] as SharedGenerationSourceIdentity)))throw fail();const binding=nativeRestoreBinding(options.restoreSegmented,options),previous=await replayGenerationReferenceRecords(identity,recordLiveBasis(row.family,older) as readonly SharedGenerationSourceRecord[],binding,options.editor,descriptor,check);
   try{const next=await replayGenerationReferenceRecords(identity,recordLiveBasis(row.family,newer) as readonly SharedGenerationSourceRecord[],binding,options.editor,descriptor,check);try{previous.check();next.check();verifyGeneration.call(next.core,previous.core);if(previous.source.versions.some((packet,i)=>next.source.versions[i]!==packet))throw fail();if(identity.kind!=='local')forwardProgress((previous.recovery as SharedSegmentedRelayRecovery).relay,(next.recovery as SharedSegmentedRelayRecovery).relay);previous.check();next.check();check();}finally{next.dispose();}}finally{previous.dispose();}
  }else if(row.family==='independent-local'||row.family==='local-operation-snapshot'||row.family==='local-operation-flat'){
   if(entry.family!=='independent-local'&&entry.family!=='local-operation-snapshot'&&entry.family!=='local-operation-flat')throw fail();const expected=entry.family==='independent-local'?entry.selection:entry.selection.original,options=selected.read as Readonly<{session:SharedIndependentRecoveryFactory<P>}>,a=recordLiveBasis(row.family,older) as SharedIndependentHistoryRecovery,b=recordLiveBasis(row.family,newer) as SharedIndependentHistoryRecovery,previous=await replayLocalOperationRecovery(expected,options.session,a,check);
   try{const next=await replayLocalOperationRecovery(expected,options.session,b,check);try{verifyLocalOperationContinuation(next,previous);check();}finally{next.dispose();}}finally{previous.dispose();}
  }else{
   const options=selected.read as Readonly<{session:SharedIndependentDeliveryOptions<P>}>,a=recordLiveBasis(row.family,older) as SharedIndependentDeliveryRecovery,b=recordLiveBasis(row.family,newer) as SharedIndependentDeliveryRecovery,previous=await replayPortableRecovery(options.session,a,check);
   try{const next=await replayPortableRecovery(options.session,b,check);try{verifyPortableContinuation(next,b,previous,a);check();}finally{next.dispose();}}finally{previous.dispose();}
  }
  check();
 }
 check();
}
