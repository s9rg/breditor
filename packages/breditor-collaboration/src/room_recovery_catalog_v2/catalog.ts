import {RecoveryLease} from "../participant_recovery/lease.js";
import {SharedRoomRecoveryCatalogArchiveV2,catalogV2ArchiveState} from "./archive.js";
import {createCatalogV2Database,existingCatalogV2Database,readCatalogV2Database,updateCatalogV2Record} from "./database.js";
import type {CatalogV2Record} from "./record.js";
import {prepareCatalogV2Stage,type V2StagedPolicy} from "./prepare_stage.js";
import {stageCatalogV2Participant,verifyCatalogV2Participant,closeCatalogV2Participant,type V2StagedParticipant} from "./staged_participant.js";
import {requireMissing} from "../room_recovery_catalog/staged_participant.js";
import {catalogV2Coverage} from "./coverage.js";
import {authority,databaseName,selected,signalCheck,failure,known} from "../room_recovery_catalog/policy.js";
import {frozen} from "../room_participant_inventory/policy.js";
import type {SharedRoomRecoveryCatalogV2BeginOptions,SharedRoomRecoveryCatalogV2OpenOptions,SharedRoomRecoveryCatalogV2Selection,SharedRoomRecoveryCatalogV2Metadata,SharedRoomRecoveryCatalogV2Progress,SharedRoomRecoveryCatalogV2Participant,SharedRoomRecoveryCatalogV2Check} from "./contract.js";
const key=Object.freeze({});
const policyOptions=(p:V2StagedPolicy)=>p.family==="generation"?p.options:p.value.options;
async function discard(owners:readonly V2StagedParticipant[]):Promise<void>{const results=await Promise.allSettled([...owners].reverse().map(o=>closeCatalogV2Participant(o,true)));if(results.some(r=>r.status==="rejected"))throw failure();}
/** Durable selected files plus private inactive native owners. This class never activates or connects. */
export class SharedRoomRecoveryCatalogV2 {
 readonly #db:IDBDatabase;readonly #lease:RecoveryLease;readonly #archive:SharedRoomRecoveryCatalogArchiveV2;readonly #state:import("./archive.js").CatalogV2ArchiveState;readonly #database:string;readonly #authority:()=>void;readonly #signal:AbortSignal|undefined;
 #record:CatalogV2Record;#pending:CatalogV2Record|undefined;#closed=false;#closing=false;#busy=false;#staging:Promise<SharedRoomRecoveryCatalogV2Check>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:"graceful"|"discard"|undefined;readonly #owners:V2StagedParticipant[]=[];
 // A failed cleanup does not relinquish custody. Keep these owners cleanup-only
 // until a later idempotent close releases every actual child lease.
 readonly #stranded:V2StagedParticipant[]=[];
 private constructor(token:object,database:string,db:IDBDatabase,lease:RecoveryLease,archive:SharedRoomRecoveryCatalogArchiveV2,record:CatalogV2Record,check:()=>void,signal?:AbortSignal){
  if(token!==key)throw failure("catalog_closed");this.#database=database;this.#db=db;this.#lease=lease;this.#archive=archive;this.#state=catalogV2ArchiveState(archive);this.#record=record;this.#authority=check;this.#signal=signal;db.onversionchange=()=>{this.#closing=true;db.close();};Object.freeze(this);
 }
 static begin(options:SharedRoomRecoveryCatalogV2BeginOptions):Promise<SharedRoomRecoveryCatalogV2>{return this.#open(options,options.archive);}
 static resume(options:SharedRoomRecoveryCatalogV2OpenOptions):Promise<SharedRoomRecoveryCatalogV2>{return this.#open(options);}
 static async #open(supplied:SharedRoomRecoveryCatalogV2OpenOptions,input?:SharedRoomRecoveryCatalogArchiveV2):Promise<SharedRoomRecoveryCatalogV2>{
  const options={...supplied},database=databaseName(options.database),expected=selected(options.expected),check=authority(options.checkAuthority),signal=options.signal,guard=()=>{signalCheck(signal);check();signalCheck(signal);};guard();
  let lease:RecoveryLease|undefined,db:IDBDatabase|undefined,archive:SharedRoomRecoveryCatalogArchiveV2|undefined;
  try{
   // Snapshot the admitted source before awaiting. Caller disposal cannot change the selected blobs.
   const source=input?catalogV2ArchiveState(input):undefined;if(source&&JSON.stringify(source.selection)!==JSON.stringify(expected))throw failure("catalog_integrity");
   lease=await RecoveryLease.acquire(JSON.stringify(database));guard();
   if(source){archive=await SharedRoomRecoveryCatalogArchiveV2.read(source.manifest,source.files,expected,{checkAuthority:guard,...(signal?{signal}:{})});guard();db=await createCatalogV2Database(database,catalogV2ArchiveState(archive),guard);}
   else{db=await existingCatalogV2Database(database);guard();if(!db)throw failure("catalog_missing");}
   const stored=await readCatalogV2Database(db,source?.manifest);guard();
   if(!archive)archive=await SharedRoomRecoveryCatalogArchiveV2.read(stored.record.manifest,stored.files,expected,{checkAuthority:guard,...(signal?{signal}:{})});
   else{const verified=await SharedRoomRecoveryCatalogArchiveV2.read(stored.record.manifest,stored.files,expected,{checkAuthority:guard,...(signal?{signal}:{})});verified.dispose();}
   guard();return new SharedRoomRecoveryCatalogV2(key,database,db,lease,archive,stored.record,check,signal);
  }catch(error){archive?.dispose();db?.close();await lease?.close();throw known(error);}
 }
 #guard=():void=>{if(this.#closed||this.#closing)throw failure("catalog_closed");signalCheck(this.#signal);this.#authority();if(this.#closed||this.#closing)throw failure("catalog_closed");signalCheck(this.#signal);catalogV2ArchiveState(this.#archive);};
 selection():SharedRoomRecoveryCatalogV2Selection{return this.#state.selection;}
 metadata():SharedRoomRecoveryCatalogV2Metadata{return this.#state.metadata;}
 manifestJson():string{return this.#state.manifest;}
 serverFile():Blob{this.#guard();return this.#archive.serverFile();}
 inventoryFile():Blob{this.#guard();return this.#archive.inventoryFile();}
 participantFile(entry:string):Blob{this.#guard();return this.#archive.participantFile(entry);}
 async #retained(verifyFiles:boolean,allowPending=false):Promise<CatalogV2Record>{
  this.#guard();const stored=await readCatalogV2Database(this.#db,this.#state.manifest);this.#guard();const actual=JSON.stringify(stored.record);if(actual!==JSON.stringify(this.#record)&&(!allowPending||actual!==JSON.stringify(this.#pending)))throw failure("catalog_diverged");
  if(verifyFiles){const archive=await SharedRoomRecoveryCatalogArchiveV2.read(stored.record.manifest,stored.files,this.selection(),{checkAuthority:this.#guard,...(this.#signal?{signal:this.#signal}:{})});archive.dispose();this.#guard();}return stored.record;
 }
 async progress():Promise<SharedRoomRecoveryCatalogV2Progress>{const record=await this.#retained(false,true);return frozen({phase:record.phase,participants:record.participants.map(row=>({...row}))});}
 async #update(next:CatalogV2Record):Promise<void>{this.#guard();if(this.#pending)throw failure("catalog_in_use");this.#pending=next;try{await updateCatalogV2Record(this.#db,this.#record,next,this.#guard,this.#signal);this.#guard();this.#record=next;}finally{this.#pending=undefined;}}
 /** Every request pins matching native factories/targets. Unselected files remain unresolved and retained. */
 stage(participants:readonly SharedRoomRecoveryCatalogV2Participant[]):Promise<SharedRoomRecoveryCatalogV2Check>{
  if(this.#busy||this.#stranded.length)throw failure("catalog_in_use");this.#busy=true;
  try{this.#guard();this.#staging=this.#stage(participants).finally(()=>{this.#staging=undefined;this.#busy=false;});return this.#staging;}catch(error){this.#busy=false;throw error;}
 }
 async #stage(input:readonly SharedRoomRecoveryCatalogV2Participant[]):Promise<SharedRoomRecoveryCatalogV2Check>{
  const acquired:V2StagedParticipant[]=[];let kept=false;
  try{
   const [,prepared]=await Promise.all([this.#retained(true),prepareCatalogV2Stage(input,this.#state,this.#database,this.#guard,this.#signal)]);this.#guard();
   if(this.#record.plan===null){for(const row of prepared.policies)for(const name of [policyOptions(row).database,...Object.values(policyOptions(row).destinations)]){await requireMissing(name);this.#guard();}await this.#update({...this.#record,plan:prepared.plan,phase:"staging",participants:prepared.policies.map(row=>({id:row.id,state:"reserved" as const}))});}
   else if(this.#record.plan!==prepared.plan)throw failure("catalog_diverged");
   if(this.#owners.length){if(this.#owners.length!==prepared.policies.length)throw failure("catalog_diverged");for(const owner of this.#owners)await verifyCatalogV2Participant(owner,this.#guard);}
   else for(const [index,policy]of prepared.policies.entries()){
    const row=this.#record.participants[index]!;if(row.state==="reserved"){await requireMissing(policyOptions(policy).database);this.#guard();await this.#update({...this.#record,participants:this.#record.participants.map((r,i)=>i===index?{...r,state:"started"}:r)});}
    const owner=await stageCatalogV2Participant(policy,row.state==="complete",this.#guard);acquired.push(owner);this.#guard();
    if(row.state!=="complete")await this.#update({...this.#record,participants:this.#record.participants.map((r,i)=>i===index?{...r,state:"complete"}:r)});
   }
   const owners=this.#owners.length?this.#owners:acquired;for(const owner of owners)await verifyCatalogV2Participant(owner,this.#guard);await this.#retained(true);this.#guard();
   try{catalogV2Coverage(this.#state.inventory,owners);}catch{throw failure("catalog_source");}
   if(this.#record.phase!=="checked")await this.#update({...this.#record,phase:"checked"});this.#guard();
   let coverage;try{coverage=catalogV2Coverage(this.#state.inventory,owners);}catch{throw failure("catalog_source");}
   const stagedParticipants=owners.map(owner=>owner.id),unreconciledParticipants=this.#state.metadata.participants.filter(row=>!stagedParticipants.includes(row.id)).map(row=>row.id),kind=coverage.kind==="covered"&&!unreconciledParticipants.length?"checked":"pending";
   this.#owners.push(...acquired);kept=true;return frozen({kind,coverage,stagedParticipants,unreconciledParticipants});
  }catch(error){throw known(error,"catalog_restore");}finally{if(!kept){this.#stranded.push(...acquired);await discard(this.#stranded);this.#stranded.length=0;}}
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
  if(this.#closed)return;
  // Failed staging remains cleanup-only on both graceful and discard paths.
  // A failed retry leaves the private handles reachable for another close.
  await discard(this.#stranded);this.#stranded.length=0;
  if(mode==="discard"){await discard(this.#owners);this.#owners.length=0;}
  else for(let i=this.#owners.length-1;i>=0;i--){const owner=this.#owners[i]!;await closeCatalogV2Participant(owner,false);this.#owners.splice(i,1);}
  this.#archive.dispose();this.#db.close();await this.#lease.close();this.#closed=true;
 }
}
