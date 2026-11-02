/** One genuine selected-cohort DATA preflight shared by explicit per-family
 * reconstruction adapters. All native clients and whole selected uploads are
 * compared against one complete actual before-cut. This is not a retirement,
 * mutable-source handoff, source ACK or authenticated room activation.
 *
 * Per-family packet/journal rules remain with that adapter. A point-in-time
 * inspection must be freshly revalidated by any later reconstruction operation.
 */
import {withSelectedNativeRecovery,withSelectedNativeRetirement,withSelectedNativeActorRetirement,withReservedSelectedActorRetirement,type SelectedActorExecutionReservation,type RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {SharedAssetBytesOptions,SharedAssetBytesResolver} from '../asset_bytes/types.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,fail} from './policy.js';
import {NativeReconstructionFactoryScope} from './factory_scope.js';
import {NativeReconstructionWaits} from './read_waits.js';
import {withAdmittedReconstructionInputs} from './admit_inputs.js';
export type NativeReconstructionInputOptions=Readonly<{retained:SelectedRoomCurrentFile;assets?:SharedAssetBytesOptions;resolveAsset?:SharedAssetBytesResolver}>;
export interface NativeReconstructionInputs{readonly before:Loaded;readonly retained:Loaded;readonly reads:PhysicalOperationV3HistoryReadOptions['reads'];readonly nativeReads:PhysicalOperationV3HistoryReadOptions['reads'];readonly clients:SelectedNativeRecoveryScope['clients'];readonly assets:SharedAssetBytesOptions|undefined;readonly resolveAsset:SharedAssetBytesResolver|undefined;readonly integrity:SharedArchiveIntegrityOptions;check():void;captureCurrent():ReturnType<SelectedNativeRecoveryScope['retainCurrent']>}
export interface ExpectedReconstructionMember{readonly id:string;readonly families:readonly RecordPayloadFamily[]}
/** One held complete cohort. Expectations are private routing data, not source
 * owners. Native and whole-upload comparison run once before the visitor. */
function runInputs<P extends SharedSelectionPolicy,R>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInputOptions,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>,retire:boolean,keepActors=false,actorExecution?:SelectedActorExecutionReservation){
 const chosen=snapshotPhysicalHistoryReadOptions(provided),raw=fields(options,['retained'],['assets','resolveAsset']),input=fields(raw['retained'],['selection','file']),retained={selection:selectedRoomCurrentSelection(input['selection']),file:archiveBlob(input['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)},assetOptions=raw['assets']===undefined?undefined:fields(raw['assets'],[],['limits','signal']) as SharedAssetBytesOptions,assets=assetOptions===undefined?undefined:{limits:checkRichAssetLimits(assetOptions.limits),...(assetOptions.signal?{signal:assetOptions.signal}:{})},resolveAsset=raw['resolveAsset'] as SharedAssetBytesResolver|undefined;
 if(resolveAsset!==undefined&&typeof resolveAsset!=='function')throw fail('native_reconstruction_policy');
 const factories=new NativeReconstructionFactoryScope(chosen.reads),cancellation=new NativeReconstructionWaits(()=>{},[chosen.signal,assets?.signal]),scoped={...chosen,signal:cancellation.signal,reads:factories.reads};
 const borrow:typeof withSelectedNativeRecovery=actorExecution?(owner,input,visit)=>withReservedSelectedActorRetirement(owner,actorExecution,input,visit):keepActors?withSelectedNativeActorRetirement:retire?withSelectedNativeRetirement:withSelectedNativeRecovery;
 try{return borrow(owner,scoped,async scope=>{
  factories.bind(scope);return withAdmittedReconstructionInputs(scope,chosen,scoped,retained,assets,resolveAsset,expected,complete,visit,retire);
 }).finally(()=>{try{factories.close();}finally{cancellation.close();}});}catch(error){try{factories.close();}finally{cancellation.close();}throw error;}
}

/** Ordinary DATA inspection retains its established no-retirement meaning. */
export function withNativeReconstructionInputs<P extends SharedSelectionPolicy,R>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInputOptions,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>){return runInputs(owner,provided,options,expected,complete,visit,false);}
/** Closed SDK route for an explicitly approved reconstruction retirement. It
 * does not accept a host-supplied scope/driver or infer permission from DATA. */
export const withNativeReconstructionRetirement:typeof withNativeReconstructionInputs=(owner,provided,options,expected,complete,visit)=>runInputs(owner,provided,options,expected,complete,visit,true);

/** Explicit retained-resource retirement for the durable whole-room executor.
 * All existing DATA/recipe admission remains unchanged. Actual actor ownership
 * stays in the same canonical owner through failed old cleanup, until taken. */
export const withNativeReconstructionActorRetirement:typeof withNativeReconstructionInputs=(owner,provided,options,expected,complete,visit)=>runInputs(owner,provided,options,expected,complete,visit,true,true);

/** Actual old-owner reservation is required by the already-returned executor;
 * unreserved legacy retirement retains its established independent contract. */
export function withNativeReconstructionReservedActorRetirement<P extends SharedSelectionPolicy,R>(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInputOptions,expected:readonly ExpectedReconstructionMember[],complete:boolean,visit:(context:NativeReconstructionInputs)=>Promise<R>){return runInputs(owner,provided,options,expected,complete,visit,true,true,reservation);}
