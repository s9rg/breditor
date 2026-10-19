import {SharedRoomRecoveryCatalogArchive,catalogArchiveState,type CatalogArchiveState} from "../room_recovery_catalog/archive.js";
import {transferRoomCatalog} from "../room_recovery_catalog/catalog.js";
import {existingCatalogDatabase,readCatalogDatabase} from "../room_recovery_catalog/storage.js";
import type {StagedPolicy} from "../room_recovery_catalog/prepare_stage.js";
import {databaseName,selected} from "../room_recovery_catalog/policy.js";
import {SharedParticipantRecovery,retargetRecoveredPreparations,type RecoveredSharedParticipant} from "../participant_recovery/recovery.js";
import {existingDatabase} from "../participant_recovery/journal.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {OperationalSharedParticipant,resumeOperationalFromRecovered,verifyOperationalParticipantAtOrigin} from "../participant_operation/operation.js";
import type {SharedParticipantOperationCurrentPolicy} from "../participant_operation/types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {roomAuthority,roomFailure,roomKnown,roomSignal} from "./errors.js";
import {roomTargets,roomParticipants,roomNames,prepareRoomTransfer,prepareRoomResume} from "./prepare.js";
import {initialRoomOperation,type RoomOperationRecord} from "./record.js";
import {createRoomOperationDatabase} from "./create_database.js";
import {existingRoomOperationDatabase,readRoomOperationDatabase} from "./read_database.js";
import {updateRoomOperation} from "./update_record.js";
import {releaseRoomCustody,transferRoomParticipants} from "./custody.js";
import type {SharedRoomOperationBeginOptions,SharedRoomOperationResumeOptions,SharedRoomOperationProgress,SharedRoomOperationParts} from "./types.js";

