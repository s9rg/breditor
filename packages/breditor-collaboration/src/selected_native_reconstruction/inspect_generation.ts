/** One generation recipe under the actual complete native/whole-upload read.
 * Retained delivery packets use their original shared packet formats. This is
 * not a participant source-save ACK, room retirement or authenticated activation.
 */
import {compareReconstructionPackets} from './compare_packets.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import {buildGenerationReconstructionRecipe} from './generation_recipe.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
export function inspectGenerationNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,reads,options,'generation','breditor/generation-native-reconstruction-inspection',async context=>{
  await compareReconstructionPackets(context);
  return buildGenerationReconstructionRecipe(context.retained,{id:context.id,read:context.read as Pick<GenerationRecordReferenceOptions,'restoreSegmented'|'editor'>,descriptor:context.descriptor,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
