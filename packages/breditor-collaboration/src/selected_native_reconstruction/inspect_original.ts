/** Original reconstruction keeps packet/save phases and paired progress equal.
 * Nonlinear records require a real merge, not an archived losing replacement.
 * The common selected-cohort preflight grants no retirement or activation. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import type {OriginalRecordReferenceOptions} from '../persistence/original_record_reference_capture.js';
import {LoadedNativeReconstructionCurrent as Loaded} from './loaded_current.js';
import {buildOriginalReconstructionRecipe} from './original_recipe.js';
import {inspectNativeReconstructionData,type NativeReconstructionInspectionOptions} from './inspection_context.js';
import {fields,fail} from './policy.js';
const records=Loaded.prototype.records;
export function inspectOriginalNativeReconstruction<P extends SharedSelectionPolicy>(owner:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions<P>,options:NativeReconstructionInspectionOptions){
 return inspectNativeReconstructionData(owner,provided,options,'original','breditor/original-native-reconstruction-inspection',async context=>{
  const {id,before,retained:after}=context,leftRecord=await records.call(before,id),rightRecord=await records.call(after,id),left=recordLiveBasis('original',leftRecord) as readonly {kind:string;json:string}[],right=recordLiveBasis('original',rightRecord) as typeof left;
  const beforeSource=fields(leftRecord,['parent','source'])['source'] as Record<string,unknown>,afterSource=fields(rightRecord,['parent','source'])['source'] as Record<string,unknown>;
  for(const key of ['versions','suggestions','revisions'])if(JSON.stringify(beforeSource[key])!==JSON.stringify(afterSource[key]))throw fail('native_reconstruction_requires_merge');
  if(JSON.stringify(left.filter(row=>row.kind!=='document'&&row.kind!=='paired-session'))!==JSON.stringify(right.filter(row=>row.kind!=='document'&&row.kind!=='paired-session')))throw fail('native_reconstruction_requires_merge');
  const paired=(rows:typeof left)=>{const selected=rows.find(row=>row.kind==='paired-session');if(!selected)return null;const {documentCheckpointJson,reviewCheckpointJson,versions,...rest}=JSON.parse(selected.json);return rest;};
  if(JSON.stringify(paired(left))!==JSON.stringify(paired(right)))throw fail('native_reconstruction_requires_merge');
  return buildOriginalReconstructionRecipe(after,{id,read:context.read as Pick<OriginalRecordReferenceOptions,'restore'|'editor'>,descriptor:context.descriptor,...(context.assets===undefined?{}:{assets:context.assets}),...(context.resolveAsset===undefined?{}:{resolveAsset:context.resolveAsset})});
 });
}
