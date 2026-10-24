/** Internal complete-data encoder. The genuine root holds/re-admits sources
 * before and after this work. This encoder itself never manufactures custody. */
import type {ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {checkPhysicalOperationV3Record} from '../physical_room_operation_v3/record.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {physicalParticipantKey} from '../physical_room_catalog/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {PhysicalRoomRecordCutCapture,PhysicalRoomRecordCutFile} from './contract.js';
import type {RecordCutEntry,RecordCutEntryKind,RecordCutManifest} from './manifest.js';
import {checkRecordCutSource,readRecordCutManifest,recordCutInputRoles} from './manifest.js';
import {recordCutJson} from './json.js';
import {recordCutPrefix,ROOM_RECORD_CUT_MIME} from './framing.js';
import {fail,MAX_ROOM_RECORD_CUT_BYTES,MAX_ROOM_RECORD_CUT_HEADER_BYTES,MAX_ROOM_RECORD_CUT_ENTRIES} from './policy.js';
export async function encodePhysicalRoomRecordCut(input:PhysicalRoomRecordCutCapture,context:Pick<ArchiveIntegrityContext,'guard'|'digest'>):Promise<PhysicalRoomRecordCutFile>{
 context.guard();const root=checkPhysicalOperationV3Record(input.root.record);if(root.phase!=='operational'||root.database!==input.root.operationDatabase||root.source.catalogDatabase!==input.root.catalogDatabase||JSON.stringify(input.history.selection)!==JSON.stringify(root.source.selection)||input.participants.length!==root.participants.length||input.uploads.length!==root.participants.length)throw fail('record_cut_source');
 const entries:RecordCutEntry[]=[],files:Blob[]=[];let total=0;
 const add=async(kind:RecordCutEntryKind,input:Blob)=>{context.guard();if(entries.length>=MAX_ROOM_RECORD_CUT_ENTRIES)throw fail('record_cut_budget');const file=archiveBlob(input,MAX_ROOM_RECORD_CUT_BYTES);total+=file.size;if(total>MAX_ROOM_RECORD_CUT_BYTES)throw fail('record_cut_budget');const sha256=await context.digest(file);context.guard();const at=entries.length;entries.push({kind,bytes:file.size,mime:file.type,sha256});files.push(file);return at;};
 const json=(value:unknown)=>new Blob([recordCutJson(value)],{type:'application/json'}),rootEntry=await add('root',json(root)),history=await add('history',json(input.history)),metadata=parsePhysicalCatalogV3Manifest(root.source.manifest),expected=new Map<string,number>([['origin-server',metadata.origin.bytes],['current-server',metadata.current.server.bytes],['inventory',metadata.current.participants.bytes],...metadata.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as [string,number])]),catalog=[];
 if(input.root.files.length!==expected.size)throw fail('record_cut_source');for(const row of input.root.files){if(expected.get(row.name)!==row.file.size)throw fail('record_cut_source');expected.delete(row.name);catalog.push({name:row.name,entry:await add('catalog',row.file)});}if(expected.size)throw fail('record_cut_source');
 const participants=[];for(const[index,row]of input.participants.entries()){
  context.guard();const selected=root.participants[index],uploads=input.uploads[index];if(!selected||selected.id!==row.id||selected.family!==row.family||row.payload.family!==row.family||uploads?.id!==row.id||uploads.family!==row.family||JSON.stringify(row.payload.files.map(f=>f.role))!==JSON.stringify(recordCutInputRoles(row.family)))throw fail('record_cut_source');checkRecordCutSource(row.payload.state,row.family);
  const records=await add('records',json(row.payload.state)),upload=await add('uploads',uploads.file),inputs=[];for(const file of row.payload.files)inputs.push({role:file.role,entry:await add('input',file.file)});participants.push({id:row.id,family:row.family,records,uploads:upload,files:inputs});
 }
 const manifest:RecordCutManifest={format:'breditor/physical-room-record-cut',formatVersion:1,root:rootEntry,history,catalog,participants,entries},header=recordCutJson(manifest,MAX_ROOM_RECORD_CUT_HEADER_BYTES);readRecordCutManifest(header);const bytes=new TextEncoder().encode(header),file=new Blob([recordCutPrefix(bytes.length),bytes,...files],{type:ROOM_RECORD_CUT_MIME});if(file.size>MAX_ROOM_RECORD_CUT_BYTES)throw fail('record_cut_budget');const sha256=await context.digest(file);context.guard();return Object.freeze({selection:frozen({format:'breditor/physical-room-record-cut-selection' as const,formatVersion:1 as const,bytes:file.size,sha256}),file});
}
