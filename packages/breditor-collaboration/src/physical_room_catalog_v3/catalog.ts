/** Private durable seven-family retention with actual database/archive/lease
 * custody. Completion markers never replace file/native admission or authority. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from '../archive_integrity/context.js';
import {RecoveryLease} from '../participant_recovery/lease.js';
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {physicalCatalogDatabase,physicalCatalogSelection,physicalCatalogFailure,physicalCatalogKnown} from '../physical_room_catalog/policy.js';
import {PhysicalRoomCatalogV3Archive,physicalCatalogV3Archive,physicalCatalogV3ArchiveState,physicalCatalogV3ParentSourceFence,type PhysicalCatalogV3ArchiveState} from './archive.js';
import {snapshotPhysicalCatalogV2GraphPolicies as snapshotPhysicalCatalogV3GraphPolicies} from '../physical_room_catalog_v2/graph_policy.js';
import {physicalCatalogV2Options as physicalCatalogV3Options} from '../physical_room_catalog_v2/input_snapshot.js';
import {snapshotPhysicalCatalogV3LocalPolicies} from './local_policy.js';
import {createPhysicalCatalogV3Database,existingPhysicalCatalogV3Database,readPhysicalCatalogV3Database} from './database.js';
import type {PhysicalRoomCatalogV3BeginOptions,PhysicalRoomCatalogV3OpenOptions,PhysicalRoomCatalogV3ReadOptions,PhysicalRoomCatalogV3Selection,PhysicalRoomCatalogV3Metadata,PhysicalRoomCatalogV3Source,PhysicalRoomCatalogV3Check} from './contract.js';
const token=Object.freeze({});
export interface PhysicalCatalogV3Custody{
 readonly database:string;readonly db:IDBDatabase;readonly lease:RecoveryLease;readonly archive:PhysicalRoomCatalogV3Archive;readonly state:PhysicalCatalogV3ArchiveState;readonly factory:IDBFactory;readonly locks:LockManager;
}
let take:<T>(catalog:PhysicalRoomCatalogV3,prepare:(held:PhysicalCatalogV3Custody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>Promise<T>;
let readState:(catalog:PhysicalRoomCatalogV3)=>PhysicalCatalogV3ArchiveState;
/** Private actual archive access for fresh native borrows; never a DTO constructor. */
export function physicalRoomCatalogV3State(catalog:PhysicalRoomCatalogV3):PhysicalCatalogV3ArchiveState{return readState(catalog);}
/** Actual successor custody only. The source reserves before callbacks and
 * retires after a final callback-free synchronous commit; no metadata flag helps. */
