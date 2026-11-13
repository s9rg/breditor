import {archiveFields} from '../archive_integrity/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {createPhysicalCatalogDatabase,existingPhysicalCatalogV3Database,readPhysicalCatalogDatabase} from '../physical_room_catalog_v3/database.js';
import {physicalCatalogDatabase,physicalCatalogFailure,physicalCatalogKnown,physicalCatalogSelection} from '../physical_room_catalog/policy.js';
import {physicalCatalogV2Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {SharedContinuedRoomCatalog} from './archive.js';
import type {ContinuedRoomCatalogReadOptions,ContinuedRoomCatalogSelection} from './contract.js';
import {selectContinuedRoomPolicies} from './policy.js';
import {parseContinuedRoomManifest} from './manifest.js';

interface OpenOptions extends ContinuedRoomCatalogReadOptions {
 readonly database:string;
 readonly expected:ContinuedRoomCatalogSelection;
}
let borrowStore:(store:SharedContinuedRoomCatalogStore)=>Resources;
const token=Symbol(),format='breditor/shared-physical-room-recovery-state';
const record=(manifest:string)=>{
 parseContinuedRoomManifest(manifest);
 return {format,formatVersion:4 as const,manifest};
};
const storage={
 stateStore:'physical_room_v4_state',fileStore:'physical_room_v4_files',encode:record,
 check(input:unknown,expected?:string){
  const row=archiveFields(input,'format,formatVersion,manifest'),manifest=row['manifest'];
  if(row['format']!==format||row['formatVersion']!==4||typeof manifest!=='string'||expected!==undefined&&manifest!==expected)
   throw physicalCatalogFailure('catalog_diverged');
  return record(manifest);
 },
 participants:(manifest:string)=>parseContinuedRoomManifest(manifest).participants,
};
const {
 read:readArchive,prototype:{selection,manifestJson,files,metadata,inspectPrefixes,participantFile,participantRecords,participantDeliveryRecords,participantUploads,participantAsset,dispose},
}=SharedContinuedRoomCatalog;
const {close:closeLease}=RecoveryLease.prototype;
interface Resources {
 readonly archive:SharedContinuedRoomCatalog;
 readonly database:string;
 readonly options:ContinuedRoomCatalogReadOptions;
 readonly db:IDBDatabase;
 readonly lease:RecoveryLease;
 readonly check:()=>void;
}

/** Durable insert-only catalog. Each cold reopen verifies all selected files and native prefixes. */
export class SharedContinuedRoomCatalogStore {
 readonly #resources:Resources;
 #closed=false;
 #closing:Promise<void>|undefined;
 private constructor(key:symbol,resources:Resources){
  if(key!==token)throw physicalCatalogFailure('catalog_closed');
  this.#resources=resources;
  Object.freeze(this);
 }
 static{borrowStore=store=>{store.#live();return store.#resources;};}
 #live(){
  if(this.#closed)throw physicalCatalogFailure('catalog_closed');
  this.#resources.check();
  if(this.#closed)throw physicalCatalogFailure('catalog_closed');
  return this.#resources.archive;
 }
 selection(){return selection.call(this.#live());}
 metadata(){return metadata.call(this.#live());}
 inspectPrefixes(){return inspectPrefixes.call(this.#live());}
 participantFile(id:string){return participantFile.call(this.#live(),id);}
 participantRecords(id:string){return participantRecords.call(this.#live(),id);}
 participantDeliveryRecords(id:string){return participantDeliveryRecords.call(this.#live(),id);}
 participantUploads(id:string){return participantUploads.call(this.#live(),id);}
 participantAsset(id:string,asset:string,generation:string){return participantAsset.call(this.#live(),id,asset,generation);}
 close():Promise<void>{
  this.#closed=true;
  const {archive,db,lease}=this.#resources;
  this.#closing??=(async()=>{
   dispose.call(archive);
   db.close();
   await closeLease.call(lease);
  })();
  return this.#closing;
 }
 static begin(input:OpenOptions&Readonly<{archive:SharedContinuedRoomCatalog}>):Promise<SharedContinuedRoomCatalogStore>{
  physicalCatalogV2Options(input,['database','expected','wasm','checkAuthority','policies','archive'],['signal','graphPolicies','localPolicies']);
  const {archive,...options}=input;
  selection.call(archive);
  return SharedContinuedRoomCatalogStore.#open(options,archive);
 }
 static resume(input:OpenOptions):Promise<SharedContinuedRoomCatalogStore>{
  physicalCatalogV2Options(input,['database','expected','wasm','checkAuthority','policies'],['signal','graphPolicies','localPolicies']);
  return SharedContinuedRoomCatalogStore.#open(input);
 }
 static async #open(input:OpenOptions,incoming?:SharedContinuedRoomCatalog):Promise<SharedContinuedRoomCatalogStore>{
  const {wasm,policies,graphPolicies,localPolicies,signal}=input,database=physicalCatalogDatabase(input.database);
  const expected=physicalCatalogSelection(input.expected),authority=participantAuthority(input.checkAuthority);
  const factory=recoveryOpeningContext(),locks=navigator.locks;
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,archive:SharedContinuedRoomCatalog|undefined,changed=false;
  const stable=()=>{
   if(changed)throw physicalCatalogFailure('catalog_closed');
   if(globalThis.indexedDB!==factory||globalThis.navigator?.locks!==locks)throw physicalCatalogFailure('catalog_policy');
   if(signal?.aborted)throw physicalCatalogFailure('catalog_closed');
   if(lease)checkRecoveryLeasesHeld([lease]);
  };
  const check=()=>{stable();authority();stable();};
  const options={wasm,policies,checkAuthority:check,...(signal?{signal}:{}),
   ...(graphPolicies?{graphPolicies}:{}),...(localPolicies?{localPolicies}:{})};
  const opening=await RecoveryOpeningCustody.reserve(factory,[database],async()=>{
   try{if(archive)dispose.call(archive);}
   finally{try{db?.close();}finally{if(lease)await closeLease.call(lease);}}
  },{policy:()=>physicalCatalogFailure('catalog_policy'),busy:()=>physicalCatalogFailure('catalog_in_use'),storage:()=>physicalCatalogFailure('catalog_storage')});
  try{
   check();
   lease=await RecoveryLease.acquire(JSON.stringify(database));
   check();
   if(incoming){
    if(JSON.stringify(selection.call(incoming))!==JSON.stringify(expected))throw physicalCatalogFailure('catalog_integrity');
    const manifest=manifestJson.call(incoming),snapshot=files.call(incoming);
    archive=await readArchive.call(SharedContinuedRoomCatalog,manifest,snapshot,expected,options);
    check();
    db=await createPhysicalCatalogDatabase(factory,database,{manifest,files:snapshot},check,signal,storage);
   }else{
    db=await existingPhysicalCatalogV3Database(factory,database,check);
    if(!db)throw physicalCatalogFailure('catalog_missing');
   }
   const active=db;
   active.onversionchange=()=>{changed=true;active.close();};
   const stored=await readPhysicalCatalogDatabase(db,check,incoming&&archive?manifestJson.call(archive):undefined,storage);
   // Re-admit the stored bytes, including the exact server and participant files.
   if(archive){dispose.call(archive);archive=undefined;}
   archive=await readArchive.call(SharedContinuedRoomCatalog,stored.record.manifest,stored.files,expected,options);
   check();
   const pinned=selectContinuedRoomPolicies(metadata.call(archive).participants,options);
   const owner=new SharedContinuedRoomCatalogStore(token,{archive,db,lease,check,database,options:{
    ...options,policies:Object.freeze([...pinned.policies.values()]),graphPolicies:pinned.graphPolicies,localPolicies:pinned.localPolicies,
   }});
   check();
   opening.complete();
   return owner;
  }catch(error){
   await opening.rollback();
   throw physicalCatalogKnown(error,'catalog_storage');
  }
 }
}

/** Internal checked archive borrow. A recovery always reads the actual durable catalog again. */
export function continuedRoomRecoveryCatalog(store:SharedContinuedRoomCatalogStore){
 const held=borrowStore(store),chosen=selection.call(held.archive),expectedManifest=manifestJson.call(held.archive);
 const check=()=>{if(borrowStore(store)!==held)throw physicalCatalogFailure('catalog_closed');};
 return {
  database:held.database,selection:chosen,metadata:metadata.call(held.archive),options:held.options,check,
  async read(extraCheck:()=>void,signal?:AbortSignal){
   const guard=()=>{check();extraCheck();check();};
   const stored=await readPhysicalCatalogDatabase(held.db,guard,expectedManifest,storage);
   const options={...held.options,checkAuthority:guard,...(signal?{signal}:{})};
   const archive=await readArchive.call(SharedContinuedRoomCatalog,stored.record.manifest,stored.files,chosen,options);
   try{guard();return archive;}catch(error){dispose.call(archive);throw error;}
  },
 };
}
