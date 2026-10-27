/** SDK-private warm whole-room executor. Construction is synchronous and
 * performs no I/O/retirement. The caller owns this attempt BEFORE run can move
 * any author resources. Ready targets remain private until a separate complete
 * admission/promotion barrier; local readiness never activates serving. */
import {RetainedSelectedAssetOwner,selectedOwnerHasRetiredActors,reserveSelectedActorExecution,releaseSelectedActorExecution,retryReservedSelectedActorCleanup,takeReservedSelectedActors,type SelectedActorExecutionReservation} from '../physical_room_asset_successor/owner.js';
import {readRoomExecution} from '../native_room_execution/coordinator.js';
import {RoomExecutionArchive} from '../native_room_execution/archive.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {snapshotPhysicalOperationV3Policy} from '../physical_room_operation_v3/policy_snapshot.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {executionNames} from '../native_room_execution/plan.js';
import {fields,fail} from '../native_room_execution/policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {retireReservedPreparedRoomKeepingActors} from '../native_room_retirement/coordinator.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import {RoomRunJournalResources} from './journal_resources.js';
import {RoomRunTargets} from './recover_targets.js';
import {checkRoomRunInputs} from './prepare_inputs.js';
import {roomRunIdentity,roomRunApproval} from './identity.js';
import {roomRunPromotionChoice} from './promotion_choice.js';
import type {RoomRunOptions,RoomRunReadOptions,RoomRunSnapshot,RoomRunStage,RoomRunApproval,RoomRunResult,RoomRunPromotionChoice,RoomRunPromotionOptions,RoomRunPromotionResult} from './contract.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
const archiveApi={read:RoomExecutionArchive.read,preparation:RoomExecutionArchive.prototype.preparation,dispose:RoomExecutionArchive.prototype.dispose};
const prepApi={read:RoomPreparationArchive.read,retained:RoomPreparationArchive.prototype.retained,dispose:RoomPreparationArchive.prototype.dispose};
const journals={open:RoomRunJournalResources.prototype.open,read:RoomRunJournalResources.prototype.read,append:RoomRunJournalResources.prototype.append,close:RoomRunJournalResources.prototype.close};
const targetsApi={recover:RoomRunTargets.prototype.recover,preview:RoomRunTargets.prototype.preview,promote:RoomRunTargets.prototype.promote,take:RoomRunTargets.prototype.takeOwner,ready:RoomRunTargets.prototype.hasSuccessor,close:RoomRunTargets.prototype.close},bindings=StoppedActorCohort.prototype.bindings,closeActors=StoppedActorCohort.prototype.close;
const scopeClose=RoomExecutionReadScope.prototype.close,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const key=Object.freeze({});
export class RoomExecutionAttempt {
 readonly #old;readonly #reservation:SelectedActorExecutionReservation;readonly #options;readonly #provided;readonly #create;readonly #targets=new RoomRunTargets();readonly #stop=new AbortController();
 #scope:RoomExecutionReadScope|undefined;#journal:RoomRunJournalResources|undefined;#snapshot:RoomRunSnapshot|undefined;
 #actors:StoppedActorCohort|undefined;#openingAttempted=false;#journalOpened=false;#taking=false;#closing=false;#closed=false;#unwatch=()=>{};
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,owner:RetainedSelectedAssetOwner,provided:RoomRunReadOptions,options:RoomRunOptions,create:boolean){
  if(token!==key)throw fail('room_execution_policy');selectedOwnerHasRetiredActors(owner);
  const raw=fields(options,['expected','participants']),expected=roomRunIdentity(raw['expected']);
  const participants=snapshotPhysicalOperationV3Policy(raw['participants'] as RoomRunOptions['participants']);
  const reads=fields(provided,['wasm','reads','checkAuthority'],['signal','assets']);
  const fresh=snapshotPhysicalHistoryReadOptions({reads:reads['reads'] as RoomRunReadOptions['reads'],checkAuthority:reads['checkAuthority'] as ()=>void,...(reads['signal']!==undefined?{signal:reads['signal'] as AbortSignal}:{})});
  const assets=reads['assets']===undefined?undefined:fields(reads['assets'],[],['limits','signal']);
  const limits=checkRichAssetLimits(assets?.['limits'] as Parameters<typeof checkRichAssetLimits>[0]);
  this.#provided={...fresh,wasm:reads['wasm'] as RoomRunReadOptions['wasm'],...(assets?{assets:{limits,...(assets['signal']!==undefined?{signal:assets['signal'] as AbortSignal}:{})}}:{})};
  this.#old=owner;this.#options=Object.freeze({expected,participants});this.#create=create;this.#reservation=reserveSelectedActorExecution(owner);Object.freeze(this);
 }
 /** No asynchronous constructor can reject after secretly taking actors. */
 static begin(owner:RetainedSelectedAssetOwner,provided:RoomRunReadOptions,options:RoomRunOptions):RoomExecutionAttempt{return new RoomExecutionAttempt(key,owner,provided,options,true);}
 /** Existing journal DATA still requires a genuine current original owner.
  * After retirement, retry run on the SAME reserved attempt. This is not actor
  * acquisition after a full process restart. */
 static resume(owner:RetainedSelectedAssetOwner,provided:RoomRunReadOptions,options:RoomRunOptions):RoomExecutionAttempt{return new RoomExecutionAttempt(key,owner,provided,options,false);}
 #check=()=>{if(this.#closing||this.#closed||this.#stop.signal.aborted)throw fail('room_execution_closed');this.#scope?.check();};
 #readOptions(){const scope=this.#scope!;return{wasm:scope.integrity.wasm,reads:scope.reads,checkAuthority:scope.check,signal:scope.signal,...(scope.assets?{assets:scope.assets}:{})};}
 async #openJournal(){
  if(this.#journal&&this.#journalOpened){this.#snapshot=await journals.read.call(this.#journal);return;}
  if(this.#journal){await journals.close.call(this.#journal);this.#journal=undefined;}
  const identity=this.#options.expected,scope=this.#scope!;
  const create=this.#create&&(!this.#openingAttempted||!await physicalOperationV3Present(identity.database,scope.check));this.#openingAttempted=true;
  this.#journal=new RoomRunJournalResources();
  this.#snapshot=await journals.open.call(this.#journal,identity,{wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal},create);this.#journalOpened=true;
 }
 async #advance(stage:Exclude<RoomRunStage,'start'>){this.#check();this.#snapshot=await journals.append.call(this.#journal!,this.#snapshot!,stage);this.#check();}
 async #approve(approve:(choice:RoomRunApproval)=>boolean|Promise<boolean>){const scope=this.#scope!,choice=roomRunApproval(this.#options.expected,this.#snapshot!);await decideFreshAssetChoice(choice,approve,{check:scope.check,signal:scope.signal,watchClosing:notify=>{add.call(scope.signal,'abort',notify,{once:true});return()=>remove.call(scope.signal,'abort',notify);}});scope.check();}
 run(approve:(choice:RoomRunApproval)=>boolean|Promise<boolean>):Promise<RoomRunResult>{
  try{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||this.#stop.signal.aborted||targetsApi.ready.call(this.#targets))throw fail('room_execution_closed');if(typeof approve!=='function')throw fail('room_execution_policy');}catch(error){return Promise.reject(error);}
  const task=Promise.resolve().then(()=>{this.#check();return this.#execute(approve);});this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 async #execute(approve:(choice:RoomRunApproval)=>boolean|Promise<boolean>):Promise<RoomRunResult>{
  if(!this.#scope){const chosen=this.#provided,signal=chosen.signal,controller=this.#stop,abort=()=>controller.abort();if(signal?.aborted)abort();else if(signal){add.call(signal,'abort',abort,{once:true});this.#unwatch=()=>remove.call(signal,'abort',abort);}
   // The read scope owns its signal observers; the external observer is removed
   // only during actual attempt cleanup, not while target reads remain live.
   this.#scope=new RoomExecutionReadScope({...chosen,signal:controller.signal});
  }
  const scope=this.#scope!,identity=this.#options.expected;let archive:RoomExecutionArchive|undefined,prepared:RoomPreparationArchive|undefined;
  try{
   const saved=await readRoomExecution(identity.execution,this.#readOptions());scope.check();
   archive=await archiveApi.read.call(RoomExecutionArchive,saved.file,identity.execution,this.#readOptions());scope.check();
   await checkRoomRunInputs(archive,identity,this.#options.participants,scope);scope.check();
   await this.#openJournal();scope.check();
   const continuing=this.#snapshot!.events.length>1;
   if(continuing)await this.#advance('resume');
   if(!this.#actors&&!selectedOwnerHasRetiredActors(this.#old)){
    // A started journal is not a license to consume occupied destinations. The
    // complete exact source check and approved native cut run again below.
    for(const name of [...executionNames(identity.execution.plan.layout).filter(name=>name!==identity.execution.plan.layout.database),...identity.execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))]){
     if(await physicalOperationV3Present(name,scope.check))throw fail('room_execution_exists');scope.check();
    }
    const input=archiveApi.preparation.call(archive);
    prepared=await prepApi.read.call(RoomPreparationArchive,input.file,input.choice,{wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal});scope.check();
    const retained=prepApi.retained.call(prepared);
    await retireReservedPreparedRoomKeepingActors(this.#old,this.#reservation,{reads:scope.reads,checkAuthority:scope.check,signal:scope.signal},{expected:input.choice,retained,...(scope.assets?{assets:scope.assets}:{}),approve:()=>this.#approve(approve).then(()=>true)});
    // No await/check/callback between taking the actual cohort and assigning
    // it into this previously returned attempt.
    this.#actors=takeReservedSelectedActors(this.#reservation);
   }else{
    await this.#approve(approve);
    if(!this.#actors){await retryReservedSelectedActorCleanup(this.#reservation);this.#actors=takeReservedSelectedActors(this.#reservation);}
   }
   bindings.call(this.#actors);scope.check();await this.#advance('retired');
   await targetsApi.recover.call(this.#targets,archive,identity,this.#options.participants,this.#actors,scope,stage=>this.#snapshot!.events.some(row=>row.event.stage===stage),stage=>this.#advance(stage));
   scope.check();this.#journal!.check();bindings.call(this.#actors);
   return Object.freeze({format:'breditor/native-room-run-result',formatVersion:1,identity,head:this.#snapshot!.head,state:'targets-and-assets-ready',scope:'held-local-replacement-only'});
  }finally{if(prepared)prepApi.dispose.call(prepared);if(archive)archiveApi.dispose.call(archive);}
 }
 /** Preview is joint DATA only; every promotion rechecks the current actual
  * head and complete native/packet/asset cut before a new affirmative decision. */
 previewPromotion():Promise<RoomRunPromotionChoice>{
  try{this.#admitPromotion();}catch(error){return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{this.#check();await this.#openJournal();this.#check();return targetsApi.preview.call(this.#targets,this.#options.expected,this.#snapshot!.head,this.#scope!);});
  this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 #admitPromotion():void{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||!this.#actors||!this.#scope||targetsApi.ready.call(this.#targets))throw fail('room_execution_closed');}
 promote(provided:RoomRunPromotionOptions):Promise<RoomRunPromotionResult>{
  let input:RoomRunPromotionOptions,reservation:Promise<void>|undefined;
  // Reflection can execute application proxy traps. Reserve before inspecting
  // any caller input, and never clear another operation's actual task on refusal.
  try{this.#admitPromotion();reservation=Promise.resolve();this.#running=reservation;const raw=fields(provided,['expected','approve','checkAssetAuthority']),expected=roomRunPromotionChoice(raw['expected']);if(typeof raw['approve']!=='function'||typeof raw['checkAssetAuthority']!=='function'||JSON.stringify(expected.identity)!==JSON.stringify(this.#options.expected))throw fail('room_execution_policy');input={expected,approve:raw['approve'] as RoomRunPromotionOptions['approve'],checkAssetAuthority:raw['checkAssetAuthority'] as ()=>void};}catch(error){if(this.#running===reservation)this.#running=undefined;return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{
   this.#check();const scope=this.#scope!;await readRoomExecution(input.expected.identity.execution,this.#readOptions());scope.check();await this.#openJournal();scope.check();
   if(JSON.stringify(this.#snapshot!.head)!==JSON.stringify(input.expected.head))throw fail();
   const actual=await targetsApi.preview.call(this.#targets,this.#options.expected,this.#snapshot!.head,scope);scope.check();if(JSON.stringify(actual)!==JSON.stringify(input.expected))throw fail();
   return targetsApi.promote.call(this.#targets,this.#actors!,scope,input,async()=>{
    // Finish actual journal cleanup and release only the old closed owner's
    // reservation BEFORE the final root/actor barrier. A failed callback leaves
    // the same attempt holding its real actors and all staged target handles.
    const current=await journals.read.call(this.#journal!);scope.check();if(JSON.stringify(current.head)!==JSON.stringify(input.expected.head))throw fail();
    this.#journalOpened=false;await journals.close.call(this.#journal!);this.#journal=undefined;scope.check();releaseSelectedActorExecution(this.#reservation);scope.check();
   });
  });this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 /** Synchronous one-shot take. Finish the old read job while the already-live
  * successor is still reachable in its recipient; cleanup cannot hide it. */
 takeOwner():RetainedSelectedAssetOwner{
  if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed)throw fail('room_execution_closed');
  if(!targetsApi.ready.call(this.#targets))throw fail('room_execution_closed');this.#taking=true;
  // Synchronous cleanup observers cannot steal this already-owned successor.
  // A callback Close cancels take while leaving real custody in the recipient.
  try{if(this.#scope)scopeClose.call(this.#scope);this.#unwatch();if(this.#closing||this.#closed)throw fail('room_execution_closed');const owner=targetsApi.take.call(this.#targets);this.#actors=undefined;this.#closed=true;return owner;}finally{this.#taking=false;}
 }
 /** Explicit terminal abandonment. Existing intent, journals and every source
  * or target byte stay intact. Never discard a preapproval source on failure. */
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let start!:()=>void,stopError:unknown,stopFailed=false;const gate=new Promise<void>(resolve=>{start=resolve;});
  // Publish actual cleanup before synchronous abort observers can reenter.
  // All callers join one operation over this genuine owner/reservation.
  this.#cleanup=gate.then(async()=>{
   await this.#running?.catch(()=>{});await targetsApi.close.call(this.#targets);
   if(!this.#actors&&selectedOwnerHasRetiredActors(this.#old)){await retryReservedSelectedActorCleanup(this.#reservation);this.#actors=takeReservedSelectedActors(this.#reservation);}
   if(this.#actors){await closeActors.call(this.#actors);this.#actors=undefined;}
   if(this.#journal){await journals.close.call(this.#journal);this.#journal=undefined;}
   releaseSelectedActorExecution(this.#reservation);this.#unwatch();if(stopFailed)throw stopError;this.#closed=true;
  }).finally(()=>{this.#cleanup=undefined;});try{this.#stop.abort();if(this.#scope)scopeClose.call(this.#scope);}catch(error){stopFailed=true;stopError=error;}finally{start();}return this.#cleanup;
 }
}
