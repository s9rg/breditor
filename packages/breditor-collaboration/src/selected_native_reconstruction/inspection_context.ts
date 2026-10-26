/** One genuine selected-cohort DATA preflight shared by explicit per-family
 * reconstruction adapters. All native clients and whole selected uploads are
 * compared against one complete actual before-cut. This is not a retirement,
 * mutable-source handoff, source ACK or authenticated room activation.
 *
 * Per-family packet/journal rules remain with that adapter. A point-in-time
 * inspection must be freshly revalidated by any later reconstruction operation.
 */
import {withSelectedNativeRecovery,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,identifier,fail} from './policy.js';
import {NativeReconstructionFactoryScope} from './factory_scope.js';
import {NativeReconstructionWaits} from './read_waits.js';
export type NativeReconstructionInspectionOptions=Readonly<{id:string;retained:SelectedRoomCurrentFile;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>;
interface Context{readonly id:string;readonly before:Loaded;readonly retained:Loaded;readonly read:PhysicalOperationV3HistoryReadOptions['reads'][number]['read'];readonly descriptor:string;readonly assets:SharedAssetBytesOptions|undefined;readonly resolveAsset:SharedAssetBytesResolver|undefined;check():void}
const file=Loaded.prototype.file,cut=Loaded.prototype.nativeCut,approval=Loaded.prototype.approval,upload=Loaded.prototype.selectedUploads,dispose=Loaded.prototype.dispose,read=Loaded.read;
export function inspectNativeReconstructionData<P extends SharedSelectionPolicy,F extends string,R>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions,family:RecordPayloadFamily|readonly RecordPayloadFamily[],format:F,visit:(context:Context)=>Promise<R>){
 const chosen=snapshotPhysicalHistoryReadOptions(provided),raw=fields(options,['id','retained'],['assets','resolveAsset']),id=identifier(raw['id']),input=fields(raw['retained'],['selection','file']),retained={selection:selectedRoomCurrentSelection(input['selection']),file:archiveBlob(input['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)},assetOptions=raw['assets']===undefined?undefined:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,assets=assetOptions===undefined?undefined:{limits:checkRichAssetLimits(assetOptions.limits),...(assetOptions.signal?{signal:assetOptions.signal}:{})},resolveAsset=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 if(resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('native_reconstruction_policy');
 // Combine cancellation only, before capture. The genuine owner below still
 // supplies all custody, current-source and permission checks.
 const factories=new NativeReconstructionFactoryScope(chosen.reads),cancellation=new NativeReconstructionWaits(()=>{},[chosen.signal,assets?.signal]),scoped={...chosen,signal:cancellation.signal,reads:factories.reads};
 try{return withSelectedNativeRecovery(owner,scoped,async scope=>{
  factories.bind(scope);
  let before:Loaded|undefined,after:Loaded|undefined;
  try{
   const actual=await scope.retainCurrent();scope.check();before=await read.call(Loaded,actual.current,actual.integrity);after=await read.call(Loaded,retained,actual.integrity);scope.check();
   const a=approval.call(before),b=approval.call(after);if(JSON.stringify(a.selection)!==JSON.stringify(b.selection)||JSON.stringify(a.choice)!==JSON.stringify(b.choice))throw fail();
   const entry=after.participant(id),member=scope.clients.find(row=>row.id===id),factory=chosen.reads.find(row=>row.id===id),allowed=typeof family==='string'?[family]:family;if(!allowed.includes(entry.family)||member?.family!==entry.family||!factory)throw fail('native_reconstruction_policy');
   await verifySelectedRoomNativeContinuation(cut.call(before),cut.call(after),scoped,scope.clients,scope.check);
   for(const row of a.choice.adoption.participants){await verifySelectedUploadContinuation(upload.call(before,row.id),upload.call(after,row.id),row.limits,scope.check,scope.signal);scope.check();}
   const recipe=await visit({id,before,retained:after,read:factory.read,descriptor:JSON.stringify(sourceNativeRecoveryRead(member.core).descriptor()),assets,resolveAsset,check:scope.check});scope.check();
   return Object.freeze({format,formatVersion:1 as const,scope:'held-current-versus-retained-data-only' as const,before:file.call(before),retained:file.call(after),recipe});
  }finally{if(after)dispose.call(after);if(before)dispose.call(before);}
 }).finally(()=>{try{factories.close();}finally{cancellation.close();}});}catch(error){try{factories.close();}finally{cancellation.close();}throw error;}
}
