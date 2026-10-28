/** Rebuild the exact complete native catalog before START/retirement. All
 * executable participant policies are independent fresh host choices. */
import {withNativeRoomUnionPrepared} from '../native_room_union/prepared_scope.js';
import {NativeRoomUnionExecutionArchive} from '../native_room_union_execution/archive.js';
import type {NativeRoomUnionReadScope} from '../native_room_union/read_scope.js';
import {physicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import {preflightPhysicalOperationV3} from '../physical_room_operation_v3/preflight.js';
import type {PhysicalOperationV3Participant} from '../physical_room_operation_v3/contract.js';
import type {NativeRoomUnionRunIdentity} from './contract.js';
import {fail} from './policy.js';
const preparation=NativeRoomUnionExecutionArchive.prototype.preparation;
export function checkNativeRoomUnionRunInputs(archive:NativeRoomUnionExecutionArchive,identity:NativeRoomUnionRunIdentity,participants:readonly PhysicalOperationV3Participant[],scope:NativeRoomUnionReadScope):Promise<void> {
 return withNativeRoomUnionPrepared(preparation.call(archive),scope,async context=>{
  const plan=identity.execution.plan;
  const targets=preflightPhysicalOperationV3(participants,physicalCatalogV3ArchiveState(context.catalog),plan.layout.operationDatabase,plan.layout.catalogDatabase).map(row=>row.target);
  const expected=plan.preparation.plan.participants.map(({id,family,namespaces})=>({id,family,namespaces}));
  if(JSON.stringify(targets)!==JSON.stringify(expected))throw fail('room_union_run_policy');
  const used=new Set<string>();
  for(const loaded of [context.before,context.retained]){
   const root=loaded.nativeCut().root(),adoption=loaded.approval().choice.adoption;
   used.add(root.database);used.add(root.source.catalogDatabase);used.add(adoption.database);
   for(const row of root.participants)for(const ns of row.namespaces)used.add(ns.database);
   for(const row of adoption.participants)used.add(row.targetDatabase);
  }
  if(used.has(identity.database))throw fail('room_union_run_policy');scope.check();
 });
}
