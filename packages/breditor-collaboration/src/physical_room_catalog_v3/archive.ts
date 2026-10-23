/** Complete explicitly selected seven-family files. Native replay of graph data
 * does not transfer writers, reconcile historical copies or activate a service. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob,archiveFields} from '../archive_integrity/policy.js';
import {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {checkPhysicalCatalogV3Inventory} from './inventory.js';
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from '../server_generation_archive/framing.js';
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from '../server_generation_inventory/policy.js';
import {physicalCatalogSelection,physicalCatalogName,physicalCatalogFailure,physicalCatalogKnown,physicalParticipantKey,MAX_PHYSICAL_ROOM_CATALOG_FILES} from '../physical_room_catalog/policy.js';
import {snapshotInventoryInputs} from '../room_participant_inventory/input_snapshot.js';
import {frozen} from '../room_participant_inventory/policy.js';
import type {PhysicalCatalogV3CohortSource} from './coverage.js';
import {physicalCatalogV3FinalNativeWitness} from './final_native_witness.js';
import {physicalCatalogV3Metadata,parsePhysicalCatalogV3Manifest} from './manifest.js';
import {physicalCatalogV2Rows as physicalCatalogV3Rows,physicalCatalogV2Options as physicalCatalogV3Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogV3ParticipantHeader,physicalCatalogV3ParticipantMaximum,readPhysicalCatalogV3Participant,disposePhysicalCatalogV3Participant,type PhysicalCatalogV3Client} from './participant.js';
import {snapshotPhysicalCatalogV2GraphPolicies as snapshotPhysicalCatalogV3GraphPolicies,matchPhysicalCatalogV2GraphPolicies as matchPhysicalCatalogV3GraphPolicies} from '../physical_room_catalog_v2/graph_policy.js';
import {snapshotPhysicalCatalogV3LocalPolicies,matchPhysicalCatalogV3LocalPolicies} from './local_policy.js';
import type {PhysicalRoomCatalogV2Entry} from '../physical_room_catalog_v2/contract.js';
import type {PhysicalRoomCatalogV3Entry,PhysicalRoomCatalogV3LocalPolicy} from './contract.js';
import type {PhysicalRoomCatalogV3CaptureOptions,PhysicalRoomCatalogV3ReadOptions,PhysicalRoomCatalogV3Metadata,PhysicalRoomCatalogV3Selection,PhysicalRoomCatalogV3Source,PhysicalRoomCatalogV3Check,PhysicalRoomCatalogV3GraphPolicy} from './contract.js';

export interface PhysicalCatalogV3ArchiveState{
 published:boolean;
 readonly manifest:string;readonly metadata:PhysicalRoomCatalogV3Metadata;readonly selection:PhysicalRoomCatalogV3Selection;
 readonly files:ReadonlyMap<string,Blob>;readonly clients:ReadonlyMap<string,PhysicalCatalogV3Client>;
 readonly origin:SharedServerLogGenerationRoomArchive;readonly current:SharedServerLogGenerationRoomArchive;
 readonly inventory:SharedServerLogGenerationParticipantInventory;
}
const key=Object.freeze({}),states=new WeakMap<PhysicalRoomCatalogV3Archive,PhysicalCatalogV3ArchiveState>();
const serverRead=SharedServerLogGenerationRoomArchive.read,serverDispose=SharedServerLogGenerationRoomArchive.prototype.dispose,inventoryRead=SharedServerLogGenerationParticipantInventory.read,inventoryDispose=SharedServerLogGenerationParticipantInventory.prototype.dispose;
export function physicalCatalogV3ArchiveState(owner:PhysicalRoomCatalogV3Archive):PhysicalCatalogV3ArchiveState{const state=states.get(owner);if(!state?.published)throw physicalCatalogFailure('catalog_closed');return state;}
/** Internal parent fence. Capture real archive/source pairs before parent
 * callbacks, then check without any permission/factory/wrapper callback. */
