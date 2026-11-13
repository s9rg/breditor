import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {archiveBlob,archiveFields} from '../archive_integrity/policy.js';
import {SharedContinuedParticipantBackup} from '../continued_participant/archive.js';
import {continuedInventorySelection,continuedParticipantCoverage,inspectContinuedParticipantPrefix,type ContinuedParticipantPrefix} from '../continued_participant/inventory.js';
import {serverGenerationRoomIdentity} from '../server_generation_archive/identity.js';
import {SharedServerLogGenerationRoomArchive} from '../server_generation_archive/read.js';
import {MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES} from '../server_generation_archive/framing.js';
import {serverGenerationParticipantIdentity} from '../server_generation_inventory/identity.js';
import {SharedServerLogGenerationParticipantInventory} from '../server_generation_inventory/read.js';
import {MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES} from '../server_generation_inventory/policy.js';
import {physicalCatalogV2Options,physicalCatalogV2Rows} from '../physical_room_catalog_v2/input_snapshot.js';
import {physicalCatalogFailure,physicalCatalogSelection,physicalParticipantKey} from '../physical_room_catalog/policy.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {readPhysicalCatalogV3Participant,disposePhysicalCatalogV3Participant} from '../physical_room_catalog_v3/participant.js';
import {continuedRoomMetadata,parseContinuedRoomManifest,continuedRoomParticipantHeader,continuedRoomParticipantMaximum} from './manifest.js';
import {selectContinuedRoomPolicies} from './policy.js';
import type {
 ContinuedRoomCatalogCaptureOptions,ContinuedRoomCatalogMetadata,
 ContinuedRoomCatalogReadOptions,ContinuedRoomCatalogSelection,
} from './contract.js';

const constructorToken=Symbol();
const {read:readServer,prototype:{dispose:disposeServer}}=SharedServerLogGenerationRoomArchive;
const {read:readInventory,prototype:{dispose:disposeInventory}}=SharedServerLogGenerationParticipantInventory;
const {read:readParticipant,prototype:{dispose:disposeParticipant,records:participantRecords,uploadBackup:participantUploads,blob:participantBlob,metadata:participantMetadata}}=SharedContinuedParticipantBackup;
const mapSize=Object.getOwnPropertyDescriptor(Map.prototype,'size')!.get!;

function component<T>(input:unknown,maximum:number,select:(value:unknown)=>T):{file:Blob;identity:T;bytes:number}{
 const row=archiveFields(input,'file,expected');
 const identity=select(row['expected']),file=archiveBlob(row['file'] as Blob,maximum);
 return {file,identity,bytes:file.size};
}

function checkedFiles(metadata:ContinuedRoomCatalogMetadata,input:ReadonlyMap<string,Blob>):Map<string,Blob>{
 const expected=new Map<string,number>([
  ['origin-server',metadata.origin.bytes],['current-server',metadata.current.server.bytes],['inventory',metadata.current.participants.bytes],
  ...metadata.participants.map(row=>[physicalParticipantKey(row.id),row.bytes] as const),
 ]);
 if(!(input instanceof Map)||mapSize.call(input)!==expected.size)throw physicalCatalogFailure('catalog_integrity');
 const files=new Map<string,Blob>();
 for(const [name,bytes] of expected){
  const value=Map.prototype.get.call(input,name);
  const file=archiveBlob(value,bytes);
  if(file.size!==bytes)throw physicalCatalogFailure('catalog_integrity');
  files.set(name,file);
 }
 return files;
}
interface CatalogContents {
 readonly manifest:string;
 readonly selection:ContinuedRoomCatalogSelection;
 readonly metadata:ContinuedRoomCatalogMetadata;
 readonly files:ReadonlyMap<string,Blob>;
 readonly backups:ReadonlyMap<string,SharedContinuedParticipantBackup>;
 readonly observations:readonly Readonly<{id:string;prefix:ContinuedParticipantPrefix}>[];
 readonly inventory:SharedServerLogGenerationParticipantInventory;
}

