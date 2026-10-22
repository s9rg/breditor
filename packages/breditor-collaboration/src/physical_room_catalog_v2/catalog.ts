/** Private durable five-family retention with actual database/archive/lease
 * custody. Completion markers never replace file/native admission or authority. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {physicalCatalogDatabase,physicalCatalogSelection,physicalCatalogFailure,physicalCatalogKnown} from '../physical_room_catalog/policy.js';
import {PhysicalRoomCatalogV2Archive,physicalCatalogV2Archive,physicalCatalogV2ArchiveState,type PhysicalCatalogV2ArchiveState} from './archive.js';
import {snapshotPhysicalCatalogV2GraphPolicies} from './graph_policy.js';
import {physicalCatalogV2Options} from './input_snapshot.js';
import {createPhysicalCatalogV2Database,existingPhysicalCatalogV2Database,readPhysicalCatalogV2Database} from './database.js';
import type {PhysicalRoomCatalogV2BeginOptions,PhysicalRoomCatalogV2OpenOptions,PhysicalRoomCatalogV2ReadOptions,PhysicalRoomCatalogV2Selection,PhysicalRoomCatalogV2Metadata,PhysicalRoomCatalogV2Source,PhysicalRoomCatalogV2Check} from './contract.js';
const token=Object.freeze({});
export interface PhysicalCatalogV2Custody{
 readonly database:string;readonly db:IDBDatabase;readonly lease:RecoveryLease;readonly archive:PhysicalRoomCatalogV2Archive;readonly state:PhysicalCatalogV2ArchiveState;readonly factory:IDBFactory;readonly locks:LockManager;
}
let take:<T>(catalog:PhysicalRoomCatalogV2,prepare:(held:PhysicalCatalogV2Custody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>Promise<T>;
let readState:(catalog:PhysicalRoomCatalogV2)=>PhysicalCatalogV2ArchiveState;
/** Private actual archive access for fresh native borrows; never a DTO constructor. */
export function physicalRoomCatalogV2State(catalog:PhysicalRoomCatalogV2):PhysicalCatalogV2ArchiveState{return readState(catalog);}
/** Actual successor custody only. The source reserves before callbacks and
 * retires after a final callback-free synchronous commit; no metadata flag helps. */
