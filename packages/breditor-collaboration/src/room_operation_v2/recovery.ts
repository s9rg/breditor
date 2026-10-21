/** Restartable mixed-family parent. Durable records and native verification are
 * independent from current account authority, provider closure and activation. */
import {SharedRoomRecoveryCatalogArchiveV2,catalogV2ArchiveState,type CatalogV2ArchiveState} from "../room_recovery_catalog_v2/archive.js";
import {transferRoomCatalogV2} from "../room_recovery_catalog_v2/catalog.js";
import {existingCatalogV2Database,readCatalogV2Database} from "../room_recovery_catalog_v2/database.js";
import {databaseName,selected} from "../room_recovery_catalog/policy.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
import {RecoveryOpeningCustody,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
import {prepareRecoveredPreparationRetargets} from "../participant_recovery/recovery.js";
import {prepareRecoveredGenerationRetargets} from "../generation_participant/recovery.js";
import {commitReadyPreparationRetargets} from "../participant_recovery/ready_retarget.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import {prepareMixedRoomParticipants} from "../mixed_room_operation/custody.js";
import {releaseRoomCustody} from "../room_operation/custody.js";
import {createRoomOperationV2Database} from "./create_database.js";
import {existingRoomOperationV2Database,readRoomOperationV2Database} from "./read_database.js";
import {updateRoomOperationV2} from "./update_record.js";
import {initialRoomOperationV2,type RoomOperationV2Record} from "./record.js";
import {v2Targets,v2Participants,v2Names,prepareV2Transfer,prepareV2Resume} from "./prepare.js";
import {transferredV2Children,resumedV2Children,openV2ChildOperation,exactV2Child,mixedV2Children,closeV2Child,type V2OperationChild} from "./children.js";
import {v2Lifetime,v2Fence,type V2OperationLife} from "./lifetime.js";
import {v2Failure,v2Known} from "./errors.js";
import type {SharedRoomOperationV2BeginOptions,SharedRoomOperationV2ResumeOptions,SharedRoomOperationV2Progress,SharedRoomOperationV2Parts} from "./contract.js";
const key=Object.freeze({});
interface State{readonly database:string;readonly db:IDBDatabase;readonly catalogDb:IDBDatabase;readonly leases:RecoveryLease[];readonly archive:SharedRoomRecoveryCatalogArchiveV2;readonly source:CatalogV2ArchiveState;readonly children:V2OperationChild[];readonly life:V2OperationLife;readonly guard:()=>void;readonly signal:AbortSignal|undefined;record:RoomOperationV2Record;pending:RoomOperationV2Record|undefined}
async function exists(name:string):Promise<boolean>{const db=await existingDatabase(name);if(!db)return false;db.close();return true;}
/** All selected ready owners remain private until one mixed aggregate handoff. */
export class SharedRoomOperationalRecoveryV2{
 readonly #state:State;readonly #rollback=new RecoveryCleanupScope(()=>v2Failure());#busy=false;#running:Promise<SharedRoomOperationV2Progress>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:"graceful"|"discard"|undefined;
 private constructor(token:object,state:State){if(token!==key)throw v2Failure("room_v2_closed");this.#state=state;v2Fence(state.db,state.life);v2Fence(state.catalogDb,state.life);Object.freeze(this);}
 /** Retain every source file, then replace every ready guard in one pure commit. */
 static async begin(supplied:SharedRoomOperationV2BeginOptions):Promise<SharedRoomOperationalRecoveryV2>{
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,oldDb:IDBDatabase|undefined,oldFence:IDBDatabase["onversionchange"]|undefined,opening:RecoveryOpeningCustody|undefined,committed=false;
  try{
   const input={...supplied,expected:selected(supplied.expected),participants:v2Targets(supplied.participants)},database=databaseName(input.database),{life,guard}=v2Lifetime(input.checkAuthority,input.signal);guard();
   const value=await transferRoomCatalogV2(input.catalog,async old=>{
    guard();if(JSON.stringify(old.state.selection)!==JSON.stringify(input.expected))throw v2Failure("room_v2_diverged");const policies=await prepareV2Transfer(old,guard,input.signal);v2Names(database,old.database,input.participants,policies);guard();
    opening=await RecoveryOpeningCustody.reserve(recoveryOpeningContext(),[database],async()=>{
     const results=await Promise.allSettled([Promise.resolve().then(()=>{if(!committed&&oldDb&&oldFence!==undefined)oldDb.onversionchange=oldFence;}),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(results.some(row=>row.status==="rejected"))throw v2Failure();
    },{policy:()=>v2Failure("room_v2_policy"),busy:()=>v2Failure("room_v2_in_use"),storage:()=>v2Failure()});guard();lease=await RecoveryLease.acquire(JSON.stringify(database));guard();
    const record=initialRoomOperationV2(old.database,old.record,input.participants);db=await createRoomOperationV2Database(database,record,old.state,guard,input.signal);v2Fence(db,life);guard();const saved=await readRoomOperationV2Database(db,record),admitted=await SharedRoomRecoveryCatalogArchiveV2.read(saved.record.catalog.manifest,saved.files,input.expected,{checkAuthority:guard,...(input.signal?{signal:input.signal}:{})});admitted.dispose();guard();
    const children=transferredV2Children(policies,old.owners),original=children.flatMap(child=>child.family==="original"?[{owner:child.ready!,prepared:child.policy.value.prepared}]:[]),generation=children.flatMap(child=>child.family==="generation"?[{owner:child.ready!,checkAuthority:guard,...(input.signal?{signal:input.signal}:{})}]:[]),retargets=[prepareRecoveredPreparationRetargets(original),prepareRecoveredGenerationRetargets(generation)];
    oldDb=old.db;oldFence=old.db.onversionchange;const successor=new SharedRoomOperationalRecoveryV2(key,{database,db,catalogDb:old.db,leases:[old.lease,lease],archive:old.archive,source:old.state,children,life,guard,signal:input.signal,record,pending:undefined});
    return{value:successor,prepareCommit:guard,commit(){for(const owner of old.owners)(owner.family==="original"?owner.value.source:owner.source).check();commitReadyPreparationRetargets(retargets);committed=true;}};
   });opening!.complete();return value;
  }catch(error){if(opening)await opening.rollback();throw v2Known(error);}
 }
 /** Read the pinned V2 parent/catalog and fresh explicit factories. No child
  * completion field substitutes for reopening actual native stores in finish. */
 static async resume(supplied:SharedRoomOperationV2ResumeOptions):Promise<SharedRoomOperationalRecoveryV2>{
  const leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,catalogDb:IDBDatabase|undefined,archive:SharedRoomRecoveryCatalogArchiveV2|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   const input={...supplied,expected:selected(supplied.expected),participants:v2Participants(supplied.participants)},database=databaseName(input.database),catalogDatabase=databaseName(input.catalogDatabase),{life,guard}=v2Lifetime(input.checkAuthority,input.signal);if(database===catalogDatabase)throw v2Failure("room_v2_policy");guard();
   opening=await RecoveryOpeningCustody.reserve(recoveryOpeningContext(),[database,catalogDatabase],async()=>{const results=await Promise.allSettled([Promise.resolve().then(()=>archive?.dispose()),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>catalogDb?.close()),...[...leases].reverse().map(lease=>Promise.resolve().then(()=>lease.close()))]);if(results.some(row=>row.status==="rejected"))throw v2Failure();},{policy:()=>v2Failure("room_v2_policy"),busy:()=>v2Failure("room_v2_in_use"),storage:()=>v2Failure()});guard();
   for(const name of [database,catalogDatabase].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingRoomOperationV2Database(database,current=>v2Fence(current,life));const saved=await readRoomOperationV2Database(db);guard();if(saved.record.catalogDatabase!==catalogDatabase)throw v2Failure("room_v2_diverged");archive=await SharedRoomRecoveryCatalogArchiveV2.read(saved.record.catalog.manifest,saved.files,input.expected,{checkAuthority:guard,...(input.signal?{signal:input.signal}:{})});guard();const source=catalogV2ArchiveState(archive);
   catalogDb=await existingCatalogV2Database(catalogDatabase);if(!catalogDb)throw v2Failure("room_v2_missing");v2Fence(catalogDb,life);const old=await readCatalogV2Database(catalogDb,source.manifest);guard();if(JSON.stringify(old.record)!==JSON.stringify(saved.record.catalog))throw v2Failure("room_v2_diverged");const admitted=await SharedRoomRecoveryCatalogArchiveV2.read(old.record.manifest,old.files,input.expected,{checkAuthority:guard,...(input.signal?{signal:input.signal}:{})});admitted.dispose();guard();
   const policies=await prepareV2Resume(input.participants,source,saved.record,guard,input.signal);v2Names(database,catalogDatabase,input.participants,policies);guard();const result=new SharedRoomOperationalRecoveryV2(key,{database,db,catalogDb,leases,archive,source,children:resumedV2Children(policies,input.participants),life,guard,signal:input.signal,record:saved.record,pending:undefined});opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw v2Known(error);}
 }
 selection(){return this.#state.source.selection;}
 metadata(){return this.#state.source.metadata;}
 serverFile():Blob{this.#state.guard();return this.#state.archive.serverFile();}
 inventoryFile():Blob{this.#state.guard();return this.#state.archive.inventoryFile();}
 participantFile(id:string):Blob{this.#state.guard();return this.#state.archive.participantFile(id);}
 #progress():SharedRoomOperationV2Progress{const s=this.#state,selected=new Set(s.record.participants.map(row=>row.id));return Object.freeze({phase:s.record.phase,participants:Object.freeze(s.record.participants.map(row=>Object.freeze({...row}))),unreconciledParticipants:Object.freeze(s.source.metadata.participants.filter(row=>!selected.has(row.id)).map(row=>row.id))});}
 #failure(error:unknown):Error{const s=this.#state;return s.signal?.aborted?v2Failure("room_v2_aborted"):s.life.changed||s.life.closing||s.life.closed?v2Failure("room_v2_closed"):v2Known(error);}
 async #retained():Promise<void>{
  const s=this.#state;if(s.life.released)throw v2Failure("room_v2_closed");s.guard();const current=await readRoomOperationV2Database(s.db,s.record);s.guard();const actual=JSON.stringify(current.record);if(actual===JSON.stringify(s.record))s.pending=undefined;else if(s.pending&&actual===JSON.stringify(s.pending)){s.record=current.record;s.pending=undefined;}else throw v2Failure("room_v2_diverged");
  const old=await readCatalogV2Database(s.catalogDb,s.source.manifest);s.guard();if(JSON.stringify(old.record)!==JSON.stringify(s.record.catalog))throw v2Failure("room_v2_diverged");for(const files of [current.files,old.files]){const admitted=await SharedRoomRecoveryCatalogArchiveV2.read(s.source.manifest,files,s.source.selection,{checkAuthority:s.guard,...(s.signal?{signal:s.signal}:{})});admitted.dispose();s.guard();}
 }
 async #update(next:RoomOperationV2Record):Promise<void>{const s=this.#state;s.guard();if(s.pending)throw v2Failure("room_v2_in_use");s.pending=next;await updateRoomOperationV2(s.db,s.record,next,s.guard,s.signal);s.guard();s.record=next;s.pending=undefined;}
 async progress():Promise<SharedRoomOperationV2Progress>{if(this.#busy)throw v2Failure("room_v2_in_use");this.#busy=true;try{await this.#retained();return this.#progress();}catch(error){throw this.#failure(error);}finally{this.#busy=false;}}
 finish():Promise<SharedRoomOperationV2Progress>{if(this.#busy)throw v2Failure("room_v2_in_use");this.#busy=true;try{this.#state.guard();this.#running=this.#finish().catch(error=>{throw this.#failure(error);}).finally(()=>{this.#busy=false;this.#running=undefined;});return this.#running;}catch(error){this.#busy=false;throw this.#failure(error);}}
 async #finish():Promise<SharedRoomOperationV2Progress>{
  const s=this.#state;await this.#rollback.drain();await this.#retained();for(const[index,child]of s.children.entries()){
   let row=s.record.participants[index]!;s.guard();if(row.state==="reserved"){if(await exists(row.operationDatabase))throw v2Failure("room_v2_exists");s.guard();await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"started"}:r)});row=s.record.participants[index]!;}
   if(!child.operation||child.currentPolicyPending){const present=await exists(row.operationDatabase);s.guard();if(row.state==="complete"&&!present)throw v2Failure("room_v2_missing");await openV2ChildOperation(child,row.operationDatabase,present,s.guard,this.#rollback,s.signal);}await child.operation!.check();s.guard();if(s.record.phase==="prepared"){await exactV2Child(child);s.guard();}if(row.state!=="complete")await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"complete"}:r)});
  }
  await this.#retained();if(s.record.phase==="prepared"){for(const child of s.children){await exactV2Child(child);s.guard();}await this.#retained();await this.#update({...s.record,phase:"operational"});}await this.#verify();return this.#progress();
 }
 async #verify():Promise<void>{const s=this.#state;await this.#retained();if(s.record.phase!=="operational"||s.children.some(child=>!child.operation))throw v2Failure("room_v2_diverged");for(const child of s.children){await child.operation!.check();s.guard();}}
 async check():Promise<void>{if(this.#busy)throw v2Failure("room_v2_in_use");this.#busy=true;try{await this.#verify();}catch(error){throw this.#failure(error);}finally{this.#busy=false;}}
 /** The common mixed barrier releases every child or returns none. Native author
  * custody remains attached to the returned parts; transports stay disconnected. */
 async intoParts():Promise<SharedRoomOperationV2Parts>{if(this.#busy)throw v2Failure("room_v2_in_use");this.#busy=true;try{await this.#verify();const s=this.#state,handoff=await prepareMixedRoomParticipants(mixedV2Children(s.children),[s.db,s.catalogDb],s.leases,()=>this.#retained(),s.guard,()=>{s.life.released=true;});try{const result=handoff.commit();s.archive.dispose();s.life.closed=true;return result;}finally{handoff.abandon();}}catch(error){throw this.#failure(error);}finally{this.#busy=false;}}
 close():Promise<void>{return this.#close("graceful");}
 discardAndClose():Promise<void>{return this.#close("discard");}
 #close(mode:"graceful"|"discard"):Promise<void>{if(this.#state.life.closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===mode?this.#cleanup:Promise.reject(v2Failure("room_v2_in_use"));if(this.#busy&&!this.#running)return Promise.reject(v2Failure("room_v2_in_use"));this.#state.life.closing=true;this.#cleanupMode=mode;this.#cleanup=this.#finishClose(mode).catch(error=>{throw v2Known(error);}).finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;}
 async #finishClose(mode:"graceful"|"discard"):Promise<void>{try{await this.#running;}catch{/* Caller retains the failure; every committed intent/file remains. */}if(this.#state.life.closed)return;await this.#rollback.drain();for(const child of [...this.#state.children].reverse())await closeV2Child(child,mode==="discard");await releaseRoomCustody([this.#state.db,this.#state.catalogDb],this.#state.leases);this.#state.archive.dispose();this.#state.life.closed=true;}
}
