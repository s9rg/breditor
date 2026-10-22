/** Canonical concrete archive readers. Local files remain local, delivery files
 * retain their bindings, and complete graph admission performs real native replay. */
import {archiveFields,archiveInteger} from '../archive_integrity/policy.js';
import {SharedParticipantBackup} from '../participant_backup/archive.js';
import {participantSelection} from '../participant_backup/policy.js';
import {MAX_SHARED_PARTICIPANT_BACKUP_BYTES} from '../participant_backup/format.js';
import {SharedGenerationParticipantBackup} from '../generation_participant/backup.js';
import {generationParticipantSelection} from '../generation_participant/policy.js';
import {MAX_GENERATION_PARTICIPANT_BYTES} from '../generation_participant/codec.js';
import {SharedIndependentParticipantBackup} from '../independent_participant/backup.js';
import {independentParticipantSelection} from '../independent_participant/policy.js';
import {MAX_INDEPENDENT_PARTICIPANT_BYTES} from '../independent_participant/codec.js';
import {SharedIndependentDeliveryParticipantBackup} from '../independent_delivery_participant/backup.js';
import {independentDeliveryParticipantSelection} from '../independent_delivery_participant/policy.js';
import {MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES} from '../independent_delivery_participant/codec.js';
import {RestoredOperationGraphArchive,restoredGraphArchive as graph} from '../restored_graph/archive.js';
import {operationBackupSelection} from '../independent_operation/portable_identity.js';
import {MAX_OPERATION_LINEAGE_BYTES} from '../independent_operation/lineage_codec.js';
import {physicalCatalogFailure,physicalCatalogName} from '../physical_room_catalog/policy.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import type {PhysicalRoomCatalogV2Entry} from './contract.js';

export type PhysicalCatalogV2Client=
 |Readonly<{family:'original';backup:SharedParticipantBackup}>
 |Readonly<{family:'generation';backup:SharedGenerationParticipantBackup}>
 |Readonly<{family:'independent-local';backup:SharedIndependentParticipantBackup}>
 |Readonly<{family:'independent-delivery';backup:SharedIndependentDeliveryParticipantBackup}>
 |Readonly<{family:'restored-graph';backup:RestoredOperationGraphArchive}>;
const readOriginal=SharedParticipantBackup.read,readGeneration=SharedGenerationParticipantBackup.read,readLocal=SharedIndependentParticipantBackup.read,readDelivery=SharedIndependentDeliveryParticipantBackup.read;
const disposeOriginal=SharedParticipantBackup.prototype.dispose,disposeGeneration=SharedGenerationParticipantBackup.prototype.dispose,disposeLocal=SharedIndependentParticipantBackup.prototype.dispose,disposeDelivery=SharedIndependentDeliveryParticipantBackup.prototype.dispose;
type ParticipantHeader=PhysicalRoomCatalogV2Entry extends infer T?T extends PhysicalRoomCatalogV2Entry?Omit<T,'bytes'>:never:never;
export function physicalCatalogV2ParticipantHeader(input:unknown):ParticipantHeader{
 const row=archiveFields(input,'id,family,selection'),id=physicalCatalogName(row['id']);
 switch(row['family']){
  case'original':return{id,family:'original',selection:participantSelection(row['selection'])};
  case'generation':return{id,family:'generation',selection:generationParticipantSelection(row['selection'])};
  case'independent-local':return{id,family:'independent-local',selection:independentParticipantSelection(row['selection'])};
  case'independent-delivery':return{id,family:'independent-delivery',selection:independentDeliveryParticipantSelection(row['selection'])};
  case'restored-graph':return{id,family:'restored-graph',selection:operationBackupSelection(row['selection'])};
  default:throw physicalCatalogFailure('catalog_policy');
 }
}
export function physicalCatalogV2Participant(input:unknown):PhysicalRoomCatalogV2Entry{
 const row=archiveFields(input,'id,family,selection,bytes'),header=physicalCatalogV2ParticipantHeader({id:row['id'],family:row['family'],selection:row['selection']});return{...header,bytes:archiveInteger(row['bytes'],1,physicalCatalogV2ParticipantMaximum(header.family))};
}
export function physicalCatalogV2ParticipantMaximum(family:PhysicalRoomCatalogV2Entry['family']):number{
 switch(family){case'original':return MAX_SHARED_PARTICIPANT_BACKUP_BYTES;case'generation':return MAX_GENERATION_PARTICIPANT_BYTES;case'independent-local':return MAX_INDEPENDENT_PARTICIPANT_BYTES;case'independent-delivery':return MAX_INDEPENDENT_DELIVERY_PARTICIPANT_BYTES;case'restored-graph':return MAX_OPERATION_LINEAGE_BYTES;default:throw physicalCatalogFailure('catalog_policy');}
}
export async function readPhysicalCatalogV2Participant(row:PhysicalRoomCatalogV2Entry,file:Blob,options:IndependentOperationReadOptions|undefined,signal?:AbortSignal):Promise<PhysicalCatalogV2Client>{
 const bytes=signal?{signal}:{};
 switch(row.family){
  case'original':return Object.freeze({family:row.family,backup:await readOriginal.call(SharedParticipantBackup,file,row.selection,bytes)});
  case'generation':return Object.freeze({family:row.family,backup:await readGeneration.call(SharedGenerationParticipantBackup,file,row.selection,bytes)});
  case'independent-local':return Object.freeze({family:row.family,backup:await readLocal.call(SharedIndependentParticipantBackup,file,row.selection,bytes)});
  case'independent-delivery':return Object.freeze({family:row.family,backup:await readDelivery.call(SharedIndependentDeliveryParticipantBackup,file,row.selection,bytes)});
  case'restored-graph':if(!options)throw physicalCatalogFailure('catalog_policy');return Object.freeze({family:row.family,backup:await graph.read.call(RestoredOperationGraphArchive,file,row.selection,options)});
 }
}
export function disposePhysicalCatalogV2Participant(row:PhysicalCatalogV2Client):void{
 switch(row.family){case'original':disposeOriginal.call(row.backup);break;case'generation':disposeGeneration.call(row.backup);break;case'independent-local':disposeLocal.call(row.backup);break;case'independent-delivery':disposeDelivery.call(row.backup);break;case'restored-graph':graph.dispose.call(row.backup);break;}
}
