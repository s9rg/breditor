/** Explicit independent-local DATA inspection. Native continuation covers both
 * independently selected lanes and ordered local version packets. Every complete
 * journal cut is admitted by the recipe; no relay, outbox or activation is added. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedIndependentRecoveryFactory} from '../independent_recovery/contract.js';
import {buildLocalReconstructionRecipe} from './local_recipe.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
export function inspectLocalNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,reads,options,'independent-local','breditor/local-native-reconstruction-inspection',async context=>buildLocalReconstructionRecipe(context.retained,{id:context.id,session:(context.read as {session:SharedIndependentRecoveryFactory}).session,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})}));
}