/** Complete physical server files and explicitly selected local continued participants. */
export class SharedContinuedRoomCatalog {
 #contents:CatalogContents|undefined;
 private constructor(token:symbol,contents:CatalogContents){
  if(token!==constructorToken)throw physicalCatalogFailure('catalog_closed');
  Object.freeze(this);
  this.#contents=contents;
 }
 #live(){if(!this.#contents)throw physicalCatalogFailure('catalog_closed');return this.#contents;}
 manifestJson():string{return this.#live().manifest;}
 selection():ContinuedRoomCatalogSelection{return this.#live().selection;}
 metadata():ContinuedRoomCatalogMetadata{return this.#live().metadata;}
 files():ReadonlyMap<string,Blob>{return new Map(this.#live().files);}
 participantFile(id:string):Blob{
  const file=this.#live().files.get(physicalParticipantKey(id));
  if(!file)throw physicalCatalogFailure('catalog_missing');
  return file;
 }
 #participant(id:string){
  const backup=this.#live().backups.get(id);
  if(!backup)throw physicalCatalogFailure('catalog_missing');
  return backup;
 }
 participantRecords(id:string){return participantRecords.call(this.#participant(id));}
 participantMetadata(id:string){return participantMetadata.call(this.#participant(id));}
 participantUploads(id:string){return participantUploads.call(this.#participant(id));}
 participantAsset(id:string,asset:string,generation:string){return participantBlob.call(this.#participant(id),asset,generation);}
 inspectPrefixes(){
  const state=this.#live(),source=continuedInventorySelection(state.inventory);
  const coverage=continuedParticipantCoverage(state.inventory,state.observations.map(row=>row.prefix));
  const unreconciledParticipants=state.metadata.participants.filter(row=>!state.backups.has(row.id)).map(row=>row.id);
  const result=frozen({source,coverage,participants:state.observations,unreconciledParticipants});
  if(this.#live()!==state)throw physicalCatalogFailure('catalog_closed');
  return result;
 }
 dispose():void{
  const state=this.#contents;
  if(!state)return;
  this.#contents=undefined;
  disposeInventory.call(state.inventory);
  for(const backup of state.backups.values())disposeParticipant.call(backup);
 }
 static async capture(input:ContinuedRoomCatalogCaptureOptions):Promise<SharedContinuedRoomCatalog>{
  const options={...input};
  physicalCatalogV2Options(options,['wasm','checkAuthority','policies','catalog','origin','current','participants'],['signal','graphPolicies','localPolicies']);
  const origin=component(options.origin,MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES,serverGenerationRoomIdentity);
  const current=archiveFields(options.current,'server,participants');
  const server=component(current['server'],MAX_SHARED_SERVER_GENERATION_ARCHIVE_BYTES,serverGenerationRoomIdentity);
  const inventory=component(current['participants'],MAX_SHARED_SERVER_LOG_GENERATION_PARTICIPANT_INVENTORY_BYTES,serverGenerationParticipantIdentity);
  const files=new Map<string,Blob>([['origin-server',origin.file],['current-server',server.file],['inventory',inventory.file]]);
  const participants=physicalCatalogV2Rows(options.participants,value=>{
   const row=Object.hasOwn(value,'family')?archiveFields(value,'id,family,file,expected'):archiveFields(value,'id,file,expected');
   const header=continuedRoomParticipantHeader(row['id'],Object.hasOwn(row,'family')?row['family']:'continued-local',row['expected']);
   const file=archiveBlob(row['file'] as Blob,continuedRoomParticipantMaximum(header.family));
   files.set(physicalParticipantKey(header.id),file);
   return {...header,bytes:file.size};
  }).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const metadata=continuedRoomMetadata({format:'breditor/shared-physical-room-recovery-catalog',formatVersion:4,catalog:options.catalog,
   origin:{identity:origin.identity,bytes:origin.bytes},current:{
    server:{identity:server.identity,bytes:server.bytes},participants:{identity:inventory.identity,bytes:inventory.bytes},
   },participants});
  const policies=selectContinuedRoomPolicies(metadata.participants,options);
  const context=prepareArchiveIntegrity(options),manifest=JSON.stringify(metadata);
  const selected=physicalCatalogSelection({catalog:metadata.catalog,sha256:await context.digest(new Blob([manifest]))});
  return SharedContinuedRoomCatalog.#admit(manifest,metadata,files,selected,policies,context,options.signal);
 }
 static async read(manifest:string,input:ReadonlyMap<string,Blob>,expected:ContinuedRoomCatalogSelection,
  supplied:ContinuedRoomCatalogReadOptions):Promise<SharedContinuedRoomCatalog>{
  const options={...supplied};
  physicalCatalogV2Options(options,['wasm','checkAuthority','policies'],['signal','graphPolicies','localPolicies']);
  const selected=physicalCatalogSelection(expected),metadata=parseContinuedRoomManifest(manifest);
  if(metadata.catalog!==selected.catalog)throw physicalCatalogFailure('catalog_integrity');
  const files=checkedFiles(metadata,input),policies=selectContinuedRoomPolicies(metadata.participants,options);
  const context=prepareArchiveIntegrity(options);
  if(await context.digest(new Blob([manifest]))!==selected.sha256)throw physicalCatalogFailure('catalog_integrity');
  return SharedContinuedRoomCatalog.#admit(manifest,metadata,files,selected,policies,context,options.signal);
 }
 static async #admit(
  manifest:string,metadata:ContinuedRoomCatalogMetadata,files:Map<string,Blob>,selection:ContinuedRoomCatalogSelection,
  policies:ReturnType<typeof selectContinuedRoomPolicies>,context:ArchiveIntegrityContext,signal?:AbortSignal,
 ):Promise<SharedContinuedRoomCatalog>{
  const options={wasm:context.wasm,checkAuthority:context.guard,...(signal?{signal}:{})};
  const backups=new Map<string,SharedContinuedParticipantBackup>();
  const observations:{id:string;prefix:ContinuedParticipantPrefix}[]=[];
  let inventory:SharedServerLogGenerationParticipantInventory|undefined,complete=false;
  try{
   for(const [name,source] of [['origin-server',metadata.origin],['current-server',metadata.current.server]] as const){
    const server=await readServer.call(SharedServerLogGenerationRoomArchive,files.get(name)!,source.identity,options);
    disposeServer.call(server);
   }
   inventory=await readInventory.call(SharedServerLogGenerationParticipantInventory,
    files.get('inventory')!,metadata.current.participants.identity,options);
   for(const row of metadata.participants){
    const file=files.get(physicalParticipantKey(row.id))!;
    if(row.family!=='continued-local'){
     const wrap=<T extends {checkAuthority:()=>void;signal?:AbortSignal}>(policy:T|undefined)=>policy?{
      ...policy,checkAuthority:()=>{context.guard();policy.checkAuthority();context.guard();},
      ...(signal?{signal}:{}),
     }:undefined;
     const client=await readPhysicalCatalogV3Participant(row,file,wrap(policies.graph.get(row.id)),wrap(policies.local.get(row.id)),signal);
     disposePhysicalCatalogV3Participant(client);
     context.guard();
     continue;
    }
    const {restoreDocument,limits}=policies.policies.get(row.id)!;
    const policy={...options,restoreDocument,...(limits?{limits}:{})};
    const backup=await readParticipant.call(SharedContinuedParticipantBackup,file,row.selection,policy);
    backups.set(row.id,backup);
    observations.push({id:row.id,prefix:await inspectContinuedParticipantPrefix(backup,inventory,policy)});
   }
   // Refuse duplicate native copies as one cohort, regardless of their file IDs.
   continuedParticipantCoverage(inventory,observations.map(row=>row.prefix));
   const contents={manifest,metadata,files,selection,backups,observations:frozen(observations),inventory};
   context.guard();
   const owner=new SharedContinuedRoomCatalog(constructorToken,contents);
   try{context.guard();owner.#live();}catch(error){owner.#contents=undefined;throw error;}
   complete=true;
   return owner;
  }finally{
   if(!complete){
    if(inventory)disposeInventory.call(inventory);
    for(const backup of backups.values())disposeParticipant.call(backup);
   }
  }
 }
}