export function physicalCatalogV3ParentSourceFence(owner:PhysicalRoomCatalogV3Archive,input:readonly PhysicalRoomCatalogV3Source[]){
 const state=physicalCatalogV3ArchiveState(owner),chosen=new Set<string>(),sources=snapshotInventoryInputs(input,()=>physicalCatalogFailure('catalog_policy'),value=>{const row=archiveFields(value,'id,family,source'),id=physicalCatalogName(row['id']),client=state.clients.get(id);if(!client||client.family!==row['family']||chosen.has(id))throw physicalCatalogFailure('catalog_source');chosen.add(id);return{id,family:client.family,source:row['source']} as PhysicalRoomCatalogV3Source;}),rows=sources.map(row=>{const client=state.clients.get(row.id)!;return{family:client.family,backup:client.backup,source:row.source} as PhysicalCatalogV3CohortSource;}),witness=physicalCatalogV3FinalNativeWitness(rows);
 return{sources,check:()=>{if(states.get(owner)!==state||!state.published)throw physicalCatalogFailure('catalog_closed');witness();if(states.get(owner)!==state)throw physicalCatalogFailure('catalog_closed');}};
}
function publish(owner:PhysicalRoomCatalogV3Archive,state:PhysicalCatalogV3ArchiveState):PhysicalRoomCatalogV3Archive{if(states.get(owner)!==state||state.published)throw physicalCatalogFailure('catalog_closed');state.published=true;return owner;}
function release(state:Pick<PhysicalCatalogV3ArchiveState,'origin'|'current'|'inventory'|'clients'|'files'>):void{
 const errors:unknown[]=[];for(const action of[()=>serverDispose.call(state.origin),()=>serverDispose.call(state.current),()=>inventoryDispose.call(state.inventory),...[...state.clients.values()].map(row=>()=>disposePhysicalCatalogV3Participant(row))])try{action();}catch(error){errors.push(error);}
 if(errors.length)throw physicalCatalogKnown(errors[0],'catalog_storage');Map.prototype.clear.call(state.clients);Map.prototype.clear.call(state.files);
}
function snapshotRawFiles(metadata:PhysicalRoomCatalogV3Metadata,input:ReadonlyMap<string,Blob>):[string,Blob][]{
 const size=metadata.participants.length+3;
 if(!(input instanceof Map)||Object.getOwnPropertyDescriptor(Map.prototype,'size')?.get?.call(input)!==size||size>MAX_PHYSICAL_ROOM_CATALOG_FILES)throw physicalCatalogFailure('catalog_integrity');
 return [...Map.prototype.entries.call(input)];
}
function snapshotFiles(metadata:PhysicalRoomCatalogV3Metadata,entries:readonly [string,Blob][]):Map<string,Blob>{
 const expected=new Map<string,number>([['origin-server',metadata.origin.bytes],['current-server',metadata.current.server.bytes],['inventory',metadata.current.participants.bytes],...metadata.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as [string,number])]);
 const files=new Map<string,Blob>();
 for(const[name,input]of entries){const bytes=expected.get(name);if(bytes===undefined)throw physicalCatalogFailure('catalog_integrity');const file=archiveBlob(input,bytes);if(file.size!==bytes)throw physicalCatalogFailure('catalog_integrity');files.set(name,file);}return files;
}
function legacy(row:PhysicalRoomCatalogV3Entry):row is PhysicalRoomCatalogV2Entry{return row.family!=='local-operation-snapshot'&&row.family!=='local-operation-flat';}
async function admit(manifest:string,metadata:PhysicalRoomCatalogV3Metadata,files:Map<string,Blob>,selected:PhysicalRoomCatalogV3Selection,policies:readonly PhysicalRoomCatalogV3GraphPolicy[],localPolicies:readonly PhysicalRoomCatalogV3LocalPolicy[],context:ArchiveIntegrityContext,signal?:AbortSignal):Promise<PhysicalCatalogV3ArchiveState>{
 if(metadata.catalog!==selected.catalog)throw physicalCatalogFailure('catalog_integrity');
 const graphPolicies=matchPhysicalCatalogV3GraphPolicies(metadata.participants.filter(legacy),policies),locals=matchPhysicalCatalogV3LocalPolicies(metadata.participants,localPolicies);context.guard();if(await context.digest(new Blob([manifest]))!==selected.sha256)throw physicalCatalogFailure('catalog_integrity');
 const options={wasm:context.wasm,checkAuthority:context.guard,...(signal?{signal}:{})},clients=new Map<string,PhysicalCatalogV3Client>();let origin:SharedServerLogGenerationRoomArchive|undefined,current:SharedServerLogGenerationRoomArchive|undefined,inventory:SharedServerLogGenerationParticipantInventory|undefined;
 try{
  origin=await serverRead.call(SharedServerLogGenerationRoomArchive,files.get('origin-server')!,metadata.origin.identity,options);context.guard();
  current=await serverRead.call(SharedServerLogGenerationRoomArchive,files.get('current-server')!,metadata.current.server.identity,options);context.guard();
  inventory=await inventoryRead.call(SharedServerLogGenerationParticipantInventory,files.get('inventory')!,metadata.current.participants.identity,signal?{signal}:{});context.guard();
  for(const row of metadata.participants){const policy=graphPolicies.get(row.id),local=locals.get(row.id),graphPolicy=policy?{...policy,checkAuthority:()=>{context.guard();policy.checkAuthority();context.guard();},...(signal?{signal}:{})}:undefined,localPolicy=local?{...local,checkAuthority:()=>{context.guard();local.checkAuthority();context.guard();},...(signal?{signal}:{})}:undefined;
   const client=await readPhysicalCatalogV3Participant(row,files.get(physicalParticipantKey(row.id))!,graphPolicy,localPolicy,signal);clients.set(row.id,client);context.guard();}
  return{published:false,manifest,metadata,selection:selected,files,clients,origin,current,inventory};
 }catch(error){const attempts=[()=>{if(origin)serverDispose.call(origin);},()=>{if(current)serverDispose.call(current);},()=>{if(inventory)inventoryDispose.call(inventory);},...[...clients.values()].map(row=>()=>disposePhysicalCatalogV3Participant(row))];for(const action of attempts)try{action();}catch{/* Keep the original admission failure after attempting every data-owner release. */}throw physicalCatalogKnown(error);}
}
export class PhysicalRoomCatalogV3Archive{
 readonly #selection;readonly #metadata;readonly #manifest;
 private constructor(token:object,state:PhysicalCatalogV3ArchiveState){if(token!==key)throw physicalCatalogFailure('catalog_closed');this.#selection=state.selection;this.#metadata=state.metadata;this.#manifest=state.manifest;states.set(this,state);Object.freeze(this);}
 selection():PhysicalRoomCatalogV3Selection{physicalCatalogV3ArchiveState(this);return this.#selection;}
 metadata():PhysicalRoomCatalogV3Metadata{physicalCatalogV3ArchiveState(this);return this.#metadata;}
 manifestJson():string{physicalCatalogV3ArchiveState(this);return this.#manifest;}
 files():ReadonlyMap<string,Blob>{return new Map(physicalCatalogV3ArchiveState(this).files);}
 participantFile(id:string):Blob{const file=physicalCatalogV3ArchiveState(this).files.get(physicalParticipantKey(id));if(!file)throw physicalCatalogFailure('catalog_missing');return file;}
 /** Cached native prefixes only. Every omitted historic copy stays unresolved. */
 checkSources(input:readonly PhysicalRoomCatalogV3Source[]):PhysicalRoomCatalogV3Check{
  const state=physicalCatalogV3ArchiveState(this);try{
   const chosen=new Set<string>(),rows=snapshotInventoryInputs(input,()=>physicalCatalogFailure('catalog_policy'),value=>{const row=archiveFields(value,'id,family,source'),id=physicalCatalogName(row['id']),client=state.clients.get(id);if(!client||client.family!==row['family']||chosen.has(id))throw physicalCatalogFailure('catalog_source');chosen.add(id);return{family:client.family,backup:client.backup,source:row['source']} as PhysicalCatalogV3CohortSource;});
   const final=physicalCatalogV3FinalNativeWitness(rows),result=checkPhysicalCatalogV3Inventory(state.inventory,rows);if(states.get(this)!==state)throw physicalCatalogFailure('catalog_closed');const selectedParticipants=[...chosen].sort(),unreconciledParticipants=state.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id),output=frozen({...result,kind:result.coverage.kind==='covered'&&!unreconciledParticipants.length?'checked' as const:'pending' as const,selectedParticipants,unreconciledParticipants});checkPhysicalCatalogV3Inventory(state.inventory,rows);if(states.get(this)!==state)throw physicalCatalogFailure('catalog_closed');final();return output;
  }catch(error){if(states.get(this)!==state)throw physicalCatalogFailure('catalog_closed');throw physicalCatalogKnown(error,'catalog_source');}
 }
 dispose():void{const state=states.get(this);if(state){release(state);states.delete(this);}}
 static async capture(supplied:PhysicalRoomCatalogV3CaptureOptions):Promise<PhysicalRoomCatalogV3Archive>{
  if(this!==PhysicalRoomCatalogV3Archive)throw physicalCatalogFailure('catalog_policy');
  try{
   const input={...supplied};physicalCatalogV3Options(input,['wasm','checkAuthority','catalog','origin','current','participants'],['signal','graphPolicies','localPolicies']);
   const signal=input.signal,originRow=archiveFields(input.origin,'file,expected'),currentRow=archiveFields(input.current,'server,participants'),serverRow=archiveFields(currentRow['server'],'file,expected'),inventoryRow=archiveFields(currentRow['participants'],'file,expected'),originExpected=serverGenerationRoomIdentity(originRow['expected']),serverExpected=serverGenerationRoomIdentity(serverRow['expected']),inventoryExpected=serverGenerationParticipantIdentity(inventoryRow['expected']),originInput=originRow['file'] as Blob,serverInput=serverRow['file'] as Blob,inventoryInput=inventoryRow['file'] as Blob;
   const selectedRows=physicalCatalogV3Rows(input.participants,value=>{const row=archiveFields(value,'id,family,expected,file');return{header:physicalCatalogV3ParticipantHeader({id:row['id'],family:row['family'],selection:row['expected']}),input:row['file'] as Blob};});
   const policies=snapshotPhysicalCatalogV3GraphPolicies(input.graphPolicies??[]),localPolicies=snapshotPhysicalCatalogV3LocalPolicies(input.localPolicies??[]),context=prepareArchiveIntegrity(input);
   const rows=selectedRows.map(row=>{const file=archiveBlob(row.input,physicalCatalogV3ParticipantMaximum(row.header.family));return{entry:{...row.header,bytes:file.size},file};});rows.sort((a,b)=>a.entry.id<b.entry.id?-1:a.entry.id>b.entry.id?1:0);
   const origin=archiveBlob(originInput,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),server=archiveBlob(serverInput,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES),inventory=archiveBlob(inventoryInput,MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES);
   const metadata=physicalCatalogV3Metadata({format:'breditor/shared-physical-room-recovery-catalog',formatVersion:3,catalog:input.catalog,origin:{identity:originExpected,bytes:origin.size},current:{server:{identity:serverExpected,bytes:server.size},participants:{identity:inventoryExpected,bytes:inventory.size}},participants:rows.map(row=>row.entry)}),manifest=JSON.stringify(metadata),files=new Map<string,Blob>([['origin-server',origin],['current-server',server],['inventory',inventory],...rows.map(row=>[physicalParticipantKey(row.entry.id),row.file] as [string,Blob])]),selected=physicalCatalogSelection({catalog:metadata.catalog,sha256:await context.digest(new Blob([manifest]))});
   const state=await admit(manifest,metadata,files,selected,policies,localPolicies,context,signal);try{context.guard();const owner=new PhysicalRoomCatalogV3Archive(key,state);context.guard();return publish(owner,state);}catch(error){release(state);throw error;}
  }catch(error){throw physicalCatalogKnown(error);}
 }
 static async read(manifest:string,input:ReadonlyMap<string,Blob>,expected:PhysicalRoomCatalogV3Selection,supplied:PhysicalRoomCatalogV3ReadOptions):Promise<PhysicalRoomCatalogV3Archive>{
  if(this!==PhysicalRoomCatalogV3Archive)throw physicalCatalogFailure('catalog_policy');
  try{const options={...supplied};physicalCatalogV3Options(options,['wasm','checkAuthority'],['signal','graphPolicies','localPolicies']);const signal=options.signal,selected=physicalCatalogSelection(expected),metadata=parsePhysicalCatalogV3Manifest(manifest),raw=snapshotRawFiles(metadata,input),policies=snapshotPhysicalCatalogV3GraphPolicies(options.graphPolicies??[]),localPolicies=snapshotPhysicalCatalogV3LocalPolicies(options.localPolicies??[]),context=prepareArchiveIntegrity(options),files=snapshotFiles(metadata,raw),state=await admit(manifest,metadata,files,selected,policies,localPolicies,context,signal);try{context.guard();const owner=new PhysicalRoomCatalogV3Archive(key,state);context.guard();return publish(owner,state);}catch(error){release(state);throw error;}}catch(error){throw physicalCatalogKnown(error);}
 }
}
const p=PhysicalRoomCatalogV3Archive.prototype;
export const physicalCatalogV3Archive=Object.freeze({read:PhysicalRoomCatalogV3Archive.read,capture:PhysicalRoomCatalogV3Archive.capture,selection:p.selection,metadata:p.metadata,manifest:p.manifestJson,files:p.files,participant:p.participantFile,check:p.checkSources,dispose:p.dispose,owns:(value:unknown):value is PhysicalRoomCatalogV3Archive=>!!value&&typeof value==='object'&&states.get(value as PhysicalRoomCatalogV3Archive)?.published===true});
