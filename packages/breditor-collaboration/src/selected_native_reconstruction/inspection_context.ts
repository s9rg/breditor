/** Per-participant DATA inspection over the same complete held cohort used by
 * durable room preparation. Its output is never retirement or activation. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import {sourceNativeRecoveryRead} from '../source_native_read.js';
import {withNativeReconstructionInputs,type NativeReconstructionInputOptions} from './input_scope.js';
import type {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {fields,identifier} from './policy.js';
export type NativeReconstructionInspectionOptions=NativeReconstructionInputOptions&Readonly<{id:string}>;
export interface NativeReconstructionParticipantContext{readonly id:string;readonly before:Loaded;readonly retained:Loaded;readonly read:PhysicalOperationV3HistoryReadOptions['reads'][number]['read'];readonly descriptor:string;readonly assets:NativeReconstructionInputOptions['assets']|undefined;readonly resolveAsset:NativeReconstructionInputOptions['resolveAsset']|undefined;check():void}
export function inspectNativeReconstructionData<P extends SharedSelectionPolicy,F extends string,R>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions,family:RecordPayloadFamily|readonly RecordPayloadFamily[],format:F,visit:(context:NativeReconstructionParticipantContext)=>Promise<R>){
 const raw=fields(options,['id','retained'],['assets','resolveAsset']),id=identifier(raw['id']),{id:ignored,...input}=raw;void ignored;
 return withNativeReconstructionInputs(owner,provided,input as NativeReconstructionInputOptions,[{id,families:typeof family==='string'?[family]:family}],false,async context=>{const member=context.clients.find(row=>row.id===id)!,selected=context.reads.find(row=>row.id===id)!;const recipe=await visit({id,before:context.before,retained:context.retained,read:selected.read,descriptor:JSON.stringify(sourceNativeRecoveryRead(member.core).descriptor()),assets:context.assets,resolveAsset:context.resolveAsset,check:context.check});context.check();return Object.freeze({format,formatVersion:1 as const,scope:'held-current-versus-retained-data-only' as const,before:context.before.file(),retained:context.retained.file(),recipe});});
}
