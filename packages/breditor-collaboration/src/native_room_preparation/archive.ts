/** Literal complete inputs plus all output files. Framing/hash admission is
 * DATA only: native mutable admission and a fresh execution decision still follow. */
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {readVerifiedArchiveHeader} from '../archive_integrity/verified_header.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {recordCutJson,parseRecordCutJson} from '../physical_room_record_cut/json.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
import {roomPreparationPlan,roomPreparationChoice,checkRoomPreparationSources} from './plan.js';
import type {RoomPreparationPlan,RoomPreparationChoice,RoomPreparationFile,RoomPreparationManifest,RoomPreparationPart} from './contract.js';
import {fields,rows,integer,hash,mime,immutable,fail,MAX_ROOM_PREPARATION_BYTES as max,MAX_ROOM_PREPARATION_HEADER_BYTES as headerMax,MAX_ROOM_PREPARATION_PARTICIPANTS as members,ROOM_PREPARATION_MAGIC as magic,ROOM_PREPARATION_MIME as type} from './policy.js';
const prefixBytes=magic.length+4,slice=Blob.prototype.slice,key=Object.freeze({});
function manifest(value:unknown):RoomPreparationManifest{const r=fields(value,['format','formatVersion','plan','parts']);if(r['format']!=='breditor/native-room-preparation'||r['formatVersion']!==1)throw fail();const plan=roomPreparationPlan(r['plan']),parts=rows(r['parts'],members+2).map(value=>{const p=fields(value,['bytes','sha256','mime']);return{bytes:integer(p['bytes'],max,1),sha256:hash(p['sha256']),mime:mime(p['mime'])};});if(parts.length!==plan.participants.length+2||parts[0]!.bytes!==plan.before.bytes||parts[0]!.sha256!==plan.before.sha256||parts[1]!.bytes!==plan.retained.bytes||parts[1]!.sha256!==plan.retained.sha256)throw fail();for(const[i,p]of plan.participants.entries()){const part=parts[i+2]!;if(part.bytes!==p.bytes||part.sha256!==p.sha256||part.mime!==p.mime)throw fail();}if(parts.reduce((n,p)=>n+p.bytes,0)>max)throw fail('room_preparation_budget');return immutable({format:'breditor/native-room-preparation',formatVersion:1,plan,parts});}
function policy(options:SharedArchiveIntegrityOptions){const r=fields(options,['wasm','checkAuthority'],['signal']),authority=participantAuthority(r['checkAuthority'] as ()=>void),signal=r['signal'] as AbortSignal|undefined,observation=new OperationalReadCancellation(signal),check=()=>{observation.check(()=>fail('room_preparation_aborted'));authority();observation.check(()=>fail('room_preparation_aborted'));};try{return{check,context:prepareArchiveIntegrity({wasm:r['wasm'] as SharedArchiveIntegrityOptions['wasm'],checkAuthority:check}),signal,close:()=>observation.close()};}catch(error){observation.close();throw error;}}
export async function encodeRoomPreparation(provided:RoomPreparationPlan,before:SelectedRoomCurrentFile,retained:SelectedRoomCurrentFile,participants:readonly Blob[],options:SharedArchiveIntegrityOptions):Promise<RoomPreparationFile>{
 const plan=roomPreparationPlan(provided),a=fields(before,['selection','file']),b=fields(retained,['selection','file']);if(JSON.stringify(a['selection'])!==JSON.stringify(plan.before)||JSON.stringify(b['selection'])!==JSON.stringify(plan.retained)||participants.length!==plan.participants.length)throw fail();const files=[a['file'],b['file'],...participants].map(file=>archiveBlob(file as Blob,max)),p=policy(options);try{if(files.reduce((n,file)=>n+file.size,0)>max)throw fail('room_preparation_budget');const parts:RoomPreparationPart[]=[];for(const file of files)parts.push({bytes:file.size,sha256:await p.context.digest(file),mime:mime(file.type)});const meta=manifest({format:'breditor/native-room-preparation',formatVersion:1,plan,parts}),header=new TextEncoder().encode(recordCutJson(meta,headerMax)),prefix=new Uint8Array(prefixBytes);prefix.set(new TextEncoder().encode(magic));new DataView(prefix.buffer).setUint32(magic.length,header.length,true);const file=new Blob([prefix,header,...files],{type});if(file.size>max)throw fail('room_preparation_budget');const choice=roomPreparationChoice({format:'breditor/native-room-preparation-choice',formatVersion:1,plan,selection:{format:'breditor/native-room-preparation-selection',formatVersion:1,bytes:file.size,sha256:await p.context.digest(file)}});p.check();return Object.freeze({choice,file});}finally{p.close();}
}
interface State{readonly file:Blob;readonly parts:readonly Blob[];readonly check:()=>void;readonly close:()=>void}
export class RoomPreparationArchive{
 readonly #choice;#state:State|undefined;
 private constructor(token:object,choice:RoomPreparationChoice,state:State){if(token!==key)throw fail('room_preparation_policy');this.#choice=choice;this.#state=state;Object.freeze(this);}
 #open():State{const state=this.#state;if(!state)throw fail('room_preparation_closed');state.check();if(this.#state!==state)throw fail('room_preparation_closed');return state;}
 choice():RoomPreparationChoice{this.#open();return this.#choice;}
 file():Blob{return this.#open().file;}
 before():SelectedRoomCurrentFile{return Object.freeze({selection:this.#choice.plan.before,file:this.#open().parts[0]!});}
 retained():SelectedRoomCurrentFile{return Object.freeze({selection:this.#choice.plan.retained,file:this.#open().parts[1]!});}
 participant(id:string):Blob{const state=this.#open(),at=this.#choice.plan.participants.findIndex(row=>row.id===id);if(at<0)throw fail('room_preparation_policy');return state.parts[at+2]!;}
 dispose():void{const state=this.#state;this.#state=undefined;state?.close();}
 static async read(input:Blob,expected:RoomPreparationChoice,options:SharedArchiveIntegrityOptions):Promise<RoomPreparationArchive>{
  const choice=roomPreparationChoice(expected),p=policy(options);
  let before:Loaded|undefined,retained:Loaded|undefined,complete=false;
  try{
   const file=archiveBlob(input,max);
   if(file.size!==choice.selection.bytes)throw fail();
   const {text,offset}=await readVerifiedArchiveHeader(file,choice.selection.sha256,p.context,{
    magic,maximumHeaderBytes:headerMax,invalid:fail,diverged:fail,budget:()=>fail('room_preparation_budget'),
   });
   const header=manifest(parseRecordCutJson(text,headerMax));
   if(recordCutJson(header,headerMax)!==text||JSON.stringify(header.plan)!==JSON.stringify(choice.plan))throw fail();
   let at=offset;
   const parts:Blob[]=[];
   for(const row of header.parts){
    if(at+row.bytes>file.size)throw fail();
    const part=slice.call(file,at,at+row.bytes,row.mime);
    at+=row.bytes;
    if(await p.context.digest(part)!==row.sha256)throw fail();
    parts.push(part);
   }
   if(at!==file.size)throw fail();
   const read={wasm:p.context.wasm,checkAuthority:p.check,...(p.signal?{signal:p.signal}:{})};
   before=await Loaded.read({selection:choice.plan.before,file:parts[0]!},read);
   retained=await Loaded.read({selection:choice.plan.retained,file:parts[1]!},read);
   checkRoomPreparationSources(before,retained,choice.plan.database,choice.plan.participants);
   p.check();
   const result=new RoomPreparationArchive(key,choice,{file,parts,check:p.check,close:p.close});
   complete=true;
   return result;
  }finally{
   retained?.dispose();
   before?.dispose();
   if(!complete)p.close();
  }
 }
}
