/** Complete explicitly selected five-family files. Native replay of graph data
 * does not transfer writers, reconcile historical copies or activate a service. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob,archiveFields} from '../archive_integrity/policy.js';
import {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {SharedServerLogGenerationParticipantInventory,checkOperationalPhysicalInventoryCohort} from '../server_generation_inventory/read.js';
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from '../server_generation_archive/framing.js';
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from '../server_generation_inventory/policy.js';
import {physicalCatalogSelection,physicalCatalogName,physicalCatalogFailure,physicalCatalogKnown,physicalParticipantKey,MAX_PHYSICAL_ROOM_CATALOG_FILES} from '../physical_room_catalog/policy.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {OperationalPhysicalCohortSource} from '../server_generation_inventory/cohort_coverage.js';
import {physicalCatalogV2Metadata,parsePhysicalCatalogV2Manifest} from './manifest.js';
import {physicalCatalogV2Rows,physicalCatalogV2Options} from './input_snapshot.js';
import {physicalCatalogV2ParticipantHeader,physicalCatalogV2ParticipantMaximum,readPhysicalCatalogV2Participant,disposePhysicalCatalogV2Participant,type PhysicalCatalogV2Client} from './participant.js';
import {snapshotPhysicalCatalogV2GraphPolicies,matchPhysicalCatalogV2GraphPolicies} from './graph_policy.js';
import type {PhysicalRoomCatalogV2CaptureOptions,PhysicalRoomCatalogV2ReadOptions,PhysicalRoomCatalogV2Metadata,PhysicalRoomCatalogV2Selection,PhysicalRoomCatalogV2Source,PhysicalRoomCatalogV2Check,PhysicalRoomCatalogV2GraphPolicy} from './contract.js';

export interface PhysicalCatalogV2ArchiveState{
 readonly manifest:string;readonly metadata:PhysicalRoomCatalogV2Metadata;readonly selection:PhysicalRoomCatalogV2Selection;
 readonly files:ReadonlyMap<string,Blob>;readonly clients:ReadonlyMap<string,PhysicalCatalogV2Client>;
 readonly origin:SharedServerLogGenerationRoomArchive;readonly current:SharedServerLogGenerationRoomArchive;
 readonly inventory:SharedServerLogGenerationParticipantInventory;
}
const key=Object.freeze({}),states=new WeakMap<PhysicalRoomCatalogV2Archive,PhysicalCatalogV2ArchiveState>();
const serverRead=SharedServerLogGenerationRoomArchive.read,serverDispose=SharedServerLogGenerationRoomArchive.prototype.dispose,inventoryRead=SharedServerLogGenerationParticipantInventory.read,inventoryDispose=SharedServerLogGenerationParticipantInventory.prototype.dispose;
export function physicalCatalogV2ArchiveState(owner:PhysicalRoomCatalogV2Archive):PhysicalCatalogV2ArchiveState{const state=states.get(owner);if(!state)throw physicalCatalogFailure('catalog_closed');return state;}
function release(state:Pick<PhysicalCatalogV2ArchiveState,'origin'|'current'|'inventory'|'clients'|'files'>):void{
 const errors:unknown[]=[];for(const action of[()=>serverDispose.call(state.origin),()=>serverDispose.call(state.current),()=>inventoryDispose.call(state.inventory),...[...state.clients.values()].map(row=>()=>disposePhysicalCatalogV2Participant(row))])try{action();}catch(error){errors.push(error);}
 if(errors.length)throw physicalCatalogKnown(errors[0],'catalog_storage');Map.prototype.clear.call(state.clients);Map.prototype.clear.call(state.files);
}
function snapshotRawFiles(metadata:PhysicalRoomCatalogV2Metadata,input:ReadonlyMap<string,Blob>):[string,Blob][]{
 const size=metadata.participants.length+3;
 if(!(input instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')?.get?.call(input)!==size||size>MAX_PHYSICAL_ROOM_CATALOG_FILES)throw physicalCatalogFailure('catalog_integrity');
 return [...Map.prototype.entries.call(input)];
}
function snapshotFiles(metadata:PhysicalRoomCatalogV2Metadata,entries:readonly [string,Blob][]):Map<string,Blob>{
 const expected=new Map<string,number>([['origin-server',metadata.origin.bytes],['current-server',metadata.current.server.bytes],['inventory',metadata.current.participants.bytes],...metadata.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as [string,number])]);
 const files=new Map<string,Blob>();
 for(const[name,input]of entries){const bytes=expected.get(name);if(bytes===undefined)throw physicalCatalogFailure('catalog_integrity');const file=archiveBlob(input,bytes);if(file.size!==bytes)throw physicalCatalogFailure('catalog_integrity');files.set(name,file);}return files;
}
async function admit(manifest:string,metadata:PhysicalRoomCatalogV2Metadata,files:Map<string,Blob>,selected:PhysicalRoomCatalogV2Selection,policies:readonly PhysicalRoomCatalogV2GraphPolicy[],context:ArchiveIntegrityContext,signal?:AbortSignal):Promise<PhysicalCatalogV2ArchiveState>{
 if(metadata.catalog!==selected.catalog)throw physicalCatalogFailure('catalog_integrity');
 const graphPolicies=matchPhysicalCatalogV2GraphPolicies(metadata.participants,policies);context.guard();if(await context.digest(new Blob([manifest]))!==selected.sha256)throw physicalCatalogFailure('catalog_integrity');
 const options={wasm:context.wasm,checkAuthority:context.guard,...(signal?{signal}:{})},clients=new Map<string,PhysicalCatalogV2Client>();let origin:SharedServerLogGenerationRoomArchive|undefined,current:SharedServerLogGenerationRoomArchive|undefined,inventory:SharedServerLogGenerationParticipantInventory|undefined;
 try{
  origin=await serverRead.call(SharedServerLogGenerationRoomArchive,files.get('origin-server')!,metadata.origin.identity,options);context.guard();
  current=await serverRead.call(SharedServerLogGenerationRoomArchive,files.get('current-server')!,metadata.current.server.identity,options);context.guard();
  inventory=await inventoryRead.call(SharedServerLogGenerationParticipantInventory,files.get('inventory')!,metadata.current.participants.identity,signal?{signal}:{});context.guard();
  for(const row of metadata.participants){const policy=graphPolicies.get(row.id),graphPolicy=policy?{...policy,checkAuthority:()=>{context.guard();policy.checkAuthority();context.guard();},...(signal?{signal}:{})}:undefined;
   const client=await readPhysicalCatalogV2Participant(row,files.get(physicalParticipantKey(row.id))!,graphPolicy,signal);clients.set(row.id,client);context.guard();}
  return{manifest,metadata,selection:selected,files,clients,origin,current,inventory};
 }catch(error){const attempts=[()=>{if(origin)serverDispose.call(origin);},()=>{if(current)serverDispose.call(current);},()=>{if(inventory)inventoryDispose.call(inventory);},...[...clients.values()].map(row=>()=>disposePhysicalCatalogV2Participant(row))];for(const action of attempts)try{action();}catch{/* Keep the original admission failure after attempting every data-owner release. */}throw physicalCatalogKnown(error);}
}
export class PhysicalRoomCatalogV2Archive{
 readonly #selection;readonly #metadata;readonly #manifest;
 private constructor(token:object,state:PhysicalCatalogV2ArchiveState){if(token!==key)throw physicalCatalogFailure('catalog_closed');this.#selection=state.selection;this.#metadata=state.metadata;this.#manifest=state.manifest;states.set(this,state);Object.freeze(this);}
 selection():PhysicalRoomCatalogV2Selection{return this.#selection;}
 metadata():PhysicalRoomCatalogV2Metadata{return this.#metadata;}
 manifestJson():string{return this.#manifest;}
 files():ReadonlyMap<string,Blob>{return new Map(physicalCatalogV2ArchiveState(this).files);}
 participantFile(id:string):Blob{const file=physicalCatalogV2ArchiveState(this).files.get(physicalParticipantKey(id));if(!file)throw physicalCatalogFailure('catalog_missing');return file;}
 /** Cached native prefixes only. Every omitted historic copy stays unresolved. */
 checkSources(input:readonly PhysicalRoomCatalogV2Source[]):PhysicalRoomCatalogV2Check{
  const state=physicalCatalogV2ArchiveState(this);try{
   const chosen=new Set<string>(),rows=snapshotInventoryInputs(input,()=>physicalCatalogFailure('catalog_policy'),value=>{const row=archiveFields(value,'id,family,source'),id=physicalCatalogName(row['id']),client=state.clients.get(id);if(!client||client.family!==row['family']||chosen.has(id))throw physicalCatalogFailure('catalog_source');chosen.add(id);return{family:client.family,backup:client.backup,source:row['source']} as OperationalPhysicalCohortSource;});
   const result=checkOperationalPhysicalInventoryCohort(state.inventory,rows);if(states.get(this)!==state)throw physicalCatalogFailure('catalog_closed');const selectedParticipants=[...chosen].sort(),unreconciledParticipants=state.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id);return frozen({...result,kind:result.coverage.kind==='covered'&&!unreconciledParticipants.length?'checked':'pending',selectedParticipants,unreconciledParticipants});
  }catch(error){if(states.get(this)!==state)throw physicalCatalogFailure('catalog_closed');throw physicalCatalogKnown(error,'catalog_source');}
 }
 dispose():void{const state=states.get(this);if(state){release(state);states.delete(this);}}
 static async capture(supplied:PhysicalRoomCatalogV2CaptureOptions):Promise<PhysicalRoomCatalogV2Archive>{
  if(this!==PhysicalRoomCatalogV2Archive)throw physicalCatalogFailure('catalog_policy');
  try{
   const input={...supplied};physicalCatalogV2Options(input,['wasm','checkAuthority','catalog','origin','current','participants'],['signal','graphPolicies']);
   const signal=input.signal,originRow=archiveFields(input.origin,'file,expected'),currentRow=archiveFields(input.current,'server,participants'),serverRow=archiveFields(currentRow['server'],'file,expected'),inventoryRow=archiveFields(currentRow['participants'],'file,expected'),originExpected=serverGenerationRoomIdentity(originRow['expected']),serverExpected=serverGenerationRoomIdentity(serverRow['expected']),inventoryExpected=serverGenerationParticipantIdentity(inventoryRow['expected']),originInput=originRow['file'] as Blob,serverInput=serverRow['file'] as Blob,inventoryInput=inventoryRow['file'] as Blob;
   const selectedRows=physicalCatalogV2Rows(input.participants,value=>{const row=archiveFields(value,'id,family,expected,file');return{header:physicalCatalogV2ParticipantHeader({id:row['id'],family:row['family'],selection:row['expected']}),input:row['file'] as Blob};});
   const policies=snapshotPhysicalCatalogV2GraphPolicies(input.graphPolicies??[]),context=prepareArchiveIntegrity(input);
   const rows=selectedRows.map(row=>{const file=archiveBlob(row.input,physicalCatalogV2ParticipantMaximum(row.header.family));return{entry:{...row.header,bytes:file.size},file};});rows.sort((a,b)=>a.entry.id<b.entry.id?-1:a.entry.id>b.entry.id?1:0);
   const origin=archiveBlob(originInput,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),server=archiveBlob(serverInput,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),inventory=archiveBlob(inventoryInput,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES);
   const metadata=physicalCatalogV2Metadata({format:'breditor/shared-physical-room-recovery-catalog',formatVersion:2,catalog:input.catalog,origin:{identity:originExpected,bytes:origin.size},current:{server:{identity:serverExpected,bytes:server.size},participants:{identity:inventoryExpected,bytes:inventory.size}},participants:rows.map(row=>row.entry)}),manifest=JSON.stringify(metadata),files=new Map<string,Blob>([['origin-server',origin],['current-server',server],['inventory',inventory],...rows.map(row=>[physicalParticipantKey(row.entry.id),row.file] as [string,Blob])]),selected=physicalCatalogSelection({catalog:metadata.catalog,sha256:await context.digest(new Blob([manifest]))});
   const state=await admit(manifest,metadata,files,selected,policies,context,signal);try{context.guard();return new PhysicalRoomCatalogV2Archive(key,state);}catch(error){release(state);throw error;}
  }catch(error){throw physicalCatalogKnown(error);}
 }
 static async read(manifest:string,input:ReadonlyMap<string,Blob>,expected:PhysicalRoomCatalogV2Selection,supplied:PhysicalRoomCatalogV2ReadOptions):Promise<PhysicalRoomCatalogV2Archive>{
  if(this!==PhysicalRoomCatalogV2Archive)throw physicalCatalogFailure('catalog_policy');
  try{const options={...supplied};physicalCatalogV2Options(options,['wasm','checkAuthority'],['signal','graphPolicies']);const signal=options.signal,selected=physicalCatalogSelection(expected),metadata=parsePhysicalCatalogV2Manifest(manifest),raw=snapshotRawFiles(metadata,input),policies=snapshotPhysicalCatalogV2GraphPolicies(options.graphPolicies??[]),context=prepareArchiveIntegrity(options),files=snapshotFiles(metadata,raw),state=await admit(manifest,metadata,files,selected,policies,context,signal);try{context.guard();return new PhysicalRoomCatalogV2Archive(key,state);}catch(error){release(state);throw error;}}catch(error){throw physicalCatalogKnown(error);}
 }
}
const p=PhysicalRoomCatalogV2Archive.prototype;
export const physicalCatalogV2Archive=Object.freeze({read:PhysicalRoomCatalogV2Archive.read,capture:PhysicalRoomCatalogV2Archive.capture,selection:p.selection,metadata:p.metadata,manifest:p.manifestJson,files:p.files,participant:p.participantFile,check:p.checkSources,dispose:p.dispose,owns:(value:unknown):value is PhysicalRoomCatalogV2Archive=>!!value&&typeof value==='object'&&states.has(value as PhysicalRoomCatalogV2Archive)});
