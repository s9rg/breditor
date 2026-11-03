import {withColdRoomExecutionTarget,type ColdRoomExecutionAttempt} from '../cold_room_execution/attempt.js';
import type {PhysicalRoomRecordCutSelection} from '../physical_room_record_cut/contract.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
/** SDK-private warm whole-room executor. Construction is synchronous and
 * performs no I/O/retirement. The caller owns this attempt BEFORE run can move
 * any author resources. Ready targets remain private until a separate complete
 * admission/promotion barrier; local readiness never activates serving. */
import {RetainedSelectedAssetOwner,selectedOwnerHasRetiredActors,reserveSelectedActorExecution,releaseSelectedActorExecution,retryReservedSelectedActorCleanup,takeReservedSelectedActors,prepareSelectedActorExecutionTransfer,type SelectedActorExecutionReservation} from '../physical_room_asset_successor/owner.js';
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
import type {RoomRunIdentity,RoomRunOptions,RoomRunReadOptions,RoomRunSnapshot,RoomRunStage,RoomRunApproval,RoomRunResult,RoomRunPromotionChoice,RoomRunPromotionOptions,RoomRunPromotionResult} from './contract.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
const archiveApi={read:RoomExecutionArchive.read,preparation:RoomExecutionArchive.prototype.preparation,dispose:RoomExecutionArchive.prototype.dispose};
const prepApi={read:RoomPreparationArchive.read,retained:RoomPreparationArchive.prototype.retained,dispose:RoomPreparationArchive.prototype.dispose};
const journals={open:RoomRunJournalResources.prototype.open,read:RoomRunJournalResources.prototype.read,append:RoomRunJournalResources.prototype.append,close:RoomRunJournalResources.prototype.close};
const targetsApi={metadata:RoomRunTargets.prototype.visitMetadataTarget,recover:RoomRunTargets.prototype.recover,preview:RoomRunTargets.prototype.preview,promote:RoomRunTargets.prototype.promote,take:RoomRunTargets.prototype.takeOwner,ready:RoomRunTargets.prototype.hasSuccessor,close:RoomRunTargets.prototype.close},bindings=StoppedActorCohort.prototype.bindings,closeActors=StoppedActorCohort.prototype.close;
const scopeClose=RoomExecutionReadScope.prototype.close,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
/** Actual same-visit target witness. Saved execution DATA cannot create it. */
declare const metadataWitnessBrand:unique symbol;
export interface RoomMetadataTargetWitness{readonly [metadataWitnessBrand]:true}
const metadataTargets=new WeakMap<RoomMetadataTargetWitness,{scope:SelectedNativeRecoveryScope;identity:RoomRunIdentity;approved:PhysicalRoomRecordCutSelection;check():void}>();
export function roomMetadataTargetIdentity(witness:RoomMetadataTargetWitness,scope:SelectedNativeRecoveryScope):RoomRunIdentity{const row=metadataTargets.get(witness);if(!row||row.scope!==scope)throw fail('room_execution_policy');row.check();return row.identity;}
export function roomMetadataTargetApprovedCut(witness:RoomMetadataTargetWitness,scope:SelectedNativeRecoveryScope):PhysicalRoomRecordCutSelection{const row=metadataTargets.get(witness);if(!row||row.scope!==scope)throw fail('room_execution_policy');row.check();return row.approved;}
let visitMetadata:<T>(owner:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,visit:(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness)=>Promise<T>)=>Promise<T>;
/** Trusted SDK composition, never a callback-based application permission. */
export const withRoomExecutionMetadataTarget=<T>(owner:RoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,visit:(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness)=>Promise<T>):Promise<T>=>visitMetadata(owner,reads,visit);
/** Same witness contract for an actually promoted cold recipient. The
 * registered identity/cut come from its private runtime, never caller DATA.
 * Ending this finite visit revokes the witness before any owner can be taken. */
