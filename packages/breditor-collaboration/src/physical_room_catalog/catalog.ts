/** Durable immutable physical files and cached prefix diagnostics, without native staging or activation. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from "../archive_integrity/context.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {RecoveryOpeningCustody,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
import {SharedPhysicalRoomRecoveryCatalogArchive,physicalCatalogArchiveState,type PhysicalCatalogArchiveState} from "./archive.js";
import {createPhysicalCatalogDatabase,existingPhysicalCatalogDatabase,readPhysicalCatalogDatabase} from "./database.js";
import {physicalCatalogDatabase,physicalCatalogSelection,physicalCatalogFailure,physicalCatalogKnown} from "./policy.js";
import type {SharedPhysicalRoomRecoveryCatalogOpenOptions,SharedPhysicalRoomRecoveryCatalogBeginOptions,SharedPhysicalRoomRecoveryCatalogSelection,SharedPhysicalRoomRecoveryCatalogMetadata,SharedPhysicalRoomRecoveryCatalogSource,SharedPhysicalRoomRecoveryCatalogCheck} from "./contract.js";
const key=Object.freeze({});
/** Internal actual file/database/lease custody. Detached selections never create this handle. */
export interface PhysicalCatalogCustody {readonly database:string;readonly db:IDBDatabase;readonly lease:RecoveryLease;readonly archive:SharedPhysicalRoomRecoveryCatalogArchive;readonly state:PhysicalCatalogArchiveState;readonly factory:IDBFactory;readonly locks:LockManager}
let takePhysicalCatalog:<T>(catalog:SharedPhysicalRoomRecoveryCatalog,prepare:(held:PhysicalCatalogCustody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>Promise<T>;
/** Reserve before host callbacks and retain every actual file until one synchronous successor commit. */
export function transferPhysicalRoomCatalog<T>(catalog:SharedPhysicalRoomRecoveryCatalog,prepare:(held:PhysicalCatalogCustody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>)):Promise<T>{return takePhysicalCatalog(catalog,prepare);}
export class SharedPhysicalRoomRecoveryCatalog {
 readonly #database:string;readonly #db:IDBDatabase;readonly #lease:RecoveryLease;readonly #archive:SharedPhysicalRoomRecoveryCatalogArchive;readonly #state:PhysicalCatalogArchiveState;readonly #context:ArchiveIntegrityContext;readonly #factory:IDBFactory;readonly #locks:LockManager;readonly #signal:AbortSignal|undefined;
 #closed=false;#closing=false;#busy=false;#running:Promise<void>|undefined;#transferring:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,database:string,db:IDBDatabase,lease:RecoveryLease,archive:SharedPhysicalRoomRecoveryCatalogArchive,context:ArchiveIntegrityContext,factory:IDBFactory,locks:LockManager,signal?:AbortSignal){
  if(token!==key)throw physicalCatalogFailure("catalog_closed");this.#database=database;this.#db=db;this.#lease=lease;this.#archive=archive;this.#state=physicalCatalogArchiveState(archive);this.#context=context;this.#factory=factory;this.#locks=locks;this.#signal=signal;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);
 }
 static{takePhysicalCatalog=async<T>(catalog:SharedPhysicalRoomRecoveryCatalog,prepare:(held:PhysicalCatalogCustody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>{
  if(!catalog||typeof catalog!=="object"||!(#state in catalog))throw physicalCatalogFailure("catalog_policy");if(catalog.#busy)throw physicalCatalogFailure("catalog_in_use");catalog.#busy=true;let done!:()=>void;catalog.#transferring=new Promise<void>(resolve=>{done=resolve;});
  try{
   if(catalog.#closed||catalog.#closing)throw physicalCatalogFailure("catalog_closed");
   const proceed=prepare({database:catalog.#database,db:catalog.#db,lease:catalog.#lease,archive:catalog.#archive,state:catalog.#state,factory:catalog.#factory,locks:catalog.#locks});
   catalog.#guard();await catalog.#verify();catalog.#guard();const result=await proceed();
   await catalog.#verify();catalog.#guard();result.prepareCommit();
   // No await, host callback, native destruction or file write follows this final check.
   if(catalog.#closed||catalog.#closing||catalog.#signal?.aborted)throw physicalCatalogFailure("catalog_closed");result.commit();catalog.#closed=true;return result.value;
  }finally{catalog.#busy=false;done();catalog.#transferring=undefined;}
 };}
 static begin(options:SharedPhysicalRoomRecoveryCatalogBeginOptions):Promise<SharedPhysicalRoomRecoveryCatalog>{return this.#open(options,options.archive);}
 static resume(options:SharedPhysicalRoomRecoveryCatalogOpenOptions):Promise<SharedPhysicalRoomRecoveryCatalog>{return this.#open(options);}
 static async #open(supplied:SharedPhysicalRoomRecoveryCatalogOpenOptions,input?:SharedPhysicalRoomRecoveryCatalogArchive):Promise<SharedPhysicalRoomRecoveryCatalog>{
  const options={...supplied},database=physicalCatalogDatabase(options.database),expected=physicalCatalogSelection(options.expected),context=prepareArchiveIntegrity(options);let factory:IDBFactory,locks:LockManager;try{factory=recoveryOpeningContext();locks=navigator.locks;}catch{throw physicalCatalogFailure("catalog_policy");}context.guard();
  let lease:RecoveryLease|undefined,db:IDBDatabase|undefined,archive:SharedPhysicalRoomRecoveryCatalogArchive|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   const source=input?physicalCatalogArchiveState(input):undefined;if(source&&JSON.stringify(source.selection)!==JSON.stringify(expected))throw physicalCatalogFailure("catalog_integrity");
   // Capture immutable source Blobs synchronously; caller disposal cannot remove the selected data.
   const initial=source?{manifest:source.manifest,files:new Map(source.files)}:undefined;
   opening=await RecoveryOpeningCustody.reserve(factory,[database],async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>archive?.dispose()),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(result=>result.status==="rejected"))throw physicalCatalogFailure("catalog_storage");},{policy:()=>physicalCatalogFailure("catalog_policy"),busy:()=>physicalCatalogFailure("catalog_in_use"),storage:()=>physicalCatalogFailure("catalog_storage")});context.guard();
   lease=await RecoveryLease.acquire(JSON.stringify(database));context.guard();
   if(initial)db=await createPhysicalCatalogDatabase(factory,database,initial,context.guard,options.signal);
   else{db=await existingPhysicalCatalogDatabase(factory,database,context.guard);context.guard();if(!db)throw physicalCatalogFailure("catalog_missing");}
   // Always read and independently re-admit actual durable bytes, including files we just wrote.
   const stored=await readPhysicalCatalogDatabase(db,context.guard,initial?.manifest);context.guard();
   archive=await SharedPhysicalRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,expected,{wasm:context.wasm,checkAuthority:context.guard,...(options.signal?{signal:options.signal}:{})});context.guard();
   const result=new SharedPhysicalRoomRecoveryCatalog(key,database,db,lease,archive,context,factory,locks,options.signal);opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw physicalCatalogKnown(error,"catalog_storage");}
 }
 #guard=():void=>{if(this.#closed||this.#closing)throw physicalCatalogFailure("catalog_closed");this.#context.guard();if(this.#closed||this.#closing)throw physicalCatalogFailure("catalog_closed");physicalCatalogArchiveState(this.#archive);};
 selection():SharedPhysicalRoomRecoveryCatalogSelection{return this.#state.selection;}
 metadata():SharedPhysicalRoomRecoveryCatalogMetadata{return this.#state.metadata;}
 manifestJson():string{return this.#state.manifest;}
 database():string{return this.#database;}
 originServerFile():Blob{this.#guard();return this.#archive.originServerFile();}
 currentServerFile():Blob{this.#guard();return this.#archive.currentServerFile();}
 inventoryFile():Blob{this.#guard();return this.#archive.inventoryFile();}
 participantFile(id:string):Blob{this.#guard();return this.#archive.participantFile(id);}
 /** Re-admit every actual stored file. Returns retained data, not native readiness or current server authority. */
 verify():Promise<void>{
  // Reserve synchronously before any host callback or async function invocation.
  // The promise does not exist yet when the first guard calls host authority.
  if(this.#busy)throw physicalCatalogFailure("catalog_in_use");this.#busy=true;
  try{this.#guard();this.#running=this.#verify().finally(()=>{this.#running=undefined;this.#busy=false;});return this.#running;}catch(error){this.#busy=false;throw physicalCatalogKnown(error,"catalog_diverged");}
 }
 async #verify():Promise<void>{
  try{const stored=await readPhysicalCatalogDatabase(this.#db,this.#guard,this.#state.manifest);this.#guard();const archive=await SharedPhysicalRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,this.selection(),{wasm:this.#context.wasm,checkAuthority:this.#guard,...(this.#signal?{signal:this.#signal}:{})});try{this.#guard();}finally{archive.dispose();}}catch(error){throw physicalCatalogKnown(error,"catalog_diverged");}
 }
 /** Pure diagnostics of the retained cache; call verify separately for fresh durable-byte integrity. */
 checkSources(sources:readonly SharedPhysicalRoomRecoveryCatalogSource[]):SharedPhysicalRoomRecoveryCatalogCheck{this.#guard();const result=this.#archive.checkSources(sources);this.#guard();return result;}
 /** Close private read handles and the actual lease. Never deletes or rewrites any database or file. */
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=this.#finishClose().catch(error=>{throw physicalCatalogKnown(error,"catalog_storage");}).finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
 async #finishClose():Promise<void>{try{await this.#running;}catch{/* The verification caller keeps its original error. */}try{await this.#transferring;}catch{/* The transfer caller keeps its original error. */}if(this.#closed)return;this.#archive.dispose();this.#db.close();await this.#lease.close();this.#closed=true;}
}
