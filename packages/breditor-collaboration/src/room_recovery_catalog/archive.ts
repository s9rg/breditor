import {SharedParticipantBackup,readSharedParticipantBackup} from "../participant_backup/archive.js";
import {participantSelection} from "../participant_backup/policy.js";
import {MAX_SHARED_PARTICIPANT_BACKUP_BYTES} from "../participant_backup/format.js";
import {SharedRoomParticipantInventory,readSharedRoomParticipantInventory} from "../room_participant_inventory/inventory.js";
import {inventoryIdentity} from "../room_participant_inventory/parse.js";
import {MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES} from "../room_participant_inventory/policy.js";
import {metadata,parseManifest} from "./manifest.js";
import {checkServerFile} from "./server_file.js";
import {authority,copyFile,digest,failure,fileIdentity,fileKey,id,known,selected,signalCheck,MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES,MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES,MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES} from "./policy.js";
import type {SharedRoomRecoveryCatalogCaptureOptions,SharedRoomRecoveryCatalogMetadata,SharedRoomRecoveryCatalogSelection} from "./types.js";
export interface CatalogArchiveState {readonly manifest:string;readonly metadata:SharedRoomRecoveryCatalogMetadata;readonly selection:SharedRoomRecoveryCatalogSelection;readonly files:ReadonlyMap<string,Blob>;readonly inventory:SharedRoomParticipantInventory;readonly participants:ReadonlyMap<string,SharedParticipantBackup>}
const key=Object.freeze({}),states=new WeakMap<SharedRoomRecoveryCatalogArchive,CatalogArchiveState>();
/** @internal Canonical private state; detached DTOs cannot substitute for admitted file handles. */
export function catalogArchiveState(archive:SharedRoomRecoveryCatalogArchive):CatalogArchiveState{const state=states.get(archive);if(!state)throw failure("catalog_closed");return state;}
function disposeState(state:Pick<CatalogArchiveState,"inventory"|"participants">):void{state.inventory.dispose();for(const backup of state.participants.values())backup.dispose();}
/** Re-admit every selected file, not just its metadata or previous progress flags. */
async function admit(manifest:string,input:ReadonlyMap<string,Blob>,expect:SharedRoomRecoveryCatalogSelection,guard:()=>void,signal?:AbortSignal):Promise<CatalogArchiveState>{
 const selection=selected(expect),m=parseManifest(manifest),files=new Map<string,Blob>(),participants=new Map<string,SharedParticipantBackup>();let inventory:SharedRoomParticipantInventory|undefined;
 for(const [name,file]of input){if(files.size>=MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES||files.has(name))throw failure("catalog_budget");files.set(name,file);}
 guard();if(m.catalog!==selection.catalog||await digest(new Blob([manifest]),guard)!==selection.sha256)throw failure("catalog_integrity");
 const keys=["server","inventory",...m.participants.map(p=>fileKey("participant",p.id))].sort();if(JSON.stringify([...files.keys()].sort())!==JSON.stringify(keys))throw failure("catalog_integrity");
 try{
  const server=copyFile(files.get("server"),MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES),native=copyFile(files.get("inventory"),MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES);
  if(server.size!==m.server.bytes||native.size!==m.inventory.bytes)throw failure("catalog_integrity");
  await checkServerFile(server,m.inventory.identity,guard);if(await digest(server,guard)!==m.server.sha256)throw failure("catalog_integrity");guard();inventory=await readSharedRoomParticipantInventory(native,m.inventory.identity,signal?{signal}:{});guard();
  files.set("server",server);files.set("inventory",native);
  for(const row of m.participants){const name=fileKey("participant",row.id),file=copyFile(files.get(name),MAX_SHARED_PARTICIPANT_BACKUP_BYTES);if(file.size!==row.bytes)throw failure("catalog_integrity");const backup=await readSharedParticipantBackup(file,row.selection,signal?{signal}:{});participants.set(row.id,backup);files.set(name,file);guard();}
  return{manifest,metadata:m,selection,files,inventory,participants};
 }catch(error){inventory?.dispose();for(const backup of participants.values())backup.dispose();throw known(error,"catalog_integrity");}
}
/** Immutable selected server/inventory/client files. Contains no native activation capability. */
export class SharedRoomRecoveryCatalogArchive {
 readonly #selection;readonly #metadata;readonly #manifest;
 private constructor(token:object,state:CatalogArchiveState){if(token!==key)throw failure("catalog_closed");this.#selection=state.selection;this.#metadata=state.metadata;this.#manifest=state.manifest;states.set(this,state);Object.freeze(this);}
 selection():SharedRoomRecoveryCatalogSelection{return this.#selection;}
 metadata():SharedRoomRecoveryCatalogMetadata{return this.#metadata;}
 manifestJson():string{return this.#manifest;}
 serverFile():Blob{return catalogArchiveState(this).files.get("server")!;}
 inventoryFile():Blob{return catalogArchiveState(this).files.get("inventory")!;}
 participantFile(entry:string):Blob{const file=catalogArchiveState(this).files.get(fileKey("participant",entry));if(!file)throw failure("catalog_missing");return file;}
 /** Drop only owned read handles; original files, live clients and persisted catalogs are untouched. */
 dispose():void{const state=states.get(this);if(state){states.delete(this);disposeState(state);}}
 static async capture(supplied:SharedRoomRecoveryCatalogCaptureOptions):Promise<SharedRoomRecoveryCatalogArchive>{
  const input={...supplied},check=authority(input.checkAuthority),signal=input.signal,guard=()=>{signalCheck(signal);check();signalCheck(signal);};guard();
  try{
   const server=copyFile(input.server.file,MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES),native=copyFile(input.inventory.file,MAX_SHARED_ROOM_PARTICIPANT_INVENTORY_BYTES),serverSelection=fileIdentity(input.server.expected,MAX_SHARED_ROOM_RECOVERY_SERVER_BYTES),inventorySelection=inventoryIdentity(input.inventory.expected);
   if(!Array.isArray(input.participants)||input.participants.length>MAX_SHARED_ROOM_RECOVERY_CATALOG_FILES-2)throw failure("catalog_policy");
   const rows=input.participants.map(row=>({id:id(row.id),file:copyFile(row.file,MAX_SHARED_PARTICIPANT_BACKUP_BYTES),selection:participantSelection(row.expected)})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   const m=metadata({format:"breditor/shared-room-recovery-catalog",formatVersion:1,catalog:id(input.catalog),inventory:{identity:inventorySelection,bytes:native.size},server:serverSelection,participants:rows.map(row=>({id:row.id,selection:row.selection,bytes:row.file.size}))}),manifest=JSON.stringify(m),selection={catalog:m.catalog,sha256:await digest(new Blob([manifest]),guard)},files=new Map<string,Blob>([["server",server],["inventory",native],...rows.map(row=>[fileKey("participant",row.id),row.file] as [string,Blob])]);
   const state=await admit(manifest,files,selection,guard,signal);try{guard();return new SharedRoomRecoveryCatalogArchive(key,state);}catch(error){disposeState(state);throw error;}
  }catch(error){throw known(error,"catalog_integrity");}
 }
 static async read(manifest:string,files:ReadonlyMap<string,Blob>,expected:SharedRoomRecoveryCatalogSelection,options:{readonly checkAuthority:()=>void;readonly signal?:AbortSignal}):Promise<SharedRoomRecoveryCatalogArchive>{
  const {signal}=options,check=authority(options.checkAuthority),guard=()=>{signalCheck(signal);check();signalCheck(signal);};guard();
  if(typeof manifest!=="string"||manifest.length>MAX_SHARED_ROOM_RECOVERY_CATALOG_METADATA_BYTES)throw failure("catalog_budget");
  let state:CatalogArchiveState|undefined;try{state=await admit(manifest,files,expected,guard,signal);guard();return new SharedRoomRecoveryCatalogArchive(key,state);}catch(error){if(state)disposeState(state);throw known(error,"catalog_integrity");}
 }
}
export const captureSharedRoomRecoveryCatalog=(input:SharedRoomRecoveryCatalogCaptureOptions)=>SharedRoomRecoveryCatalogArchive.capture(input);
export const readSharedRoomRecoveryCatalogArchive=(manifest:string,files:ReadonlyMap<string,Blob>,expected:SharedRoomRecoveryCatalogSelection,options:{readonly checkAuthority:()=>void;readonly signal?:AbortSignal})=>SharedRoomRecoveryCatalogArchive.read(manifest,files,expected,options);
