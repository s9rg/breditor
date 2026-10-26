/** Hold the real seven-family current cut before rebuilding one delivery
 * participant. Existing queued rows must survive exactly; additional admitted
 * rows are allowed, conflicting changes require a merge. This is DATA, not a
 * source retirement, server decision or whole-room activation.
 */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {buildDeliveryReconstructionRecipe,type DeliveryReconstructionReadFactory} from './delivery_recipe.js';
import {verifyDeliveryReconstructionPackets} from './delivery_packets.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
export function inspectDeliveryNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,reads,options,'independent-delivery','breditor/delivery-native-reconstruction-inspection',async context=>{
  const before=recordLiveBasis('independent-delivery',await context.before.records(context.id)) as SharedIndependentDeliveryRecovery,after=recordLiveBasis('independent-delivery',await context.retained.records(context.id)) as SharedIndependentDeliveryRecovery;
  verifyDeliveryReconstructionPackets(before,after);context.check();
  return buildDeliveryReconstructionRecipe(context.retained,{id:context.id,session:(context.read as {session:DeliveryReconstructionReadFactory}).session,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