export function withColdRoomExecutionMetadataTarget<T>(owner:ColdRoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,visit:(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness)=>Promise<T>):Promise<T>{
 if(typeof visit!=='function')return Promise.reject(fail('room_execution_policy'));
 return withColdRoomExecutionTarget(owner,reads,async work=>{
  const witness=Object.freeze({}) as RoomMetadataTargetWitness;
  metadataTargets.set(witness,{scope:work.scope,identity:work.identity,approved:work.approved,check:work.check});
  try{work.check();const result=await visit(work.scope,witness);work.check();return result;}finally{metadataTargets.delete(witness);}
 });
}
const key=Object.freeze({});
export class RoomExecutionAttempt {
 readonly #old;readonly #reservation:SelectedActorExecutionReservation;readonly #options;readonly #provided;readonly #create;readonly #targets=new RoomRunTargets();readonly #stop=new AbortController();readonly #targetStop=new AbortController();
 #scope:RoomExecutionReadScope|undefined;#journal:RoomRunJournalResources|undefined;#snapshot:RoomRunSnapshot|undefined;
 #approvedMetadataTarget:PhysicalRoomRecordCutSelection|undefined;#actors:StoppedActorCohort|undefined;#openingAttempted=false;#journalOpened=false;#taking=false;#closing=false;#closed=false;#unwatch=()=>{};
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,owner:RetainedSelectedAssetOwner,provided:RoomRunReadOptions,options:RoomRunOptions,create:boolean,retired?:SelectedActorExecutionReservation){
  if(token!==key)throw fail('room_execution_policy');selectedOwnerHasRetiredActors(owner);
  const transfer=retired===undefined?undefined:prepareSelectedActorExecutionTransfer(owner,retired);
  try{const raw=fields(options,['expected','participants']),expected=roomRunIdentity(raw['expected']);
  if(transfer&&JSON.stringify(expected.execution.plan.preparation)!==transfer.preparation)throw fail('room_execution_policy');
  const participants=snapshotPhysicalOperationV3Policy(raw['participants'] as RoomRunOptions['participants']);
  const reads=fields(provided,['wasm','reads','checkAuthority'],['signal','assets']);
  const fresh=snapshotPhysicalHistoryReadOptions({reads:reads['reads'] as RoomRunReadOptions['reads'],checkAuthority:reads['checkAuthority'] as ()=>void,...(reads['signal']!==undefined?{signal:reads['signal'] as AbortSignal}:{})});
  const assets=reads['assets']===undefined?undefined:fields(reads['assets'],[],['limits','signal']);
  const limits=checkRichAssetLimits(assets?.['limits'] as Parameters<typeof checkRichAssetLimits>[0]);
  this.#provided={...fresh,wasm:reads['wasm'] as RoomRunReadOptions['wasm'],...(assets?{assets:{limits,...(assets['signal']!==undefined?{signal:assets['signal'] as AbortSignal}:{})}}:{})};
  this.#old=owner;this.#options=Object.freeze({expected,participants});this.#create=create;this.#reservation=transfer?.reservation??reserveSelectedActorExecution(owner);Object.freeze(this);transfer?.commit();
  }catch(error){transfer?.rollback();throw error;}
 }
 /** No asynchronous constructor can reject after secretly taking actors. */
 static begin(owner:RetainedSelectedAssetOwner,provided:RoomRunReadOptions,options:RoomRunOptions):RoomExecutionAttempt{return new RoomExecutionAttempt(key,owner,provided,options,true);}
 /** Existing journal DATA still requires a genuine current original owner.
  * After retirement, retry run on the SAME reserved attempt. This is not actor
  * acquisition after a full process restart. */
 static resume(owner:RetainedSelectedAssetOwner,provided:RoomRunReadOptions,options:RoomRunOptions):RoomExecutionAttempt{return new RoomExecutionAttempt(key,owner,provided,options,false);}
 /** Continue after same-scope retirement without reacquiring any writer. The
  * actual old reservation is revoked before reflecting on caller options; a
  * constructor refusal restores it synchronously. No actors move until run on
  * this already-returned attempt. Saved phase/receipt DATA supplies no custody. */
 static beginRetired(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,provided:RoomRunReadOptions,options:RoomRunOptions):RoomExecutionAttempt{return new RoomExecutionAttempt(key,owner,provided,options,true,reservation);}
 /** Existing journal admission still runs against the complete actual inputs. */
 static resumeRetired(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,provided:RoomRunReadOptions,options:RoomRunOptions):RoomExecutionAttempt{return new RoomExecutionAttempt(key,owner,provided,options,false,reservation);}
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
   const promoted=await targetsApi.promote.call(this.#targets,this.#actors!,scope,input,async()=>{
    // Finish actual journal cleanup and release only the old closed owner's
    // reservation BEFORE the final root/actor barrier. A failed callback leaves
    // the same attempt holding its real actors and all staged target handles.
    const current=await journals.read.call(this.#journal!);scope.check();if(JSON.stringify(current.head)!==JSON.stringify(input.expected.head))throw fail();
    this.#journalOpened=false;await journals.close.call(this.#journal!);this.#journal=undefined;scope.check();releaseSelectedActorExecution(this.#reservation);scope.check();
   });this.#approvedMetadataTarget=promoted.choice.approval.cut;return promoted;
  });this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 /** Construction authority ends at promotion. Fresh target visits check
  * the actual recipient and their own supplied authority/lifetime. Cancelling
  * the finished construction reader does not revoke the genuine successor. */
 #checkMetadataTarget=()=>{
  if(this.#closing||this.#closed||this.#targetStop.signal.aborted||!targetsApi.ready.call(this.#targets)||!this.#approvedMetadataTarget)throw fail('room_execution_closed');
 };
 /** The promoted successor stays private in this attempt through the entire
  * source visit. Reflection is reserved before any caller hook can reenter take. */
 #visitMetadata<T>(provided:PhysicalOperationV3HistoryReadOptions,visit:(scope:SelectedNativeRecoveryScope,witness:RoomMetadataTargetWitness)=>Promise<T>):Promise<T>{
  try{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||!targetsApi.ready.call(this.#targets)||!this.#approvedMetadataTarget||typeof visit!=='function')throw fail('room_execution_closed');}catch(error){return Promise.reject(error);}
  let reads:PhysicalOperationV3HistoryReadOptions|undefined,error:unknown;const controller=new AbortController(),unwatch:(()=>void)[]=[];
  const task=Promise.resolve().then(async()=>{if(!reads)throw error;this.#checkMetadataTarget();return targetsApi.metadata.call(this.#targets,reads,async scope=>{const witness=Object.freeze({}) as RoomMetadataTargetWitness;metadataTargets.set(witness,{scope,identity:this.#options.expected,approved:this.#approvedMetadataTarget!,check:()=>{this.#checkMetadataTarget();scope.check();}});try{return await visit(scope,witness);}finally{metadataTargets.delete(witness);}}) as Promise<T>;});this.#running=task;
  try{const chosen=snapshotPhysicalHistoryReadOptions(provided);for(const signal of[this.#targetStop.signal,chosen.signal])if(signal){const abort=()=>controller.abort();if(signal.aborted)abort();else{add.call(signal,'abort',abort,{once:true});unwatch.push(()=>remove.call(signal,'abort',abort));}}reads={...chosen,signal:controller.signal,checkAuthority:()=>{this.#checkMetadataTarget();chosen.checkAuthority();this.#checkMetadataTarget();}};}catch(reason){error=reason;}
  return task.finally(()=>{for(const stop of unwatch)stop();controller.abort();if(this.#running===task)this.#running=undefined;});
 }
 static{visitMetadata=(owner,reads,visit)=>{if(!owner||typeof owner!=='object'||!(#targets in owner))return Promise.reject(fail('room_execution_policy'));return owner.#visitMetadata(reads,visit);};}
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
  }).finally(()=>{this.#cleanup=undefined;});try{for(const stop of [()=>this.#targetStop.abort(),()=>this.#stop.abort(),()=>this.#scope&&scopeClose.call(this.#scope)])try{stop();}catch(error){if(!stopFailed){stopFailed=true;stopError=error;}}}finally{start();}return this.#cleanup;
 }
}
