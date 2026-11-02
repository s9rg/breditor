/** SDK-private persistent source ownership for joint activation. A rejected
 * command leaves the real Native reservation and actor exclusion held. Closing
 * is a durable source suspension, never an implicit return to old editing. */
import {RetainedSelectedAssetOwner,reserveSelectedActorExecution,releaseSelectedActorExecution,withReservedSelectedActorSourceSession,takeReservedSelectedActors,retryReservedSelectedDurableCleanup,selectedOwnerHasRetiredActors,type SelectedActorExecutionReservation} from '../physical_room_asset_successor/owner.js';
import {selectedNativeDeliverySources,checkpointSelectedNativeResources,settleSelectedNativeResources,resetSelectedNativeRetirement,armSelectedNativeDurableStop} from '../relay/native_delivery.js';
import type {SelectedNativeRecoveryScope,SelectedNativeRetainedCurrent} from '../selected_native_recovery/contract.js';
import type {RetainedDeliveryClient} from '../complete_operation_cohort/retained_native_read.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import type {PreparedRoomRetirementOptions} from '../native_room_retirement/coordinator.js';
import {verifyHeldPreparedRoomRetirement,type HeldPreparedRoomRetirementInspection} from '../native_room_retirement/held_scope.js';
import {RoomExecutionAttempt} from '../native_room_execution_run/attempt.js';
import type {RoomRunReadOptions,RoomRunOptions} from '../native_room_execution_run/contract.js';
import {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import {deferred} from './deferred.js';
import {fail} from './policy.js';
const closeActors=StoppedActorCohort.prototype.close,abort=AbortController.prototype.abort;
const key=Object.freeze({});
export interface JointSourceWork {
 readonly scope:SelectedNativeRecoveryScope;
 readonly sources:readonly RetainedDeliveryClient[];
 /** Cancellation bounds a command, not the held source lifetime. Actual
  * adapters must observe this signal and retain their own late request work. */
 readonly signal:AbortSignal;
 check():void;
}
let operate:<T>(owner:NativeActivationSourceSession,visit:(work:JointSourceWork)=>Promise<T>)=>Promise<T>;
/** Trusted SDK composition only. No supplied driver, structural copy or stored
 * workflow can manufacture this actual source owner or release its lifetime. */
export const withNativeActivationSources=<T>(owner:NativeActivationSourceSession,visit:(work:JointSourceWork)=>Promise<T>):Promise<T>=>operate(owner,visit);
export class NativeActivationSourceSession {
 readonly #old;readonly #reservation:SelectedActorExecutionReservation;readonly #reads;
 readonly #ready=deferred<void>();readonly #finish=deferred<void>();readonly #lifetime=new AbortController();
 readonly #host:Promise<void>;readonly #observation:PhysicalOperationV3Cancellation;readonly #unwatch:()=>void;
 #scope:SelectedNativeRecoveryScope|undefined;#sources:readonly RetainedDeliveryClient[]=[];
 #actors:StoppedActorCohort|undefined;#cleanup:Promise<void>|undefined;#command:Promise<unknown>|undefined;#commandAbort:AbortController|undefined;#ending:Promise<unknown>|undefined;
 #taking=false;#cancelled=false;#closing=false;#closed=false;#retired=false;#finishStarted=false;#taken=false;#startupEnded=false;
 #hostError:unknown;#current:SelectedNativeRetainedCurrent|undefined;#prepared:HeldPreparedRoomRetirementInspection|undefined;
 private constructor(token:object,old:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions){
  if(token!==key)throw fail();this.#old=old;this.#reservation=reserveSelectedActorExecution(old);
  let observation:PhysicalOperationV3Cancellation|undefined;
  try{
   const chosen=snapshotPhysicalHistoryReadOptions(provided);observation=new PhysicalOperationV3Cancellation(chosen.signal);observation.check();
   this.#observation=observation;this.#unwatch=observation.watch(()=>{this.#cancelled=true;if(this.#commandAbort)abort.call(this.#commandAbort);});
   // Caller cancellation never aborts the source visitor after an uncertain
   // request. Only explicit checkpointed retirement can end this lifetime.
   this.#reads={...chosen,signal:this.#lifetime.signal};
  }catch(error){observation?.close();releaseSelectedActorExecution(this.#reservation);throw error;}
  this.#host=Promise.resolve().then(async()=>{
   if(this.#closing||this.#cancelled){this.#startupEnded=true;releaseSelectedActorExecution(this.#reservation);this.#ready.reject(fail('joint_source_closed'));return;}
   try{
    await withReservedSelectedActorSourceSession(old,this.#reservation,this.#reads,async scope=>{
     this.#scope=scope;this.#sources=selectedNativeDeliverySources(scope);scope.check();this.#ready.resolve();await this.#finish.promise;
    });this.#retired=true;
   }catch(error){this.#hostError=error;this.#ready.reject(error);if(!this.#scope){this.#startupEnded=true;releaseSelectedActorExecution(this.#reservation);}throw error;}
  });void this.#host.catch(()=>{});Object.freeze(this);
 }
 static begin(old:RetainedSelectedAssetOwner,provided:PhysicalOperationV3HistoryReadOptions):NativeActivationSourceSession{return new NativeActivationSourceSession(key,old,provided);}
 /** Opening is data-free; this Promise never exposes the underlying scope. */
 ready():Promise<void>{return this.#ready.promise;}
 #check=()=>{if(this.#closed||this.#taken)throw fail('joint_source_closed');if(this.#hostError)throw this.#hostError;this.#scope?.check();};
 #run<T>(visit:(work:JointSourceWork)=>Promise<T>):Promise<T>{
  try{if(this.#command||this.#ending)throw fail('joint_source_busy');if(this.#closing||this.#closed||this.#taken)throw fail('joint_source_closed');if(this.#cancelled)throw fail('joint_source_aborted');if(typeof visit!=='function')throw fail();}catch(error){return Promise.reject(error);}
  // Publish the actual operation before any authority or application callback.
  const task=Promise.resolve().then(async()=>{await this.#ready.promise;this.#check();if(this.#cancelled)throw fail('joint_source_aborted');const abort=new AbortController();this.#commandAbort=abort;
   try{const value=await visit(Object.freeze({scope:this.#scope!,sources:this.#sources,signal:abort.signal,check:this.#check}));this.#check();return value;}finally{this.#commandAbort=undefined;}
  });this.#command=task;return task.finally(()=>{if(this.#command===task)this.#command=undefined;});
 }
 /** Exact current DATA remains readable after a failed/unknown command. */
 capture():Promise<SelectedNativeRetainedCurrent>{return this.#run(work=>work.scope.retainCurrent());}
 async #checkpoint():Promise<void>{
  const scope=this.#scope!;await checkpointSelectedNativeResources(scope);scope.check();await settleSelectedNativeResources(scope);scope.check();
  for(const row of this.#sources){row.source.check();row.source.save();await row.source.flush();scope.check();}
  await resetSelectedNativeRetirement(scope);scope.check();
 }
 #end(preparation?:PreparedRoomRetirementOptions):Promise<void>{
  if(this.#closed||this.#taken)return Promise.reject(fail('joint_source_closed'));if(this.#ending)return this.#ending as Promise<void>;
  this.#closing=true;
  const task=Promise.resolve().then(async()=>{
   await this.#command?.catch(()=>{});await this.#ready.promise;if(this.#finishStarted){await this.#host;return;}
   this.#check();await this.#checkpoint();this.#check();
   if(preparation)this.#prepared=await verifyHeldPreparedRoomRetirement(this.#scope!,preparation);
   else this.#current=await this.#scope!.retainRetirementCurrent();
   this.#scope!.check();armSelectedNativeDurableStop(this.#scope!);
   // No callback/await splits arming the durable stop from ending the visitor.
   this.#finishStarted=true;this.#finish.resolve();await this.#host;
  });this.#ending=task;if(this.#commandAbort)abort.call(this.#commandAbort);return task.finally(()=>{if(this.#ending===task)this.#ending=undefined;});
 }
 /** Preserve actual source/metadata stores and stop old writers. The Native
  * activation intent keeps its original Prepared/Unknown/receipt meanings. */
 suspend():Promise<void>{if(this.#retired)return Promise.resolve();return this.#end();}
 /** The exact preparation is pinned by genuine full recipe admission. Actual
  * actors stay in the closed root until an already-returned executor takes them. */
 retirePrepared(options:PreparedRoomRetirementOptions):Promise<void>{if(this.#retired)return Promise.reject(fail());return this.#end(options);}
 intoExecution(reads:RoomRunReadOptions,options:RoomRunOptions,resume=false):RoomExecutionAttempt{
  if(this.#taking||this.#command||this.#ending||this.#cleanup)throw fail('joint_source_busy');if(!this.#retired||!this.#prepared||this.#closed||this.#taken)throw fail();
  // The constructor owns token rollback on refusal; no actual cohort is taken
  // before the returned attempt exists. This session stays usable on refusal.
  this.#taking=true;try{const attempt=resume?RoomExecutionAttempt.resumeRetired(this.#old,this.#reservation,reads,options):RoomExecutionAttempt.beginRetired(this.#old,this.#reservation,reads,options);
  this.#taken=true;this.#closed=true;this.#unwatch();this.#observation.close();return attempt;}finally{this.#taking=false;}
 }
 /** Explicit terminal cleanup, retryable over the same retained handles. It
  * never reopens old writers after an unknown activation or failed retirement. */
 close():Promise<void>{
  if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;
  // Publish cleanup before any abort listener, source callback or actor close.
  const task=Promise.resolve().then(async()=>{
   if(this.#closed||this.#taken)return;
   if(!this.#finishStarted&&!this.#startupEnded){try{await this.suspend();}catch(error){if(!this.#startupEnded)throw error;}}
   await this.#host.catch(()=>{});
   if(!this.#actors&&selectedOwnerHasRetiredActors(this.#old)){await retryReservedSelectedDurableCleanup(this.#reservation);this.#actors=takeReservedSelectedActors(this.#reservation);}
   if(this.#actors){await closeActors.call(this.#actors);this.#actors=undefined;}
   releaseSelectedActorExecution(this.#reservation);this.#unwatch();this.#observation.close();this.#closed=true;
  });this.#cleanup=task.finally(()=>{this.#cleanup=undefined;});return this.#cleanup;
 }
 static{operate=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#scope in owner))return Promise.reject(fail());return owner.#run(visit);};}
}
