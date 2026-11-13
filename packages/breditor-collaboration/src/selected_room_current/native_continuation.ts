/** SDK-private native ancestry proof for two COMPLETE admitted cuts. Replays
 * both sides through the SAME explicitly selected read factories, then uses
 * actual native document/comment continuity. AST equality is never a fallback.
 *
 * This proves native order and immutable local-version/relay progress; it does
 * not manufacture source custody, availability of every retained packet,
 * permission, a mutable native owner or authenticated room activation. */
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
import{verifyOriginalReferenceBranchCoverage}from'../persistence/original_reference_branch.js';
import{verifyLocalOperationBranchCoverage}from'../independent_local_operation/portable_branch.js';
import{verifyPortableBranchCoverage}from'../independent_operation/portable_branch.js';
import {generationIdentity} from '../generation_source/identity.js';
import type {SharedGenerationSourceIdentity,SharedGenerationSourceRecord} from '../generation_source/contract.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import {replayGenerationReferenceRecords} from '../generation_source/record_reference_capture.js';
import {replayLocalOperationRecovery,verifyLocalOperationContinuation} from '../independent_local_operation/portable_replay.js';
import type {SharedIndependentHistoryRecovery} from '../independent_history/contract.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {replayPortableRecovery,verifyPortableContinuation} from '../independent_operation/portable_replay.js';
import type {SharedIndependentDeliveryOptions,SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {verifyGenerationReferenceContinuation} from '../generation_source/reference_continuation.js';
import {fail} from './manifest.js';
const readRoot=PhysicalRoomRecordCutArchive.prototype.root,records=PhysicalRoomRecordCutArchive.prototype.records;
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail('selected_current_policy');return value as Record<string,unknown>;};
/** Existing live-source route still obtains its descriptor from the genuine
 * managed native core. No DATA descriptor becomes writer custody. */
export async function verifySelectedRoomNativeContinuation<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[],guard:()=>void):Promise<void>{
 const root=readRoot.call(after);if(clients.length!==root.participants.length||new Set(clients.map(row=>row.id)).size!==clients.length||root.participants.some(row=>!clients.some(client=>client.id===row.id&&client.family===row.family)))throw fail();
 return verifyContinuation(before,after,provided,id=>JSON.stringify(sourceNativeRecoveryRead(clients.find(client=>client.id===id)!.core).descriptor()),guard);
}
/** SDK-private DATA-only route. Descriptors must come from actual independent
 * readonly replay in the caller's bounded read scope, not archive headers.
 * This proves ancestry; it grants no source, native actor or storage custody. */
export async function verifySelectedRoomNativeDataContinuation<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,descriptors:ReadonlyMap<string,string>,guard:()=>void):Promise<void>{
 const root=readRoot.call(after);if(descriptors.size!==root.participants.length||root.participants.some(row=>typeof descriptors.get(row.id)!=='string'))throw fail();return verifyContinuation(before,after,provided,id=>descriptors.get(id)!,guard);
}
/** Separate native-only branch coverage for COMPLETE admitted record cuts.
 * Both lanes are checked; local versions and delivery progress keep their old
 * laws. This proves neither full packet/upload union nor serving authority.
 * The ordinary exact-continuation entry points below keep their old defaults. */
export async function verifySelectedRoomNativeBranchCoverage<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,clients:readonly RetainedNativeClient[],guard:()=>void):Promise<void>{
 const root=readRoot.call(after),members=clients.map(row=>Object.freeze({id:row.id,family:row.family,core:row.core}));if(members.length!==root.participants.length||new Set(members.map(row=>row.id)).size!==members.length||root.participants.some(row=>!members.some(client=>client.id===row.id&&client.family===row.family)))throw fail();
 const descriptors=new Map(members.map(row=>[row.id,JSON.stringify(sourceNativeRecoveryRead(row.core).descriptor())]));return verifyContinuation(before,after,provided,id=>descriptors.get(id)!,guard,'compatible');
}
/** DATA-only counterpart. Exact independent readonly replays must supply the
 * descriptors; a native-coverage result is not a mutable room or actor grant. */