const key=Object.freeze({});
interface Life{changed:boolean;closing:boolean;closed:boolean}
interface Child{readonly policy:StagedPolicy;readonly currentPolicy:SharedParticipantOperationCurrentPolicy;ready:RecoveredSharedParticipant<SharedSelectionPolicy>|undefined;source:SharedAssetReferenceCapture|undefined;operation:OperationalSharedParticipant<SharedSelectionPolicy>|undefined}
interface State{readonly database:string;readonly db:IDBDatabase;readonly catalogDb:IDBDatabase;readonly leases:RecoveryLease[];readonly archive:SharedRoomRecoveryCatalogArchive;readonly source:CatalogArchiveState;readonly children:Child[];readonly life:Life;readonly guard:()=>void;readonly signal:AbortSignal|undefined;record:RoomOperationRecord;pending:RoomOperationRecord|undefined}
function fence(db:IDBDatabase,life:Life):void{db.onversionchange=()=>{life.changed=true;db.close();};}
function lifetime(checkAuthority:()=>void,signal?:AbortSignal){const life:Life={changed:false,closing:false,closed:false},authority=roomAuthority(checkAuthority),guard=()=>{if(life.closed||life.closing||life.changed)throw roomFailure("room_operation_closed");roomSignal(signal);authority();roomSignal(signal);if(life.closed||life.closing||life.changed)throw roomFailure("room_operation_closed");};return{life,guard};}
async function exists(name:string):Promise<boolean>{const db=await existingDatabase(name);if(!db)return false;db.close();return true;}
/** A durable held attempt. No child, token, synchronization or activation is exposed before handoff. */
export class SharedRoomOperationalRecovery{
 readonly #state:State;#busy=false;#running:Promise<SharedRoomOperationProgress>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:"graceful"|"discard"|undefined;
 private constructor(token:object,state:State){if(token!==key)throw roomFailure("room_operation_closed");this.#state=state;fence(state.db,state.life);fence(state.catalogDb,state.life);Object.freeze(this);}
 /** Consume only a genuinely staged catalog, atomically retaining its entire original source first. */
 static async begin(supplied:SharedRoomOperationBeginOptions):Promise<SharedRoomOperationalRecovery>{
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,oldDb:IDBDatabase|undefined,oldFence:IDBDatabase["onversionchange"]|undefined;
  try{
   const input={...supplied,expected:selected(supplied.expected),participants:roomTargets(supplied.participants)},database=databaseName(input.database),{life,guard}=lifetime(input.checkAuthority,input.signal);guard();
   return await transferRoomCatalog(input.catalog,async old=>{
    guard();if(JSON.stringify(old.state.selection)!==JSON.stringify(input.expected))throw roomFailure("room_operation_diverged");roomNames(database,old.database,input.participants,old.owners.map(owner=>owner.policy));
    const policies=await prepareRoomTransfer(old,guard,input.signal);guard();lease=await RecoveryLease.acquire(JSON.stringify(database));guard();const record=initialRoomOperation(old.database,old.record,input.participants);
    db=await createRoomOperationDatabase(database,record,old.state,guard,input.signal);fence(db,life);guard();const saved=await readRoomOperationDatabase(db,record),admitted=await SharedRoomRecoveryCatalogArchive.read(saved.record.catalog.manifest,saved.files,input.expected,{checkAuthority:guard,...(input.signal?{signal:input.signal}:{})});admitted.dispose();guard();
    const children=policies.map((policy,index)=>({policy,currentPolicy:{documentReadOnly:true,reviewAccess:policy.options.session.kind.includes("paired")?"read_only" as const:null},ready:old.owners[index]!.recovered,source:old.owners[index]!.source,operation:undefined}));
    oldDb=old.db;oldFence=old.db.onversionchange;const state:State={database,db,catalogDb:old.db,leases:[old.lease,lease],archive:old.archive,source:old.state,children,life,guard,signal:input.signal,record,pending:undefined},value=new SharedRoomOperationalRecovery(key,state);
    return{value,prepareCommit:guard,commit:()=>retargetRecoveredPreparations(children.map(child=>({owner:child.ready!,prepared:child.policy.prepared})))};
   });
  }catch(error){db?.close();if(oldDb&&oldFence!==undefined)oldDb.onversionchange=oldFence;await lease?.close();throw roomKnown(error);}
 }
 /** Read original parent data and explicit policies only. finish reopens every actual native child. */
 static async resume(supplied:SharedRoomOperationResumeOptions):Promise<SharedRoomOperationalRecovery>{
  const leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,catalogDb:IDBDatabase|undefined,archive:SharedRoomRecoveryCatalogArchive|undefined;
  try{
   const input={...supplied,expected:selected(supplied.expected),participants:roomParticipants(supplied.participants)},database=databaseName(input.database),catalogDatabase=databaseName(input.catalogDatabase),{life,guard}=lifetime(input.checkAuthority,input.signal);if(database===catalogDatabase)throw roomFailure("room_operation_policy");guard();
   for(const name of [database,catalogDatabase].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingRoomOperationDatabase(database,current=>fence(current,life));const stored=await readRoomOperationDatabase(db);guard();if(stored.record.catalogDatabase!==catalogDatabase)throw roomFailure("room_operation_diverged");
   archive=await SharedRoomRecoveryCatalogArchive.read(stored.record.catalog.manifest,stored.files,input.expected,{checkAuthority:guard,...(input.signal?{signal:input.signal}:{})});guard();const source=catalogArchiveState(archive);
   catalogDb=await existingCatalogDatabase(catalogDatabase);if(!catalogDb)throw roomFailure("room_operation_missing");fence(catalogDb,life);const original=await readCatalogDatabase(catalogDb,source.manifest);guard();if(JSON.stringify(original.record)!==JSON.stringify(stored.record.catalog))throw roomFailure("room_operation_diverged");
   const verified=await SharedRoomRecoveryCatalogArchive.read(original.record.manifest,original.files,input.expected,{checkAuthority:guard,...(input.signal?{signal:input.signal}:{})});verified.dispose();guard();
   const policies=await prepareRoomResume(input.participants,source,stored.record,guard,input.signal);roomNames(database,catalogDatabase,input.participants,policies);guard();const children=policies.map((policy,index)=>({policy,currentPolicy:input.participants[index]!.currentPolicy,ready:undefined,source:undefined,operation:undefined}));
   return new SharedRoomOperationalRecovery(key,{database,db,catalogDb,leases,archive,source,children,life,guard,signal:input.signal,record:stored.record,pending:undefined});
  }catch(error){archive?.dispose();if(db&&catalogDb)await releaseRoomCustody([db,catalogDb],leases);else{db?.close();catalogDb?.close();for(const lease of leases.reverse())await lease.close();}throw roomKnown(error);}
 }
 selection(){return this.#state.source.selection;}
 metadata(){return this.#state.source.metadata;}
 serverFile():Blob{this.#state.guard();return this.#state.archive.serverFile();}
 inventoryFile():Blob{this.#state.guard();return this.#state.archive.inventoryFile();}
 participantFile(id:string):Blob{this.#state.guard();return this.#state.archive.participantFile(id);}
 #progress():SharedRoomOperationProgress{const s=this.#state,chosen=new Set(s.record.participants.map(row=>row.id));return Object.freeze({phase:s.record.phase,participants:Object.freeze(s.record.participants.map(row=>Object.freeze({...row}))),unreconciledParticipants:Object.freeze(s.source.metadata.participants.filter(row=>!chosen.has(row.id)).map(row=>row.id))});}
 #failure(error:unknown):Error{const s=this.#state;return s.signal?.aborted?roomFailure("room_operation_aborted"):s.life.changed||s.life.closing||s.life.closed?roomFailure("room_operation_closed"):roomKnown(error);}
 async #retained():Promise<void>{
  const s=this.#state;s.guard();const current=await readRoomOperationDatabase(s.db,s.record);s.guard();const actual=JSON.stringify(current.record);if(actual===JSON.stringify(s.record))s.pending=undefined;else if(s.pending&&actual===JSON.stringify(s.pending)){s.record=current.record;s.pending=undefined;}else throw roomFailure("room_operation_diverged");
  const original=await readCatalogDatabase(s.catalogDb,s.source.manifest);s.guard();if(JSON.stringify(original.record)!==JSON.stringify(s.record.catalog))throw roomFailure("room_operation_diverged");
  for(const files of [current.files,original.files]){const admitted=await SharedRoomRecoveryCatalogArchive.read(s.source.manifest,files,s.source.selection,{checkAuthority:s.guard,...(s.signal?{signal:s.signal}:{})});admitted.dispose();s.guard();}
 }
 async #update(next:RoomOperationRecord):Promise<void>{const s=this.#state;s.guard();if(s.pending)throw roomFailure("room_operation_in_use");s.pending=next;await updateRoomOperation(s.db,s.record,next,s.guard,s.signal);s.guard();s.record=next;s.pending=undefined;}
 async progress():Promise<SharedRoomOperationProgress>{if(this.#busy)throw roomFailure("room_operation_in_use");this.#busy=true;try{await this.#retained();return this.#progress();}catch(error){throw roomKnown(error);}finally{this.#busy=false;}}
 /** Advance ordered durable intents; successful private children survive a later failure for retry. */
 finish():Promise<SharedRoomOperationProgress>{
  if(this.#busy)throw roomFailure("room_operation_in_use");this.#busy=true;try{this.#state.guard();this.#running=this.#finish().catch(error=>{throw this.#failure(error);}).finally(()=>{this.#busy=false;this.#running=undefined;});return this.#running;}catch(error){this.#busy=false;throw this.#failure(error);}
 }
 async #finish():Promise<SharedRoomOperationProgress>{
  const s=this.#state;await this.#retained();
  for(const [index,child]of s.children.entries()){
   let row=s.record.participants[index]!;s.guard();if(row.state==="reserved"){if(await exists(row.operationDatabase))throw roomFailure("room_operation_exists");s.guard();await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"started"}:r)});row=s.record.participants[index]!;}
   if(!child.operation){
    const present=await exists(row.operationDatabase);s.guard();if(row.state==="complete"&&!present)throw roomFailure("room_operation_missing");
    if(!child.ready&&!present){const attempt=await SharedParticipantRecovery.resume(child.policy.options);try{child.ready=await attempt.finish();}finally{await attempt.close();}s.guard();}
    if(child.ready){const options={database:row.operationDatabase,recovered:child.ready,expected:child.policy.options.expected,checkAuthority:s.guard,...(s.signal?{signal:s.signal}:{})};child.operation=await(present?resumeOperationalFromRecovered(options):OperationalSharedParticipant.begin(options));child.ready=undefined;child.source?.dispose();child.source=undefined;}
    else{const {backup:_backup,database:recoveryDatabase,...base}=child.policy.options;child.operation=await OperationalSharedParticipant.resume({...base,database:row.operationDatabase,recoveryDatabase,currentPolicy:child.currentPolicy});}
    s.guard();
   }
   await child.operation.check();s.guard();if(s.record.participants[index]!.state!=="complete")await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"complete"}:r)});
  }
  await this.#retained();if(s.record.phase==="prepared"){for(const child of s.children){await verifyOperationalParticipantAtOrigin(child.operation!);s.guard();}await this.#retained();await this.#update({...s.record,phase:"operational"});}
  await this.#verify();return this.#progress();
 }
 async #verify():Promise<void>{const s=this.#state;await this.#retained();if(s.record.phase!=="operational"||s.children.some(child=>!child.operation))throw roomFailure("room_operation_diverged");for(const child of s.children){await child.operation!.check();s.guard();}}
 async check():Promise<void>{if(this.#busy)throw roomFailure("room_operation_in_use");this.#busy=true;try{await this.#verify();}catch(error){throw roomKnown(error);}finally{this.#busy=false;}}
 /** One aggregate release: no child handle is consumed if another cooperative release fails. */
 async intoParts():Promise<SharedRoomOperationParts>{if(this.#busy)throw roomFailure("room_operation_in_use");this.#busy=true;try{await this.#verify();const s=this.#state,parts=await transferRoomParticipants(s.children.map(child=>({id:child.policy.id,operation:child.operation!})),[s.db,s.catalogDb],s.leases,()=>this.#retained());s.archive.dispose();s.life.closed=true;return parts;}catch(error){throw roomKnown(error);}finally{this.#busy=false;}}
 close():Promise<void>{return this.#close("graceful");}
 discardAndClose():Promise<void>{return this.#close("discard");}
 #close(mode:"graceful"|"discard"):Promise<void>{if(this.#state.life.closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===mode?this.#cleanup:Promise.reject(roomFailure("room_operation_in_use"));if(this.#busy&&!this.#running)return Promise.reject(roomFailure("room_operation_in_use"));this.#state.life.closing=true;this.#cleanupMode=mode;this.#cleanup=this.#finishClose(mode).catch(error=>{throw roomKnown(error);}).finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;}
 async #finishClose(mode:"graceful"|"discard"):Promise<void>{
  try{await this.#running;}catch{/* The finish caller retains its error and the durable intent. */}if(this.#state.life.closed)return;const s=this.#state;
  for(const child of [...s.children].reverse()){if(child.operation){await(mode==="graceful"?child.operation.close():child.operation.discardAndClose());child.operation=undefined;}if(child.ready){await(mode==="graceful"?child.ready.close():child.ready.discardAndClose());child.ready=undefined;}child.source?.dispose();child.source=undefined;}
  await releaseRoomCustody([s.db,s.catalogDb],s.leases);s.archive.dispose();s.life.closed=true;
 }
}
