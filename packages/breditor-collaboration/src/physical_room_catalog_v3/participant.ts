/** Exact seven-family admission. Five unchanged families use their existing
 * concrete readers; local snapshot and flat each invoke their own native reader. */
import {archiveFields,archiveInteger} from '../archive_integrity/policy.js';
import {physicalCatalogFailure} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2ParticipantHeader,physicalCatalogV2ParticipantMaximum,readPhysicalCatalogV2Participant,disposePhysicalCatalogV2Participant,type PhysicalCatalogV2Client} from '../physical_room_catalog_v2/participant.js';
import type {IndependentOperationReadOptions} from '../independent_operation/portable_policy.js';
import {localOperationBackupSelection} from '../independent_local_operation/portable_identity.js';
import {MAX_LOCAL_OPERATION_BACKUP_BYTES} from '../independent_local_operation/portable_codec.js';
import {IndependentLocalOperationBackup,portableLocalOperationArchive as snapshot} from '../independent_local_operation/portable_backup.js';
import {MAX_FLAT_LOCAL_BYTES} from '../flat_local_operation/limits.js';
import {FlatLocalArchive,flatLocalArchive as flat} from '../flat_local_operation/archive.js';
import type {LocalOperationReadOptions} from '../independent_local_operation/portable_policy.js';
import {physicalCatalogName} from '../physical_room_catalog/policy.js';
import type {PhysicalRoomCatalogV3Entry} from './contract.js';

export type PhysicalCatalogV3Client=PhysicalCatalogV2Client
 |Readonly<{family:'local-operation-snapshot';backup:IndependentLocalOperationBackup}>
 |Readonly<{family:'local-operation-flat';backup:FlatLocalArchive}>;
type Header=PhysicalRoomCatalogV3Entry extends infer T?T extends PhysicalRoomCatalogV3Entry?Omit<T,'bytes'>:never:never;
const legacy=['original','generation','independent-local','independent-delivery','restored-graph'] as const;
export function physicalCatalogV3ParticipantHeader(input:unknown):Header{
 const row=archiveFields(input,'id,family,selection');
 if(row['family']==='local-operation-snapshot'||row['family']==='local-operation-flat')return{id:physicalCatalogName(row['id']),family:row['family'],selection:localOperationBackupSelection(row['selection'])};
 return physicalCatalogV2ParticipantHeader(row);
}
export function physicalCatalogV3ParticipantMaximum(family:PhysicalRoomCatalogV3Entry['family']):number{
 if(family==='local-operation-snapshot')return MAX_LOCAL_OPERATION_BACKUP_BYTES;
 if(family==='local-operation-flat')return MAX_FLAT_LOCAL_BYTES;
 return physicalCatalogV2ParticipantMaximum(family);
}
export function physicalCatalogV3Participant(input:unknown):PhysicalRoomCatalogV3Entry{
 const row=archiveFields(input,'id,family,selection,bytes'),header=physicalCatalogV3ParticipantHeader({id:row['id'],family:row['family'],selection:row['selection']});
 return{...header,bytes:archiveInteger(row['bytes'],1,physicalCatalogV3ParticipantMaximum(header.family))};
}
/** Missing local policy refuses before a native factory. A graph's policy is
 * never reused as permission to read an unrelated local archive. */
export async function readPhysicalCatalogV3Participant(row:PhysicalRoomCatalogV3Entry,file:Blob,graphPolicy:IndependentOperationReadOptions|undefined,localPolicy:LocalOperationReadOptions|undefined,signal?:AbortSignal):Promise<PhysicalCatalogV3Client>{
 switch(row.family){
  case'local-operation-snapshot':if(!localPolicy||graphPolicy)throw physicalCatalogFailure('catalog_policy');return Object.freeze({family:row.family,backup:await snapshot.read.call(IndependentLocalOperationBackup,file,row.selection,localPolicy)});
  case'local-operation-flat':if(!localPolicy||graphPolicy)throw physicalCatalogFailure('catalog_policy');return Object.freeze({family:row.family,backup:await flat.read.call(FlatLocalArchive,file,row.selection,localPolicy)});
  default:if(localPolicy||!legacy.includes(row.family))throw physicalCatalogFailure('catalog_policy');return readPhysicalCatalogV2Participant(row,file,graphPolicy,signal);
 }
}
export function disposePhysicalCatalogV3Participant(row:PhysicalCatalogV3Client):void{
 if(row.family==='local-operation-snapshot')snapshot.dispose.call(row.backup);
 else if(row.family==='local-operation-flat')flat.dispose.call(row.backup);
 else disposePhysicalCatalogV2Participant(row);
}
