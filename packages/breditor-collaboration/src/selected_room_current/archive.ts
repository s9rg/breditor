/** A complete data snapshot for future cold resume. Both nested readers admit
 * their unchanged full protocols. Selected queues must extend the SELECTED side
 * of each original base. The immutable losing inputs are never discarded.
 *
 * This reader proves integrity and asset continuity, NOT native continuation,
 * source custody, a fresh approval, writer permission or room activation. */
import {RichAssetReconciledBase} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {RoomAssetApprovalArchive} from '../physical_room_asset_approval/archive.js';
import type {RoomAssetApprovalFile} from '../physical_room_asset_approval/contract.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {PhysicalRoomRecordCutFile} from '../physical_room_record_cut/contract.js';
import {recordCutJson,parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {readVerifiedArchiveHeader} from '../archive_integrity/verified_header.js';
import {fields,rows as dataRows} from '../physical_room_record_cut/policy.js';
import {approvalChoice} from '../physical_room_asset_approval/choice.js';
import type {SelectedAssetCurrentCut} from '../physical_room_asset_successor/owner.js';
import type {SelectedRoomCurrentFile,SelectedRoomCurrentSelection,SelectedRoomCurrentManifest} from './contract.js';
import {selectedRoomCurrentManifest,selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES,MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES,SELECTED_ROOM_CURRENT_MAGIC as magic,SELECTED_ROOM_CURRENT_MIME as mime,fail} from './manifest.js';
const prefixBytes=magic.length+4,key=Object.freeze({}),slice=Blob.prototype.slice;
const approval={read:RoomAssetApprovalArchive.read,choice:RoomAssetApprovalArchive.prototype.choice,file:RoomAssetApprovalArchive.prototype.file,selection:RoomAssetApprovalArchive.prototype.selection,cut:RoomAssetApprovalArchive.prototype.recordCut,base:RoomAssetApprovalArchive.prototype.baseFile,dispose:RoomAssetApprovalArchive.prototype.dispose};
const cut={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,file:PhysicalRoomRecordCutArchive.prototype.file,selection:PhysicalRoomRecordCutArchive.prototype.selection,uploads:PhysicalRoomRecordCutArchive.prototype.uploads,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
const base={read:RichAssetReconciledBase.read,verify:RichAssetReconciledBase.prototype.verifySuccessor,dispose:RichAssetReconciledBase.prototype.dispose};
interface State{readonly file:Blob;readonly approval:RoomAssetApprovalArchive;readonly current:PhysicalRoomRecordCutArchive;readonly uploads:ReadonlyMap<string,Blob>}
function policy(options:SharedArchiveIntegrityOptions){const r=fields(options,['wasm','checkAuthority'],['signal']),authority=participantAuthority(r['checkAuthority'] as ()=>void),signal=r['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal),check=()=>{observation.check(()=>fail('selected_current_aborted'));authority();observation.check(()=>fail('selected_current_aborted'));};try{return{context:prepareArchiveIntegrity({wasm:r['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check}),signal,check,close:()=>observation.close()};}catch(error){observation.close();throw error;}}
/** The supplied tuple is detached immediately. All data is read-admitted again;
 * object shape or an alleged ready marker never supplies a capability. */
