/** Literal original and parent-input delivery facts remain part of containment.
 * Existing archive readers validate bytes; no new writer or namespace is created. */
import {SharedParticipantBackup as OriginalBackup} from '../participant_backup/archive.js';
import type {SharedParticipantBackupSelection} from '../participant_backup/types.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {SharedIndependentDeliveryParticipantBackup as DeliveryBackup} from '../independent_delivery_participant/backup.js';
import {SharedGenerationParticipantBackup as GenerationBackup} from '../generation_participant/backup.js';
import type {SharedIndependentDeliveryParticipantSelection} from '../independent_delivery_participant/contract.js';
import type {SharedGenerationParticipantSelection} from '../generation_participant/contract.js';
import type {SharedIndependentDeliveryRecoveryFactory} from '../independent_delivery_recovery/contract.js';
import {readRestoredOperationInput} from '../restored_operation/input.js';
import {portableCutRecovery} from '../independent_operation/portable_cut.js';
import type {RecordPayloadFamily} from '../operation_read/record_payload.js';
import type {SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {participantMetadataRecords} from './record_points.js';
import {object,text,fail,same} from './policy.js';
const inputs=PhysicalRoomRecordCutArchive.prototype.inputs,root=PhysicalRoomRecordCutArchive.prototype.root;
const original={read:OriginalBackup.read,records:OriginalBackup.prototype.records,dispose:OriginalBackup.prototype.dispose};
const delivery={read:DeliveryBackup.read,records:DeliveryBackup.prototype.records,dispose:DeliveryBackup.prototype.dispose};
const generation={read:GenerationBackup.read,records:GenerationBackup.prototype.records,dispose:GenerationBackup.prototype.dispose};
export async function visitOriginalReceiptPoints(cut:PhysicalRoomRecordCutArchive,id:string,family:RecordPayloadFamily,payload:unknown,session:SharedIndependentDeliveryRecoveryFactory|undefined,signal:AbortSignal,check:()=>void,visit:(point:string,records:SegmentedRetainedRecords)=>void|Promise<void>):Promise<void>{
 check();const source=object(object(payload)['source']),files=inputs.call(cut,id);
 if(family==='original'){
  const file=files.find(row=>row.role==='operation-origin');if(!file)throw fail();
  const selection=object(object(payload)['parent'])['selection'] as SharedParticipantBackupSelection;let archive:OriginalBackup|undefined;
  try{archive=await original.read.call(OriginalBackup,file.file,selection,{signal});check();await visit('operation-origin',participantMetadataRecords(original.records.call(archive)));check();}finally{if(archive)original.dispose.call(archive);}
  return;
 }
 if(family==='generation'){
  const parent=object(object(payload)['parent']),selection=parent['selection'] as SharedGenerationParticipantSelection;
  for(const file of files){let archive:GenerationBackup|undefined;try{archive=await generation.read.call(GenerationBackup,file.file,selection,{signal});check();await visit(file.role,participantMetadataRecords(generation.records.call(archive)));check();}finally{if(archive)generation.dispose.call(archive);}}
  return;
 }
 if(family!=='independent-delivery'&&family!=='restored-graph')return;
 const origin=files.find(row=>row.role==='source-origin');if(!origin)throw fail();
 let archive:DeliveryBackup|undefined;
 try{archive=await delivery.read.call(DeliveryBackup,origin.file,source['original'] as SharedIndependentDeliveryParticipantSelection,{signal});check();await visit('source-origin',participantMetadataRecords(delivery.records.call(archive)));check();}finally{if(archive)delivery.dispose.call(archive);}
 if(family!=='restored-graph')return;
 const file=files.find(row=>row.role==='parent-input'),input=object(source['input']),member=root.call(cut).participants.find(row=>row.id===id);
 if(!file||!member||!session)throw fail();const namespace=(role:string)=>{const value=member.namespaces.find(row=>row.role===role);if(!value)throw fail();return value.database;};
 const kind=input['kind'];if(kind!=='snapshot-v1'&&kind!=='lineage-v1'&&kind!=='lineage-v2')throw fail();
 const prepared=await readRestoredOperationInput(file.file,{kind,expected:input['selection'] as Parameters<typeof readRestoredOperationInput>[1]['expected'],database:namespace('journal'),sourceDatabase:namespace('source'),cohort:{coordinatorDatabase:namespace('operation'),uploadsDatabase:namespace('uploads')},session,writerRecovery:'host-reacquired',checkAuthority:check,signal});
 try{
  check();if(prepared.fileSha256!==text(input['fileSha256'])||!same(prepared.identity,source['identity']))throw fail();
  for(const[index,selected]of prepared.targets.entries()){const recovery=await portableCutRecovery(prepared.factory,prepared.identity,selected);check();await visit('parent-input:'+index,recovery.retained);check();}
 }finally{prepared.dispose();}
}
