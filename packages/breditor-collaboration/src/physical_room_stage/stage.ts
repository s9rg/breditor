/** Private inactive native clients and retained physical source custody. Never connects or activates. */
import {prepareArchiveIntegrity,type ArchiveIntegrityContext} from "../archive_integrity/context.js";
import {transferPhysicalRoomCatalog,type PhysicalCatalogCustody} from "../physical_room_catalog/catalog.js";
import {SharedPhysicalRoomRecoveryCatalogArchive,physicalCatalogArchiveState} from "../physical_room_catalog/archive.js";
import {readPhysicalCatalogDatabase} from "../physical_room_catalog/database.js";
import {physicalCatalogDatabase,physicalCatalogSelection} from "../physical_room_catalog/policy.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {RecoveryOpeningCustody} from "../participant_recovery/opening_custody.js";
import {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
import {prepareMixedCatalogStage,snapshotMixedCatalogParticipant,type MixedCatalogStagePolicy} from "../mixed_catalog_stage/prepare.js";
import {stageCatalogV2Participant,verifyCatalogV2Participant,closeCatalogV2Participant,type V2StagedParticipant} from "../room_recovery_catalog_v2/staged_participant.js";
import {requireMissing} from "../room_recovery_catalog/staged_participant.js";
import {frozen} from "../room_participant_inventory/policy.js";
import {createPhysicalStageDatabase} from "./create_database.js";
import {existingPhysicalStageDatabase,readPhysicalStageDatabase} from "./read_database.js";
import {updatePhysicalStageRecord} from "./update_record.js";
import {initialPhysicalStageRecord,type PhysicalStageRecord,type PhysicalStageSource} from "./record.js";
import {physicalStageFailure as fail,physicalStageKnown as known,MAX_PHYSICAL_ROOM_STAGE_PARTICIPANTS,MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES} from "./policy.js";
import type {SharedPhysicalRoomStageOpenOptions,SharedPhysicalRoomStageParticipant,SharedPhysicalRoomStageCheck,SharedPhysicalRoomStageProgress} from "./contract.js";
interface Life {closing:boolean;closed:boolean;changed:boolean;committed:boolean}
interface State {readonly database:string;readonly db:IDBDatabase;readonly lease:RecoveryLease;readonly held:PhysicalCatalogCustody;readonly source:PhysicalStageSource;readonly context:ArchiveIntegrityContext;readonly guard:()=>void;readonly signal:AbortSignal|undefined;readonly life:Life;record:PhysicalStageRecord;pending:PhysicalStageRecord|undefined}
/** Genuine private ownership, not a portable progress/selection object. */
export interface PhysicalStageCustody {readonly database:string;readonly db:IDBDatabase;readonly lease:RecoveryLease;readonly held:PhysicalCatalogCustody;readonly source:PhysicalStageSource;readonly record:PhysicalStageRecord;readonly owners:readonly V2StagedParticipant[]}
let takePhysicalStage:<T>(stage:SharedPhysicalRoomParticipantStage,prepare:(held:PhysicalStageCustody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>Promise<T>;
/** Internal source reservation; every actual readonly owner and source lease transfers together. */
export function transferPhysicalRoomStage<T>(stage:SharedPhysicalRoomParticipantStage,prepare:(held:PhysicalStageCustody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>)):Promise<T>{return takePhysicalStage(stage,prepare);}
const key=Object.freeze({}),policyOptions=(p:MixedCatalogStagePolicy)=>p.family==="generation"?p.options:p.value.options;
async function discard(owners:readonly V2StagedParticipant[]):Promise<void>{const results=await Promise.allSettled([...owners].reverse().map(owner=>closeCatalogV2Participant(owner,true)));if(results.some(row=>row.status==="rejected"))throw fail();}
export class SharedPhysicalRoomParticipantStage {
 readonly #state:State;readonly #owners:V2StagedParticipant[]=[];readonly #rollback=new RecoveryCleanupScope(()=>fail());
 #busy=false;#running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:"graceful"|"discard"|undefined;
 private constructor(token:object,state:State){if(token!==key)throw fail("physical_stage_closed");this.#state=state;state.db.onversionchange=()=>{state.life.changed=true;state.db.close();};Object.freeze(this);}
 static{takePhysicalStage=async<T>(stage:SharedPhysicalRoomParticipantStage,prepare:(held:PhysicalStageCustody)=>(()=>Promise<{value:T;prepareCommit:()=>void;commit:()=>void}>))=>{
  if(!stage||typeof stage!=="object"||!(#state in stage))throw fail("physical_stage_policy");
  return stage.#exclusive(async()=>{
   const s=stage.#state,proceed=prepare({database:s.database,db:s.db,lease:s.lease,held:s.held,source:s.source,record:s.record,owners:Object.freeze([...stage.#owners])});
   await stage.#rollback.drain();await stage.#retained(true);await stage.#ready();stage.#guard();
   const result=await proceed();await stage.#retained(true);await stage.#ready();stage.#guard();result.prepareCommit();
   if(s.life.closed||s.life.closing||s.life.changed||s.signal?.aborted||globalThis.indexedDB!==s.held.factory||globalThis.navigator?.locks!==s.held.locks)throw fail("physical_stage_closed");
   // No callback, await, native destruction or write after this final local check.
   result.commit();s.life.closed=true;stage.#owners.splice(0);return result.value;
  },true);
 };}
 static begin(options:SharedPhysicalRoomStageOpenOptions):Promise<SharedPhysicalRoomParticipantStage>{return this.#open(options,false);}
 static resume(options:SharedPhysicalRoomStageOpenOptions):Promise<SharedPhysicalRoomParticipantStage>{return this.#open(options,true);}
 static async #open(supplied:SharedPhysicalRoomStageOpenOptions,resume:boolean):Promise<SharedPhysicalRoomParticipantStage>{
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   // The source reserves its actual custody before this callback snapshots policy or invokes a host.
   const value=await transferPhysicalRoomCatalog(supplied.catalog,held=>{
    const options={...supplied},database=physicalCatalogDatabase(options.database),expected=physicalCatalogSelection(options.expected),life:Life={closing:false,closed:false,changed:false,committed:false};
    if(database===held.database||JSON.stringify(expected)!==JSON.stringify(held.state.selection))throw fail("physical_stage_policy");
    const context=prepareArchiveIntegrity(options),guard=()=>{
     if(life.closed||life.closing||life.changed)throw fail("physical_stage_closed");
     if(globalThis.indexedDB!==held.factory||globalThis.navigator?.locks!==held.locks)throw fail("physical_stage_closed");
     context.guard();
     if(life.closed||life.closing||life.changed||globalThis.indexedDB!==held.factory||globalThis.navigator?.locks!==held.locks)throw fail("physical_stage_closed");
     if(physicalCatalogArchiveState(held.archive)!==held.state)throw fail("physical_stage_closed");
    },source={database:held.database,manifest:held.state.manifest,selection:expected};guard();
    return async()=>{
     opening=await RecoveryOpeningCustody.reserve(held.factory,[database],async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==="rejected"))throw fail();},{policy:()=>fail("physical_stage_policy"),busy:()=>fail("physical_stage_in_use"),storage:()=>fail()});guard();
     lease=await RecoveryLease.acquire(JSON.stringify(database));guard();
     if(resume){db=await existingPhysicalStageDatabase(held.factory,database,guard);if(!db)throw fail("physical_stage_missing");}
     else db=await createPhysicalStageDatabase(held.factory,database,initialPhysicalStageRecord(source),guard,options.signal);
     guard();const record=await readPhysicalStageDatabase(db,guard,source);guard();
     const state:State={database,db,lease,held,source,context,guard,signal:options.signal,life,record,pending:undefined},successor=new SharedPhysicalRoomParticipantStage(key,state);
     return{value:successor,prepareCommit:guard,commit(){
      // Actual database/lease/archive pointers transfer together, without a callback or destruction.
      held.db.onversionchange=()=>{life.changed=true;held.db.close();};life.committed=true;
     }};
    };
   });
   opening!.complete();return value;
  }catch(error){if(opening)await opening.rollback();throw known(error);}
 }
 #guard=():void=>{if(!this.#state.life.committed)throw fail("physical_stage_closed");this.#state.guard();};
 #failure(error:unknown):Error{const s=this.#state;return s.signal?.aborted?fail("physical_stage_aborted"):s.life.closed||s.life.closing||s.life.changed?fail("physical_stage_closed"):known(error);}
 /** Reserve the wait handle before any authority callback can reenter or close this owner. */
 #exclusive<T>(work:()=>Promise<T>,preserveSuccessorFailure=false):Promise<T>{
  if(this.#busy)throw fail("physical_stage_in_use");this.#busy=true;let done!:()=>void;this.#running=new Promise<void>(resolve=>{done=resolve;});
  // Internal outgoing custody leaves error classification to the successor.
  // Otherwise cancellation/authority failures become misleading source storage failures.
  try{return work().catch(error=>{throw preserveSuccessorFailure?error:this.#failure(error);}).finally(()=>{this.#busy=false;this.#running=undefined;done();});}
  catch(error){this.#busy=false;this.#running=undefined;done();throw preserveSuccessorFailure?error:this.#failure(error);}
 }
 selection(){return this.#state.source.selection;}
 metadata(){return this.#state.held.state.metadata;}
 manifestJson():string{return this.#state.source.manifest;}
 database():string{return this.#state.database;}
 catalogDatabase():string{return this.#state.held.database;}
 originServerFile():Blob{this.#guard();return this.#state.held.archive.originServerFile();}
 currentServerFile():Blob{this.#guard();return this.#state.held.archive.currentServerFile();}
 inventoryFile():Blob{this.#guard();return this.#state.held.archive.inventoryFile();}
 participantFile(id:string):Blob{this.#guard();return this.#state.held.archive.participantFile(id);}
 async #retained(verifyFiles:boolean):Promise<void>{
  const s=this.#state;this.#guard();const record=await readPhysicalStageDatabase(s.db,this.#guard,s.source);this.#guard();const actual=JSON.stringify(record);
  if(actual===JSON.stringify(s.record))s.pending=undefined;else if(s.pending&&actual===JSON.stringify(s.pending)){s.record=record;s.pending=undefined;}else throw fail("physical_stage_diverged");
  const stored=await readPhysicalCatalogDatabase(s.held.db,this.#guard,s.source.manifest);this.#guard();
  if(verifyFiles){const admitted=await SharedPhysicalRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,s.source.selection,{wasm:s.context.wasm,checkAuthority:this.#guard,...(s.signal?{signal:s.signal}:{})});try{this.#guard();}finally{admitted.dispose();}}
 }
 async #update(next:PhysicalStageRecord):Promise<void>{const s=this.#state;if(s.pending)await this.#retained(false);this.#guard();s.pending=next;await updatePhysicalStageRecord(s.db,s.record,next,this.#guard,s.signal);this.#guard();s.record=next;s.pending=undefined;}
 #progress():SharedPhysicalRoomStageProgress{const s=this.#state,selected=new Set(s.record.participants.map(row=>row.id));return frozen({phase:s.record.phase,participants:s.record.participants.map(row=>({...row})),unreconciledParticipants:s.held.state.metadata.participants.filter(row=>!selected.has(row.id)).map(row=>row.id)});}
 /** Durable intent inspection only; it does not reopen a completed native participant. */
 progress():Promise<SharedPhysicalRoomStageProgress>{return this.#exclusive(async()=>{await this.#retained(false);return this.#progress();});}
 #coverage(owners:readonly V2StagedParticipant[]=this.#owners):SharedPhysicalRoomStageCheck{
  const sources=owners.map(owner=>owner.family==="original"?{id:owner.id,family:"original" as const,source:owner.value.source}:{id:owner.id,family:"generation" as const,source:owner.source}),result=SharedPhysicalRoomRecoveryCatalogArchive.prototype.checkSources.call(this.#state.held.archive,sources);
  this.#guard();return frozen({kind:result.kind,source:result.source,coverage:result.coverage,stagedParticipants:result.selectedParticipants,unreconciledParticipants:result.unreconciledParticipants});
 }
 stage(input:readonly SharedPhysicalRoomStageParticipant[]):Promise<SharedPhysicalRoomStageCheck>{
  return this.#exclusive(()=>{
   if(!Array.isArray(input)||input.length>MAX_PHYSICAL_ROOM_STAGE_PARTICIPANTS)throw fail("physical_stage_policy");
   const rows=input.map(snapshotMixedCatalogParticipant);this.#guard();return this.#stage(rows);
  });
 }
 async #stage(input:readonly SharedPhysicalRoomStageParticipant[]):Promise<SharedPhysicalRoomStageCheck>{
  const s=this.#state,acquired:V2StagedParticipant[]=[];let kept=false;
  try{
   await this.#rollback.drain();await this.#retained(true);
   const prepared=await prepareMixedCatalogStage(input,s.held.state.clients,s.held.state.inventory.metadata().native,[s.database,s.held.database],MAX_PHYSICAL_ROOM_STAGE_PLAN_BYTES,this.#guard,s.signal,true);this.#guard();
   if(s.record.plan===null){
    for(const row of prepared.policies)for(const name of [policyOptions(row).database,...Object.values(policyOptions(row).destinations)]){await requireMissing(name);this.#guard();}
    await this.#update({...s.record,plan:prepared.plan,phase:"staging",participants:prepared.policies.map(row=>({id:row.id,state:"reserved" as const}))});
   }else if(s.record.plan!==prepared.plan)throw fail("physical_stage_diverged");
   if(this.#owners.length){if(this.#owners.length!==prepared.policies.length)throw fail("physical_stage_diverged");for(const owner of this.#owners)await verifyCatalogV2Participant(owner,this.#guard);}
   else for(const[index,policy]of prepared.policies.entries()){
    let row=s.record.participants[index]!;
    if(row.state==="reserved"){await requireMissing(policyOptions(policy).database);this.#guard();await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"started"}:r)});row=s.record.participants[index]!;}
    const owner=await stageCatalogV2Participant(policy,row.state==="complete",this.#guard,this.#rollback);acquired.push(owner);this.#guard();
    if(row.state!=="complete")await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"complete"}:r)});
   }
   for(const owner of acquired.length?acquired:this.#owners)await verifyCatalogV2Participant(owner,this.#guard);
   await this.#retained(true);this.#guard();this.#coverage(acquired.length?acquired:this.#owners);
   if(s.record.phase!=="staged")await this.#update({...s.record,phase:"staged"});this.#guard();
   this.#owners.push(...acquired);
   try{const result=this.#coverage();kept=true;return result;}catch(error){this.#owners.splice(this.#owners.length-acquired.length,acquired.length);throw error;}
  }catch(error){throw known(error,"physical_stage_restore");}
  finally{if(!kept){if(acquired.length)this.#rollback.retain(()=>discard(acquired));await this.#rollback.drain();}}
 }
 /** Recheck complete source bytes and every actual private native owner, never the marker alone. */
 check():Promise<SharedPhysicalRoomStageCheck>{return this.#exclusive(async()=>{
  await this.#rollback.drain();await this.#retained(true);await this.#ready();this.#guard();return this.#coverage();
 });}
 async #ready():Promise<void>{const s=this.#state;if(s.record.phase!=="staged"||s.record.participants.length!==this.#owners.length)throw fail("physical_stage_restore");for(const owner of this.#owners)await verifyCatalogV2Participant(owner,this.#guard);this.#guard();}
 close():Promise<void>{return this.#close("graceful");}
 discardAndClose():Promise<void>{return this.#close("discard");}
 #close(mode:"graceful"|"discard"):Promise<void>{
  const s=this.#state;if(s.life.closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===mode?this.#cleanup:Promise.reject(fail("physical_stage_in_use"));
  s.life.closing=true;this.#cleanupMode=mode;this.#cleanup=this.#finishClose(mode).catch(error=>{throw known(error);}).finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;
 }
 async #finishClose(mode:"graceful"|"discard"):Promise<void>{
  try{await this.#running;}catch{/* The caller retains its original staging failure. */}const s=this.#state;if(s.life.closed)return;
  await this.#rollback.drain();
  for(let at=this.#owners.length-1;at>=0;at--){await closeCatalogV2Participant(this.#owners[at]!,mode==="discard");this.#owners.splice(at,1);}
  s.db.close();s.held.db.close();await s.lease.close();await s.held.lease.close();s.held.archive.dispose();s.life.closed=true;
 }
}
