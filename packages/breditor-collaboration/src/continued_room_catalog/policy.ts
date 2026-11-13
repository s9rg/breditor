import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {continuedParticipantSelection} from '../continued_participant/policy.js';
import {physicalCatalogV2Rows,physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogFailure,physicalCatalogName} from '../physical_room_catalog/policy.js';
import {matchPhysicalCatalogV2GraphPolicies,snapshotPhysicalCatalogV2GraphPolicies} from '../physical_room_catalog_v2/graph_policy.js';
import {matchPhysicalCatalogV3LocalPolicies,snapshotPhysicalCatalogV3LocalPolicies} from '../physical_room_catalog_v3/local_policy.js';
import type {PhysicalRoomCatalogV2Entry} from '../physical_room_catalog_v2/contract.js';
import {isContinuedRoomLocalEntry} from './manifest.js';
import type {ContinuedRoomCatalogReadOptions,ContinuedRoomCatalogPolicy,ContinuedRoomCatalogEntry} from './contract.js';

/** Factories and expected participant identities are supplied outside the catalog. */
function continuedPolicies(
 entries:readonly ContinuedRoomCatalogEntry[],input:readonly ContinuedRoomCatalogPolicy[],
):ReadonlyMap<string,ContinuedRoomCatalogPolicy>{
 const expected=new Map(entries.filter(isContinuedRoomLocalEntry).map(entry=>[entry.id,entry.selection]));
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
 if(policies.size!==expected.size)throw physicalCatalogFailure('catalog_policy');
 return policies;
}

export function selectContinuedRoomPolicies(entries:readonly ContinuedRoomCatalogEntry[],options:ContinuedRoomCatalogReadOptions){
 const retained=entries.filter(entry=>!isContinuedRoomLocalEntry(entry));
 const graphPolicies=snapshotPhysicalCatalogV2GraphPolicies(options.graphPolicies??[]);
 const localPolicies=snapshotPhysicalCatalogV3LocalPolicies(options.localPolicies??[]);
 return {
  policies:continuedPolicies(entries,options.policies),
  graphPolicies,localPolicies,
  graph:matchPhysicalCatalogV2GraphPolicies(retained.filter((row):row is PhysicalRoomCatalogV2Entry=>
   row.family!=='local-operation-snapshot'&&row.family!=='local-operation-flat'),graphPolicies),
  local:matchPhysicalCatalogV3LocalPolicies(retained,localPolicies),
 };
}
