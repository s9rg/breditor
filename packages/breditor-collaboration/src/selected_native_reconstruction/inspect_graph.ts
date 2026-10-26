/** Genuine all-member native/whole-upload preflight before graph DATA append.
 * Additional retained rows cannot delete current intents. This does not retire
 * a source, finalize review decisions or authenticate a reconstructed room. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {DeliveryReconstructionReadFactory} from './delivery_recipe.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {verifyRetainedReconstructionPackets} from './retained_packets.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
import {buildGraphReconstructionRecipe} from './graph_recipe.js';
export function inspectGraphNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,reads,options,'restored-graph','breditor/graph-native-reconstruction-inspection',async context=>{
  const before=recordLiveBasis('restored-graph',await context.before.records(context.id)) as SharedIndependentDeliveryRecovery,after=recordLiveBasis('restored-graph',await context.retained.records(context.id)) as SharedIndependentDeliveryRecovery;
  verifyRetainedReconstructionPackets(before,after);context.check();
  const read=context.read as Readonly<{session:DeliveryReconstructionReadFactory}>;
  return buildGraphReconstructionRecipe(context.retained,{id:context.id,session:read.session,descriptor:context.descriptor,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
