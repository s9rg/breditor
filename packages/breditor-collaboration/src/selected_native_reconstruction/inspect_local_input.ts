/** All-member native and whole-upload preflight, with an explicit flat output
 * choice. A snapshot-backed source is not relabelled as a snapshot save. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
import {buildLocalInputReconstructionRecipe,type LocalInputReconstructionReadFactory} from './local_input_recipe.js';
import {fields,fail} from './policy.js';
export function inspectLocalInputNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,provided:NativeReconstructionInspectionOptions&Readonly<{outputFamily:'local-operation-flat'}>){
 const raw=fields(provided,['id','retained','outputFamily'],['assets','resolveAsset']);if(raw['outputFamily']!=='local-operation-flat')throw fail('native_reconstruction_policy');const{outputFamily:ignored,...options}=raw;void ignored;
 return inspectNativeReconstructionData(owner,reads,options as NativeReconstructionInspectionOptions,['local-operation-snapshot','local-operation-flat'],'breditor/local-input-native-reconstruction-inspection',context=>{
  const read=context.read as Readonly<{session:LocalInputReconstructionReadFactory}>;
  return buildLocalInputReconstructionRecipe(context.retained,{id:context.id,outputFamily:'local-operation-flat',session:read.session,descriptor:context.descriptor,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
