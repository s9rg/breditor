import {RecoveryLease} from "../participant_recovery/lease.js";
import {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
import {RecoveryOpeningCustody,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
import {SharedRoomRecoveryCatalogArchive,catalogArchiveState,type CatalogArchiveState} from "./archive.js";
import {createCatalogDatabase,existingCatalogDatabase,readCatalogDatabase,updateCatalogRecord,type CatalogRecord} from "./storage.js";
import {prepareStage} from "./prepare_stage.js";
import {stageParticipant,verifyStagedParticipant,discardStagedParticipants,requireMissing,type StagedParticipant} from "./staged_participant.js";
import {authority,databaseName,selected,signalCheck,failure,known} from "./policy.js";
import {frozen} from "../room_participant_inventory/policy.js";
import type {SharedRoomRecoveryCatalogBeginOptions,SharedRoomRecoveryCatalogOpenOptions,SharedRoomRecoveryCatalogSelection,SharedRoomRecoveryCatalogMetadata,SharedRoomRecoveryCatalogProgress,SharedRoomRecoveryCatalogParticipant,SharedRoomRecoveryCatalogCheck} from "./types.js";
const key=Object.freeze({});
export interface CatalogCustody{readonly database:string;readonly db:IDBDatabase;readonly lease:RecoveryLease;readonly archive:SharedRoomRecoveryCatalogArchive;readonly state:CatalogArchiveState;readonly record:CatalogRecord;readonly owners:readonly StagedParticipant[]}
let takeCatalog:<T>(catalog:SharedRoomRecoveryCatalog,take:(held:CatalogCustody)=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>)=>Promise<T>;
/** Internal genuine custody transfer. No public snapshot can manufacture private native owners. */
export function transferRoomCatalog<T>(catalog:SharedRoomRecoveryCatalog,take:(held:CatalogCustody)=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>):Promise<T>{return takeCatalog(catalog,take);}
/** Durable selected files plus private inactive native owners. This class never activates or connects. */
export class SharedRoomRecoveryCatalog {
 readonly #db:IDBDatabase;readonly #lease:RecoveryLease;readonly #archive:SharedRoomRecoveryCatalogArchive;readonly #state:CatalogArchiveState;readonly #database:string;readonly #authority:()=>void;readonly #signal:AbortSignal|undefined;
 #record:CatalogRecord;#pending:CatalogRecord|undefined;#closed=false;#closing=false;#busy=false;#staging:Promise<SharedRoomRecoveryCatalogCheck>|undefined;#transferring:Promise<void>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:"graceful"|"discard"|undefined;readonly #owners:StagedParticipant[]=[];
 // Failed stage cleanup is still custody. Keep every acquired handle until its
 // idempotent discard/release succeeds, including attempts not yet returned by a helper.
 readonly #rollback=new RecoveryCleanupScope(failure);
 private constructor(token:object,database:string,db:IDBDatabase,lease:RecoveryLease,archive:SharedRoomRecoveryCatalogArchive,record:CatalogRecord,check:()=>void,signal?:AbortSignal){
  if(token!==key)throw failure("catalog_closed");this.#database=database;this.#db=db;this.#lease=lease;this.#archive=archive;this.#state=catalogArchiveState(archive);this.#record=record;this.#authority=check;this.#signal=signal;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);
 }
 static{takeCatalog=async<T>(catalog:SharedRoomRecoveryCatalog,take:(held:CatalogCustody)=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>)=>{
  if(catalog.#busy||catalog.#rollback.pending)throw failure("catalog_in_use");catalog.#guard();catalog.#busy=true;let done!:()=>void;catalog.#transferring=new Promise<void>(resolve=>{done=resolve;});
  try{const record=await catalog.#retained(true);if(record.phase!=="checked"||record.participants.length!==catalog.#owners.length)throw failure("catalog_diverged");for(const owner of catalog.#owners)await verifyStagedParticipant(owner,catalog.#guard);
   catalog.#state.inventory.checkSources(catalog.#owners.map(owner=>({backup:owner.policy.options.backup,source:owner.source})));catalog.#guard();
   const result=await take({database:catalog.#database,db:catalog.#db,lease:catalog.#lease,archive:catalog.#archive,state:catalog.#state,record,owners:catalog.#owners});
   await catalog.#retained(true);for(const owner of catalog.#owners)await verifyStagedParticipant(owner,catalog.#guard);catalog.#guard();result.prepareCommit();
   // No await or caller callback remains after checking both source and successor.
   if(catalog.#closed||catalog.#closing)throw failure("catalog_closed");signalCheck(catalog.#signal);result.commit();catalog.#owners.length=0;catalog.#closed=true;return result.value;
  }finally{catalog.#busy=false;done();catalog.#transferring=undefined;}
 };}
 static begin(options:SharedRoomRecoveryCatalogBeginOptions):Promise<SharedRoomRecoveryCatalog>{return this.#open(options,options.archive);}
 static resume(options:SharedRoomRecoveryCatalogOpenOptions):Promise<SharedRoomRecoveryCatalog>{return this.#open(options);}
 static async #open(supplied:SharedRoomRecoveryCatalogOpenOptions,input?:SharedRoomRecoveryCatalogArchive):Promise<SharedRoomRecoveryCatalog>{
  const options={...supplied},database=databaseName(options.database),expected=selected(options.expected),check=authority(options.checkAuthority),signal=options.signal,guard=()=>{signalCheck(signal);check();signalCheck(signal);};guard();
  let lease:RecoveryLease|undefined,db:IDBDatabase|undefined,archive:SharedRoomRecoveryCatalogArchive|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   // Snapshot the admitted source before awaiting. Caller disposal cannot change the selected blobs.
   const source=input?catalogArchiveState(input):undefined;if(source&&JSON.stringify(source.selection)!==JSON.stringify(expected))throw failure("catalog_integrity");
   // Own initial rollback before the first lease; a rejected factory has no public close handle.
   opening=await RecoveryOpeningCustody.reserve(recoveryOpeningContext(),[database],async()=>{
    const results=await Promise.allSettled([Promise.resolve().then(()=>archive?.dispose()),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(result=>result.status==="rejected"))throw failure();
   },{policy:()=>failure("catalog_policy"),busy:()=>failure("catalog_in_use"),storage:()=>failure()});guard();
   lease=await RecoveryLease.acquire(JSON.stringify(database));guard();
   if(source){archive=await SharedRoomRecoveryCatalogArchive.read(source.manifest,source.files,expected,{checkAuthority:guard,...(signal?{signal}:{})});guard();db=await createCatalogDatabase(database,catalogArchiveState(archive),guard);}
   else{db=await existingCatalogDatabase(database);guard();if(!db)throw failure("catalog_missing");}
   const stored=await readCatalogDatabase(db,source?.manifest);guard();
   if(!archive)archive=await SharedRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,expected,{checkAuthority:guard,...(signal?{signal}:{})});
   else{const verified=await SharedRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,expected,{checkAuthority:guard,...(signal?{signal}:{})});verified.dispose();}
   guard();const result=new SharedRoomRecoveryCatalog(key,database,db,lease,archive,stored.record,check,signal);opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw known(error);}
 }
 #guard=():void=>{if(this.#closed||this.#closing)throw failure("catalog_closed");signalCheck(this.#signal);this.#authority();if(this.#closed||this.#closing)throw failure("catalog_closed");signalCheck(this.#signal);catalogArchiveState(this.#archive);};
 selection():SharedRoomRecoveryCatalogSelection{return this.#state.selection;}
 metadata():SharedRoomRecoveryCatalogMetadata{return this.#state.metadata;}
 manifestJson():string{return this.#state.manifest;}
 serverFile():Blob{this.#guard();return this.#archive.serverFile();}
 inventoryFile():Blob{this.#guard();return this.#archive.inventoryFile();}
 participantFile(entry:string):Blob{this.#guard();return this.#archive.participantFile(entry);}
 async #retained(verifyFiles:boolean,allowPending=false):Promise<CatalogRecord>{
  this.#guard();const stored=await readCatalogDatabase(this.#db,this.#state.manifest);this.#guard();const actual=JSON.stringify(stored.record);if(actual!==JSON.stringify(this.#record)&&(!allowPending||actual!==JSON.stringify(this.#pending)))throw failure("catalog_diverged");
  if(verifyFiles){const archive=await SharedRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,this.selection(),{checkAuthority:this.#guard,...(this.#signal?{signal:this.#signal}:{})});archive.dispose();this.#guard();}return stored.record;
 }
 async progress():Promise<SharedRoomRecoveryCatalogProgress>{const record=await this.#retained(false,true);return frozen({phase:record.phase,participants:record.participants.map(row=>({...row}))});}
 async #update(next:CatalogRecord):Promise<void>{this.#guard();if(this.#pending)throw failure("catalog_in_use");this.#pending=next;try{await updateCatalogRecord(this.#db,this.#record,next,this.#guard,this.#signal);this.#guard();this.#record=next;}finally{this.#pending=undefined;}}
 /** Every request pins original native factories/targets. Unselected files remain unresolved and retained. */
 stage(participants:readonly SharedRoomRecoveryCatalogParticipant[]):Promise<SharedRoomRecoveryCatalogCheck>{
  if(this.#busy||this.#rollback.pending)throw failure("catalog_in_use");this.#busy=true;
  try{this.#guard();this.#staging=this.#stage(participants).finally(()=>{this.#staging=undefined;this.#busy=false;});return this.#staging;}catch(error){this.#busy=false;throw error;}
 }
 async #stage(input:readonly SharedRoomRecoveryCatalogParticipant[]):Promise<SharedRoomRecoveryCatalogCheck>{
  const acquired:StagedParticipant[]=[];let kept=false;
  try{
   const [,prepared]=await Promise.all([this.#retained(true),prepareStage(input,this.#state,this.#database,this.#guard,this.#signal)]);this.#guard();
   if(this.#record.plan===null){for(const row of prepared.policies)for(const name of [row.options.database,...Object.values(row.options.destinations)]){await requireMissing(name);this.#guard();}await this.#update({...this.#record,plan:prepared.plan,phase:"staging",participants:prepared.policies.map(row=>({id:row.id,state:"reserved" as const}))});}
   else if(this.#record.plan!==prepared.plan)throw failure("catalog_diverged");
   if(this.#owners.length){if(this.#owners.length!==prepared.policies.length)throw failure("catalog_diverged");for(const owner of this.#owners)await verifyStagedParticipant(owner,this.#guard);}
   else for(const [index,policy]of prepared.policies.entries()){
    const row=this.#record.participants[index]!;if(row.state==="reserved"){await requireMissing(policy.options.database);this.#guard();await this.#update({...this.#record,participants:this.#record.participants.map((r,i)=>i===index?{...r,state:"started"}:r)});}
    const owner=await stageParticipant(policy,row.state==="complete",this.#guard,this.#rollback);acquired.push(owner);this.#guard();
    if(row.state!=="complete")await this.#update({...this.#record,participants:this.#record.participants.map((r,i)=>i===index?{...r,state:"complete"}:r)});
   }
   const owners=this.#owners.length?this.#owners:acquired;for(const owner of owners)await verifyStagedParticipant(owner,this.#guard);await this.#retained(true);this.#guard();
   try{this.#state.inventory.checkSources(owners.map(owner=>({backup:owner.policy.options.backup,source:owner.source})));}catch{throw failure("catalog_source");}
   if(this.#record.phase!=="checked")await this.#update({...this.#record,phase:"checked"});this.#guard();
   let coverage;try{coverage=this.#state.inventory.checkSources(owners.map(owner=>({backup:owner.policy.options.backup,source:owner.source})));}catch{throw failure("catalog_source");}
   const stagedParticipants=owners.map(owner=>owner.policy.id),unreconciledParticipants=this.#state.metadata.participants.filter(row=>!stagedParticipants.includes(row.id)).map(row=>row.id),kind=coverage.kind==="covered"&&!unreconciledParticipants.length?"checked":"pending";
   this.#owners.push(...acquired);kept=true;return frozen({kind,coverage,stagedParticipants,unreconciledParticipants});
  }catch(error){throw known(error,"catalog_restore");}finally{if(!kept){if(acquired.length)this.#rollback.retain(()=>discardStagedParticipants(acquired));await this.#rollback.drain();}}
 }
 /** Gracefully close private owners and release origin locks; retain every file and destination. */
 close():Promise<void>{return this.#close("graceful");}
 /** Explicitly abandon private runtime owners, never committed files, participant stores or journals. */
 discardAndClose():Promise<void>{return this.#close("discard");}
 #close(mode:"graceful"|"discard"):Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===mode?this.#cleanup:Promise.reject(failure("catalog_in_use"));
  this.#closing=true;this.#cleanupMode=mode;this.#cleanup=this.#finishClose(mode).catch(error=>{throw known(error);}).finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;
 }
 async #finishClose(mode:"graceful"|"discard"):Promise<void>{
  try{await this.#staging;}catch{/* Stage retains its original failure and committed work. */}
  try{await this.#transferring;}catch{/* The transfer caller retains its original failure. */}if(this.#closed)return;
  // Failed staging is cleanup-only, even when the host asks for graceful close.
  // On another release error the scope retains every actual cleanup continuation.
  await this.#rollback.drain();
  if(mode==="discard"){await discardStagedParticipants(this.#owners);this.#owners.length=0;}
  else for(let i=this.#owners.length-1;i>=0;i--){const owner=this.#owners[i]!;await owner.recovered.close();owner.source.dispose();this.#owners.splice(i,1);}
  this.#archive.dispose();this.#db.close();await this.#lease.close();this.#closed=true;
 }
}
