/** Mixed original/generation retained files. This archive cannot activate a room or choose a writer. */
import {readSharedParticipantBackup,type SharedParticipantBackup} from "../participant_backup/archive.js";
import {MAX_SHARED_PARTICIPANT_BACKUP_BYTES} from "../participant_backup/format.js";
import {readSharedGenerationParticipant,type SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {MAX_GENERATION_PARTICIPANT_BYTES} from "../generation_participant/codec.js";
import {readSharedRoomParticipantInventory,type SharedRoomParticipantInventory} from "../room_participant_inventory/inventory.js";
import {MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES} from "../room_participant_inventory/policy.js";
import {catalogV2Metadata,parseCatalogV2Manifest} from "./manifest.js";
import {checkServerFile} from "../room_recovery_catalog/server_file.js";
import {authority,copyFile,digest,failure,fileKey,id,known,selected,signalCheck,MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES,MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES,MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES} from "../room_recovery_catalog/policy.js";
import type {SharedRoomRecoveryCatalogV2CaptureOptions,SharedRoomRecoveryCatalogV2Metadata,SharedRoomRecoveryCatalogV2Selection} from "./contract.js";
export type CatalogV2Participant=Readonly<{family:"original";backup:SharedParticipantBackup}>|Readonly<{family:"generation";backup:SharedGenerationParticipantBackup}>;
export interface CatalogV2ArchiveState {readonly manifest:string;readonly metadata:SharedRoomRecoveryCatalogV2Metadata;readonly selection:SharedRoomRecoveryCatalogV2Selection;readonly files:ReadonlyMap<string,Blob>;readonly inventory:SharedRoomParticipantInventory;readonly participants:ReadonlyMap<string,CatalogV2Participant>}
const token=Object.freeze({}),states=new WeakMap<SharedRoomRecoveryCatalogArchiveV2,CatalogV2ArchiveState>();
export function catalogV2ArchiveState(archive:SharedRoomRecoveryCatalogArchiveV2):CatalogV2ArchiveState{const s=states.get(archive);if(!s)throw failure("catalog_closed");return s;}
function dispose(state:Pick<CatalogV2ArchiveState,"inventory"|"participants">):void{state.inventory.dispose();for(const row of state.participants.values())row.backup.dispose();}
async function admit(manifest:string,input:ReadonlyMap<string,Blob>,expect:SharedRoomRecoveryCatalogV2Selection,guard:()=>void,signal?:AbortSignal):Promise<CatalogV2ArchiveState>{
 const selection=selected(expect),m=parseCatalogV2Manifest(manifest),files=new Map<string,Blob>(),participants=new Map<string,CatalogV2Participant>();let inventory:SharedRoomParticipantInventory|undefined;
 for(const[name,file]of input){if(files.size>=MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES||files.has(name))throw failure("catalog_budget");files.set(name,file);}
 guard();if(m.catalog!==selection.catalog||await digest(new Blob([manifest]),guard)!==selection.sha256)throw failure("catalog_integrity");
 const keys=["server","inventory",...m.participants.map(p=>fileKey("participant",p.id))].sort();if(JSON.stringify([...files.keys()].sort())!==JSON.stringify(keys))throw failure("catalog_integrity");
 try{
  const server=copyFile(files.get("server"),MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES),native=copyFile(files.get("inventory"),MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES);
  if(server.size!==m.server.bytes||native.size!==m.inventory.bytes)throw failure("catalog_integrity");
  await checkServerFile(server,m.inventory.identity,guard);if(await digest(server,guard)!==m.server.sha256)throw failure("catalog_integrity");guard();inventory=await readSharedRoomParticipantInventory(native,m.inventory.identity,signal?{signal}:{});guard();files.set("server",server);files.set("inventory",native);
  for(const row of m.participants){const name=fileKey("participant",row.id),file=copyFile(files.get(name),row.family==="generation"?MAX_GENERATION_PARTICIPANT_BYTES:MAX_SHARED_PARTICIPANT_BACKUP_BYTES);if(file.size!==row.bytes)throw failure("catalog_integrity");
   const participant:CatalogV2Participant=row.family==="generation"?{family:"generation",backup:await readSharedGenerationParticipant(file,row.selection,signal?{signal}:{})}:{family:"original",backup:await readSharedParticipantBackup(file,row.selection,signal?{signal}:{})};participants.set(row.id,Object.freeze(participant));files.set(name,file);guard();
  }
  return{manifest,metadata:m,selection,files,inventory,participants};
 }catch(error){inventory?.dispose();for(const row of participants.values())row.backup.dispose();throw known(error,"catalog_integrity");}
}
export class SharedRoomRecoveryCatalogArchiveV2 {
 readonly #selection;readonly #metadata;readonly #manifest;
 private constructor(key:object,state:CatalogV2ArchiveState){if(key!==token)throw failure("catalog_closed");this.#selection=state.selection;this.#metadata=state.metadata;this.#manifest=state.manifest;states.set(this,state);Object.freeze(this);}
 selection():SharedRoomRecoveryCatalogV2Selection{return this.#selection;}
 metadata():SharedRoomRecoveryCatalogV2Metadata{return this.#metadata;}
 manifestJson():string{return this.#manifest;}
 serverFile():Blob{return catalogV2ArchiveState(this).files.get("server")!;}
 inventoryFile():Blob{return catalogV2ArchiveState(this).files.get("inventory")!;}
 participantFile(entry:string):Blob{const file=catalogV2ArchiveState(this).files.get(fileKey("participant",entry));if(!file)throw failure("catalog_missing");return file;}
 dispose():void{const state=states.get(this);if(state){states.delete(this);dispose(state);}}
 static async capture(supplied:SharedRoomRecoveryCatalogV2CaptureOptions):Promise<SharedRoomRecoveryCatalogArchiveV2>{
  const input={...supplied},check=authority(input.checkAuthority),signal=input.signal,guard=()=>{signalCheck(signal);check();signalCheck(signal);};guard();
  try{
   if(!Array.isArray(input.participants)||input.participants.length>MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES-2)throw failure("catalog_policy");
   const rows=input.participants.map(row=>({...row,id:id(row.id),file:copyFile(row.file,row.family==="generation"?MAX_GENERATION_PARTICIPANT_BYTES:MAX_SHARED_PARTICIPANT_BACKUP_BYTES)})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   const server=copyFile(input.server.file,MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES),native=copyFile(input.inventory.file,MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES);
   const m=catalogV2Metadata({format:"breditor/shared-room-recovery-catalog",formatVersion:2,catalog:id(input.catalog),inventory:{identity:input.inventory.expected,bytes:native.size},server:input.server.expected,participants:rows.map(row=>({id:row.id,family:row.family,selection:row.expected,bytes:row.file.size}))}),manifest=JSON.stringify(m),selection={catalog:m.catalog,sha256:await digest(new Blob([manifest]),guard)},files=new Map<string,Blob>([["server",server],["inventory",native],...rows.map(row=>[fileKey("participant",row.id),row.file] as [string,Blob])]);
   const state=await admit(manifest,files,selection,guard,signal);try{guard();return new SharedRoomRecoveryCatalogArchiveV2(token,state);}catch(error){dispose(state);throw error;}
  }catch(error){throw known(error,"catalog_integrity");}
 }
 static async read(manifest:string,input:ReadonlyMap<string,Blob>,expect:SharedRoomRecoveryCatalogV2Selection,options:{readonly checkAuthority:()=>void;readonly signal?:AbortSignal}):Promise<SharedRoomRecoveryCatalogArchiveV2>{
  const check=authority(options.checkAuthority),signal=options.signal,guard=()=>{signalCheck(signal);check();signalCheck(signal);};guard();if(typeof manifest!=="string"||manifest.length>MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES)throw failure("catalog_budget");
  let state:CatalogV2ArchiveState|undefined;try{state=await admit(manifest,input,expect,guard,signal);guard();return new SharedRoomRecoveryCatalogArchiveV2(token,state);}catch(error){if(state)dispose(state);throw known(error,"catalog_integrity");}
 }
}