export function transferPhysicalCatalogV2<T>(catalog:PhysicalRoomCatalogV2,prepare:(held:PhysicalCatalogV2Custody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>)):Promise<T>{return take(catalog,prepare);}
export class PhysicalRoomCatalogV2{
 readonly #database;readonly #db;readonly #lease;readonly #archive;readonly #state;readonly #context;readonly #factory;readonly #locks;readonly #options;
 #closed=false;#closing=false;#busy=false;#running:Promise<void>|undefined;#transferring:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(key:object,database:string,db:IDBDatabase,lease:RecoveryLease,archive:PhysicalRoomCatalogV2Archive,context:ArchiveIntegrityContext,factory:IDBFactory,locks:LockManager,options:PhysicalRoomCatalogV2ReadOptions){
  if(key!==token)throw physicalCatalogFailure('catalog_closed');this.#database=database;this.#db=db;this.#lease=lease;this.#archive=archive;this.#state=physicalCatalogV2ArchiveState(archive);this.#context=context;this.#factory=factory;this.#locks=locks;this.#options=options;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);
 }
 static{take=async<T>(catalog:PhysicalRoomCatalogV2,prepare:(held:PhysicalCatalogV2Custody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>{
  if(!catalog||typeof catalog!=='object'||!(#state in catalog))throw physicalCatalogFailure('catalog_policy');if(catalog.#busy)throw physicalCatalogFailure('catalog_in_use');catalog.#busy=true;let done!:()=>void;catalog.#transferring=new Promise<void>(resolve=>{done=resolve;});
  try{
   if(catalog.#closed||catalog.#closing)throw physicalCatalogFailure('catalog_closed');
   const proceed=prepare({database:catalog.#database,db:catalog.#db,lease:catalog.#lease,archive:catalog.#archive,state:catalog.#state,factory:catalog.#factory,locks:catalog.#locks});
   catalog.#guard();await catalog.#verify();catalog.#guard();const result=await proceed();await catalog.#verify();catalog.#guard();result.prepareCommit();
   if(catalog.#closed||catalog.#closing||catalog.#options.signal?.aborted)throw physicalCatalogFailure('catalog_closed');if(globalThis.indexedDB!==catalog.#factory||globalThis.navigator?.locks!==catalog.#locks)throw physicalCatalogFailure('catalog_policy');physicalCatalogV2ArchiveState(catalog.#archive);result.commit();catalog.#closed=true;return result.value;
  }finally{catalog.#busy=false;done();catalog.#transferring=undefined;}
 };readState=catalog=>{if(!catalog||typeof catalog!=='object'||!(#state in catalog))throw physicalCatalogFailure('catalog_policy');catalog.#guard();return catalog.#state;};}
 static begin(input:PhysicalRoomCatalogV2BeginOptions):Promise<PhysicalRoomCatalogV2>{if(this!==PhysicalRoomCatalogV2)throw physicalCatalogFailure('catalog_policy');const options={...input};physicalCatalogV2Options(options,['wasm','checkAuthority','database','expected','archive'],['signal','graphPolicies']);const archive=options.archive;if(!physicalCatalogV2Archive.owns(archive))throw physicalCatalogFailure('catalog_policy');return PhysicalRoomCatalogV2.#open(options,archive);}
 static resume(input:PhysicalRoomCatalogV2OpenOptions):Promise<PhysicalRoomCatalogV2>{if(this!==PhysicalRoomCatalogV2)throw physicalCatalogFailure('catalog_policy');const options={...input};physicalCatalogV2Options(options,['wasm','checkAuthority','database','expected'],['signal','graphPolicies']);return PhysicalRoomCatalogV2.#open(options);}
 static async #open(supplied:PhysicalRoomCatalogV2OpenOptions,incoming?:PhysicalRoomCatalogV2Archive):Promise<PhysicalRoomCatalogV2>{
  const options={...supplied},database=physicalCatalogDatabase(options.database),expected=physicalCatalogSelection(options.expected),factory=recoveryOpeningContext(),locks=navigator.locks,initial=incoming?{manifest:physicalCatalogV2Archive.manifest.call(incoming),files:physicalCatalogV2Archive.files.call(incoming)}:undefined;
  if(incoming&&JSON.stringify(physicalCatalogV2Archive.selection.call(incoming))!==JSON.stringify(expected))throw physicalCatalogFailure('catalog_integrity');
  const assertContext=()=>{if(recoveryOpeningContext()!==factory||navigator.locks!==locks)throw physicalCatalogFailure('catalog_policy');};
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,archive:PhysicalRoomCatalogV2Archive|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   opening=await RecoveryOpeningCustody.reserve(factory,[database],async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>{if(archive)physicalCatalogV2Archive.dispose.call(archive);}),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==='rejected'))throw physicalCatalogFailure('catalog_storage');},{policy:()=>physicalCatalogFailure('catalog_policy'),busy:()=>physicalCatalogFailure('catalog_in_use'),storage:()=>physicalCatalogFailure('catalog_storage')});assertContext();
   // The actual namespace is reserved before any native/read authority callback.
   const graphPolicies=snapshotPhysicalCatalogV2GraphPolicies(options.graphPolicies??[]);assertContext();const context=prepareArchiveIntegrity(options),guard=()=>{assertContext();context.guard();assertContext();};guard();
   lease=await RecoveryLease.acquire(JSON.stringify(database));guard();
   if(initial)db=await createPhysicalCatalogV2Database(factory,database,initial,guard,options.signal);else{db=await existingPhysicalCatalogV2Database(factory,database,guard);if(!db)throw physicalCatalogFailure('catalog_missing');}guard();
   const stored=await readPhysicalCatalogV2Database(db,guard,initial?.manifest);guard();const readOptions={wasm:context.wasm,checkAuthority:guard,graphPolicies,...(options.signal?{signal:options.signal}:{})};
   archive=await physicalCatalogV2Archive.read.call(PhysicalRoomCatalogV2Archive,stored.record.manifest,stored.files,expected,readOptions);guard();
   const result=new PhysicalRoomCatalogV2(token,database,db,lease,archive,context,factory,locks,readOptions);opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw physicalCatalogKnown(error,'catalog_storage');}
 }
 #guard=():void=>{if(this.#closed||this.#closing)throw physicalCatalogFailure('catalog_closed');if(recoveryOpeningContext()!==this.#factory||navigator.locks!==this.#locks)throw physicalCatalogFailure('catalog_policy');this.#context.guard();if(this.#closed||this.#closing)throw physicalCatalogFailure('catalog_closed');if(recoveryOpeningContext()!==this.#factory||navigator.locks!==this.#locks)throw physicalCatalogFailure('catalog_policy');physicalCatalogV2ArchiveState(this.#archive);};
 selection():PhysicalRoomCatalogV2Selection{return this.#state.selection;}
 metadata():PhysicalRoomCatalogV2Metadata{return this.#state.metadata;}
 database():string{return this.#database;}
 manifestJson():string{return this.#state.manifest;}
 files():ReadonlyMap<string,Blob>{this.#guard();return physicalCatalogV2Archive.files.call(this.#archive);}
 participantFile(id:string):Blob{this.#guard();return physicalCatalogV2Archive.participant.call(this.#archive,id);}
 checkSources(input:readonly PhysicalRoomCatalogV2Source[]):PhysicalRoomCatalogV2Check{this.#guard();const result=physicalCatalogV2Archive.check.call(this.#archive,input);this.#guard();return result;}
 verify():Promise<void>{
  if(this.#busy)throw physicalCatalogFailure('catalog_in_use');this.#busy=true;let done!:()=>void;this.#running=new Promise<void>(resolve=>{done=resolve;});
  return(async()=>{try{this.#guard();await this.#verify();}finally{this.#busy=false;done();this.#running=undefined;}})();
 }
 async #verify():Promise<void>{
  try{const stored=await readPhysicalCatalogV2Database(this.#db,this.#guard,this.#state.manifest);this.#guard();const archive=await physicalCatalogV2Archive.read.call(PhysicalRoomCatalogV2Archive,stored.record.manifest,stored.files,this.#state.selection,{...this.#options,checkAuthority:this.#guard});try{this.#guard();}finally{physicalCatalogV2Archive.dispose.call(archive);}}catch(error){throw physicalCatalogKnown(error,'catalog_diverged');}
 }
 /** Retain durable bytes and retry cleanup failures. A transferred successor owns
  * its actual resources; closing the retired source never destroys them. */
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=this.#finishClose().catch(error=>{throw physicalCatalogKnown(error,'catalog_storage');}).finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
 async #finishClose():Promise<void>{await this.#running;await this.#transferring;if(this.#closed)return;physicalCatalogV2Archive.dispose.call(this.#archive);this.#db.close();await this.#lease.close();this.#closed=true;}
}
