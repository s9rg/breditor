/** Explicit seven-family prefix cohort. Duplicate copies refuse selection as a
 * whole; retaining a file never makes an omitted historical copy reconciled. */
import {checkOperationalPhysicalSourceCohort,type OperationalPhysicalCohortSource} from '../server_generation_inventory/cohort_coverage.js';
import {checkNativeInputInventorySources,nativeInputInventoryRead,type NativeInputInventorySource} from '../native_input_operation/inventory_coverage.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {readPairedBackupRecord} from '../backups/paired.js';
import {bindIndependentPrefixSource,readBoundIndependentPrefix} from '../room_participant_inventory/independent_source.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {SharedRoomParticipantInventoryError,frozen} from '../room_participant_inventory/policy.js';
import type {SharedRoomParticipantInventoryMetadata,SharedRoomParticipantCoverage,SharedRoomParticipantMissing} from '../room_participant_inventory/types.js';
import {physicalCatalogV3FinalNativeWitness} from './final_native_witness.js';
export type PhysicalCatalogV3CohortSource=OperationalPhysicalCohortSource|NativeInputInventorySource;
const originalRecords=SharedParticipantBackup.prototype.records,originalSelection=SharedParticipantBackup.prototype.selection,generationSelection=SharedGenerationParticipantBackup.prototype.selection;
const fail=()=>new SharedRoomParticipantInventoryError('inventory_source','Select explicit genuine seven-family native sources');
const duplicate=()=>new SharedRoomParticipantInventoryError('inventory_duplicate','Reconcile every duplicate writer/actor copy explicitly; no branch was selected');
const key=(row:SharedRoomParticipantMissing)=>row.kind==='document'?'document:'+row.writer:row.kind==='review'?'review:'+row.actor:'unbound:'+row.participant+':'+row.actor;
function local(row:PhysicalCatalogV3CohortSource):row is NativeInputInventorySource{return row.family==='local-operation-snapshot'||row.family==='local-operation-flat';}
function actor(row:PhysicalCatalogV3CohortSource):string|undefined{
 if(local(row))return nativeInputInventoryRead(row).capture.metadata.identity.review.actor;
 if(row.family==='original'){const paired=originalRecords.call(row.backup).find(r=>r.kind==='paired-session');return paired?readPairedBackupRecord(paired.json,originalSelection.call(row.backup).identity.source).reviewActor:undefined;}
 if(row.family==='generation')return generationSelection.call(row.backup).identity.source.review?.actor;
 return readBoundIndependentPrefix(bindIndependentPrefixSource(row)).history.review.actor;
}
export function checkPhysicalCatalogV3Cohort(metadata:SharedRoomParticipantInventoryMetadata,input:readonly PhysicalCatalogV3CohortSource[]):SharedRoomParticipantCoverage{
 const rows=snapshotInventoryInputs(input,fail,row=>{if(!row||Object.keys(row).sort().join(',')!=='backup,family,source')throw fail();return{...row};}),final=physicalCatalogV3FinalNativeWitness(rows);
 const old=rows.filter((row):row is OperationalPhysicalCohortSource=>!local(row)),incoming=rows.filter(local),run=()=>[checkOperationalPhysicalSourceCohort(metadata,old),checkNativeInputInventorySources(metadata,incoming)],results=run(),writers=new Set<string>(),actors=new Set<string>();
 for(const result of results)for(const row of result.checkedParticipants){if(writers.has(row.writer))throw duplicate();writers.add(row.writer);}
 for(const row of rows){const value=actor(row);if(value!==undefined){if(actors.has(value))throw duplicate();actors.add(value);}}
 const maps=results.map(r=>new Map(r.missing.filter(row=>row.kind!=='unbound_review').map(row=>[key(row),row]))),missing:SharedRoomParticipantMissing[]=[];
 for(const row of results[0]!.missing)if(row.kind!=='unbound_review'&&maps.every(map=>map.has(key(row))))missing.push(maps.map(map=>map.get(key(row))!).find(value=>value.reason==='server_ahead')??row);
 const registeredStreamsCovered=missing.length===0;for(const result of results)missing.push(...result.missing.filter(row=>row.kind==='unbound_review'));
 const result=frozen({kind:missing.length?'pending' as const:'covered' as const,registeredStreamsCovered,checkedParticipants:results.flatMap(r=>r.checkedParticipants),missing});run();for(const row of rows)actor(row);final();
 return result;
}
