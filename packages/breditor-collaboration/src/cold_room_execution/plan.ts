/** Complete source/target names and same-author membership are admitted BEFORE
 * requesting a fresh actor. No saved run stage can manufacture an actor grant. */
import {coldRoomActorPlan} from '../cold_room_recovery/plan.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {RoomExecutionArchive} from '../native_room_execution/archive.js';
import {withExecutionPrepared} from '../native_room_execution/prepared_scope.js';
import {preflightPhysicalOperationV3} from '../physical_room_operation_v3/preflight.js';
import {physicalCatalogV3ArchiveState} from '../physical_room_catalog_v3/archive.js';
import {checkRoomRunInputs} from '../native_room_execution_run/prepare_inputs.js';
import {executionNames} from '../native_room_execution/plan.js';
import {fail} from '../native_room_execution/policy.js';
import type {ColdRoomExecutionOptions} from './contract.js';
import type {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
export async function coldRoomExecutionPlan(archive:RoomExecutionArchive,options:ColdRoomExecutionOptions,scope:RoomExecutionReadScope){
 await checkRoomRunInputs(archive,options.run.expected,options.run.participants,scope);scope.check();
 return withExecutionPrepared(archive.preparation(),scope,async context=>{
  const basis=context.before.file(),opened=await SelectedRoomCurrentArchive.read(basis.file,basis.selection,{wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal});
  try{const plan=await coldRoomActorPlan(opened,options.original,options.sourceIntentDatabase,scope);scope.check();const layout=options.run.expected.execution.plan.layout,prepared=preflightPhysicalOperationV3(options.run.participants,physicalCatalogV3ArchiveState(context.catalog),layout.operationDatabase,layout.catalogDatabase);
   const targets=prepared.map(row=>({id:row.target.id,factory:row.target.family==='original'?(row.identity.actor===undefined?'shared':'review'):row.target.family==='generation'?'segmented':'independent',writer:row.identity.writer,actor:row.identity.actor??null}));
   if(prepared.some(row=>row.identity.room!==plan.room)||JSON.stringify(targets)!==JSON.stringify(plan.members))throw fail('room_execution_policy');
   const used=new Set(plan.names),names=[options.run.expected.database,options.run.expected.execution.plan.preparation.plan.database,...executionNames(layout),...prepared.flatMap(row=>row.target.namespaces.map(ns=>ns.database))];
   if(new Set(names).size!==names.length||names.some(name=>used.has(name)))throw fail('room_execution_policy');scope.check();
   return Object.freeze({...plan,basis,adoption:context.before.approval()});
  }finally{opened.dispose();}
 });
}
