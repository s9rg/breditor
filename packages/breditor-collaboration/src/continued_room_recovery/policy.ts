import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {ContinuedRoomCatalogEntry} from '../continued_room_catalog/contract.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options,physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import type {ContinuedRoomIndependentRecoveryPolicy} from './contract.js';

export function snapshotContinuedRoomIndependentPolicies(
 input:readonly ContinuedRoomIndependentRecoveryPolicy[]|undefined,fail:()=>Error,
){
 const policies=new Map<string,ContinuedRoomIndependentRecoveryPolicy>();
 for(const policy of physicalCatalogV2Rows(input===undefined?[]:input,value=>{
  physicalCatalogV2Options(value,['id','expected','session'],['limits']);
  const expected=independentParticipantSelection(value.expected);
  return {id:physicalCatalogName(value.id),expected,session:snapshotIndependentRecoveryFactory(expected,value.session),
   limits:checkRichAssetLimits(value.limits)};
 })){
  if(policies.has(policy.id))throw fail();
  policies.set(policy.id,policy);
 }
 return policies;
}

/** A caller-supplied policy must name the exact independent archive. */
export function matchContinuedRoomIndependentPolicies(
 entries:readonly ContinuedRoomCatalogEntry[],policies:ReadonlyMap<string,ContinuedRoomIndependentRecoveryPolicy>,fail:()=>Error,
){
 const expected=new Map(entries.filter(row=>row.family==='independent-local').map(row=>[row.id,row.selection]));
 for(const [id,policy] of policies)
  if(JSON.stringify(policy.expected)!==JSON.stringify(expected.get(id)))throw fail();
 return expected.size===policies.size;
}
