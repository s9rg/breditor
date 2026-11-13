import {continuedCatalogClient,continuedCatalogInventory,type SharedContinuedRoomCatalog} from '../continued_room_catalog/archive.js';
import type {PhysicalRoomCatalogV3LocalPolicy} from '../physical_room_catalog_v3/contract.js';
import type {PhysicalRoomCatalogV2GraphPolicy} from '../physical_room_catalog_v2/contract.js';
import {flatLocalArchive as flat} from '../flat_local_operation/archive.js';
import {portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {restoredGraphArchive as graph} from '../restored_graph/archive.js';
import type {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {continuedReconciliationFailure as fail} from './asset_pins.js';
import {inspectDeliveryArchivePrefix} from './delivery_prefix.js';
import {inspectLocalArchivePrefix} from './independent_prefix.js';

/** The catalog has admitted all retained ancestry. Compare its exact LIVE cut to the relay. */
export async function inspectOperationRoomPrefix(
 archive:SharedContinuedRoomCatalog,policy:PhysicalRoomCatalogV2GraphPolicy|PhysicalRoomCatalogV3LocalPolicy,waits:NativeReconstructionWaits,
){
 const client=continuedCatalogClient(archive,policy.id),inventory=continuedCatalogInventory(archive);
 if(client.family==='restored-graph'&&!('family'in policy)){
  const prefix=await inspectDeliveryArchivePrefix(inventory,policy.original,policy.options.session,
   graph.live.call(client.backup),waits);
  return {prefix,boundActor:prefix.review.actor};
 }
 if('family'in policy&&policy.family===client.family){
  const recovery=client.family==='local-operation-snapshot'?snapshot.live.call(client.backup):flat.live.call(client.backup);
  const prefix=await inspectLocalArchivePrefix(inventory,policy.original,policy.options.session,recovery,waits);
  return {prefix,boundActor:undefined};
 }
 throw fail('policy');
}
