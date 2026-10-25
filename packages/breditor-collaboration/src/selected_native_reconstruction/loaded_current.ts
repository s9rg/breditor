/** Complete immutable reconstruction input. A file/handle is DATA, not a live
 * source, writer grant, backend receipt or permission to activate a room. */
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {selectedRoomCurrentSelection} from '../selected_room_current/manifest.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {PhysicalRoomRecordCutArchive} from '../physical_room_record_cut/archive.js';
import {parsePhysicalCatalogV3Manifest} from '../physical_room_catalog_v3/manifest.js';
import {physicalParticipantKey} from '../physical_room_catalog/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {fields,fail,identifier} from './policy.js';
const current={read:SelectedRoomCurrentArchive.read,current:SelectedRoomCurrentArchive.prototype.current,approval:SelectedRoomCurrentArchive.prototype.approval,file:SelectedRoomCurrentArchive.prototype.file,upload:SelectedRoomCurrentArchive.prototype.uploadFile,dispose:SelectedRoomCurrentArchive.prototype.dispose};
const record={read:PhysicalRoomRecordCutArchive.read,root:PhysicalRoomRecordCutArchive.prototype.root,records:PhysicalRoomRecordCutArchive.prototype.records,files:PhysicalRoomRecordCutArchive.prototype.catalogFiles,upload:PhysicalRoomRecordCutArchive.prototype.uploads,dispose:PhysicalRoomRecordCutArchive.prototype.dispose};
const token=Object.freeze({});
export class LoadedNativeReconstructionCurrent {
 readonly #outer;readonly #inner;readonly #file;readonly #guard;readonly #observation;readonly #catalog;
 #closed=false;
 private constructor(key:object,outer:SelectedRoomCurrentArchive,inner:PhysicalRoomRecordCutArchive,file:SelectedRoomCurrentFile,guard:()=>void,observation:OperationalReadCancellation) {
  if(key!==token)throw fail('native_reconstruction_policy');
  this.#outer=outer;this.#inner=inner;this.#file=file;this.#guard=guard;this.#observation=observation;
  this.#catalog=parsePhysicalCatalogV3Manifest(record.root.call(inner).source.manifest);Object.freeze(this);
 }
 check=()=>{if(this.#closed)throw fail('native_reconstruction_closed');this.#guard();if(this.#closed)throw fail('native_reconstruction_closed');};
 file():SelectedRoomCurrentFile {this.check();return this.#file;}
 catalog(){this.check();return this.#catalog;}
 approval(){this.check();return current.approval.call(this.#outer);}
 /** SDK-only borrowed reader. No mutable source or permissions are admitted. */
 nativeCut():PhysicalRoomRecordCutArchive {this.check();return this.#inner;}
 participant(id:string){this.check();const row=this.#catalog.participants.find(row=>row.id===identifier(id));if(!row)throw fail('native_reconstruction_policy');return row;}
 participantFile(id:string):Blob {this.participant(id);const file=record.files.call(this.#inner).get(physicalParticipantKey(id));if(!file)throw fail();this.check();return file;}
 async records(id:string):Promise<unknown> {this.participant(id);const value=await record.records.call(this.#inner,id);this.check();return value;}
 originalUploads(id:string):Blob {this.participant(id);const file=record.upload.call(this.#inner,id);this.check();return file;}
 selectedUploads(id:string):Blob {this.participant(id);const file=current.upload.call(this.#outer,id);this.check();return file;}
 dispose():void {if(this.#closed)return;this.#closed=true;try{record.dispose.call(this.#inner);}finally{try{current.dispose.call(this.#outer);}finally{this.#observation.close();}}}
 static async read(provided:SelectedRoomCurrentFile,options:SharedArchiveIntegrityOptions):Promise<LoadedNativeReconstructionCurrent> {
  const input=fields(provided,['selection','file']),selected=selectedRoomCurrentSelection(input['selection']),raw=fields(options,['wasm','checkAuthority'],['signal']),authority=participantAuthority(raw['checkAuthority'] as ()=>void),signal=raw['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal);
  const check=()=>{observation.check(()=>fail('native_reconstruction_aborted'));authority();observation.check(()=>fail('native_reconstruction_aborted'));};
  const integrity={wasm:raw['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check,...(signal?{signal}:{})};
  let outer:SelectedRoomCurrentArchive|undefined,inner:PhysicalRoomRecordCutArchive|undefined,complete=false;
  try{
   check();outer=await current.read.call(SelectedRoomCurrentArchive,input['file'] as Blob,selected,integrity);check();
   const source=current.current.call(outer);inner=await record.read.call(PhysicalRoomRecordCutArchive,source.file,source.selection,integrity);check();
   const file=Object.freeze({selection:selected,file:current.file.call(outer)}),result=new LoadedNativeReconstructionCurrent(token,outer,inner,file,check,observation);result.check();complete=true;return result;
  }finally{if(!complete){if(inner)record.dispose.call(inner);if(outer)current.dispose.call(outer);observation.close();}}
 }
}
