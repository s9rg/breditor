/** Final lane/input fence after every seven-family policy and wrapper callback.
 * It complements, never replaces, complete source authorization/record checks.
 * Legacy retained-store epochs remain a separate reconciliation obligation. */
import {capturedNativeHistoryRead,capturedNativeHistoryFinalCheck} from '../native_history_read/registry.js';
import {nativeInputIncomingFinalCheck} from '../native_input_operation/incoming_source.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {restoredGraphArchive as graph} from '../restored_graph/archive.js';
import {portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {flatLocalArchive as flat} from '../flat_local_operation/archive.js';
import type {PhysicalCatalogV3CohortSource} from './coverage.js';
const originalFile=SharedParticipantBackup.prototype.file,generationFile=SharedGenerationParticipantBackup.prototype.file,localFile=SharedIndependentParticipantBackup.prototype.file,deliveryFile=SharedIndependentDeliveryParticipantBackup.prototype.file;
export function physicalCatalogV3FinalNativeWitness(rows:readonly PhysicalCatalogV3CohortSource[]):()=>void{
 const checks:(()=>void)[]=[];
 for(const row of rows){
  checks.push(capturedNativeHistoryFinalCheck(capturedNativeHistoryRead(row.source)));
  switch(row.family){
   case'original':checks.push(()=>{originalFile.call(row.backup);});break;
   case'generation':checks.push(()=>{generationFile.call(row.backup);});break;
   case'independent-local':checks.push(()=>{localFile.call(row.backup);});break;
   case'independent-delivery':checks.push(()=>{deliveryFile.call(row.backup);});break;
   case'restored-graph':checks.push(()=>{graph.file.call(row.backup);});break;
   case'local-operation-snapshot':checks.push(nativeInputIncomingFinalCheck(row.source),()=>{snapshot.file.call(row.backup);});break;
   case'local-operation-flat':checks.push(nativeInputIncomingFinalCheck(row.source),()=>{flat.file.call(row.backup);});break;
  }
 }
 return()=>{for(const check of checks)check();};
}
