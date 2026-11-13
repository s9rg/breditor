import {snapshotGenerationRecoveryFactory} from '../generation_participant/prepare_recovery.js';
import {generationParticipantSelection} from '../generation_participant/policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import type {ContinuedRoomCatalogEntry} from '../continued_room_catalog/contract.js';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {snapshotIndependentDeliveryFactory} from '../independent_delivery_recovery/factory_policy.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {snapshotIndependentRecoveryFactory} from '../independent_recovery/factory_policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options,physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import type {ContinuedRoomGenerationRecoveryPolicy,ContinuedRoomDeliveryRecoveryPolicy,ContinuedRoomIndependentRecoveryPolicy} from './contract.js';

export function snapshotContinuedRoomIndependentPolicies(
 input:readonly ContinuedRoomIndependentRecoveryPolicy[]|undefined,fail:()=>Error,
){
 return snapshotPolicies(input,fail,value=>{
  physicalCatalogV2Options(value,['id','expected','session'],['limits']);
  const expected=independentParticipantSelection(value.expected);
  return {id:physicalCatalogName(value.id),expected,session:snapshotIndependentRecoveryFactory(expected,value.session),
   limits:checkRichAssetLimits(value.limits)};
 });
}

export function snapshotContinuedRoomDeliveryPolicies(
 input:readonly ContinuedRoomDeliveryRecoveryPolicy[]|undefined,fail:()=>Error,
){
 return snapshotPolicies(input,fail,value=>{
  physicalCatalogV2Options(value,['id','expected','session'],['limits']);
  const expected=independentDeliveryParticipantSelection(value.expected);
  return {id:physicalCatalogName(value.id),expected,session:snapshotIndependentDeliveryFactory(expected,value.session,true),
   limits:checkRichAssetLimits(value.limits)};
 });
}

export function snapshotContinuedRoomGenerationPolicies(
 input:readonly ContinuedRoomGenerationRecoveryPolicy[]|undefined,fail:()=>Error,
){
 return snapshotPolicies(input,fail,value=>{
  physicalCatalogV2Options(value,['id','expected','session'],['limits']);
  const expected=generationParticipantSelection(value.expected);
  const session=snapshotGenerationRecoveryFactory(expected,value.session);
  if(session.options.readOnly!==true||session.options.review&&session.options.review.access!=='read_only')throw fail();
  return {id:physicalCatalogName(value.id),expected,session,limits:checkRichAssetLimits(value.limits)};
 });
}

function snapshotPolicies<T,R extends {id:string}>(
 input:readonly T[]|undefined,fail:()=>Error,snapshot:(row:T)=>R,
){
 const policies=new Map<string,R>();
 for(const policy of physicalCatalogV2Rows(input===undefined?[]:input,snapshot)){
  if(policies.has(policy.id))throw fail();
  policies.set(policy.id,policy);
 }
 return policies;
}

/** A caller-supplied policy must name the exact archive of its selected family. */
export function matchContinuedRoomPolicies(
 entries:readonly ContinuedRoomCatalogEntry[],family:'independent-local'|'independent-delivery'|'generation',
 policies:ReadonlyMap<string,{readonly expected:unknown}>,fail:()=>Error,
){
 const expected=new Map(entries.filter(row=>row.family===family).map(row=>[row.id,row.selection]));
 for(const [id,policy] of policies)
  if(JSON.stringify(policy.expected)!==JSON.stringify(expected.get(id)))throw fail();
 return expected.size===policies.size;
}
