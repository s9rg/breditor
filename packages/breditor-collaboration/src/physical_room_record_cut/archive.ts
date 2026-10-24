/** Independently selected portable data. Integrity/closed framing is not native
 * owner admission: replay and current policy remain mandatory before editing.
 * No stored phase, writer credential, mutable source or release capability is
 * accepted or returned. Disposal drops all payload/file references and grants.
 */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {checkPhysicalOperationV3Record,type PhysicalOperationV3Record} from '../physical_room_operation_v3/record.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {physicalParticipantKey} from '../physical_room_catalog/policy.js';
import type {PhysicalOperationV3HistoryRead} from '../physical_room_operation_v3/history_read_contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {PhysicalRoomRecordCutMetadata,PhysicalRoomRecordCutSelection} from './contract.js';
import {readRecordCutManifest,checkRecordCutSource,type RecordCutManifest} from './manifest.js';
import {parseRecordCutJson} from './json.js';
import {recordCutHeader,recordCutBytes} from './framing.js';
import {fail,fields,integer,hash,MAX_ROOM_RECORD_CUT_BYTES,MAX_ROOM_RECORD_CUT_JSON_BYTES} from './policy.js';
interface State{readonly file:Blob;readonly manifest:RecordCutManifest;readonly entries:readonly Blob[];readonly root:PhysicalOperationV3Record;readonly history:PhysicalOperationV3HistoryRead}
const key=Object.freeze({}),slice=Blob.prototype.slice,arrayBuffer=Blob.prototype.arrayBuffer;
export function recordCutSelection(value:unknown):PhysicalRoomRecordCutSelection{const r=fields(value,['format','formatVersion','bytes','sha256']);if(r['format']!=='breditor/physical-room-record-cut-selection'||r['formatVersion']!==1)throw fail();return frozen({format:'breditor/physical-room-record-cut-selection',formatVersion:1,bytes:integer(r['bytes'],MAX_ROOM_RECORD_CUT_BYTES,1),sha256:hash(r['sha256'])});}
async function readJson(file:Blob,context:ArchiveIntegrityContext):Promise<unknown>{if(file.type!=='application/json'||file.size>MAX_ROOM_RECORD_CUT_JSON_BYTES)throw fail('record_cut_budget');const bytes=await recordCutBytes(file,0,file.size,context);let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail();}return parseRecordCutJson(text);}
function historyData(input:unknown,root:PhysicalOperationV3Record,files:number):PhysicalOperationV3HistoryRead{
 const r=fields(input,['format','formatVersion','scope','selection','catalogFilesVerified','history','unreconciledParticipants']);if(r['format']!=='breditor/physical-operation-v3-history-read'||r['formatVersion']!==1||r['scope']!=='held-client-history-and-retained-catalog-bytes'||JSON.stringify(r['selection'])!==JSON.stringify(root.source.selection)||r['catalogFilesVerified']!==files)throw fail('record_cut_integrity');
 const h=fields(r['history'],['format','formatVersion','scope','participants','kind','references']);if(h['format']!=='breditor/complete-operational-history-read'||h['formatVersion']!==1||h['scope']!=='held-seven-family-protected-history-records'||!['ready','pending'].includes(String(h['kind']))||!Array.isArray(h['participants'])||h['participants'].length!==root.participants.length||!Array.isArray(h['references']))throw fail();
 for(const[i,row]of h['participants'].entries()){const p=fields(row,['id','family','history']),expected=root.participants[i];if(!expected||p['id']!==expected.id||p['family']!==expected.family)throw fail('record_cut_integrity');}
 const selected=new Set(root.participants.map(row=>row.id)),unreconciled=parsePhysicalCatalogV3Manifest(root.source.manifest).participants.filter(row=>!selected.has(row.id)).map(row=>row.id);if(JSON.stringify(r['unreconciledParticipants'])!==JSON.stringify(unreconciled))throw fail('record_cut_integrity');return input as PhysicalOperationV3HistoryRead;
}
export class PhysicalRoomRecordCutArchive{
 readonly #metadata:PhysicalRoomRecordCutMetadata;#state:State|undefined;
 private constructor(token:object,metadata:PhysicalRoomRecordCutMetadata,state:State){if(token!==key)throw fail();this.#metadata=frozen(metadata);this.#state=state;Object.freeze(this);}
 metadata(){return this.#metadata;}
 selection(){return this.#metadata.selection;}
 #open():State{if(!this.#state)throw fail('record_cut_closed');return this.#state;}
 file():Blob{return this.#open().file;}
 root():PhysicalOperationV3Record{return structuredClone(this.#open().root);}
 history():PhysicalOperationV3HistoryRead{return structuredClone(this.#open().history);}
 catalogFiles():ReadonlyMap<string,Blob>{const state=this.#open();return new Map(state.manifest.catalog.map(row=>[row.name,state.entries[row.entry]!]));}
 uploads(id:string):Blob{const state=this.#open(),row=state.manifest.participants.find(row=>row.id===id);if(!row)throw fail();return state.entries[row.uploads]!;}
 inputs(id:string):readonly Readonly<{role:string;file:Blob}>[]{const state=this.#open(),row=state.manifest.participants.find(row=>row.id===id);if(!row)throw fail();return Object.freeze(row.files.map(file=>Object.freeze({role:file.role,file:state.entries[file.entry]!})));}
 async records(id:string):Promise<unknown>{const state=this.#open(),row=state.manifest.participants.find(row=>row.id===id);if(!row)throw fail();const file=state.entries[row.records]!,bytes=await arrayBuffer.call(file);if(this.#open()!==state)throw fail('record_cut_closed');let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail();}const value=parseRecordCutJson(text);checkRecordCutSource(value,row.family);if(this.#open()!==state)throw fail('record_cut_closed');return value;}
 dispose():void{this.#state=undefined;}
 static async read(input:Blob,provided:PhysicalRoomRecordCutSelection,options:SharedArchiveIntegrityOptions):Promise<PhysicalRoomRecordCutArchive>{
  const selected=recordCutSelection(provided),choice=fields(options,['wasm','checkAuthority'],['signal']),authority=participantAuthority(choice['checkAuthority'] as ()=>void),signal=choice['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal),check=()=>{observation.check(()=>fail('record_cut_aborted'));authority();observation.check(()=>fail('record_cut_aborted'));};let result:PhysicalRoomRecordCutArchive|undefined;
  try{const context=prepareArchiveIntegrity({wasm:choice['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check}),file=archiveBlob(input,MAX_ROOM_RECORD_CUT_BYTES);if(file.size!==selected.bytes||await context.digest(file)!==selected.sha256)throw fail('record_cut_integrity');const header=await recordCutHeader(file,context),manifest=readRecordCutManifest(header.text),entries:Blob[]=[];let offset=header.offset;
   for(const row of manifest.entries){if(offset+row.bytes>file.size)throw fail('record_cut_integrity');const part=slice.call(file,offset,offset+row.bytes,row.mime);if(await context.digest(part)!==row.sha256)throw fail('record_cut_integrity');entries.push(part);offset+=row.bytes;}if(offset!==file.size)throw fail('record_cut_integrity');
   const root=checkPhysicalOperationV3Record(await readJson(entries[manifest.root]!,context));if(root.phase!=='operational'||root.participants.length!==manifest.participants.length)throw fail();for(const[i,row]of manifest.participants.entries())if(row.id!==root.participants[i]?.id||row.family!==root.participants[i]?.family)throw fail('record_cut_integrity');
   const catalog=parsePhysicalCatalogV3Manifest(root.source.manifest),expected=new Map<string,number>([['origin-server',catalog.origin.bytes],['current-server',catalog.current.server.bytes],['inventory',catalog.current.participants.bytes],...catalog.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as [string,number])]);if(manifest.catalog.length!==expected.size)throw fail('record_cut_integrity');for(const row of manifest.catalog){if(expected.get(row.name)!==entries[row.entry]!.size)throw fail('record_cut_integrity');expected.delete(row.name);}if(expected.size||await context.digest(new Blob([root.source.manifest]))!==root.source.selection.sha256)throw fail('record_cut_integrity');
   const history=historyData(await readJson(entries[manifest.history]!,context),root,manifest.catalog.length);for(const row of manifest.participants)checkRecordCutSource(await readJson(entries[row.records]!,context),row.family);
   const metadata:PhysicalRoomRecordCutMetadata={format:'breditor/physical-room-record-cut',formatVersion:1,scope:'complete-selected-client-payloads-and-literal-room-inputs',selection:selected,operationDatabase:root.database,catalogDatabase:root.source.catalogDatabase,catalog:root.source.selection,participants:manifest.participants.map(row=>({id:row.id,family:row.family,inputFiles:row.files.length})),unreconciledParticipants:history.unreconciledParticipants,catalogFiles:manifest.catalog.length,archiveEntries:entries.length};result=new PhysicalRoomRecordCutArchive(key,metadata,{file,manifest,entries,root,history});check();return result;
  }catch(error){result?.dispose();throw error;}finally{observation.close();}
 }
}
