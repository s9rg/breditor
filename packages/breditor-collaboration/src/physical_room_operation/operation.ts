/** Restartable client-side parent retaining original/current physical files and native mixed owners.
 * No native-host ancestry transfer, provider closure, connection or authenticated activation. */
import {transferPhysicalRoomStage} from "../physical_room_stage/stage.js";
import {SharedPhysicalRoomRecoveryCatalogArchive,physicalCatalogArchiveState,type PhysicalCatalogArchiveState} from "../physical_room_catalog/archive.js";
import {existingPhysicalCatalogDatabase,readPhysicalCatalogDatabase} from "../physical_room_catalog/database.js";
import {existingPhysicalStageDatabase,readPhysicalStageDatabase} from "../physical_room_stage/read_database.js";
import {physicalCatalogSelection,physicalCatalogDatabase} from "../physical_room_catalog/policy.js";
import {RecoveryLease} from "../participant_recovery/lease.js";
import {RecoveryCleanupScope} from "../participant_recovery/cleanup_scope.js";
import {RecoveryOpeningCustody,recoveryOpeningContext} from "../participant_recovery/opening_custody.js";
import {prepareRecoveredPreparationRetargets} from "../participant_recovery/recovery.js";
import {prepareRecoveredGenerationRetargets} from "../generation_participant/recovery.js";
import {commitReadyPreparationRetargets} from "../participant_recovery/ready_retarget.js";
import {prepareMixedRoomParticipants} from "../mixed_room_operation/custody.js";
import {releaseRoomCustody} from "../room_operation/custody.js";
import {repreparePhysicalClientOwners} from "./prepare_transfer.js";
import {transferredV2Children,resumedV2Children,openV2ChildOperation,exactV2Child,mixedV2Children,closeV2Child,type V2OperationChild} from "../room_operation_v2/children.js";
import {frozen} from "../room_participant_inventory/policy.js";
import type {ArchiveIntegrityContext} from "../archive_integrity/context.js";
import {createPhysicalRoomOperationDatabase} from "./create_database.js";
import {existingPhysicalRoomOperationDatabase,readPhysicalRoomOperationDatabase} from "./read_database.js";
import {updatePhysicalRoomOperationRecord} from "./update_record.js";
import {initialPhysicalRoomOperation,type PhysicalRoomOperationRecord} from "./record.js";
import {physicalOperationTargets,physicalOperationParticipants,physicalOperationNames,preparePhysicalOperationResume} from "./prepare.js";
import {physicalOperationLifetime,physicalOperationFence,type PhysicalOperationLife} from "./lifetime.js";
import {physicalOperationFailure as fail,physicalOperationKnown as known} from "./policy.js";
import type {SharedPhysicalRoomOperationBeginOptions,SharedPhysicalRoomOperationResumeOptions,SharedPhysicalRoomOperationProgress,SharedPhysicalRoomOperationParts,SharedPhysicalRoomNativeCheck} from "./contract.js";
import type {SharedPhysicalRoomRecoveryHost} from "../physical_recovery_control/host.js";
import {checkPhysicalRoomNativeHost,physicalNativeCheckFailure} from "./native_check.js";
import {checkPhysicalRoomNativeAssets} from "./native_assets.js";
import type {SharedPhysicalRoomNativeAssetsCheck} from "./native_assets_contract.js";
const key=Object.freeze({});
interface State {readonly database:string;readonly db:IDBDatabase;readonly stageDb:IDBDatabase;readonly catalogDb:IDBDatabase;readonly leases:readonly RecoveryLease[];readonly archive:SharedPhysicalRoomRecoveryCatalogArchive;readonly source:PhysicalCatalogArchiveState;readonly children:V2OperationChild[];readonly life:PhysicalOperationLife;readonly guard:()=>void;readonly local:()=>void;readonly context:ArchiveIntegrityContext;readonly factory:IDBFactory;readonly locks:LockManager;readonly signal:AbortSignal|undefined;record:PhysicalRoomOperationRecord;pending:PhysicalRoomOperationRecord|undefined}
/** Native clients remain private until every selected family crosses one mixed handoff barrier. */
export class SharedPhysicalRoomClientOperation {
 readonly #state:State;readonly #rollback=new RecoveryCleanupScope(()=>fail());
 #busy=false;#running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:"graceful"|"discard"|undefined;
 private constructor(token:object,state:State){if(token!==key)throw fail("physical_operation_closed");this.#state=state;physicalOperationFence(state.db,state.life);Object.freeze(this);}
 /** Transfer actual readonly staging owners and all three source/destination leases without a gap. */
 static async begin(supplied:SharedPhysicalRoomOperationBeginOptions):Promise<SharedPhysicalRoomClientOperation>{
  let db:IDBDatabase|undefined,lease:RecoveryLease|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   const result=await transferPhysicalRoomStage(supplied.stage,held=>{
    const options={...supplied,expected:physicalCatalogSelection(supplied.expected),participants:physicalOperationTargets(supplied.participants)},database=physicalCatalogDatabase(options.database),factory=held.held.factory,locks=held.held.locks,{life,guard,local,context}=physicalOperationLifetime(options,factory,locks);
    if(JSON.stringify(options.expected)!==JSON.stringify(held.source.selection))throw fail("physical_operation_diverged");guard();
    return async()=>{
     const policies=await repreparePhysicalClientOwners(held.owners,guard,options.signal);guard();physicalOperationNames(database,held.database,held.held.database,options.participants,policies);
     for(const target of options.participants){const occupied=await existingPhysicalRoomOperationDatabase(factory,target.operationDatabase,guard);if(occupied){occupied.close();throw fail("physical_operation_exists");}guard();}
     opening=await RecoveryOpeningCustody.reserve(factory,[database],async()=>{const all=await Promise.allSettled([Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>lease?.close())]);if(all.some(row=>row.status==="rejected"))throw fail();},{policy:()=>fail("physical_operation_policy"),busy:()=>fail("physical_operation_in_use"),storage:()=>fail()});guard();
     lease=await RecoveryLease.acquire(JSON.stringify(database));guard();const record=initialPhysicalRoomOperation(database,held.database,held.record,options.participants);
     db=await createPhysicalRoomOperationDatabase(factory,database,record,guard,options.signal);guard();await readPhysicalRoomOperationDatabase(db,guard,record);guard();
     const children=transferredV2Children(policies,held.owners),original=children.flatMap(child=>child.family==="original"?[{owner:child.ready!,prepared:child.policy.value.prepared}]:[]),generation=children.flatMap(child=>child.family==="generation"?[{owner:child.ready!,checkAuthority:guard,...(options.signal?{signal:options.signal}:{})}]:[]),retargets=[prepareRecoveredPreparationRetargets(original),prepareRecoveredGenerationRetargets(generation)];
     const successor=new SharedPhysicalRoomClientOperation(key,{database,db,stageDb:held.db,catalogDb:held.held.db,leases:[held.held.lease,held.lease,lease],archive:held.held.archive,source:held.held.state,children,life,guard,local,context,factory,locks,signal:options.signal,record,pending:undefined});
     return{value:successor,prepareCommit(){guard();for(const item of retargets)item.validate();},commit(){local();commitReadyPreparationRetargets(retargets);physicalOperationFence(held.db,life);physicalOperationFence(held.held.db,life);life.committed=true;}};
    };
   });opening!.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw known(error);}
 }
 /** Read all three exact intent/source stores and snapshot fresh factories/current permissions.
  * Native owners are not manufactured here; finish reopens every real component. */
 static async resume(supplied:SharedPhysicalRoomOperationResumeOptions):Promise<SharedPhysicalRoomClientOperation>{
  const leases:RecoveryLease[]=[];let db:IDBDatabase|undefined,stageDb:IDBDatabase|undefined,catalogDb:IDBDatabase|undefined,archive:SharedPhysicalRoomRecoveryCatalogArchive|undefined,opening:RecoveryOpeningCustody|undefined;
  try{
   const options={...supplied,expected:physicalCatalogSelection(supplied.expected),participants:physicalOperationParticipants(supplied.participants)},database=physicalCatalogDatabase(options.database),stageDatabase=physicalCatalogDatabase(options.stageDatabase),catalogDatabase=physicalCatalogDatabase(options.catalogDatabase),factory=recoveryOpeningContext(),locks=navigator.locks,{life,guard,local,context}=physicalOperationLifetime(options,factory,locks);
   if(new Set([database,stageDatabase,catalogDatabase]).size!==3)throw fail("physical_operation_policy");guard();
   opening=await RecoveryOpeningCustody.reserve(factory,[database,stageDatabase,catalogDatabase],async()=>{const all=await Promise.allSettled([Promise.resolve().then(()=>archive?.dispose()),Promise.resolve().then(()=>db?.close()),Promise.resolve().then(()=>stageDb?.close()),Promise.resolve().then(()=>catalogDb?.close()),...[...leases].reverse().map(lease=>Promise.resolve().then(()=>lease.close()))]);if(all.some(row=>row.status==="rejected"))throw fail();},{policy:()=>fail("physical_operation_policy"),busy:()=>fail("physical_operation_in_use"),storage:()=>fail()});guard();
   for(const name of [database,stageDatabase,catalogDatabase].sort()){leases.push(await RecoveryLease.acquire(JSON.stringify(name)));guard();}
   db=await existingPhysicalRoomOperationDatabase(factory,database,guard);if(!db)throw fail("physical_operation_missing");physicalOperationFence(db,life);const record=await readPhysicalRoomOperationDatabase(db,guard);guard();
   if(record.database!==database||record.stageDatabase!==stageDatabase||record.stage.catalogDatabase!==catalogDatabase||JSON.stringify(record.stage.catalog)!==JSON.stringify(options.expected))throw fail("physical_operation_diverged");
   stageDb=await existingPhysicalStageDatabase(factory,stageDatabase,guard);if(!stageDb)throw fail("physical_operation_missing");physicalOperationFence(stageDb,life);const stage=await readPhysicalStageDatabase(stageDb,guard);guard();if(JSON.stringify(stage)!==JSON.stringify(record.stage))throw fail("physical_operation_diverged");
   catalogDb=await existingPhysicalCatalogDatabase(factory,catalogDatabase,guard);if(!catalogDb)throw fail("physical_operation_missing");physicalOperationFence(catalogDb,life);const stored=await readPhysicalCatalogDatabase(catalogDb,guard,record.stage.manifest);guard();
   archive=await SharedPhysicalRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,options.expected,{wasm:context.wasm,checkAuthority:guard,...(options.signal?{signal:options.signal}:{})});guard();const source=physicalCatalogArchiveState(archive),policies=await preparePhysicalOperationResume(options.participants,source,record,guard,options.signal);guard();
   life.committed=true;const result=new SharedPhysicalRoomClientOperation(key,{database,db,stageDb,catalogDb,leases,archive,source,children:resumedV2Children(policies,options.participants),life,guard,local,context,factory,locks,signal:options.signal,record,pending:undefined});opening.complete();return result;
  }catch(error){if(opening)await opening.rollback();throw known(error);}
 }
 #guard=():void=>{if(!this.#state.life.committed)throw fail("physical_operation_closed");this.#state.guard();};
 #failure(error:unknown):Error{const s=this.#state;return s.signal?.aborted?fail("physical_operation_aborted"):s.life.closed||s.life.closing||s.life.changed?fail("physical_operation_closed"):known(error);}
 #exclusive<T>(work:()=>Promise<T>,failure:(error:unknown)=>Error=error=>this.#failure(error)):Promise<T>{
  if(this.#busy)throw fail("physical_operation_in_use");this.#busy=true;let done!:()=>void;this.#running=new Promise<void>(resolve=>{done=resolve;});
  try{return work().catch(error=>{throw failure(error);}).finally(()=>{this.#busy=false;this.#running=undefined;done();});}catch(error){this.#busy=false;this.#running=undefined;done();throw failure(error);}
 }
 database():string{return this.#state.database;}
 stageDatabase():string{return this.#state.record.stageDatabase;}
 catalogDatabase():string{return this.#state.record.stage.catalogDatabase;}
 selection(){return this.#state.source.selection;}
 metadata(){return this.#state.source.metadata;}
 manifestJson():string{return this.#state.source.manifest;}
 originServerFile():Blob{this.#guard();return this.#state.archive.originServerFile();}
 currentServerFile():Blob{this.#guard();return this.#state.archive.currentServerFile();}
 inventoryFile():Blob{this.#guard();return this.#state.archive.inventoryFile();}
 participantFile(id:string):Blob{this.#guard();return this.#state.archive.participantFile(id);}
 async #retained():Promise<void>{
  const s=this.#state;if(s.life.released)throw fail("physical_operation_closed");this.#guard();const record=await readPhysicalRoomOperationDatabase(s.db,this.#guard,s.record);this.#guard();const actual=JSON.stringify(record);
  if(actual===JSON.stringify(s.record))s.pending=undefined;else if(s.pending&&actual===JSON.stringify(s.pending)){s.record=record;s.pending=undefined;}else throw fail("physical_operation_diverged");
  const stage=await readPhysicalStageDatabase(s.stageDb,this.#guard);this.#guard();if(JSON.stringify(stage)!==JSON.stringify(s.record.stage))throw fail("physical_operation_diverged");
  const stored=await readPhysicalCatalogDatabase(s.catalogDb,this.#guard,s.source.manifest);this.#guard();const admitted=await SharedPhysicalRoomRecoveryCatalogArchive.read(stored.record.manifest,stored.files,s.source.selection,{wasm:s.context.wasm,checkAuthority:this.#guard,...(s.signal?{signal:s.signal}:{})});try{this.#guard();}finally{admitted.dispose();}
 }
 #progress():SharedPhysicalRoomOperationProgress{const s=this.#state,selected=new Set(s.record.participants.map(row=>row.id));return frozen({phase:s.record.phase,participants:s.record.participants.map(row=>({...row})),unreconciledParticipants:s.source.metadata.participants.filter(row=>!selected.has(row.id)).map(row=>row.id)});}
 progress():Promise<SharedPhysicalRoomOperationProgress>{return this.#exclusive(async()=>{await this.#retained();return this.#progress();});}
 async #update(next:PhysicalRoomOperationRecord):Promise<void>{const s=this.#state;if(s.pending)await this.#retained();this.#guard();s.pending=next;await updatePhysicalRoomOperationRecord(s.db,s.record,next,this.#guard,s.signal);this.#guard();s.record=next;s.pending=undefined;}
 finish():Promise<SharedPhysicalRoomOperationProgress>{return this.#exclusive(()=>this.#finish());}
 async #finish():Promise<SharedPhysicalRoomOperationProgress>{
  const s=this.#state;await this.#rollback.drain();await this.#retained();
  for(const[index,child]of s.children.entries()){
   let row=s.record.participants[index]!;this.#guard();
   if(row.state==="reserved"){const occupied=await existingPhysicalRoomOperationDatabase(s.factory,row.operationDatabase,this.#guard);if(occupied){occupied.close();throw fail("physical_operation_exists");}this.#guard();await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"started"}:r)});row=s.record.participants[index]!;}
   if(!child.operation||child.currentPolicyPending){const db=await existingPhysicalRoomOperationDatabase(s.factory,row.operationDatabase,this.#guard),present=!!db;db?.close();this.#guard();if(row.state==="complete"&&!present)throw fail("physical_operation_missing");await openV2ChildOperation(child,row.operationDatabase,present,this.#guard,this.#rollback,s.signal);}
   await child.operation!.check();this.#guard();if(s.record.phase==="prepared"){await exactV2Child(child);this.#guard();}
   if(row.state!=="complete")await this.#update({...s.record,participants:s.record.participants.map((r,i)=>i===index?{...r,state:"complete"}:r)});
  }
  await this.#retained();if(s.record.phase==="prepared"){for(const child of s.children){await exactV2Child(child);this.#guard();}await this.#retained();await this.#update({...s.record,phase:"operational"});}
  await this.#verify();return this.#progress();
 }
 async #verify():Promise<void>{const s=this.#state;await this.#retained();if(s.record.phase!=="operational"||s.children.some(child=>!child.operation||child.currentPolicyPending))throw fail("physical_operation_restore");for(const child of s.children){await child.operation!.check();this.#guard();}}
 check():Promise<void>{return this.#exclusive(()=>this.#verify());}
 /** Joint live read under all genuine client reservations and a real authenticated native check.
  * Historic copies and incomplete registered coverage remain Pending. No file, client flush,
  * ownership release, source retarget, provider/client closure or service activation occurs. */
 checkNativeHost(host:SharedPhysicalRoomRecoveryHost):Promise<SharedPhysicalRoomNativeCheck>{return this.#exclusive(async()=>{
  const s=this.#state;await this.#retained();if(s.record.phase!=="operational"||s.children.some(child=>!child.operation||child.currentPolicyPending))throw fail("physical_operation_restore");
  return checkPhysicalRoomNativeHost(s.children,s.source,host,()=>this.#retained(),this.#guard);
 },error=>{const s=this.#state;return s.signal?.aborted||s.life.closed||s.life.closing||s.life.changed?this.#failure(error):physicalNativeCheckFailure(error);});}
 /** Snapshot actual native/packet sources and every whole upload store under genuine reservations,
  * recheck current provider bytes and exact source/queue stamps, retaining every Pending. */
 checkNativeAssets(host:SharedPhysicalRoomRecoveryHost):Promise<SharedPhysicalRoomNativeAssetsCheck>{return this.#exclusive(async()=>{
  const s=this.#state;await this.#retained();if(s.record.phase!=="operational"||s.children.some(child=>!child.operation||child.currentPolicyPending))throw fail("physical_operation_restore");
  return checkPhysicalRoomNativeAssets(s.children,s.source,host,s.context,()=>this.#retained(),this.#guard,s.signal);
 },error=>{const s=this.#state;return s.signal?.aborted||s.life.closed||s.life.closing||s.life.changed?this.#failure(error):physicalNativeCheckFailure(error);});}
 /** All native clients or none; remains disconnected and is not server activation. */
 intoParts():Promise<SharedPhysicalRoomOperationParts>{return this.#exclusive(async()=>{
  await this.#verify();const s=this.#state,handoff=await prepareMixedRoomParticipants(mixedV2Children(s.children),[s.db,s.stageDb,s.catalogDb],s.leases,()=>this.#retained(),this.#guard,()=>{s.life.released=true;});
  try{const result=handoff.commit();s.archive.dispose();s.life.closed=true;return result;}finally{handoff.abandon();}
 });}
 close():Promise<void>{return this.#close("graceful");}
 discardAndClose():Promise<void>{return this.#close("discard");}
 #close(mode:"graceful"|"discard"):Promise<void>{
  const s=this.#state;if(s.life.closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===mode?this.#cleanup:Promise.reject(fail("physical_operation_in_use"));s.life.closing=true;this.#cleanupMode=mode;this.#cleanup=this.#finishClose(mode).catch(error=>{throw known(error);}).finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;
 }
 async #finishClose(mode:"graceful"|"discard"):Promise<void>{
  try{await this.#running;}catch{/* The operation caller keeps its original failure. */}const s=this.#state;if(s.life.closed)return;
  await this.#rollback.drain();for(const child of [...s.children].reverse())await closeV2Child(child,mode==="discard");await releaseRoomCustody([s.db,s.stageDb,s.catalogDb],s.leases);s.archive.dispose();s.life.closed=true;
 }
}
