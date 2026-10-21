/** Complete declared original/current server, native inventory and client files, without activation. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from "../archive_integrity/context.js";
import {archiveBlob} from "../archive_integrity/policy.js";
import {SharedServerLogGenerationRoomArchive,readSharedServerLogGenerationRoomArchive} from "../server_generation_archive/read.js";
import {SharedServerLogGenerationParticipantInventory,readSharedServerLogGenerationParticipantInventory} from "../server_generation_inventory/read.js";
import {readSharedParticipantBackup,type SharedParticipantBackup} from "../participant_backup/archive.js";
import {readSharedGenerationParticipant,type SharedGenerationParticipantBackup} from "../generation_participant/backup.js";
import {MAX_SHARED_PARTICIPANT_BACKUP_BYTES} from "../participant_backup/format.js";
import {MAX_GENERATION_PARTICIPANT_BYTES} from "../generation_participant/codec.js";
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from "../server_generation_archive/framing.js";
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from "../server_generation_inventory/policy.js";
import {frozen} from "../room_participant_inventory/policy.js";
import {physicalCatalogMetadata,parsePhysicalCatalogManifest} from "./manifest.js";
import {physicalCatalogName,physicalCatalogSelection,physicalCatalogFailure,physicalCatalogKnown,physicalParticipantKey,MAX_PHYSICAL_ROOM_CATALOG_FILES} from "./policy.js";
import type {SharedArchiveIntegrityOptions} from "../archive_integrity/contract.js";
import type {SharedServerLogGenerationParticipantSource} from "../server_generation_inventory/contract.js";
import type {SharedPhysicalRoomRecoveryCatalogCaptureOptions,SharedPhysicalRoomRecoveryCatalogMetadata,SharedPhysicalRoomRecoveryCatalogSelection,SharedPhysicalRoomRecoveryCatalogSource,SharedPhysicalRoomRecoveryCatalogCheck} from "./contract.js";
type Client=Readonly<{family:"original";backup:SharedParticipantBackup}>|Readonly<{family:"generation";backup:SharedGenerationParticipantBackup}>;
export interface PhysicalCatalogArchiveState {readonly manifest:string;readonly metadata:SharedPhysicalRoomRecoveryCatalogMetadata;readonly selection:SharedPhysicalRoomRecoveryCatalogSelection;readonly files:ReadonlyMap<string,Blob>;readonly origin:SharedServerLogGenerationRoomArchive;readonly current:SharedServerLogGenerationRoomArchive;readonly inventory:SharedServerLogGenerationParticipantInventory;readonly clients:ReadonlyMap<string,Client>}
const token=Object.freeze({}),states=new WeakMap<SharedPhysicalRoomRecoveryCatalogArchive,PhysicalCatalogArchiveState>();
/** @internal Genuine private read handles, not a JSON readiness constructor or native owner. */
export function physicalCatalogArchiveState(archive:SharedPhysicalRoomRecoveryCatalogArchive):PhysicalCatalogArchiveState{const state=states.get(archive);if(!state)throw physicalCatalogFailure("catalog_closed");return state;}
function dispose(state:Pick<PhysicalCatalogArchiveState,"origin"|"current"|"inventory"|"clients">):void{state.origin.dispose();state.current.dispose();state.inventory.dispose();for(const client of state.clients.values())client.backup.dispose();}
async function admit(manifest:string,input:ReadonlyMap<string,Blob>,expect:SharedPhysicalRoomRecoveryCatalogSelection,context:ArchiveIntegrityContext,signal?:AbortSignal):Promise<PhysicalCatalogArchiveState>{
 const selected=physicalCatalogSelection(expect),metadata=parsePhysicalCatalogManifest(manifest),files=new Map<string,Blob>(),clients=new Map<string,Client>();
 const expectedFiles=new Map<string,number>([["origin-server",metadata.origin.bytes],["current-server",metadata.current.server.bytes],["inventory",metadata.current.participants.bytes],...metadata.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as [string,number])]);
 for(const[name,file]of input){if(files.size>=MAX_PHYSICAL_ROOM_CATALOG_FILES||files.has(name)||!expectedFiles.has(name))throw physicalCatalogFailure("catalog_integrity");const snapshot=archiveBlob(file,expectedFiles.get(name)!);if(snapshot.size!==expectedFiles.get(name))throw physicalCatalogFailure("catalog_integrity");files.set(name,snapshot);}
 if(files.size!==expectedFiles.size||metadata.catalog!==selected.catalog)throw physicalCatalogFailure("catalog_integrity");context.guard();if(await context.digest(new Blob([manifest]))!==selected.sha256)throw physicalCatalogFailure("catalog_integrity");
 const options={wasm:context.wasm,checkAuthority:context.guard,...(signal?{signal}:{})};let origin:SharedServerLogGenerationRoomArchive|undefined,current:SharedServerLogGenerationRoomArchive|undefined,inventory:SharedServerLogGenerationParticipantInventory|undefined;
 try{
  origin=await readSharedServerLogGenerationRoomArchive(files.get("origin-server")!,metadata.origin.identity,options);context.guard();
  current=await readSharedServerLogGenerationRoomArchive(files.get("current-server")!,metadata.current.server.identity,options);context.guard();
  inventory=await readSharedServerLogGenerationParticipantInventory(files.get("inventory")!,metadata.current.participants.identity,signal?{signal}:{});context.guard();
  for(const row of metadata.participants){const file=files.get(physicalParticipantKey(row.id))!;const client:Client=row.family==="original"?{family:"original",backup:await readSharedParticipantBackup(file,row.selection,signal?{signal}:{})}:{family:"generation",backup:await readSharedGenerationParticipant(file,row.selection,signal?{signal}:{})};clients.set(row.id,Object.freeze(client));context.guard();}
  return{manifest,metadata,selection:selected,files,origin,current,inventory,clients};
 }catch(error){origin?.dispose();current?.dispose();inventory?.dispose();for(const client of clients.values())client.backup.dispose();throw physicalCatalogKnown(error);}
}
export class SharedPhysicalRoomRecoveryCatalogArchive {
 readonly #selection;readonly #metadata;readonly #manifest;
 private constructor(key:object,state:PhysicalCatalogArchiveState){if(key!==token)throw physicalCatalogFailure("catalog_closed");this.#selection=state.selection;this.#metadata=state.metadata;this.#manifest=state.manifest;states.set(this,state);Object.freeze(this);}
 selection():SharedPhysicalRoomRecoveryCatalogSelection{return this.#selection;}
 metadata():SharedPhysicalRoomRecoveryCatalogMetadata{return this.#metadata;}
 manifestJson():string{return this.#manifest;}
 /** A detached map of immutable Blobs, never a mutable escape to the internal catalog. */
 files():ReadonlyMap<string,Blob>{return new Map(physicalCatalogArchiveState(this).files);}
 originServerFile():Blob{return physicalCatalogArchiveState(this).files.get("origin-server")!;}
 currentServerFile():Blob{return physicalCatalogArchiveState(this).files.get("current-server")!;}
 inventoryFile():Blob{return physicalCatalogArchiveState(this).files.get("inventory")!;}
 participantFile(id:string):Blob{const file=physicalCatalogArchiveState(this).files.get(physicalParticipantKey(id));if(!file)throw physicalCatalogFailure("catalog_missing");return file;}
 /** Pure cached-file diagnostics. Obtain/reconcile every historic copy separately before activation. */
 checkSources(input:readonly SharedPhysicalRoomRecoveryCatalogSource[]):SharedPhysicalRoomRecoveryCatalogCheck {
  const state=physicalCatalogArchiveState(this);try{
   if(!Array.isArray(input)||input.length>1024)throw physicalCatalogFailure("catalog_policy");const chosen=new Set<string>(),sources=Array.from(input,row=>{const id=physicalCatalogName(row.id),client=state.clients.get(id);if(!client||client.family!==row.family||chosen.has(id))throw physicalCatalogFailure("catalog_source");chosen.add(id);return{family:client.family,backup:client.backup,source:row.source} as SharedServerLogGenerationParticipantSource;});
   const result=SharedServerLogGenerationParticipantInventory.prototype.checkMixedSources.call(state.inventory,sources);if(states.get(this)!==state)throw physicalCatalogFailure("catalog_closed");const selectedParticipants=[...chosen].sort(),unreconciledParticipants=state.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id);return frozen({...result,kind:result.coverage.kind==="covered"&&!unreconciledParticipants.length?"checked":"pending",selectedParticipants,unreconciledParticipants});
  }catch(error){if(states.get(this)!==state)throw physicalCatalogFailure("catalog_closed");throw physicalCatalogKnown(error,"catalog_source");}
 }
 dispose():void{const state=states.get(this);if(state){dispose(state);states.delete(this);}}
 static async capture(supplied:SharedPhysicalRoomRecoveryCatalogCaptureOptions):Promise<SharedPhysicalRoomRecoveryCatalogArchive>{
  const input={...supplied},context=prepareArchiveIntegrity(input);context.guard();
  try{
   if(!Array.isArray(input.participants)||input.participants.length>MAX_PHYSICAL_ROOM_CATALOG_FILES-3)throw physicalCatalogFailure("catalog_budget");
   const rows=Array.from(input.participants,row=>{const family=row.family;if(family!=="original"&&family!=="generation")throw physicalCatalogFailure("catalog_policy");return{id:physicalCatalogName(row.id),family,expected:row.expected,file:archiveBlob(row.file,family==="original"?MAX_SHARED_PARTICIPANT_BACKUP_BYTES:MAX_GENERATION_PARTICIPANT_BYTES)};}).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
   const origin=archiveBlob(input.origin.file,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),server=archiveBlob(input.current.server.file,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),inventory=archiveBlob(input.current.participants.file,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES);
   const metadata=physicalCatalogMetadata({format:"breditor/shared-physical-room-recovery-catalog",formatVersion:1,catalog:input.catalog,origin:{identity:input.origin.expected,bytes:origin.size},current:{server:{identity:input.current.server.expected,bytes:server.size},participants:{identity:input.current.participants.expected,bytes:inventory.size}},participants:rows.map(row=>({id:row.id,family:row.family,selection:row.expected,bytes:row.file.size}))}),manifest=JSON.stringify(metadata),selection={catalog:metadata.catalog,sha256:await context.digest(new Blob([manifest]))},files=new Map<string,Blob>([["origin-server",origin],["current-server",server],["inventory",inventory],...rows.map(row=>[physicalParticipantKey(row.id),row.file] as [string,Blob])]);
   const state=await admit(manifest,files,selection,context,input.signal);try{context.guard();return new SharedPhysicalRoomRecoveryCatalogArchive(token,state);}catch(error){dispose(state);throw error;}
  }catch(error){throw physicalCatalogKnown(error);}
 }
 static async read(manifest:string,input:ReadonlyMap<string,Blob>,expected:SharedPhysicalRoomRecoveryCatalogSelection,options:SharedArchiveIntegrityOptions):Promise<SharedPhysicalRoomRecoveryCatalogArchive>{
  const selectedOptions={...options},context=prepareArchiveIntegrity(selectedOptions);context.guard();const state=await admit(manifest,input,expected,context,selectedOptions.signal);try{context.guard();return new SharedPhysicalRoomRecoveryCatalogArchive(token,state);}catch(error){dispose(state);throw physicalCatalogKnown(error);}
 }
}
