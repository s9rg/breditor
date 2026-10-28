/** SDK-private warm whole-room executor. Construction is synchronous and
 * performs no I/O/retirement. The caller owns this attempt BEFORE run can move
 * any author resources. Ready targets remain private until a separate complete
 * admission/promotion barrier; local readiness never activates serving. */
import {RetainedSelectedAssetOwner,selectedOwnerHasRetiredActors,reserveSelectedActorExecution,releaseSelectedActorExecution,retryReservedSelectedActorCleanup,takeReservedSelectedActors,type SelectedActorExecutionReservation} from '../physical_room_asset_successor/owner.js';
import {readPreparedNativeRoomUnionExecution,readPreparedAuthenticatedNativeRoomUnionExecution} from '../native_room_union_execution/coordinator.js';
import {NativeRoomUnionExecutionArchive} from '../native_room_union_execution/archive.js';
import {NativeRoomUnionReadScope} from '../native_room_union/read_scope.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {snapshotPhysicalOperationV3Policy} from '../physical_room_operation_v3/policy_snapshot.js';
import {physicalOperationV3Present} from '../physical_room_operation_v3/child.js';
import {executionNames} from '../native_room_execution/plan.js';
import {fields,fail} from './policy.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {retireReservedNativeRoomUnionKeepingActors,retireReservedAuthenticatedNativeRoomUnionKeepingActors} from '../native_room_union/retirement.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import {NativeRoomUnionRunJournalResources} from './journal_resources.js';
import {NativeRoomUnionRunTargets} from './recover_targets.js';
import {checkNativeRoomUnionRunInputs} from './prepare_inputs.js';
import {unionRunIdentity,unionRunApproval,MAX_UNION_RUN_METADATA_BYTES} from './identity.js';
import {unionRunPromotionChoice} from './promotion_choice.js';
import type {NativeRoomUnionRunOptions,NativeRoomUnionRunReadOptions,NativeRoomUnionRunSnapshot,NativeRoomUnionRunStage,NativeRoomUnionRunApproval,NativeRoomUnionRunResult,NativeRoomUnionRunPromotionChoice,NativeRoomUnionRunPromotionOptions,NativeRoomUnionRunPromotionResult} from './contract.js';
import {NativeRoomUnionArchive} from '../native_room_union/archive.js';
import {unionAuthorizations,unionPlanTargets} from '../native_room_union/plan.js';
import {NativeRoomUnionAuthentication} from '../native_room_union_authentication/source.js';
import type {AuthenticatedNativeRoomUnionReadOptions as AuthRead} from '../native_room_union_authentication/contract.js';
import {recordCutJson} from '../physical_room_record_cut/json.js';
import type {NativeRoomUnionRunHandoff} from './contract.js';
const archiveApi={read:NativeRoomUnionExecutionArchive.read,preparation:NativeRoomUnionExecutionArchive.prototype.preparation,dispose:NativeRoomUnionExecutionArchive.prototype.dispose};
const prepApi={read:NativeRoomUnionArchive.read,retained:NativeRoomUnionArchive.prototype.retained,dispose:NativeRoomUnionArchive.prototype.dispose};
const journals={open:NativeRoomUnionRunJournalResources.prototype.open,read:NativeRoomUnionRunJournalResources.prototype.read,append:NativeRoomUnionRunJournalResources.prototype.append,close:NativeRoomUnionRunJournalResources.prototype.close};
const targetsApi={recover:NativeRoomUnionRunTargets.prototype.recover,preview:NativeRoomUnionRunTargets.prototype.preview,promote:NativeRoomUnionRunTargets.prototype.promote,take:NativeRoomUnionRunTargets.prototype.takeOwner,ready:NativeRoomUnionRunTargets.prototype.hasSuccessor,confirm:NativeRoomUnionRunTargets.prototype.confirmSuccessor,close:NativeRoomUnionRunTargets.prototype.close},bindings=StoppedActorCohort.prototype.bindings,closeActors=StoppedActorCohort.prototype.close;
const scopeClose=NativeRoomUnionReadScope.prototype.close,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const key=Object.freeze({});
export class NativeRoomUnionExecutionAttempt {
 readonly #authentication:NativeRoomUnionAuthentication|undefined;readonly #old;readonly #reservation:SelectedActorExecutionReservation;readonly #options;readonly #provided;readonly #create;readonly #targets=new NativeRoomUnionRunTargets();readonly #stop=new AbortController();
 #scope:NativeRoomUnionReadScope|undefined;#journal:NativeRoomUnionRunJournalResources|undefined;#snapshot:NativeRoomUnionRunSnapshot|undefined;
 #actors:StoppedActorCohort|undefined;#openingAttempted=false;#journalOpened=false;#taking=false;#closing=false;#closed=false;#unwatch=()=>{};
 #promotion:NativeRoomUnionRunPromotionChoice|undefined;#handoff:NativeRoomUnionRunHandoff|undefined;#completed=false;
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;
 private constructor(token:object,owner:RetainedSelectedAssetOwner,provided:NativeRoomUnionRunReadOptions|AuthRead,options:NativeRoomUnionRunOptions,create:boolean,authenticated=false){
  if(token!==key)throw fail('room_union_run_policy');selectedOwnerHasRetiredActors(owner);
  const raw=fields(options,['expected','participants']),expected=unionRunIdentity(raw['expected']);
  const participants=snapshotPhysicalOperationV3Policy(raw['participants'] as NativeRoomUnionRunOptions['participants']);
  const reads=fields(provided,['wasm','reads',authenticated?'authentication':'authorizations','checkAuthority'],['signal','assets']);
  this.#authentication=authenticated?new NativeRoomUnionAuthentication(reads['authentication'] as AuthRead['authentication']):undefined;
  const fresh=snapshotPhysicalHistoryReadOptions({reads:reads['reads'] as NativeRoomUnionRunReadOptions['reads'],checkAuthority:reads['checkAuthority'] as ()=>void,...(reads['signal']!==undefined?{signal:reads['signal'] as AbortSignal}:{})});
  const assets=reads['assets']===undefined?undefined:fields(reads['assets'],[],['limits','signal']);
  const limits=checkRichAssetLimits(assets?.['limits'] as Parameters<typeof checkRichAssetLimits>[0]);
  this.#provided={...fresh,authorizations:authenticated?[]:unionAuthorizations(reads['authorizations']),wasm:reads['wasm'] as NativeRoomUnionRunReadOptions['wasm'],...(assets?{assets:{limits,...(assets['signal']!==undefined?{signal:assets['signal'] as AbortSignal}:{})}}:{})};
  this.#old=owner;this.#options=Object.freeze({expected,participants});this.#create=create;this.#reservation=reserveSelectedActorExecution(owner);Object.freeze(this);
 }
 /** No asynchronous constructor can reject after secretly taking actors. */
 static begin(owner:RetainedSelectedAssetOwner,provided:NativeRoomUnionRunReadOptions,options:NativeRoomUnionRunOptions):NativeRoomUnionExecutionAttempt{return new NativeRoomUnionExecutionAttempt(key,owner,provided,options,true);}
 /** Existing journal DATA still requires a genuine current original owner.
  * After retirement, retry run on the SAME reserved attempt. This is not actor
  * acquisition after a full process restart. */
 static resume(owner:RetainedSelectedAssetOwner,provided:NativeRoomUnionRunReadOptions,options:NativeRoomUnionRunOptions):NativeRoomUnionExecutionAttempt{return new NativeRoomUnionExecutionAttempt(key,owner,provided,options,false);}
 /** Explicit authenticated modes retain the same real reservation and stopped-cohort owner. */
 static beginAuthenticated(owner:RetainedSelectedAssetOwner,provided:AuthRead,options:NativeRoomUnionRunOptions):NativeRoomUnionExecutionAttempt{return new NativeRoomUnionExecutionAttempt(key,owner,provided,options,true,true);}
 static resumeAuthenticated(owner:RetainedSelectedAssetOwner,provided:AuthRead,options:NativeRoomUnionRunOptions):NativeRoomUnionExecutionAttempt{return new NativeRoomUnionExecutionAttempt(key,owner,provided,options,false,true);}
 #check=()=>{if(this.#closing||this.#closed||this.#stop.signal.aborted)throw fail('room_union_run_closed');this.#scope?.check();};
 #readOptions(){const scope=this.#scope!,base=scope.base;return{wasm:base.integrity.wasm,reads:base.reads,authorizations:scope.authorizations,checkAuthority:scope.check,signal:base.signal,...(base.assets?{assets:base.assets}:{})};}
 #authenticatedReadOptions():AuthRead{const{authorizations:_grants,...base}=this.#readOptions();if(!this.#authentication)throw fail('room_union_run_policy');return{...base,authentication:this.#authentication.options};}
 async #authenticate(){if(this.#authentication)await this.#scope!.authorize(unionPlanTargets(this.#options.expected.execution.plan.preparation.plan));this.#check();}
 #readExecution(choice:NativeRoomUnionRunOptions['expected']['execution']){return this.#authentication?readPreparedAuthenticatedNativeRoomUnionExecution(choice,this.#authenticatedReadOptions()):readPreparedNativeRoomUnionExecution(choice,this.#readOptions());}
 async #openJournal(){
  if(this.#journal&&this.#journalOpened){this.#snapshot=await journals.read.call(this.#journal);return;}
  if(this.#journal){await journals.close.call(this.#journal);this.#journal=undefined;}
  const identity=this.#options.expected,scope=this.#scope!;
  const create=this.#create&&(!this.#openingAttempted||!await physicalOperationV3Present(identity.database,scope.check));this.#openingAttempted=true;
  this.#journal=new NativeRoomUnionRunJournalResources();
  this.#snapshot=await journals.open.call(this.#journal,identity,{wasm:scope.base.integrity.wasm,checkAuthority:scope.check,signal:scope.base.signal},create);this.#journalOpened=true;
 }
 async #advance(stage:Exclude<NativeRoomUnionRunStage,'start'>,handoff:NativeRoomUnionRunHandoff|null=null){this.#check();this.#snapshot=await journals.append.call(this.#journal!,this.#snapshot!,stage,handoff);this.#check();}
 async #approve(approve:(choice:NativeRoomUnionRunApproval)=>boolean|Promise<boolean>){const scope=this.#scope!,choice=unionRunApproval(this.#options.expected,this.#snapshot!);await decideFreshAssetChoice(choice,approve,{check:scope.check,signal:scope.base.signal,watchClosing:notify=>{add.call(scope.base.signal,'abort',notify,{once:true});return()=>remove.call(scope.base.signal,'abort',notify);}});scope.check();}
 run(approve:(choice:NativeRoomUnionRunApproval)=>boolean|Promise<boolean>):Promise<NativeRoomUnionRunResult>{
  try{if(this.#running||this.#taking)throw fail('room_union_run_busy');if(this.#closing||this.#closed||this.#stop.signal.aborted||targetsApi.ready.call(this.#targets))throw fail('room_union_run_closed');if(typeof approve!=='function')throw fail('room_union_run_policy');}catch(error){return Promise.reject(error);}
  const task=Promise.resolve().then(()=>{this.#check();return this.#execute(approve);});this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 async #execute(approve:(choice:NativeRoomUnionRunApproval)=>boolean|Promise<boolean>):Promise<NativeRoomUnionRunResult>{
  if(!this.#scope){const chosen=this.#provided,signal=chosen.signal,controller=this.#stop,abort=()=>controller.abort();if(signal?.aborted)abort();else if(signal){add.call(signal,'abort',abort,{once:true});this.#unwatch=()=>remove.call(signal,'abort',abort);}
   // The read scope owns its signal observers; the external observer is removed
   // only during actual attempt cleanup, not while target reads remain live.
   // An admitted journal stays in EVERY nested read/handoff guard. Failed
   // opens remain cleanup-reachable until the actual journal admission completes.
   const current=()=>{if(this.#journalOpened){if(!this.#journal)throw fail('room_union_run_closed');this.#journal.check();}}, {authorizations:_grants,...base}=chosen;this.#scope=this.#authentication?new NativeRoomUnionReadScope({...base,authentication:this.#authentication.options,signal:controller.signal},true,current):new NativeRoomUnionReadScope({...chosen,signal:controller.signal},false,current);
  }
  const scope=this.#scope!,identity=this.#options.expected;let archive:NativeRoomUnionExecutionArchive|undefined,prepared:NativeRoomUnionArchive|undefined;
  try{
   await this.#authenticate();const saved=await this.#readExecution(identity.execution);scope.check();
   archive=this.#authentication?await NativeRoomUnionExecutionArchive.readAuthenticated(saved.file,identity.execution,this.#authenticatedReadOptions()):await archiveApi.read.call(NativeRoomUnionExecutionArchive,saved.file,identity.execution,this.#readOptions());scope.check();
   await checkNativeRoomUnionRunInputs(archive,identity,this.#options.participants,scope);scope.check();
   await this.#openJournal();scope.check();
   if(this.#snapshot!.events.at(-1)!.event.stage==='handoff-observed')throw fail('room_union_run_closed');
   const continuing=this.#snapshot!.events.length>1;
   if(continuing)await this.#advance('resume');
   if(!this.#actors&&!selectedOwnerHasRetiredActors(this.#old)){
    // A started journal is not a license to consume occupied destinations. The
    // complete exact source check and approved native cut run again below.
    for(const name of [...executionNames(identity.execution.plan.layout).filter(name=>name!==identity.execution.plan.layout.database),...identity.execution.plan.preparation.plan.participants.flatMap(row=>row.namespaces.map(ns=>ns.database))]){
     if(await physicalOperationV3Present(name,scope.check))throw fail('room_union_run_exists');scope.check();
    }
    const input=archiveApi.preparation.call(archive);
    prepared=this.#authentication?await NativeRoomUnionArchive.readAuthenticated(input.file,input.choice,this.#authenticatedReadOptions()):await prepApi.read.call(NativeRoomUnionArchive,input.file,input.choice,this.#readOptions());scope.check();
    const retained=prepApi.retained.call(prepared);
    const retirement={expected:input.choice,retained,...(scope.base.assets?{assets:scope.base.assets}:{}),approve:()=>this.#approve(approve).then(()=>true)},reads={reads:scope.base.reads,checkAuthority:scope.check,signal:scope.base.signal};
    if(this.#authentication)await retireReservedAuthenticatedNativeRoomUnionKeepingActors(this.#old,this.#reservation,reads,{...retirement,authentication:this.#authentication.options});else await retireReservedNativeRoomUnionKeepingActors(this.#old,this.#reservation,reads,{...retirement,authorizations:scope.authorizations});
    // No await/check/callback between taking the actual cohort and assigning
    // it into this previously returned attempt.
    this.#actors=takeReservedSelectedActors(this.#reservation);
   }else{
    await this.#approve(approve);
    if(!this.#actors){await retryReservedSelectedActorCleanup(this.#reservation);this.#actors=takeReservedSelectedActors(this.#reservation);}
   }
   bindings.call(this.#actors);scope.check();await this.#advance('retired');
   await targetsApi.recover.call(this.#targets,archive,identity,this.#options.participants,this.#actors,scope,stage=>this.#snapshot!.events.some(row=>row.event.stage===stage),stage=>this.#advance(stage));
   scope.check();this.#journal!.check();bindings.call(this.#actors);if(this.#authentication)await scope.verify();
   return Object.freeze({format:'breditor/native-room-union-run-result',formatVersion:1,identity,head:this.#snapshot!.head,state:'targets-and-assets-ready',scope:'held-local-replacement-only'});
  }finally{if(prepared)prepApi.dispose.call(prepared);if(archive)archiveApi.dispose.call(archive);}
 }
 /** Preview is joint DATA only; every promotion rechecks the current actual
  * head and complete native/packet/asset cut before a new affirmative decision. */
 previewPromotion():Promise<NativeRoomUnionRunPromotionChoice>{
  try{this.#admitPromotion();}catch(error){return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{this.#check();await this.#authenticate();await this.#openJournal();this.#check();const result=await targetsApi.preview.call(this.#targets,this.#options.expected,this.#snapshot!.head,this.#scope!);if(this.#authentication)await this.#scope!.verify();return result;});
  this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 #admitPromotion():void{if(this.#running||this.#taking)throw fail('room_union_run_busy');if(this.#closing||this.#closed||!this.#actors||!this.#scope||targetsApi.ready.call(this.#targets))throw fail('room_union_run_closed');}
 promote(provided:NativeRoomUnionRunPromotionOptions):Promise<NativeRoomUnionRunPromotionResult>{
  let input:NativeRoomUnionRunPromotionOptions,reservation:Promise<void>|undefined;
  // Reflection can execute application proxy traps. Reserve before inspecting
  // any caller input, and never clear another operation's actual task on refusal.
  try{this.#admitPromotion();reservation=Promise.resolve();this.#running=reservation;const raw=fields(provided,['expected','approve','checkAssetAuthority']),expected=unionRunPromotionChoice(raw['expected']);if(typeof raw['approve']!=='function'||typeof raw['checkAssetAuthority']!=='function'||JSON.stringify(expected.identity)!==JSON.stringify(this.#options.expected))throw fail('room_union_run_policy');input={expected,approve:raw['approve'] as NativeRoomUnionRunPromotionOptions['approve'],checkAssetAuthority:raw['checkAssetAuthority'] as ()=>void};}catch(error){if(this.#running===reservation)this.#running=undefined;return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{
   this.#check();const scope=this.#scope!;await this.#authenticate();await this.#readExecution(input.expected.identity.execution);scope.check();await this.#openJournal();scope.check();
   if(JSON.stringify(this.#snapshot!.head)!==JSON.stringify(input.expected.head))throw fail();
   const actual=await targetsApi.preview.call(this.#targets,this.#options.expected,this.#snapshot!.head,scope);scope.check();if(JSON.stringify(actual)!==JSON.stringify(input.expected))throw fail();
   const encoded=recordCutJson(input.expected.approval,MAX_UNION_RUN_METADATA_BYTES),file=new Blob([encoded]);
   const approval=Object.freeze({bytes:file.size,sha256:await scope.base.integrity.digest(file)});scope.check();
   this.#promotion=input.expected;
   const result=await targetsApi.promote.call(this.#targets,this.#actors!,scope,input,async saved=>{
    if(JSON.stringify(saved.choice)!==JSON.stringify(input.expected.approval))throw fail();const handoff=Object.freeze({decisionHead:input.expected.head,approval,approvalFile:saved.selection});this.#handoff=handoff;
    // Persist the exact decision BEFORE the common native/asset/actor barrier.
    // This marker is preparation DATA, deliberately not proof of transfer.
    const current=await journals.read.call(this.#journal!);scope.check();if(JSON.stringify(current.head)!==JSON.stringify(input.expected.head))throw fail();this.#snapshot=current;
    await this.#advance('handoff-prepared',handoff);
    if(this.#authentication)await scope.verify();scope.check();
   });
   // The actual recipient already owns the live successor before any awaited
   // completion I/O. A rejected write leaves it reachable by complete()/close().
   await this.#completeHandoff();return result;
  });this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 async #completeHandoff():Promise<void>{
  this.#check();if(!this.#promotion||!this.#handoff||!targetsApi.ready.call(this.#targets))throw fail('room_union_run_closed');
  targetsApi.confirm.call(this.#targets,this.#promotion);if(this.#completed)return;await this.#openJournal();this.#check();
  const last=this.#snapshot!.events.at(-1)!.event;
  if(JSON.stringify(last.handoff)!==JSON.stringify(this.#handoff)||last.stage!=='handoff-prepared'&&last.stage!=='handoff-observed')throw fail();
  if(last.stage==='handoff-prepared')await this.#advance('handoff-observed',this.#handoff);
  targetsApi.confirm.call(this.#targets,this.#promotion);this.#journalOpened=false;await journals.close.call(this.#journal!);this.#journal=undefined;this.#check();
  releaseSelectedActorExecution(this.#reservation);this.#completed=true;
 }
 /** Cleanup-only continuation after a real transfer; saved stages alone cannot
  * make this callable or acquire authors. Never repeat the actual barrier. */
 complete():Promise<void>{try{if(this.#running||this.#taking)throw fail('room_union_run_busy');if(this.#closing||this.#closed||!targetsApi.ready.call(this.#targets))throw fail('room_union_run_closed');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>this.#completeHandoff());this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 /** Synchronous one-shot take. Finish the old read job while the already-live
  * successor is still reachable in its recipient; cleanup cannot hide it. */
 takeOwner():RetainedSelectedAssetOwner{
  if(this.#running||this.#taking)throw fail('room_union_run_busy');if(this.#closing||this.#closed)throw fail('room_union_run_closed');
  if(!this.#completed||!targetsApi.ready.call(this.#targets))throw fail('room_union_run_closed');this.#taking=true;
  // Synchronous cleanup observers cannot steal this already-owned successor.
  // A callback Close cancels take while leaving real custody in the recipient.
  try{if(this.#scope)scopeClose.call(this.#scope);this.#unwatch();if(this.#closing||this.#closed)throw fail('room_union_run_closed');const owner=targetsApi.take.call(this.#targets);this.#actors=undefined;this.#closed=true;return owner;}finally{this.#taking=false;}
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
