/** Bind every selected actual namespace and actor identity from the complete
 * independently chosen basis BEFORE requesting any fresh writer lock. This
 * admits DATA only; actual current stores/lineage are rechecked after reopen. */
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {PhysicalRoomCatalogV3Archive,physicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import {preflightPhysicalOperationV3} from '../physical_room_operation_v3/preflight.js';
import type {PhysicalOperationV3ResumeOptions} from '../physical_room_operation_v3/contract.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import type {RoomActorAcquisitionMember} from '../persistence/room_actor_acquisition_contract.js';
import {roomActorAcquisitionInput} from '../persistence/room_actor_acquisition_input.js';
import {fail} from '../native_room_execution/policy.js';
const api={current:SelectedRoomCurrentArchive.prototype.current,approval:SelectedRoomCurrentArchive.prototype.approval},cutApi={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,files:PhysicalRoomRecordCutArchive.prototype.catalogFiles,dispose:PhysicalRoomRecordCutArchive.prototype.dispose},catalogApi={read:PhysicalRoomCatalogV3Archive.read,dispose:PhysicalRoomCatalogV3Archive.prototype.dispose};
export async function coldRoomActorPlan(basis:SelectedRoomCurrentArchive,root:PhysicalOperationV3ResumeOptions,intentDatabase:string,scope:RoomExecutionReadScope):Promise<Readonly<{room:string;members:readonly RoomActorAcquisitionMember[];names:readonly string[]}>>{
 const current=api.current.call(basis),approval=api.approval.call(basis),options={wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal};let cut:PhysicalRoomRecordCutArchive|undefined,catalog:PhysicalRoomCatalogV3Archive|undefined;
 try{cut=await cutApi.read.call(PhysicalRoomRecordCutArchive,current.file,current.selection,options);scope.check();const record=cutApi.root.call(cut);
  if(record.database!==root.database||record.source.catalogDatabase!==root.catalogDatabase||JSON.stringify(record.source.selection)!==JSON.stringify(root.expected))throw fail('room_execution_policy');
  catalog=await catalogApi.read.call(PhysicalRoomCatalogV3Archive,record.source.manifest,cutApi.files.call(cut),root.expected,{...options,...(root.graphPolicies?{graphPolicies:root.graphPolicies}:{}),...(root.localPolicies?{localPolicies:root.localPolicies}:{})});scope.check();
  const prepared=preflightPhysicalOperationV3(root.participants,physicalCatalogV3ArchiveState(catalog),root.database,root.catalogDatabase);
  if(prepared.length!==record.participants.length||prepared.some((row,index)=>{const old=record.participants[index];return!old||old.id!==row.target.id||old.family!==row.target.family||JSON.stringify(old.namespaces)!==JSON.stringify(row.target.namespaces);}))throw fail('room_execution_policy');
  const room=prepared[0]!.identity.room;if(prepared.some(row=>row.identity.room!==room))throw fail('room_execution_policy');
  const members=prepared.map(row=>({id:row.target.id,factory:row.target.family==='original'?(row.identity.actor===undefined?'shared':'review'):row.target.family==='generation'?'segmented':'independent',writer:row.identity.writer,actor:row.identity.actor??null})) as RoomActorAcquisitionMember[];
  const names=[record.database,record.source.catalogDatabase,...record.participants.flatMap(row=>row.namespaces.map(ns=>ns.database)),approval.choice.adoption.database,...approval.choice.adoption.participants.map(row=>row.targetDatabase)];if(names.includes(intentDatabase))throw fail('room_execution_policy');
  const selected=roomActorAcquisitionInput({room,members,checkAuthority:scope.check,signal:scope.signal});scope.check();return Object.freeze({room:selected.room,members:selected.members,names:Object.freeze([...names,intentDatabase])});
 }finally{if(catalog)catalogApi.dispose.call(catalog);if(cut)cutApi.dispose.call(cut);}
}
