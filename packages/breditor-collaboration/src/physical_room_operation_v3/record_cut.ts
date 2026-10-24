/** Retain the SAME seven-family source reads, complete typed cut rows, literal
 * origin/graph inputs, catalog bytes and whole uploads in one portable file.
 * This never replaces a baseline, approves a selection or exposes a writer. */
import type {SharedSelectionPolicy} from '../types.js';
import type {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalOperationV3HistoryReadOptions,PhysicalOperationV3HistoryRead} from './history_read_contract.js';
import type {PhysicalRoomRecordCutFile} from '../physical_room_record_cut/contract.js';
import {encodePhysicalRoomRecordCut} from '../physical_room_record_cut/capture.js';
import {retainPhysicalRoomRecordCut,roomRecordCutDatabase} from '../physical_room_record_cut/retention.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {projectPhysicalOperationV3History} from './history_read.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {physicalOperationV3Failure as fail} from './policy.js';
export function capturePhysicalOperationV3RecordCut<P extends SharedSelectionPolicy>(state:PhysicalOperationV3Custody,held:()=>void,cleanup:RecoveryCleanupScope,input:PhysicalOperationV3HistoryReadOptions<P>,destination?:Readonly<{database:string}>):Promise<PhysicalRoomRecordCutFile>{
 // Requesting retention is distinct from supplying a valid destination. A
 // missing/undefined runtime database must never become portable-only success.
 const target=destination===undefined?undefined:roomRecordCutDatabase(destination.database);if(target!==undefined&&[state.database,state.held.database,...state.record.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))].includes(target))throw fail('physical_operation_v3_policy');
 return projectPhysicalOperationV3History(state,held,input,{cleanup,mode:'records-v1',visit:async scope=>{
  if(!scope.root||!scope.recordPayloads)throw fail('physical_operation_v3_policy');const selected=new Set(scope.root.record.participants.map(row=>row.id)),catalog=parsePhysicalCatalogV3Manifest(scope.root.record.source.manifest),history:PhysicalOperationV3HistoryRead=frozen(structuredClone({format:'breditor/physical-operation-v3-history-read',formatVersion:1,scope:'held-client-history-and-retained-catalog-bytes',selection:scope.root.record.source.selection,catalogFilesVerified:scope.root.files.length,history:scope.history,unreconciledParticipants:catalog.participants.filter(row=>!selected.has(row.id)).map(row=>row.id)}));
  let file=await encodePhysicalRoomRecordCut({root:scope.root,history,participants:scope.recordPayloads(),uploads:scope.uploads},{guard:scope.check,digest:scope.digest});scope.check();if(target!==undefined)file=await retainPhysicalRoomRecordCut(target,file,{check:scope.check,digest:scope.digest,signal:scope.signal,cleanup});scope.check();return{file,history};
 },project:(history,value)=>{if(JSON.stringify(history)!==JSON.stringify(value.history))throw fail('physical_operation_v3_diverged');return value.file;}}) as Promise<PhysicalRoomRecordCutFile>;
}