export async function encodeSelectedRoomCurrent(input:SelectedAssetCurrentCut,options:SharedArchiveIntegrityOptions):Promise<SelectedRoomCurrentFile>{
 const raw=fields(input,['approval','root','uploads']),a=fields(raw['approval'],['selection','file','choice']),r=fields(raw['root'],['selection','file']),expectedChoice=approvalChoice(a['choice']);
 const uploads=dataRows(raw['uploads'],1024).map(value=>{const row=fields(value,['id','database','file','sha256']),file=archiveBlob(row['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES);return{id:row['id'],database:row['database'],bytes:file.size,sha256:row['sha256'],file};}),aFile=archiveBlob(a['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES),rFile=archiveBlob(r['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES),manifest=selectedRoomCurrentManifest({format:'breditor/selected-room-current',formatVersion:1,approval:a['selection'],current:r['selection'],uploads:uploads.map(({file,...row})=>row)}),text=recordCutJson(manifest,MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES),header=new TextEncoder().encode(text),prefix=new Uint8Array(prefixBytes);prefix.set(new TextEncoder().encode(magic));new DataView(prefix.buffer).setUint32(magic.length,header.length,true);const file=new Blob([prefix,header,aFile,rFile,...uploads.map(row=>row.file)],{type:mime});
 if(file.size>MAX_SELECTED_ROOM_CURRENT_BYTES)throw fail('selected_current_budget');const p=policy(options);let verified:SelectedRoomCurrentArchive|undefined;try{const selection=selectedRoomCurrentSelection({format:'breditor/selected-room-current-selection',formatVersion:1,bytes:file.size,sha256:await p.context.digest(file)});verified=await readArchive.call(SelectedRoomCurrentArchive,file,selection,{wasm:p.context.wasm,checkAuthority:p.check,...(p.signal?{signal:p.signal}:{})});if(JSON.stringify(verified.approval().choice)!==JSON.stringify(expectedChoice))throw fail();p.check();return Object.freeze({file,selection});}finally{verified?.dispose();p.close();}
}
export class SelectedRoomCurrentArchive{
 readonly #selection;readonly #manifest;#state:State|undefined;
 private constructor(token:object,selection:SelectedRoomCurrentSelection,manifest:SelectedRoomCurrentManifest,state:State){if(token!==key)throw fail('selected_current_policy');this.#selection=selection;this.#manifest=manifest;this.#state=state;Object.freeze(this);}
 #open():State{if(!this.#state)throw fail('selected_current_closed');return this.#state;}
 selection():SelectedRoomCurrentSelection{return this.#selection;}
 manifest():SelectedRoomCurrentManifest{return this.#manifest;}
 file():Blob{return this.#open().file;}
 approval():RoomAssetApprovalFile{const state=this.#open();return Object.freeze({file:approval.file.call(state.approval),selection:approval.selection.call(state.approval),choice:approval.choice.call(state.approval)});}
 current():PhysicalRoomRecordCutFile{const state=this.#open();return Object.freeze({file:cut.file.call(state.current),selection:cut.selection.call(state.current)});}
 uploadFile(id:string):Blob{const file=this.#open().uploads.get(id);if(!file)throw fail('selected_current_policy');return file;}
 dispose():void{if(this.#state){approval.dispose.call(this.#state.approval);cut.dispose.call(this.#state.current);this.#state=undefined;}}
 static async read(input:Blob,provided:SelectedRoomCurrentSelection,options:SharedArchiveIntegrityOptions):Promise<SelectedRoomCurrentArchive>{
  const selected=selectedRoomCurrentSelection(provided),p=policy(options);let approved:RoomAssetApprovalArchive|undefined,current:PhysicalRoomRecordCutArchive|undefined;
  try{
   const file=archiveBlob(input,MAX_SELECTED_ROOM_CURRENT_BYTES);
   if(file.size!==selected.bytes)throw fail();
   const {text,offset:headerOffset}=await readVerifiedArchiveHeader(file,selected.sha256,p.context,{
    magic,maximumHeaderBytes:MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES,
    invalid:()=>fail(),diverged:()=>fail(),budget:()=>fail('selected_current_budget'),
   });
   const manifest=selectedRoomCurrentManifest(parseRecordCutJson(text,MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES));
   if(recordCutJson(manifest,MAX_SELECTED_ROOM_CURRENT_HEADER_BYTES)!==text)throw fail();
   let offset=headerOffset;
   const take=(bytes:number)=>{if(offset+bytes>file.size)throw fail();const part=slice.call(file,offset,offset+bytes);offset+=bytes;return part;},read={wasm:p.context.wasm,checkAuthority:p.check,...(p.signal?{signal:p.signal}:{})};approved=await approval.read.call(RoomAssetApprovalArchive,take(manifest.approval.bytes),manifest.approval,read);current=await cut.read.call(PhysicalRoomRecordCutArchive,take(manifest.current.bytes),manifest.current,read);const choice=approval.choice.call(approved),root=cut.root.call(current);
   if(root.database!==choice.adoption.source.operationDatabase||root.source.catalogDatabase!==choice.adoption.source.catalogDatabase||JSON.stringify(root.source.selection)!==JSON.stringify(choice.adoption.source.catalog)||await p.context.digest(new Blob([JSON.stringify(root)]))!==choice.adoption.source.intentSha256||manifest.uploads.length!==choice.adoption.participants.length||root.participants.length!==manifest.uploads.length)throw fail();const uploads=new Map<string,Blob>();
   for(const[i,row]of manifest.uploads.entries()){p.check();const selected=choice.adoption.participants[i]!,native=root.participants[i]!,file=take(row.bytes);if(row.id!==selected.id||row.database!==selected.targetDatabase||native.id!==row.id||native.family!==selected.family||await p.context.digest(file)!==row.sha256||await p.context.digest(cut.uploads.call(current,row.id))!==selected.sourceUploadsSha256)throw fail();const reader=await base.read.call(RichAssetReconciledBase,approval.base.call(approved,row.id),{limits:selected.limits,...(p.signal?{signal:p.signal}:{})});try{await base.verify.call(reader,file,{limits:selected.limits,...(p.signal?{signal:p.signal}:{})});p.check();}finally{base.dispose.call(reader);}uploads.set(row.id,file);}
   if(offset!==file.size)throw fail();p.check();const result=new SelectedRoomCurrentArchive(key,selected,manifest,{file,approval:approved,current,uploads});approved=undefined;current=undefined;return result;
  }finally{if(approved)approval.dispose.call(approved);if(current)cut.dispose.call(current);p.close();}
 }
}
const readArchive=SelectedRoomCurrentArchive.read;