export function transferPhysicalCatalogV3<T>(catalog:PhysicalRoomCatalogV3,prepare:(held:PhysicalCatalogV3Custody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>)):Promise<T>{return take(catalog,prepare);}
export class PhysicalRoomCatalogV3{
 readonly #database;readonly #db;readonly #lease;readonly #archive;readonly #state;readonly #context;readonly #factory;readonly #locks;readonly #options;
 #exposed=false;#closed=false;#closing=false;#busy=false;#running:Promise<void>|undefined;#transferring:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(key:object,database:string,db:IDBDatabase,lease:RecoveryLease,archive:PhysicalRoomCatalogV3Archive,context:ArchiveIntegrityContext,factory:IDBFactory,locks:LockManager,options:PhysicalRoomCatalogV3ReadOptions){
  if(key!==token)throw physicalCatalogFailure('catalog_closed');this.#database=database;this.#db=db;this.#lease=lease;this.#archive=archive;this.#state=physicalCatalogV3ArchiveState(archive);this.#context=context;this.#factory=factory;this.#locks=locks;this.#options=options;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);
 }
 static{take=async<T>(catalog:PhysicalRoomCatalogV3,prepare:(held:PhysicalCatalogV3Custody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>{
  if(!catalog||typeof catalog!=='object'||!(#state in catalog)||!catalog.#exposed)throw physicalCatalogFailure('catalog_policy');if(catalog.#busy)throw physicalCatalogFailure('catalog_in_use');catalog.#busy=true;let done!:()=>void;catalog.#transferring=new Promise<void>(resolve=>{done=resolve;});
  try{
   if(catalog.#closed||catalog.#closing)throw physicalCatalogFailure('catalog_closed');
   const proceed=prepare({database:catalog.#database,db:catalog.#db,lease:catalog.#lease,archive:catalog.#archive,state:catalog.#state,factory:catalog.#factory,locks:catalog.#locks});
   catalog.#guard();await catalog.#verify();catalog.#guard();const result=await proceed();await catalog.#verify();catalog.#guard();result.prepareCommit();
   if(catalog.#closed||catalog.#closing||catalog.#options.signal?.aborted)throw physicalCatalogFailure('catalog_closed');if(globalThis.indexedDB!==catalog.#factory||globalThis.navigator?.locks!==catalog.#locks)throw physicalCatalogFailure('catalog_policy');physicalCatalogV3ArchiveState(catalog.#archive);result.commit();catalog.#closed=true;return result.value;
  }finally{catalog.#busy=false;done();catalog.#transferring=undefined;}
 };readState=catalog=>{if(!catalog||typeof catalog!=='object'||!(#state in catalog))throw physicalCatalogFailure('catalog_policy');catalog.#guard();return catalog.#state;};}
 static begin(input:PhysicalRoomCatalogV3BeginOptions):Promise<PhysicalRoomCatalogV3>{if(this!==PhysicalRoomCatalogV3)throw physicalCatalogFailure('catalog_policy');const options={...input};physicalCatalogV3Options(options,['wasm','checkAuthority','database','expected','archive'],['signal','graphPolicies','localPolicies']);const archive=options.archive;if(!physicalCatalogV3Archive.owns(archive))throw physicalCatalogFailure('catalog_policy');return PhysicalRoomCatalogV3.#open(options,archive);}
 static resume(input:PhysicalRoomCatalogV3OpenOptions):Promise<PhysicalRoomCatalogV3>{if(this!==PhysicalRoomCatalogV3)throw physicalCatalogFailure('catalog_policy');const options={...input};physicalCatalogV3Options(options,['wasm','checkAuthority','database','expected'],['signal','graphPolicies','localPolicies']);return PhysicalRoomCatalogV3.#open(options);}
 static async #open(supplied:PhysicalRoomCatalogV3OpenOptions,incoming?:PhysicalRoomCatalogV3Archive):Promise<PhysicalRoomCatalogV3>{
  const options={...supplied},database=physicalCatalogDatabase(options.database),expected=physicalCatalogSelection(options.expected),factory=recoveryOpeningContext(),locks=navigator.locks,initial=incoming?{manifest:physicalCatalogV3Archive.manifest.call(incoming),files:physicalCatalogV3Archive.files.call(incoming)}:undefined;
  if(incoming&&JSON.stringify(physicalCatalogV3Archive.selection.call(incoming))!==JSON.stringify(expected))throw physicalCatalogFailure('catalog_integrity');
  const assertContext=()=>{if(recoveryOpeningContext()!==factory||navigator.locks!==locks)throw physicalCatalogFailure('catalog_policy');};
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,archive:PhysicalRoomCatalogV3Archive|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   opening=await RecoveryOpeningCustody.reserve(factory,[database],async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>{if(archive)physicalCatalogV3Archive.dispose.call(archive);}),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==='rejected'))throw physicalCatalogFailure('catalog_storage');},{policy:()=>physicalCatalogFailure('catalog_policy'),busy:()=>physicalCatalogFailure('catalog_in_use'),storage:()=>physicalCatalogFailure('catalog_storage')});assertContext();
   // The actual namespace is reserved before any native/read authority callback.
   const graphPolicies=snapshotPhysicalCatalogV3GraphPolicies(options.graphPolicies??[]),localPolicies=snapshotPhysicalCatalogV3LocalPolicies(options.localPolicies??[]);assertContext();const context=prepareArchiveIntegrity(options),guard=()=>{assertContext();context.guard();assertContext();};guard();
   lease=await RecoveryLease.acquire(JSON.stringify(database));guard();
   if(initial)db=await createPhysicalCatalogV3Database(factory,database,initial,guard,options.signal);else{db=await existingPhysicalCatalogV3Database(factory,database,guard);if(!db)throw physicalCatalogFailure('catalog_missing');}guard();
   const stored=await readPhysicalCatalogV3Database(db,guard,initial?.manifest);guard();const readOptions={wasm:context.wasm,checkAuthority:guard,graphPolicies,localPolicies,...(options.signal?{signal:options.signal}:{})};
   archive=await physicalCatalogV3Archive.read.call(PhysicalRoomCatalogV3Archive,stored.record.manifest,stored.files,expected,readOptions);guard();
   const result=new PhysicalRoomCatalogV3(token,database,db,lease,archive,context,factory,locks,readOptions);guard();if(result.#closed||result.#closing)throw physicalCatalogFailure('catalog_closed');opening.complete();result.#exposed=true;return result;
  }catch(error){if(opening)await opening.rollback();throw physicalCatalogKnown(error,'catalog_storage');}
 }
 #guard=():void=>{if(!this.#exposed||this.#closed||this.#closing)throw physicalCatalogFailure('catalog_closed');if(recoveryOpeningContext()!==this.#factory||navigator.locks!==this.#locks)throw physicalCatalogFailure('catalog_policy');this.#context.guard();if(!this.#exposed||this.#closed||this.#closing)throw physicalCatalogFailure('catalog_closed');if(recoveryOpeningContext()!==this.#factory||navigator.locks!==this.#locks)throw physicalCatalogFailure('catalog_policy');physicalCatalogV3ArchiveState(this.#archive);};
 selection():PhysicalRoomCatalogV3Selection{this.#guard();return this.#state.selection;}
 metadata():PhysicalRoomCatalogV3Metadata{this.#guard();return this.#state.metadata;}
 database():string{this.#guard();return this.#database;}
 manifestJson():string{this.#guard();return this.#state.manifest;}
 files():ReadonlyMap<string,Blob>{this.#guard();return physicalCatalogV3Archive.files.call(this.#archive);}
 participantFile(id:string):Blob{this.#guard();return physicalCatalogV3Archive.participant.call(this.#archive,id);}
 checkSources(input:readonly PhysicalRoomCatalogV3Source[]):PhysicalRoomCatalogV3Check{try{this.#guard();const held=physicalCatalogV3ParentSourceFence(this.#archive,input),result=physicalCatalogV3Archive.check.call(this.#archive,held.sources);this.#guard();held.check();return result;}catch(error){throw physicalCatalogKnown(error,'catalog_source');}}
 verify():Promise<void>{
  if(this.#busy)throw physicalCatalogFailure('catalog_in_use');this.#busy=true;let done!:()=>void;this.#running=new Promise<void>(resolve=>{done=resolve;});
  return(async()=>{try{this.#guard();await this.#verify();}finally{this.#busy=false;done();this.#running=undefined;}})();
 }
 async #verify():Promise<void>{
  try{const stored=await readPhysicalCatalogV3Database(this.#db,this.#guard,this.#state.manifest);this.#guard();const archive=await physicalCatalogV3Archive.read.call(PhysicalRoomCatalogV3Archive,stored.record.manifest,stored.files,this.#state.selection,{...this.#options,checkAuthority:this.#guard});try{this.#guard();}finally{physicalCatalogV3Archive.dispose.call(archive);}}catch(error){throw physicalCatalogKnown(error,'catalog_diverged');}
 }
 /** Retain durable bytes and retry cleanup failures. A transferred successor owns
  * its actual resources; closing the retired source never destroys them. */
 close():Promise<void>{if(!this.#exposed)throw physicalCatalogFailure('catalog_closed');if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=this.#finishClose().catch(error=>{throw physicalCatalogKnown(error,'catalog_storage');}).finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
 async #finishClose():Promise<void>{await this.#running;await this.#transferring;if(this.#closed)return;physicalCatalogV3Archive.dispose.call(this.#archive);this.#db.close();await this.#lease.close();this.#closed=true;}
}
