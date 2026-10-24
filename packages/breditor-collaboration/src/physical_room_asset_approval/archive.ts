/** Complete approval evidence, not an ownership capability. The literal room
 * cut and every selected base (including both losing inputs) are retained in
 * one bounded file. A cold read still supplies a new grant and outside pin. */
import {RichAssetReconciledBase} from '@breditor/experimental-rich-content';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import type {PhysicalRoomRecordCutFile} from '../physical_room_record_cut/contract.js';
import {recordCutJson,parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {recordCutBytes} from '../physical_room_record_cut/framing.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {fields,fail,MAX_ROOM_ASSET_PLAN_BYTES} from '../physical_room_asset_adoption/policy.js';
import type {AdoptionFiles} from '../physical_room_asset_adoption/storage.js';
import type {RoomAssetApprovalChoice,RoomAssetApprovalSelection,RoomAssetApprovalFile} from './contract.js';
import {approvalChoice,approvalSelection,MAX_ROOM_ASSET_APPROVAL_BYTES} from './choice.js';
const magic='BREDITOR-ROOM-ASSET-APPROVAL1\n',prefixBytes=magic.length+4,mime='application/vnd.breditor.room-asset-approval',key=Object.freeze({}),slice=Blob.prototype.slice;
const readCut=PhysicalRoomRecordCutArchive.read,cutRoot=PhysicalRoomRecordCutArchive.prototype.root,cutMetadata=PhysicalRoomRecordCutArchive.prototype.metadata,cutUploads=PhysicalRoomRecordCutArchive.prototype.uploads,cutFile=PhysicalRoomRecordCutArchive.prototype.file,cutSelection=PhysicalRoomRecordCutArchive.prototype.selection,disposeCut=PhysicalRoomRecordCutArchive.prototype.dispose,readBase=RichAssetReconciledBase.read,baseMetadata=RichAssetReconciledBase.prototype.metadata,verifyBase=RichAssetReconciledBase.prototype.verifyPredecessor,disposeBase=RichAssetReconciledBase.prototype.dispose;
interface State{readonly file:Blob;readonly cut:PhysicalRoomRecordCutArchive;readonly bases:ReadonlyMap<string,Blob>}
export async function encodeRoomAssetApproval(choice:RoomAssetApprovalChoice,cut:PhysicalRoomRecordCutFile,bases:AdoptionFiles,context:Readonly<{check:()=>void;digest:(file:Blob)=>Promise<string>}>):Promise<RoomAssetApprovalFile>{
 context.check();const chosen=approvalChoice(choice);if(JSON.stringify(chosen.cut)!==JSON.stringify(cut.selection)||bases.size!==chosen.adoption.participants.length||cut.file.size!==chosen.cut.bytes||await context.digest(cut.file)!==chosen.cut.sha256)throw fail('asset_adoption_diverged');const files:Blob[]=[cut.file];let total=cut.file.size;
 for(const row of chosen.adoption.participants){context.check();const bytes=bases.get(row.id);if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.base.bytes)throw fail('asset_adoption_diverged');const file=new Blob([bytes]);total+=file.size;if(total>MAX_ROOM_ASSET_APPROVAL_BYTES)throw fail('asset_adoption_budget');if(await context.digest(file)!==row.base.sha256)throw fail('asset_adoption_diverged');files.push(file);}
 const text=recordCutJson(chosen,MAX_ROOM_ASSET_PLAN_BYTES),header=new TextEncoder().encode(text),prefix=new Uint8Array(prefixBytes);prefix.set(new TextEncoder().encode(magic));new DataView(prefix.buffer).setUint32(magic.length,header.length,true);const file=new Blob([prefix,header,...files],{type:mime});if(file.size>MAX_ROOM_ASSET_APPROVAL_BYTES)throw fail('asset_adoption_budget');const sha256=await context.digest(file);context.check();return Object.freeze({choice:chosen,file,selection:approvalSelection({format:'breditor/room-asset-approval-selection',formatVersion:1,bytes:file.size,sha256})});
}
export class RoomAssetApprovalArchive{
 readonly #selection:RoomAssetApprovalSelection;readonly #choice:RoomAssetApprovalChoice;#state:State|undefined;
 private constructor(token:object,selection:RoomAssetApprovalSelection,choice:RoomAssetApprovalChoice,state:State){if(token!==key)throw fail('asset_adoption_policy');this.#selection=selection;this.#choice=choice;this.#state=state;Object.freeze(this);}
 selection(){return this.#selection;}
 choice(){return this.#choice;}
 #open(){if(!this.#state)throw fail('asset_adoption_closed');return this.#state;}
 file():Blob{return this.#open().file;}
 recordCut():PhysicalRoomRecordCutFile{const state=this.#open();return Object.freeze({file:cutFile.call(state.cut),selection:cutSelection.call(state.cut)});}
 baseFile(id:string):Blob{const file=this.#open().bases.get(id);if(!file)throw fail('asset_adoption_policy');return file;}
 dispose():void{if(this.#state)disposeCut.call(this.#state.cut);this.#state=undefined;}
 static async read(input:Blob,provided:RoomAssetApprovalSelection,options:SharedArchiveIntegrityOptions):Promise<RoomAssetApprovalArchive>{
  const selection=approvalSelection(provided),raw=fields(options,['wasm','checkAuthority'],['signal']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),signal=raw['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal),check=()=>{observation.check(()=>fail('asset_adoption_aborted'));authority();observation.check(()=>fail('asset_adoption_aborted'));};let cut:PhysicalRoomRecordCutArchive|undefined;
  try{const context=prepareArchiveIntegrity({wasm:raw['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check}),file=archiveBlob(input,MAX_ROOM_ASSET_APPROVAL_BYTES);if(file.size!==selection.bytes||file.size<prefixBytes||await context.digest(file)!==selection.sha256)throw fail('asset_adoption_diverged');const prefix=await context.read(file,0,prefixBytes);for(const[i,value]of new TextEncoder().encode(magic).entries())if(prefix[i]!==value)throw fail('asset_adoption_diverged');const n=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength).getUint32(magic.length,true);if(n<2||n>MAX_ROOM_ASSET_PLAN_BYTES||prefixBytes+n>file.size)throw fail('asset_adoption_budget');const bytes=await recordCutBytes(file,prefixBytes,n,context);let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw fail('asset_adoption_diverged');}const choice=approvalChoice(parseRecordCutJson(text,MAX_ROOM_ASSET_PLAN_BYTES));if(recordCutJson(choice,MAX_ROOM_ASSET_PLAN_BYTES)!==text)throw fail('asset_adoption_diverged');let offset=prefixBytes+n;
   if(offset+choice.cut.bytes>file.size)throw fail('asset_adoption_diverged');cut=await readCut.call(PhysicalRoomRecordCutArchive,slice.call(file,offset,offset+choice.cut.bytes),choice.cut,{wasm:context.wasm,checkAuthority:check,...(signal?{signal}:{})});offset+=choice.cut.bytes;const root=cutRoot.call(cut),adoption=choice.adoption;if(root.database!==adoption.source.operationDatabase||root.source.catalogDatabase!==adoption.source.catalogDatabase||JSON.stringify(root.source.selection)!==JSON.stringify(adoption.source.catalog)||await context.digest(new Blob([JSON.stringify(root)]))!==adoption.source.intentSha256||root.participants.length!==adoption.participants.length||JSON.stringify(cutMetadata.call(cut).unreconciledParticipants)!==JSON.stringify(adoption.unreconciledParticipants))throw fail('asset_adoption_diverged');const bases=new Map<string,Blob>();
   for(const[i,row]of adoption.participants.entries()){check();const original=root.participants[i];if(!original||original.id!==row.id||original.family!==row.family||original.namespaces.find(ns=>ns.role==='uploads')?.database!==row.sourceDatabase||offset+row.base.bytes>file.size||await context.digest(cutUploads.call(cut,row.id))!==row.sourceUploadsSha256)throw fail('asset_adoption_diverged');const baseFile=slice.call(file,offset,offset+row.base.bytes);offset+=row.base.bytes;if(await context.digest(baseFile)!==row.base.sha256)throw fail('asset_adoption_diverged');const base=await readBase.call(RichAssetReconciledBase,baseFile,{limits:row.limits,...(signal?{signal}:{})});try{check();const m=baseMetadata.call(base);if(m.files.current.sha256!==row.sourceUploadsSha256||m.files.selected.bytes!==row.selected.bytes||m.files.selected.sha256!==row.selected.sha256)throw fail('asset_adoption_diverged');await verifyBase.call(base,cutUploads.call(cut,row.id),{limits:row.limits,...(signal?{signal}:{})});check();}finally{disposeBase.call(base);}bases.set(row.id,baseFile);}
   if(offset!==file.size)throw fail('asset_adoption_diverged');check();const result=new RoomAssetApprovalArchive(key,selection,frozen(choice),{file,cut,bases});cut=undefined;return result;
  }finally{if(cut)disposeCut.call(cut);observation.close();}
 }
}
