/** The same packet conservation laws apply to single and complete-room DATA
 * construction. Additional rows never erase old decisions or retry intents. */
import type {NativeReconstructionParticipantContext as Context} from './inspection_context.js';
import {recordLiveBasis} from '../complete_operation_cohort/record_live_basis.js';
import {checkGenerationRecords} from '../generation_source/validate_records.js';
import type {SharedGenerationSourceRecord} from '../generation_source/contract.js';
import type {SharedSegmentedRetainedRecovery} from '../segmented_relay/retained_contract.js';
import type {SharedIndependentDeliveryRecovery} from '../independent_delivery/contract.js';
import {verifyRetainedReconstructionPackets} from './retained_packets.js';
import {fields,fail} from './policy.js';
export async function compareReconstructionPackets(context:Pick<Context,'id'|'before'|'retained'|'check'>):Promise<void>{
 const{id,before,retained:after}=context,entry=after.participant(id),leftRecord=await before.records(id),rightRecord=await after.records(id);context.check();
 if(entry.family==='original'){
  const left=recordLiveBasis('original',leftRecord) as readonly {kind:string;json:string}[],right=recordLiveBasis('original',rightRecord) as typeof left,beforeSource=fields(leftRecord,['parent','source'])['source'] as Record<string,unknown>,afterSource=fields(rightRecord,['parent','source'])['source'] as Record<string,unknown>;
  for(const key of['versions','suggestions','revisions'])if(JSON.stringify(beforeSource[key])!==JSON.stringify(afterSource[key]))throw fail('native_reconstruction_requires_merge');
  if(JSON.stringify(left.filter(row=>row.kind!=='document'&&row.kind!=='paired-session'))!==JSON.stringify(right.filter(row=>row.kind!=='document'&&row.kind!=='paired-session')))throw fail('native_reconstruction_requires_merge');
  const paired=(rows:typeof left)=>{const selected=rows.find(row=>row.kind==='paired-session');if(!selected)return null;const{documentCheckpointJson,reviewCheckpointJson,versions,...rest}=JSON.parse(selected.json);return rest;};if(JSON.stringify(paired(left))!==JSON.stringify(paired(right)))throw fail('native_reconstruction_requires_merge');
 }else if(entry.family==='generation'){
  const identity=entry.selection.identity.source,a=checkGenerationRecords(identity,recordLiveBasis('generation',leftRecord) as readonly SharedGenerationSourceRecord[]),b=checkGenerationRecords(identity,recordLiveBasis('generation',rightRecord) as readonly SharedGenerationSourceRecord[]);if(identity.kind==='retained')verifyRetainedReconstructionPackets(a.recovery as SharedSegmentedRetainedRecovery,b.recovery as SharedSegmentedRetainedRecovery);
 }else if(entry.family==='independent-delivery'||entry.family==='restored-graph')verifyRetainedReconstructionPackets(recordLiveBasis(entry.family,leftRecord) as SharedIndependentDeliveryRecovery,recordLiveBasis(entry.family,rightRecord) as SharedIndependentDeliveryRecovery);
 context.check();
}
