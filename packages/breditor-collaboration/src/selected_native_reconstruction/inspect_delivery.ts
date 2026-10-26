/** Hold the real seven-family current cut before rebuilding one delivery
 * participant. Existing queued rows must survive exactly; additional admitted
 * rows are allowed, conflicting changes require a merge. This is DATA, not a
 * source retirement, server decision or whole-room activation.
 */
import {compareReconstructionPackets} from './compare_packets.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {buildDeliveryReconstructionRecipe,type DeliveryReconstructionReadFactory} from './delivery_recipe.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
export function inspectDeliveryNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,reads,options,'independent-delivery','breditor/delivery-native-reconstruction-inspection',async context=>{
  await compareReconstructionPackets(context);
  return buildDeliveryReconstructionRecipe(context.retained,{id:context.id,session:(context.read as {session:DeliveryReconstructionReadFactory}).session,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
