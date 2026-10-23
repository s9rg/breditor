/** Exact per-file local read policies are snapped before byte/storage awaits.
 * Serialized family/identity fields never select execution or current grants. */
import {archiveFields} from '../archive_integrity/policy.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {localPortableReadPolicy,type LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import {physicalCatalogFailure,physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Rows,physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import type {PhysicalRoomCatalogV3LocalPolicy,PhysicalRoomCatalogV3Entry} from './contract.js';

export function snapshotPhysicalCatalogV3LocalPolicies(input:readonly PhysicalRoomCatalogV3LocalPolicy[]):readonly PhysicalRoomCatalogV3LocalPolicy[]{
 const ids=new Set<string>();
 return Object.freeze(physicalCatalogV2Rows(input,value=>{
  const row=archiveFields(value,'id,family,original,options'),id=physicalCatalogName(row['id']);
  if(ids.has(id)||row['family']!=='local-operation-snapshot'&&row['family']!=='local-operation-flat')throw physicalCatalogFailure('catalog_policy');ids.add(id);
  const original=independentParticipantSelection(row['original']);physicalCatalogV2Options(row['options'] as object,['session','checkAuthority'],['signal','limits']);
  const policy=localPortableReadPolicy(original,row['options'] as LocalOperationReadOptions),options:LocalOperationReadOptions=Object.freeze({session:policy.options.session,checkAuthority:policy.guard,...(policy.options.signal?{signal:policy.options.signal}:{}),...(policy.options.limits?{limits:policy.options.limits}:{})});
  return Object.freeze({id,family:row['family'],original,options});
 }));
}
export function matchPhysicalCatalogV3LocalPolicies(rows:readonly PhysicalRoomCatalogV3Entry[],input:readonly PhysicalRoomCatalogV3LocalPolicy[]):ReadonlyMap<string,LocalOperationReadOptions>{
 const policies=new Map<string,LocalOperationReadOptions>();
 for(const policy of input){const row=rows.find(row=>row.id===policy.id);if(!row||row.family!==policy.family||row.family!=='local-operation-snapshot'&&row.family!=='local-operation-flat'||JSON.stringify(row.selection.original)!==JSON.stringify(policy.original)||policies.has(row.id))throw physicalCatalogFailure('catalog_policy');policies.set(row.id,policy.options);}
 if(rows.some(row=>(row.family==='local-operation-snapshot'||row.family==='local-operation-flat')&&!policies.has(row.id)))throw physicalCatalogFailure('catalog_policy');return policies;
}
