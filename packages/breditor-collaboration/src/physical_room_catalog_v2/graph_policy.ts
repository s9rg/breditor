/** Snapshot fresh independently selected graph factories before storage/byte
 * awaits. A serialized entry cannot choose its own original or permission. */
import {archiveFields} from '../archive_integrity/policy.js';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {portableReadPolicy,type IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import {physicalCatalogFailure,physicalCatalogName} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Rows,physicalCatalogV2Options} from './input_snapshot.js';
import type {PhysicalRoomCatalogV2GraphPolicy,PhysicalRoomCatalogV2Entry} from './contract.js';

export function snapshotPhysicalCatalogV2GraphPolicies(input:readonly PhysicalRoomCatalogV2GraphPolicy[]):readonly PhysicalRoomCatalogV2GraphPolicy[]{
 const ids=new Set<string>();
 return Object.freeze(physicalCatalogV2Rows(input,value=>{
  const row=archiveFields(value,'id,original,options'),id=physicalCatalogName(row['id']),original=independentDeliveryParticipantSelection(row['original']);
  if(ids.has(id))throw physicalCatalogFailure('catalog_policy');ids.add(id);
  physicalCatalogV2Options(row['options'] as object,['session','checkAuthority'],['signal','limits']);
  const policy=portableReadPolicy(original,row['options'] as IndependentOperationReadOptions);
  const options:IndependentOperationReadOptions=Object.freeze({session:policy.options.session,checkAuthority:policy.guard,...(policy.options.signal?{signal:policy.options.signal}:{}),...(policy.options.limits?{limits:policy.options.limits}:{})});
  return Object.freeze({id,original,options});
 }));
}
export function matchPhysicalCatalogV2GraphPolicies(rows:readonly PhysicalRoomCatalogV2Entry[],input:readonly PhysicalRoomCatalogV2GraphPolicy[]):ReadonlyMap<string,IndependentOperationReadOptions>{
 const policies=new Map<string,IndependentOperationReadOptions>();
 for(const policy of input){const row=rows.find(row=>row.id===policy.id);if(!row||row.family!=='restored-graph'||JSON.stringify(row.selection.original)!==JSON.stringify(policy.original)||policies.has(row.id))throw physicalCatalogFailure('catalog_policy');policies.set(row.id,policy.options);}
 if(rows.some(row=>row.family==='restored-graph'&&!policies.has(row.id)))throw physicalCatalogFailure('catalog_policy');return policies;
}
