/** Detach one complete DATA request before authority callbacks or asynchronous
 * hashes can change caller-owned rows. Native strings stay opaque and byte exact.
 * This plan grants no source custody, writer identity, storage or activation. */
import {archiveBlob} from '../archive_integrity/policy.js';
import {checkPhysicalOperationV3Record} from '../physical_room_operation_v3/record.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {physicalParticipantKey} from '../physical_room_catalog/policy.js';
import type {PhysicalRoomRecordCutCapture} from './contract.js';
import type {RecordCutEntryKind,RecordCutManifest,RecordCutParticipant} from './manifest.js';
import {checkRecordCutSource,recordCutInputRoles} from './manifest.js';
import {recordCutJson} from './json.js';
import {fields,rows,fail,MAX_ROOM_RECORD_CUT_BYTES,MAX_ROOM_RECORD_CUT_ENTRIES,MAX_ROOM_RECORD_CUT_PARTICIPANTS} from './policy.js';

interface PreparedEntry {readonly kind:RecordCutEntryKind;readonly file:Blob}
export interface PreparedRecordCutCapture {
 readonly root:number;readonly history:number;
 readonly catalog:RecordCutManifest['catalog'];
 readonly participants:readonly RecordCutParticipant[];
 readonly entries:readonly PreparedEntry[];
}
/** Synchronous and bounded; no authority or digest callback runs here. Copies JSON into literal
 * immutable Blob bytes, and retains independent Blob wrappers for binary inputs.
 * No caller object, array or descriptor is read again by the hashing phase. */
export function prepareRecordCutCapture(input:PhysicalRoomRecordCutCapture):PreparedRecordCutCapture {
 const raw=fields(input,['root','history','participants','uploads']),r=fields(raw['root'],['operationDatabase','catalogDatabase','record','files']);
 const root=checkPhysicalOperationV3Record(r['record']),historyJson=recordCutJson(raw['history']),history=fields(raw['history'],['format','formatVersion','scope','selection','catalogFilesVerified','history','unreconciledParticipants']);
 const people=rows(raw['participants'],MAX_ROOM_RECORD_CUT_PARTICIPANTS),uploads=rows(raw['uploads'],MAX_ROOM_RECORD_CUT_PARTICIPANTS);
 if(root.phase!=='operational'||root.database!==r['operationDatabase']||root.source.catalogDatabase!==r['catalogDatabase']||JSON.stringify(history['selection'])!==JSON.stringify(root.source.selection)||people.length!==root.participants.length||uploads.length!==root.participants.length)throw fail('record_cut_source');
 const entries:PreparedEntry[]=[];let total=0;
 const add=(kind:RecordCutEntryKind,input:Blob)=>{
  if(entries.length>=MAX_ROOM_RECORD_CUT_ENTRIES)throw fail('record_cut_budget');
  const file=Object.freeze(archiveBlob(input,MAX_ROOM_RECORD_CUT_BYTES));total+=file.size;if(total>MAX_ROOM_RECORD_CUT_BYTES)throw fail('record_cut_budget');
  const at=entries.length;entries.push(Object.freeze({kind,file}));return at;
 };
 const json=(text:string)=>new Blob([text],{type:'application/json'}),rootEntry=add('root',json(recordCutJson(root))),historyEntry=add('history',json(historyJson));
 const metadata=parsePhysicalCatalogV3Manifest(root.source.manifest),expected=new Map<string,number>([['origin-server',metadata.origin.bytes],['current-server',metadata.current.server.bytes],['inventory',metadata.current.participants.bytes],...metadata.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as [string,number])]);
 const catalogFiles=rows(r['files'],MAX_ROOM_RECORD_CUT_ENTRIES),catalog=[];
 if(catalogFiles.length!==expected.size)throw fail('record_cut_source');
 for(const value of catalogFiles){const row=fields(value,['name','file']),name=row['name'],entry=add('catalog',row['file'] as Blob);if(typeof name!=='string'||expected.get(name)!==entries[entry]!.file.size)throw fail('record_cut_source');expected.delete(name);catalog.push(Object.freeze({name,entry}));}
 if(expected.size)throw fail('record_cut_source');
 const participants=[];
 for(const[index,value]of people.entries()){
  const row=fields(value,['id','family','payload']),payload=fields(row['payload'],['family','state','files']),upload=fields(uploads[index],['id','family','file']),selected=root.participants[index]!,files=rows(payload['files'],2).map(value=>fields(value,['role','file']));
  if(selected.id!==row['id']||selected.family!==row['family']||payload['family']!==selected.family||upload['id']!==selected.id||upload['family']!==selected.family||JSON.stringify(files.map(f=>f['role']))!==JSON.stringify(recordCutInputRoles(selected.family)))throw fail('record_cut_source');
  checkRecordCutSource(payload['state'],selected.family);
  const records=add('records',json(recordCutJson(payload['state']))),uploadEntry=add('uploads',upload['file'] as Blob),inputs=files.map(file=>Object.freeze({role:file['role'] as string,entry:add('input',file['file'] as Blob)}));
  participants.push(Object.freeze({id:selected.id,family:selected.family,records,uploads:uploadEntry,files:Object.freeze(inputs)}));
 }
 return Object.freeze({root:rootEntry,history:historyEntry,catalog:Object.freeze(catalog),participants:Object.freeze(participants),entries:Object.freeze(entries)});
}
