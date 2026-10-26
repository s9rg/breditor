/** One generation recipe under the actual complete native/whole-upload read.
 * Retained delivery packets use their original shared packet formats. This is
 * not a participant source-save ACK, room retirement or authenticated activation.
 */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {GenerationRecordReferenceOptions} from '../generation_source/record_reference_capture.js';
import type {SharedGenerationSourceRecord} from '../generation_source/contract.js';
import type {SharedSegmentedRetainedRecovery} from '../segmented_relay/retained_contract.js';
import {checkGenerationRecords} from '../generation_source/validate_records.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {verifyRetainedReconstructionPackets} from './retained_packets.js';
import {buildGenerationReconstructionRecipe} from './generation_recipe.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
import {fail} from './policy.js';
export function inspectGenerationNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,reads,options,'generation','breditor/generation-native-reconstruction-inspection',async context=>{
  const entry=context.retained.participant(context.id);if(entry.family!=='generation')throw fail();
  const identity=entry.selection.identity.source;
  const before=checkGenerationRecords(identity,recordLiveBasis('generation',await context.before.records(context.id)) as readonly SharedGenerationSourceRecord[]),after=checkGenerationRecords(identity,recordLiveBasis('generation',await context.retained.records(context.id)) as readonly SharedGenerationSourceRecord[]);
  if(identity.kind==='retained')verifyRetainedReconstructionPackets(before.recovery as SharedSegmentedRetainedRecovery,after.recovery as SharedSegmentedRetainedRecovery);context.check();
  return buildGenerationReconstructionRecipe(context.retained,{id:context.id,read:context.read as Pick<GenerationRecordReferenceOptions,'restoreSegmented'|'editor'>,descriptor:context.descriptor,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
