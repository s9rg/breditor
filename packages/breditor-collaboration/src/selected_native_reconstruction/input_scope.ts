/** One genuine selected-cohort DATA preflight shared by explicit per-family
 * reconstruction adapters. All native clients and whole selected uploads are
 * compared against one complete actual before-cut. This is not a retirement,
 * mutable-source handoff, source ACK or authenticated room activation.
 *
 * Per-family packet/journal rules remain with that adapter. A point-in-time
 * inspection must be freshly revalidated by any later reconstruction operation.
 */
import {withSelectedNativeRecovery,withSelectedNativeRetirement,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {verifySelectedRoomNativeContinuation} from '../selected_room_current/native_continuation.js';
import {verifySelectedUploadContinuation} from '../physical_room_asset_successor/asset_continuation.js';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
import {NativeReconstructionFactoryScope} from './factory_scope.js';
import {NativeReconstructionWaits} from './read_waits.js';
export type NativeReconstructionInputOptions=Readonly<{retained:SelectedRoomCurrentFile;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>;
export interface NativeReconstructionInputs{readonly before:Loaded;readonly retained:Loaded;readonly reads:PhysicalOperationV3HistoryReadOptions['reads'];readonly nativeReads:PhysicalOperationV3HistoryReadOptions['reads'];readonly clients:SelectedNativeRecoveryScope['clients'];readonly assets:SharedAssetBytesOptions|undefined;readonly resolveAsset:SharedAssetBytesResolver|undefined;readonly integrity:SharedArchiveIntegrityOptions;check():void;captureCurrent():ReturnType<SelectedNativeRecoveryScope['retainCurrent']>}
export interface ExpectedReconstructionMember{readonly id:string;readonly families:readonly RecordPayloadFamily[]}
const cut=Loaded.prototype.nativeCut,approval=Loaded.prototype.approval,upload=Loaded.prototype.selectedUploads,dispose=Loaded.prototype.dispose,read=Loaded.read;
/** One held complete cohort. Expectations are private routing data, not source
 * owners. Native and whole-upload comparison run once before the visitor. */
function runInputs<P extends SharedSelectionPolicy,R>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInputOptions,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>,retire:boolean){
 const chosen=snapshotPhysicalHistoryReadOptions(provided),raw=fields(options,['retained'],['assets','resolveAsset']),input=fields(raw['retained'],['selection','file']),retained={selection:selectedRoomCurrentSelection(input['selection']),file:archiveBlob(input['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)},assetOptions=raw['assets']===undefined?undefined:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,assets=assetOptions===undefined?undefined:{limits:checkRichAssetLimits(assetOptions.limits),...(assetOptions.signal?{signal:assetOptions.signal}:{})},resolveAsset=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 if(resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('native_reconstruction_policy');
 const factories=new NativeReconstructionFactoryScope(chosen.reads),cancellation=new NativeReconstructionWaits(()=>{},[chosen.signal,assets?.signal]),scoped={...chosen,signal:cancellation.signal,reads:factories.reads};
 const borrow=retire?withSelectedNativeRetirement:withSelectedNativeRecovery;
 try{return borrow(owner,scoped,async scope=>{
  factories.bind(scope);let before:Loaded|undefined,after:Loaded|undefined;
  try{const actual=await scope.retainCurrent();scope.check();before=await read.call(Loaded,actual.current,actual.integrity);after=await read.call(Loaded,retained,actual.integrity);scope.check();const a=approval.call(before),b=approval.call(after);if(JSON.stringify(a.selection)!==JSON.stringify(b.selection)||JSON.stringify(a.choice)!==JSON.stringify(b.choice))throw fail();
   if(complete&&expected.length!==scope.clients.length||new Set(expected.map(row=>row.id)).size!==expected.length)throw fail('native_reconstruction_policy');
   for(const row of expected){const entry=after.participant(row.id),member=scope.clients.find(m=>m.id===row.id),factory=chosen.reads.find(m=>m.id===row.id);if(!row.families.includes(entry.family)||member?.family!==entry.family||!factory)throw fail('native_reconstruction_policy');}
   await verifySelectedRoomNativeContinuation(cut.call(before),cut.call(after),scoped,scope.clients,scope.check);for(const row of a.choice.adoption.participants){await verifySelectedUploadContinuation(upload.call(before,row.id),upload.call(after,row.id),row.limits,scope.check,scope.signal);scope.check();}
   const result=await visit({before,retained:after,reads:chosen.reads,nativeReads:scoped.reads,clients:scope.clients,assets,resolveAsset,integrity:actual.integrity,check:scope.check,captureCurrent:()=>retire?scope.retainRetirementCurrent():scope.retainCurrent()});scope.check();return result;
  }finally{if(after)dispose.call(after);if(before)dispose.call(before);}
 }).finally(()=>{try{factories.close();}finally{cancellation.close();}});}catch(error){try{factories.close();}finally{cancellation.close();}throw error;}
}

/** Ordinary DATA inspection retains its established no-retirement meaning. */
export function withNativeReconstructionInputs<P extends SharedSelectionPolicy,R>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInputOptions,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>){return runInputs(owner,provided,options,expected,complete,visit,false);}
/** Closed SDK route for an explicitly approved reconstruction retirement. It
 * does not accept a host-supplied scope/driver or infer permission from DATA. */
export const withNativeReconstructionRetirement:typeof withNativeReconstructionInputs=(owner,provided,options,expected,complete,visit)=>runInputs(owner,provided,options,expected,complete,visit,true);
