/** Original reconstruction keeps packet/save phases and paired progress equal.
 * Nonlinear records require a real merge, not an archived losing replacement.
 * The common selected-cohort preflight grants no retirement or activation. */
import {compareReconstructionPackets} from './compare_packets.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import {buildOriginalReconstructionRecipe} from './original_recipe.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
export function inspectOriginalNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,provided,options,'original','breditor/original-native-reconstruction-inspection',async context=>{
  await compareReconstructionPackets(context);
  return buildOriginalReconstructionRecipe(context.retained,{id:context.id,read:context.read as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>,descriptor:context.descriptor,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
