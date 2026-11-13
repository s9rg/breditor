/** Dispatch only on the admitted literal family. Factories come from the
 * owner's independently bound read set, never an editable source constructed
 * from incoming records. Each family cleans up its reader after this visit. */
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedAssetBytesOptions} from '../asset_bytes/types.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {fields,identifier,fail} from '../selected_native_reconstruction/policy.js';
import {visitOriginalPacketNative} from './original.js';
import {visitGenerationPacketNative} from './generation.js';
import {visitDeliveryPacketNative} from './delivery.js';
import {visitLocalPacketNative} from './local.js';
import {visitGraphPacketNative} from './graph.js';
import {visitLocalInputPacketNative} from './local_input.js';
import type {MetadataPacketNativeVisit} from './contract.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import type {DeliveryReconstructionReadFactory} from '../selected_native_reconstruction/delivery_recipe.js';
import type {LocalInputReconstructionReadFactory} from '../selected_native_reconstruction/local_input_recipe.js';
export async function visitRetainedPacketNative<T>(source:Loaded,provided:Readonly<{id:string;read:PhysicalOperationV3HistoryReadOptions['reads'][number]['read'];descriptor:string;assets?:SharedAssetBytesOptions}>,visit:MetadataPacketNativeVisit<T>):Promise<T>{
 source.check();const raw=fields(provided,['id','read','descriptor'],['assets']),id=identifier(raw['id']),entry=source.participant(id);if(typeof raw['descriptor']!=='string'||typeof visit!=='function')throw fail('native_reconstruction_policy');
 const common={id,...(raw['assets']===undefined?{}:{assets:raw['assets'] as SharedAssetBytesOptions})},descriptor=raw['descriptor'];
 switch(entry.family){
  case'original':return visitOriginalPacketNative(source,{...common,read:raw['read'] as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>,descriptor},visit);
  case'generation':return visitGenerationPacketNative(source,{...common,read:raw['read'] as Pick<GenerationRecordReferenceOptions,'restoreSegmented'|'restoreContinued'|'editor'>,descriptor},visit);
  case'independent-local':return visitLocalPacketNative(source,{...common,session:fields(raw['read'],['session'])['session'] as SharedIndependentRecoveryFactory},visit);
  case'independent-delivery':return visitDeliveryPacketNative(source,{...common,session:fields(raw['read'],['session'])['session'] as DeliveryReconstructionReadFactory},visit);
  case'restored-graph':return visitGraphPacketNative(source,{...common,session:fields(raw['read'],['session'])['session'] as DeliveryReconstructionReadFactory,descriptor},visit);
  case'local-operation-snapshot':case'local-operation-flat':return visitLocalInputPacketNative(source,{...common,session:fields(raw['read'],['session'])['session'] as LocalInputReconstructionReadFactory,descriptor},visit);
 }
}
