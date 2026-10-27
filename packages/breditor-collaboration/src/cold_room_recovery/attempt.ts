/** Reachable cold-recovery ownership. Only selected complete data and fresh
 * factories enter; no original editor/cohort is needed. Actual fresh actors and
 * every returned/failed opening stay owned before asynchronous work can reject.
 * Final promotion remains LOCAL, not authenticated serving activation. */
import {RoomActorAcquisition} from '../persistence/room_actor_acquisition.js';
import {StoppedActorCohort,takeAcquiredActorCohort} from '../persistence/stopped_actor_cohort.js';
import {RoomRunSuccessorRecipient} from '../native_room_execution_run/successor_recipient.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {SelectedRoomCurrentArchive} from '../selected_room_current/archive.js';
import {selectedRoomCurrentSelection,MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {snapshotPhysicalRootResumeOptions,resumePhysicalRootKeepingActors,PhysicalRoomClientOperationV3} from '../physical_room_operation_v3/operation.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {previewColdSelectedRoom,resumeColdSelectedRoomWithActors} from '../cold_selected_room/coordinator.js';
import {coldSelectedRoomChoice} from '../cold_selected_room/choice.js';
import {coldRoomActorPlan} from './plan.js';
import {fields,database,fail} from '../native_room_execution/policy.js';
import {recoveryOpeningContext,drainFailedRecoveryOpenings} from '../participant_recovery/opening_custody.js';
import type {ColdRoomRecoveryOptions,ColdRoomPromotionOptions} from './contract.js';
import type {ColdSelectedRoomPreview} from '../cold_selected_room/contract.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
const actorsApi={begin:RoomActorAcquisition.begin,acquire:RoomActorAcquisition.prototype.acquire,close:RoomActorAcquisition.prototype.close},closeActors=StoppedActorCohort.prototype.close;
const rootApi={finish:PhysicalRoomClientOperationV3.prototype.finish,close:PhysicalRoomClientOperationV3.prototype.discardAndClose},recipient={ready:RoomRunSuccessorRecipient.prototype.ready,take:RoomRunSuccessorRecipient.prototype.take,close:RoomRunSuccessorRecipient.prototype.close};
const archive={read:SelectedRoomCurrentArchive.read,dispose:SelectedRoomCurrentArchive.prototype.dispose},scopeClose=RoomExecutionReadScope.prototype.close,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,aborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,key=Object.freeze({});
export class ColdRoomRecoveryAttempt{
 readonly #options;readonly #recipient=new RoomRunSuccessorRecipient();readonly #stop=new AbortController();readonly #unwatch:(()=>void)[]=[];
 #scope:RoomExecutionReadScope|undefined;#basis:SelectedRoomCurrentArchive|undefined;#plan:Awaited<ReturnType<typeof coldRoomActorPlan>>|undefined;#factory:IDBFactory|undefined;
 #acquisition:RoomActorAcquisition|undefined;#actors:StoppedActorCohort|undefined;#root:PhysicalRoomClientOperationV3|undefined;
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#taking=false;#closing=false;#closed=false;
 private constructor(token:object,input:ColdRoomRecoveryOptions){if(token!==key)throw fail('room_execution_policy');const raw=fields(input,['root','basis','reads','intentDatabase']),b=fields(raw['basis'],['file','selection']),root=snapshotPhysicalRootResumeOptions(raw['root'] as ColdRoomRecoveryOptions['root']),reads=snapshotPhysicalHistoryReadOptions(raw['reads'] as ColdRoomRecoveryOptions['reads']);this.#options=Object.freeze({root,reads,basis:Object.freeze({selection:selectedRoomCurrentSelection(b['selection']),file:archiveBlob(b['file'] as Blob,MAX_SELECTED_ROOM_CURRENT_BYTES)}),intentDatabase:database(raw['intentDatabase'])});Object.freeze(this);}
 static begin(input:ColdRoomRecoveryOptions):ColdRoomRecoveryAttempt{return new ColdRoomRecoveryAttempt(key,input);}
 #admit=()=>{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||recipient.ready.call(this.#recipient))throw fail('room_execution_closed');};
 #check=()=>{if(this.#closing||this.#closed||this.#stop.signal.aborted)throw fail('room_execution_closed');this.#scope?.check();if(this.#closing||this.#closed||this.#stop.signal.aborted)throw fail('room_execution_closed');};
 #start(){if(this.#scope)return;for(const unwatch of this.#unwatch)unwatch();this.#unwatch.length=0;for(const signal of new Set([this.#options.root.signal,this.#options.reads.signal].filter((value):value is AbortSignal=>value!==undefined))){const cancel=()=>this.#stop.abort();if(aborted.call(signal))cancel();else{add.call(signal,'abort',cancel,{once:true});this.#unwatch.push(()=>remove.call(signal,'abort',cancel));}}
  this.#scope=new RoomExecutionReadScope({wasm:this.#options.root.wasm,reads:this.#options.reads.reads,checkAuthority:this.#options.reads.checkAuthority,signal:this.#stop.signal});this.#factory=recoveryOpeningContext();
 }
 async #open(){this.#check();this.#start();this.#check();const scope=this.#scope!,root=this.#options.root;
  if(!this.#basis){this.#basis=await archive.read.call(SelectedRoomCurrentArchive,this.#options.basis.file,this.#options.basis.selection,{wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal});this.#check();}
  if(!this.#plan){this.#plan=await coldRoomActorPlan(this.#basis,root,this.#options.intentDatabase,scope);this.#check();}
  if(!this.#acquisition)this.#acquisition=actorsApi.begin.call(RoomActorAcquisition,{room:this.#plan.room,members:this.#plan.members,checkAuthority:scope.check,signal:scope.signal});
  if(!this.#actors){await actorsApi.acquire.call(this.#acquisition);this.#check();this.#actors=takeAcquiredActorCohort(this.#acquisition);}
  if(!this.#root){for(const name of this.#plan.names)await drainFailedRecoveryOpenings(this.#factory!,[name],()=>fail('room_execution_storage'));this.#check();
   this.#root=await resumePhysicalRootKeepingActors({...root,checkAuthority:()=>{scope.check();root.checkAuthority();scope.check();},signal:scope.signal},this.#actors);this.#check();}
  await rootApi.finish.call(this.#root);this.#check();
 }
 /** Existing-only root/child reopening. No mutable client is exposed yet. */
 open():Promise<void>{try{this.#admit();}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>this.#open());this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 preview():Promise<ColdSelectedRoomPreview>{try{this.#admit();}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(async()=>{await this.#open();const scope=this.#scope!;return previewColdSelectedRoom(this.#root!,this.#basis!,{reads:scope.reads,checkAuthority:scope.check,signal:scope.signal,expectedBasis:this.#options.basis.selection,intentDatabase:this.#options.intentDatabase});});this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 promote(provided:ColdRoomPromotionOptions):Promise<ColdRoomPromotionOptions['expected']>{let input:ColdRoomPromotionOptions,reservation:Promise<void>|undefined;
  try{this.#admit();reservation=Promise.resolve();this.#running=reservation;const raw=fields(provided,['expected','approve','checkAssetAuthority']),expected=coldSelectedRoomChoice(raw['expected']);if(typeof raw['approve']!=='function'||typeof raw['checkAssetAuthority']!=='function'||JSON.stringify(expected.basis)!==JSON.stringify(this.#options.basis.selection)||expected.intentDatabase!==this.#options.intentDatabase)throw fail('room_execution_policy');input={expected,approve:raw['approve'] as ColdRoomPromotionOptions['approve'],checkAssetAuthority:raw['checkAssetAuthority'] as ()=>void};}catch(error){if(this.#running===reservation)this.#running=undefined;return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{await this.#open();const scope=this.#scope!;await resumeColdSelectedRoomWithActors(this.#root!,this.#basis!,{reads:scope.reads,checkAuthority:scope.check,signal:scope.signal,...input},this.#actors!,this.#recipient);this.#root=undefined;return input.expected;});this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 /** End the finite read job before pointer take; the already-owned successor
  * stays reachable even if cleanup rejects. Independent current grants survive. */
 takeOwner():RetainedSelectedAssetOwner{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||!recipient.ready.call(this.#recipient))throw fail('room_execution_closed');this.#taking=true;
  // Ending a read job fires synchronous abort observers. Reserve this actual
  // pointer take first; neither reentry nor a callback Close can hide its owner.
  try{if(this.#scope)scopeClose.call(this.#scope);for(const unwatch of this.#unwatch)unwatch();this.#unwatch.length=0;if(this.#basis)archive.dispose.call(this.#basis);if(this.#closing||this.#closed)throw fail('room_execution_closed');const owner=recipient.take.call(this.#recipient);this.#basis=undefined;this.#root=undefined;this.#actors=undefined;this.#acquisition=undefined;this.#plan=undefined;this.#factory=undefined;this.#closed=true;return owner;}finally{this.#taking=false;}
 }
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let start!:()=>void,stopError:unknown,stopFailed=false;const gate=new Promise<void>(resolve=>{start=resolve;});
  // Publish the real cleanup Promise BEFORE synchronous abort/close observers.
  // Cancellation is still immediate; reentry joins this exact operation.
  this.#cleanup=gate.then(async()=>{await this.#running?.catch(()=>{});await recipient.close.call(this.#recipient);if(this.#root){await rootApi.close.call(this.#root);this.#root=undefined;}if(this.#factory&&this.#plan)for(const name of this.#plan.names)await drainFailedRecoveryOpenings(this.#factory,[name],()=>fail('room_execution_storage'));if(this.#actors){await closeActors.call(this.#actors);this.#actors=undefined;}if(this.#acquisition){await actorsApi.close.call(this.#acquisition);this.#acquisition=undefined;}if(this.#basis){archive.dispose.call(this.#basis);this.#basis=undefined;}for(const unwatch of this.#unwatch)unwatch();this.#unwatch.length=0;if(stopFailed)throw stopError;this.#closed=true;}).finally(()=>{this.#cleanup=undefined;});try{this.#stop.abort();if(this.#scope)scopeClose.call(this.#scope);}catch(error){stopFailed=true;stopError=error;}finally{start();}return this.#cleanup;
 }
}