export async function verifySelectedRoomNativeDataBranchCoverage<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,descriptors:ReadonlyMap<string,string>,guard:()=>void):Promise<void>{
 const root=readRoot.call(after),selected=new Map(descriptors);if(selected.size!==root.participants.length||root.participants.some(row=>typeof selected.get(row.id)!=='string'))throw fail();return verifyContinuation(before,after,provided,id=>selected.get(id)!,guard,'compatible');
}
async function verifyContinuation<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,descriptorFor:(id:string)=>string,guard:()=>void,mode:'exact'|'compatible'='exact',only?:string):Promise<void>{
 const chosen=snapshotPhysicalHistoryReadOptions(provided),oldRoot=readRoot.call(before),root=readRoot.call(after);if(JSON.stringify(oldRoot)!==JSON.stringify(root)||chosen.reads.length!==root.participants.length)throw fail();
 if(only!==undefined&&!root.participants.some(row=>row.id===only))throw fail();
 const catalog=parsePhysicalCatalogV3Manifest(root.source.manifest),check=()=>{guard();chosen.checkAuthority();guard();};check();
 for(const row of root.participants){
  if(only!==undefined&&row.id!==only)continue;
  const selected=chosen.reads.find(value=>value.id===row.id),entry=catalog.participants.find(value=>value.id===row.id);if(!selected||!entry||entry.family!==row.family)throw fail();
  const older=await records.call(before,row.id),newer=await records.call(after,row.id);check();const left=object(object(older)['source']),right=object(object(newer)['source']),descriptor=descriptorFor(row.id);
  if(row.family==='original'){
   const options=selected.read as Omit<OriginalRecordReferenceOptions<P>,'source'|'checkAuthority'>,binding=nativeRestoreBinding(options.restore,options),a=originalReferenceNativeStates(left['native'] as OriginalNativeRecords|PersistentPairedMetadata).find(state=>state.slot==='live'),b=originalReferenceNativeStates(right['native'] as OriginalNativeRecords|PersistentPairedMetadata).find(state=>state.slot==='live');if(!a||!b)throw fail();
   const previous=await replayOriginalReferenceState(a,binding,options.editor,descriptor,check);try{const next=await replayOriginalReferenceState(b,binding,options.editor,descriptor,check);try{(mode==='exact'?verifyOriginalReferenceContinuation:verifyOriginalReferenceBranchCoverage)(next,previous);check();}finally{next.dispose();}}finally{previous.dispose();}
  }else if(row.family==='generation'){
   const options=selected.read as Omit<GenerationRecordReferenceOptions<P>,'source'|'checkAuthority'>;
   const identity=generationIdentity(left['identity'] as SharedGenerationSourceIdentity);
   if(JSON.stringify(identity)!==JSON.stringify(generationIdentity(right['identity'] as SharedGenerationSourceIdentity)))throw fail();
   const binding=nativeRestoreBinding(options.restoreSegmented,options);
   const restore=options.restoreContinued&&nativeRestoreBinding(options.restoreContinued,options);
   const restoreContinued=restore&&((checkpoint:string)=>restore.factory.call(restore.receiver,checkpoint));
   const previous=await replayGenerationReferenceRecords(identity,recordLiveBasis(row.family,older) as readonly SharedGenerationSourceRecord[],
    binding,options.editor,descriptor,check,restoreContinued);
   try{
    const next=await replayGenerationReferenceRecords(identity,recordLiveBasis(row.family,newer) as readonly SharedGenerationSourceRecord[],
     binding,options.editor,descriptor,check,restoreContinued);
    try{verifyGenerationReferenceContinuation(identity,previous,next,()=>fail(),mode);check();}
    finally{next.dispose();}
   }finally{previous.dispose();}
  }else if(row.family==='independent-local'||row.family==='local-operation-snapshot'||row.family==='local-operation-flat'){
   if(entry.family!=='independent-local'&&entry.family!=='local-operation-snapshot'&&entry.family!=='local-operation-flat')throw fail();const expected=entry.family==='independent-local'?entry.selection:entry.selection.original,options=selected.read as Readonly<{session:SharedIndependentRecoveryFactory<P>}>,a=recordLiveBasis(row.family,older) as SharedIndependentHistoryRecovery,b=recordLiveBasis(row.family,newer) as SharedIndependentHistoryRecovery,previous=await replayLocalOperationRecovery(expected,options.session,a,check);
   try{const next=await replayLocalOperationRecovery(expected,options.session,b,check);try{(mode==='exact'?verifyLocalOperationContinuation:verifyLocalOperationBranchCoverage)(next,previous);check();}finally{next.dispose();}}finally{previous.dispose();}
  }else{
   const options=selected.read as Readonly<{session:SharedIndependentDeliveryOptions<P>}>,a=recordLiveBasis(row.family,older) as SharedIndependentDeliveryRecovery,b=recordLiveBasis(row.family,newer) as SharedIndependentDeliveryRecovery,previous=await replayPortableRecovery(options.session,a,check);
   try{const next=await replayPortableRecovery(options.session,b,check);try{(mode==='exact'?verifyPortableContinuation:verifyPortableBranchCoverage)(next,b,previous,a);check();}finally{next.dispose();}}finally{previous.dispose();}
  }
  check();
 }
 check();
}

/** SDK-private exact per-member proof for a closed mixed-mode coordinator. It
 * does NOT certify omitted members; all ordinary complete-room entry points
 * above still compare every row with their unchanged strict defaults. */
export function verifySelectedRoomNativeParticipantContinuation<P extends SharedSelectionPolicy>(before:PhysicalRoomRecordCutArchive,after:PhysicalRoomRecordCutArchive,provided:PhysicalOperationV3HistoryReadOptions<P>,id:string,descriptor:string,guard:()=>void):Promise<void>{if(typeof id!=='string'||typeof descriptor!=='string')throw fail();return verifyContinuation(before,after,provided,()=>descriptor,guard,'exact',id);}
