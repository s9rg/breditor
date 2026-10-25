/** Complete framed before-file and original accepted pages. Every page is
 * request/selection bound and the cursor chain must terminate. Read admission
 * proves data integrity, not historic authentication or permission to import. */
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {recordCutBytes} from '../physical_room_record_cut/framing.js';
import {recordCutJson,parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {physicalAcceptedChoices,preparePhysicalAcceptedRequest} from '../physical_recovery_control/accepted_request.js';
import {readPhysicalAcceptedNative} from '../physical_recovery_control/accepted_response.js';
import {MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES,type SharedPhysicalRecoveryAcceptedRequest,type SharedPhysicalRecoveryAcceptedRead} from '../physical_recovery_control/accepted_contract.js';
import {fields,rows,integer,fail,MAX_NATIVE_IMPORT_BYTES,MAX_NATIVE_IMPORT_HEADER_BYTES,MAX_NATIVE_IMPORT_PAGES,NATIVE_IMPORT_MAGIC as magic,NATIVE_IMPORT_MIME as mime} from './policy.js';
import {nativeImportSelection,nativeImportManifest} from './manifest.js';
import type {SelectedNativeImportSelection,SelectedNativeImportInput,SelectedNativeImportManifest,SelectedNativeImportFile} from './contract.js';
const prefixBytes=magic.length+4,key=Object.freeze({}),slice=Blob.prototype.slice;
const before={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,dispose:SelectedRoomCurrentArchive.prototype.dispose},cut={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
function policy(options:SharedArchiveIntegrityOptions){const r=fields(options,['wasm','checkAuthority'],['signal']),authority=participantAuthority(r['checkAuthority'] as ()=>void),observation=new OperationalReadCancellation(r['signal'] as AbortSignal|undefined),check=()=>{observation.check(()=>fail('native_import_aborted'));authority();observation.check(()=>fail('native_import_aborted'));};try{const context=prepareArchiveIntegrity({wasm:r['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check});return{context,check,close:()=>observation.close()};}catch(error){observation.close();throw error;}}
async function page(file:Blob,manifest:SelectedNativeImportManifest,index:number,context:ReturnType<typeof prepareArchiveIntegrity>):Promise<SharedPhysicalRecoveryAcceptedRead>{const selected=manifest.pages[index];if(!selected||file.size!==selected.bytes||await context.digest(file)!==selected.sha256)throw fail();let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await recordCutBytes(file,0,file.size,context));}catch{throw fail();}const request=await preparePhysicalAcceptedRequest(manifest.server,selected.request);context.guard();return readPhysicalAcceptedNative(text,manifest.server,request.sha256,selected.request);}
export async function encodeSelectedNativeImport(input:SelectedNativeImportInput,options:SharedArchiveIntegrityOptions):Promise<SelectedNativeImportFile>{
 const r=fields(input,['server','before','pages']),b=fields(r['before'],['selection','file']),beforeFile=archiveBlob(b['file'] as Blob,MAX_NATIVE_IMPORT_BYTES),pages=rows(r['pages'],MAX_NATIVE_IMPORT_PAGES).map(value=>{const row=fields(value,['request','file']);return{request:physicalAcceptedChoices(row['request']),file:archiveBlob(row['file'] as Blob,MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES)};});if(!pages.length||beforeFile.size+pages.reduce((n,row)=>n+row.file.size,0)>MAX_NATIVE_IMPORT_BYTES)throw fail('native_import_budget');const p=policy(options);let admitted:SelectedNativeImportArchive|undefined;
 try{const entries=[];for(const row of pages)entries.push({request:row.request,bytes:row.file.size,sha256:await p.context.digest(row.file)});const manifest=nativeImportManifest({format:'breditor/selected-native-import-input',formatVersion:1,server:r['server'],before:b['selection'],pages:entries}),text=recordCutJson(manifest,MAX_NATIVE_IMPORT_HEADER_BYTES),header=new TextEncoder().encode(text),prefix=new Uint8Array(prefixBytes);prefix.set(new TextEncoder().encode(magic));new DataView(prefix.buffer).setUint32(magic.length,header.length,true);const file=new Blob([prefix,header,beforeFile,...pages.map(row=>row.file)],{type:mime});if(file.size>MAX_NATIVE_IMPORT_BYTES)throw fail('native_import_budget');const selection=nativeImportSelection({format:'breditor/selected-native-import-selection',formatVersion:1,bytes:file.size,sha256:await p.context.digest(file)});admitted=await readArchive.call(SelectedNativeImportArchive,file,selection,{wasm:p.context.wasm,checkAuthority:p.check});p.check();return Object.freeze({file,selection});}finally{admitted?.dispose();p.close();}
}
interface State{readonly file:Blob;readonly before:Blob;readonly pages:readonly Blob[]}
export class SelectedNativeImportArchive{
 readonly #selection;readonly #manifest;#state:State|undefined;
 private constructor(token:object,selection:SelectedNativeImportSelection,manifest:SelectedNativeImportManifest,state:State){if(token!==key)throw fail('native_import_policy');this.#selection=selection;this.#manifest=manifest;this.#state=state;Object.freeze(this);}
 #open():State{if(!this.#state)throw fail('native_import_closed');return this.#state;}
 selection():SelectedNativeImportSelection{return this.#selection;}
 manifest():SelectedNativeImportManifest{return this.#manifest;}
 file():Blob{return this.#open().file;}
 beforeFile(){return Object.freeze({file:this.#open().before,selection:this.#manifest.before});}
 pageFile(index:number):Blob{const state=this.#open();integer(index,state.pages.length-1);return state.pages[index]!;}
 async readPage(index:number,options:SharedArchiveIntegrityOptions):Promise<SharedPhysicalRecoveryAcceptedRead>{const state=this.#open(),file=this.pageFile(index),p=policy(options);try{const result=await page(file,this.#manifest,index,p.context);p.check();this.#open();return result;}finally{p.close();}}
 dispose():void{this.#state=undefined;}
 static async read(input:Blob,provided:SelectedNativeImportSelection,options:SharedArchiveIntegrityOptions):Promise<SelectedNativeImportArchive>{
  const selected=nativeImportSelection(provided),p=policy(options);let admitted:SelectedRoomCurrentArchive|undefined,root:PhysicalRoomRecordCutArchive|undefined;
  try{const file=archiveBlob(input,MAX_NATIVE_IMPORT_BYTES);if(file.size!==selected.bytes||file.size<prefixBytes||await p.context.digest(file)!==selected.sha256)throw fail();const prefix=await p.context.read(file,0,prefixBytes);for(const[i,byte]of new TextEncoder().encode(magic).entries())if(prefix[i]!==byte)throw fail();const bytes=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(magic.length,true);if(bytes<2||bytes>MAX_NATIVE_IMPORT_HEADER_BYTES||prefixBytes+bytes>file.size)throw fail('native_import_budget');let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await recordCutBytes(file,prefixBytes,bytes,p.context));}catch{throw fail();}const manifest=nativeImportManifest(parseRecordCutJson(text,MAX_NATIVE_IMPORT_HEADER_BYTES));if(recordCutJson(manifest,MAX_NATIVE_IMPORT_HEADER_BYTES)!==text)throw fail();let offset=prefixBytes+bytes;const take=(bytes:number)=>{if(offset+bytes>file.size)throw fail();const value=slice.call(file,offset,offset+bytes);offset+=bytes;return value;},beforeFile=take(manifest.before.bytes),read={wasm:p.context.wasm,checkAuthority:p.check};
   admitted=await before.read.call(SelectedRoomCurrentArchive,beforeFile,manifest.before,read);const current=before.current.call(admitted);root=await cut.read.call(PhysicalRoomRecordCutArchive,current.file,current.selection,read);const catalog=parsePhysicalCatalogV3Manifest(cut.root.call(root).source.manifest),server=manifest.server.source;if(JSON.stringify(server.ancestor)!==JSON.stringify(catalog.origin.identity)||JSON.stringify(server.server)!==JSON.stringify(catalog.current.server.identity)||JSON.stringify(server.participants)!==JSON.stringify(catalog.current.participants.identity))throw fail();
   const pages:Blob[]=[];let previous:SharedPhysicalRecoveryAcceptedRead|undefined;
   for(const[index,row]of manifest.pages.entries()){const part=take(row.bytes);let request:SharedPhysicalRecoveryAcceptedRequest;if(index===0){if(row.request.document!=='include'||row.request.review.kind==='after')throw fail();request=row.request;}else{if(!previous?.review?.more)throw fail();request={document:'omit',review:{kind:'after',cursor:previous.review.cursor}};}if(JSON.stringify(request)!==JSON.stringify(row.request))throw fail();previous=await page(part,manifest,index,p.context);pages.push(part);}
   if(previous?.review?.more||offset!==file.size)throw fail();p.check();return new SelectedNativeImportArchive(key,selected,manifest,{file,before:beforeFile,pages:Object.freeze(pages)});
  }finally{if(root)cut.dispose.call(root);if(admitted)before.dispose.call(admitted);p.close();}
 }
}
const readArchive=SelectedNativeImportArchive.read;
