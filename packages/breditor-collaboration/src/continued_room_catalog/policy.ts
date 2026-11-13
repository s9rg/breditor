import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {continuedParticipantSelection} from '../continued_participant/policy.js';
import {physicalCatalogV2Rows,physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogFailure,physicalCatalogName} from '../physical_room_catalog/policy.js';
import type {ContinuedRoomCatalogPolicy,ContinuedRoomCatalogEntry} from './contract.js';

/** Factories and expected participant identities are supplied outside the catalog. */
export function selectContinuedRoomPolicies(
 entries:readonly ContinuedRoomCatalogEntry[],input:readonly ContinuedRoomCatalogPolicy[],
):ReadonlyMap<string,ContinuedRoomCatalogPolicy>{
 const expected=new Map(entries.map(entry=>[entry.id,entry.selection]));
 const policies=new Map<string,ContinuedRoomCatalogPolicy>();
 for(const policy of physicalCatalogV2Rows(input,value=>{
  physicalCatalogV2Options(value,['id','expected','restoreDocument'],['limits']);
  const {id,expected,restoreDocument,limits}={...value};
  if(typeof restoreDocument!=='function')throw physicalCatalogFailure('catalog_policy');
  return Object.freeze({id:physicalCatalogName(id),expected:continuedParticipantSelection(expected),restoreDocument,
   ...(limits?{limits:checkRichAssetLimits(limits)}:{})});
 })){
  if(policies.has(policy.id)||JSON.stringify(expected.get(policy.id))!==JSON.stringify(policy.expected))
   throw physicalCatalogFailure('catalog_policy');
  policies.set(policy.id,policy);
 }
 if(policies.size!==entries.length)throw physicalCatalogFailure('catalog_policy');
 return policies;
}
