/** A synchronously reachable cold executor owns every fresh actor, original,
 * failed opening and partial target. Stored phases are history DATA, not grants.
 * This resumes existing local execution; it never activates remote serving. */
import type {PhysicalRoomRecordCutSelection} from '../physical_room_record_cut/contract.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {RoomActorAcquisition} from '../persistence/room_actor_acquisition.js';
import {StoppedActorCohort,takeAcquiredActorCohort} from '../persistence/stopped_actor_cohort.js';
import {snapshotColdRootResumeOptions} from '../cold_room_recovery/root_policy.js';
import {snapshotPhysicalOperationV3Policy} from '../physical_room_operation_v3/policy_snapshot.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {checkRichAssetLimits} from '@breditor/experimental-rich-content';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {RoomExecutionArchive} from '../native_room_execution/archive.js';
import {readRoomExecution} from '../native_room_execution/coordinator.js';
import {withExecutionPrepared} from '../native_room_execution/prepared_scope.js';
import {LoadedNativeReconstructionCurrent as Loaded} from '../selected_native_reconstruction/loaded_current.js';
import {RoomRunJournalResources} from '../native_room_execution_run/journal_resources.js';
import {RoomRunTargets} from '../native_room_execution_run/recover_targets.js';
import {roomRunIdentity} from '../native_room_execution_run/identity.js';
import {roomRunPromotionChoice} from '../native_room_execution_run/promotion_choice.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {fields,database,fail} from '../native_room_execution/policy.js';
import {recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {coldRoomExecutionPlan} from './plan.js';
import {ColdRoomExecutionSource} from './source.js';
import {verifyColdRoomExecutionSource} from './verify_source.js';
import {coldRoomExecutionChoice} from './choice.js';
import type {ColdRoomExecutionOptions,ColdRoomExecutionPreview,ColdRoomExecutionRunOptions,ColdRoomOriginalRepairChoice} from './contract.js';
import type {RoomRunSnapshot,RoomRunStage,RoomRunResult,RoomRunPromotionChoice,RoomRunPromotionOptions,RoomRunPromotionResult} from '../native_room_execution_run/contract.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
const actor={begin:RoomActorAcquisition.begin,acquire:RoomActorAcquisition.prototype.acquire,close:RoomActorAcquisition.prototype.close,bindings:StoppedActorCohort.prototype.bindings,release:StoppedActorCohort.prototype.close},targets={metadata:RoomRunTargets.prototype.visitMetadataTarget,recover:RoomRunTargets.prototype.recover,preview:RoomRunTargets.prototype.preview,promote:RoomRunTargets.prototype.promote,ready:RoomRunTargets.prototype.hasSuccessor,take:RoomRunTargets.prototype.takeOwner,close:RoomRunTargets.prototype.close};
const journals={open:RoomRunJournalResources.prototype.open,read:RoomRunJournalResources.prototype.read,append:RoomRunJournalResources.prototype.append,close:RoomRunJournalResources.prototype.close},scopeClose=RoomExecutionReadScope.prototype.close,add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,abort=AbortController.prototype.abort,key=Object.freeze({});
/** Actual cold recipient visit; a saved execution/receipt cannot create it. */
export interface ColdRoomMetadataTargetWork {
 readonly scope:SelectedNativeRecoveryScope;
 readonly identity:import('../native_room_execution_run/contract.js').RoomRunIdentity;
 readonly approved:PhysicalRoomRecordCutSelection;
 check():void;
}
let visitColdTarget:<T>(owner:ColdRoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,visit:(work:ColdRoomMetadataTargetWork)=>Promise<T>)=>Promise<T>;
/** SDK composition only. The genuine cold attempt retains the promoted root
 * throughout this finite visit; no actor or editor owner is returned. */
export const withColdRoomExecutionTarget=<T>(owner:ColdRoomExecutionAttempt,reads:PhysicalOperationV3HistoryReadOptions,visit:(work:ColdRoomMetadataTargetWork)=>Promise<T>):Promise<T>=>visitColdTarget(owner,reads,visit);
export class ColdRoomExecutionAttempt{
 readonly #options;readonly #preparedStart:boolean;readonly #targets=new RoomRunTargets();readonly #stop=new AbortController();readonly #targetStop=new AbortController();readonly #unwatch:(()=>void)[]=[];
 #factory:IDBFactory|undefined;#locks:LockManager|undefined;#scope:RoomExecutionReadScope|undefined;#plan:Awaited<ReturnType<typeof coldRoomExecutionPlan>>|undefined;#acquisition:RoomActorAcquisition|undefined;#actors:StoppedActorCohort|undefined;#source:ColdRoomExecutionSource|undefined;
 #approvedMetadataTarget:PhysicalRoomRecordCutSelection|undefined;
 #journal:RoomRunJournalResources|undefined;#journalOpened=false;#snapshot:RoomRunSnapshot|undefined;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#taking=false;#closing=false;#closed=false;#originalCleanupDone=false;
 private constructor(token:object,input:ColdRoomExecutionOptions,preparedStart=false){if(token!==key)throw fail('room_execution_policy');this.#preparedStart=preparedStart;const row=fields(input,['original','run','reads','sourceIntentDatabase']),run=fields(row['run'],['expected','participants']),reads=fields(row['reads'],['wasm','reads','checkAuthority'],['signal','assets']),fresh=snapshotPhysicalHistoryReadOptions({reads:reads['reads'] as ColdRoomExecutionOptions['reads']['reads'],checkAuthority:reads['checkAuthority'] as ()=>void,...(reads['signal']!==undefined?{signal:reads['signal'] as AbortSignal}:{})}),assets=reads['assets']===undefined?undefined:fields(reads['assets'],[],['limits','signal']),limits=checkRichAssetLimits(assets?.['limits'] as Parameters<typeof checkRichAssetLimits>[0]);
  this.#options=Object.freeze({original:snapshotColdRootResumeOptions(row['original'] as ColdRoomExecutionOptions['original']),run:Object.freeze({expected:roomRunIdentity(run['expected']),participants:snapshotPhysicalOperationV3Policy(run['participants'] as ColdRoomExecutionOptions['run']['participants'])}),reads:{...fresh,wasm:reads['wasm'] as ColdRoomExecutionOptions['reads']['wasm'],...(assets?{assets:{limits,...(assets['signal']!==undefined?{signal:assets['signal'] as AbortSignal}:{})}}:{})},sourceIntentDatabase:database(row['sourceIntentDatabase'])});Object.freeze(this);
 }
 /** No old editor, asset owner, stopped flag or surviving cohort is accepted. */
 static resume(input:ColdRoomExecutionOptions):ColdRoomExecutionAttempt{return new ColdRoomExecutionAttempt(key,input);}
 /** Explicit absent-only start from an existing immutable preparation and
  * execution. Construction stays data-free. The first preview creates only
  * the start journal; real actors, original reads and fresh decisions still
  * precede any target. Existing resume never creates a missing journal. */
 static beginPrepared(input:ColdRoomExecutionOptions):ColdRoomExecutionAttempt{return new ColdRoomExecutionAttempt(key,input,true);}
 #admit=()=>{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||targets.ready.call(this.#targets))throw fail('room_execution_closed');};
 #check=()=>{if(this.#closing||this.#closed||this.#stop.signal.aborted)throw fail('room_execution_closed');this.#scope?.check();if(this.#closing||this.#closed||this.#stop.signal.aborted)throw fail('room_execution_closed');};
 #start(){if(this.#scope)return;for(const unwatch of this.#unwatch)unwatch();this.#unwatch.length=0;this.#factory??=recoveryOpeningContext();this.#locks??=navigator.locks;for(const signal of new Set([this.#options.original.signal,this.#options.reads.signal,this.#options.reads.assets?.signal].filter((value):value is AbortSignal=>value!==undefined))){const cancel=()=>this.#stop.abort();if(signal.aborted)cancel();else{add.call(signal,'abort',cancel,{once:true});this.#unwatch.push(()=>remove.call(signal,'abort',cancel));}}
  const input=this.#options.reads,current=()=>{if(globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_execution_policy');};this.#scope=new RoomExecutionReadScope({...input,checkAuthority:()=>{current();input.checkAuthority();current();this.#options.original.checkAuthority();current();input.checkAuthority();current();},signal:this.#stop.signal});
 }
 async #load():Promise<RoomExecutionArchive>{this.#check();this.#start();this.#check();const scope=this.#scope!,choice=this.#options.run.expected.execution,input={wasm:scope.integrity.wasm,reads:scope.reads,checkAuthority:scope.check,signal:scope.signal,...(scope.assets?{assets:scope.assets}:{})},saved=await readRoomExecution(choice,input);scope.check();return RoomExecutionArchive.read(saved.file,choice,input);}
 async #open(archive:RoomExecutionArchive){this.#check();const scope=this.#scope!;
  if(!this.#plan){this.#plan=await coldRoomExecutionPlan(archive,this.#options,scope);this.#check();}
  if(!this.#journalOpened){if(this.#journal){await journals.close.call(this.#journal);this.#journal=undefined;}this.#journal=new RoomRunJournalResources();this.#snapshot=await journals.open.call(this.#journal,this.#options.run.expected,{wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal},this.#preparedStart);this.#journalOpened=true;}else this.#snapshot=await journals.read.call(this.#journal!);this.#check();
  if(!this.#acquisition)this.#acquisition=actor.begin.call(RoomActorAcquisition,{room:this.#plan.room,members:this.#plan.members,checkAuthority:scope.check,signal:scope.signal});
  if(!this.#actors){await actor.acquire.call(this.#acquisition);this.#check();this.#actors=takeAcquiredActorCohort(this.#acquisition);}actor.bindings.call(this.#actors);this.#check();
  if(!this.#source)this.#source=new ColdRoomExecutionSource(this.#plan,this.#options.original,this.#actors,scope,this.#options.sourceIntentDatabase);
 }
 async #inspect(archive:RoomExecutionArchive):Promise<ColdRoomExecutionPreview>{await this.#open(archive);const scope=this.#scope!,current=await this.#source!.capture();this.#check();const loaded=await Loaded.read(current,{wasm:scope.integrity.wasm,checkAuthority:scope.check,signal:scope.signal});
  try{await withExecutionPrepared(archive.preparation(),scope,context=>verifyColdRoomExecutionSource(loaded,context.before,context.retained,scope));this.#check();return Object.freeze({current,choice:coldRoomExecutionChoice({format:'breditor/cold-room-execution-choice',formatVersion:1,identity:this.#options.run.expected,head:this.#snapshot!.head,original:current.selection})});}finally{loaded.dispose();}
 }
 async #decision<T>(choice:T,approve:(choice:T)=>boolean|Promise<boolean>){const scope=this.#scope!;await decideFreshAssetChoice(choice,approve,{check:this.#check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});this.#check();}
 async #advance(stage:Exclude<RoomRunStage,'start'>){this.#check();this.#snapshot=await journals.append.call(this.#journal!,this.#snapshot!,stage);this.#check();}
 /** Complete-existing inspection only. It neither ACKs pending work nor starts
  * a target. A corrupt/unknown original stays intact for reconciliation. */
 preview():Promise<ColdRoomExecutionPreview>{try{this.#admit();}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(async()=>{const archive=await this.#load();try{return await this.#inspect(archive);}finally{archive.dispose();}});this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 /** Repair is an explicit separate fresh decision. It may ACK genuine pending
  * original journals, never a destination. A fresh preview/run is still needed. */
 repairOriginal(approve:(choice:ColdRoomOriginalRepairChoice)=>boolean|Promise<boolean>):Promise<void>{try{this.#admit();if(typeof approve!=='function')throw fail('room_execution_policy');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(async()=>{const archive=await this.#load();try{await this.#open(archive);await this.#decision(Object.freeze({format:'breditor/cold-room-original-repair-choice' as const,formatVersion:1 as const,identity:this.#options.run.expected,head:this.#snapshot!.head,originalDatabase:this.#options.original.database,scope:'repair-existing-original-only' as const}),approve);await this.#source!.repair();this.#check();}finally{archive.dispose();}});this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 run(provided:ColdRoomExecutionRunOptions):Promise<RoomRunResult>{let input:ColdRoomExecutionRunOptions,reservation:Promise<void>|undefined;try{this.#admit();reservation=Promise.resolve();this.#running=reservation;const row=fields(provided,['expected','approve']),expected=coldRoomExecutionChoice(row['expected']);if(typeof row['approve']!=='function'||JSON.stringify(expected.identity)!==JSON.stringify(this.#options.run.expected))throw fail('room_execution_policy');input={expected,approve:row['approve'] as ColdRoomExecutionRunOptions['approve']};}catch(error){if(this.#running===reservation)this.#running=undefined;return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{const archive=await this.#load();try{const first=await this.#inspect(archive);if(JSON.stringify(first.choice)!==JSON.stringify(input.expected))throw fail();await this.#decision(first.choice,input.approve);const actual=await this.#inspect(archive);if(JSON.stringify(actual.choice)!==JSON.stringify(input.expected))throw fail();await this.#source!.sealNative();this.#check();await this.#advance('resume');
   // A historical retired row is DATA, not retirement of these new handles.
   // The actual original above has closed; only now may targets borrow actors.
   await targets.recover.call(this.#targets,archive,this.#options.run.expected,this.#options.run.participants,this.#actors!,this.#scope!,stage=>this.#snapshot!.events.some(row=>row.event.stage===stage),stage=>this.#advance(stage));this.#check();this.#journal!.check();actor.bindings.call(this.#actors!);
   return Object.freeze({format:'breditor/native-room-run-result' as const,formatVersion:1 as const,identity:this.#options.run.expected,head:this.#snapshot!.head,state:'targets-and-assets-ready' as const,scope:'held-local-replacement-only' as const});
  }finally{archive.dispose();}});this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 previewPromotion():Promise<RoomRunPromotionChoice>{try{this.#admit();if(!this.#actors||!this.#scope)throw fail('room_execution_closed');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(async()=>{const archive=await this.#load();try{await this.#open(archive);return await targets.preview.call(this.#targets,this.#options.run.expected,this.#snapshot!.head,this.#scope!);}finally{archive.dispose();}});this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 promote(provided:RoomRunPromotionOptions):Promise<RoomRunPromotionResult>{let input:RoomRunPromotionOptions,reservation:Promise<void>|undefined;try{this.#admit();if(!this.#actors||!this.#scope)throw fail('room_execution_closed');reservation=Promise.resolve();this.#running=reservation;const row=fields(provided,['expected','approve','checkAssetAuthority']),expected=roomRunPromotionChoice(row['expected']);if(typeof row['approve']!=='function'||typeof row['checkAssetAuthority']!=='function'||JSON.stringify(expected.identity)!==JSON.stringify(this.#options.run.expected))throw fail('room_execution_policy');input={expected,approve:row['approve'] as RoomRunPromotionOptions['approve'],checkAssetAuthority:row['checkAssetAuthority'] as ()=>void};}catch(error){if(this.#running===reservation)this.#running=undefined;return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{const archive=await this.#load();try{await this.#inspect(archive);if(JSON.stringify(this.#snapshot!.head)!==JSON.stringify(input.expected.head))throw fail();const actual=await targets.preview.call(this.#targets,this.#options.run.expected,this.#snapshot!.head,this.#scope!);this.#check();if(JSON.stringify(actual)!==JSON.stringify(input.expected))throw fail();const result=await targets.promote.call(this.#targets,this.#actors!,this.#scope!,input,async()=>{await this.#source!.capture();const saved=await journals.read.call(this.#journal!);this.#check();if(JSON.stringify(saved.head)!==JSON.stringify(input.expected.head))throw fail();this.#journalOpened=false;await journals.close.call(this.#journal!);this.#journal=undefined;this.#check();});
   // The genuine successor is already reachable in its recipient. Cleanup
   // failure must never strand it behind a second promotion attempt.
   this.#approvedMetadataTarget=result.choice.approval.cut;await this.#completeOriginal();return result;
  }finally{archive.dispose();}});this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 async #completeOriginal(){if(this.#source){await this.#source.close();this.#source=undefined;}this.#originalCleanupDone=true;}
 /** Promotion ends construction authority. A completed reader may be
  * cancelled while its genuine successor remains reachable in this recipient.
  * Target work uses a fresh supplied read scope and this separate lifetime;
  * terminal Close still revokes it synchronously. No saved state admits it. */
 #checkMetadataTarget=()=>{
  if(this.#closing||this.#closed||this.#targetStop.signal.aborted||!this.#originalCleanupDone||!targets.ready.call(this.#targets)||!this.#approvedMetadataTarget)throw fail('room_execution_closed');
 };
 /** The actual target and its actors stay private. Finish original cleanup
  * before admitting metadata; a persisted promotion row is never sufficient. */
 #visitMetadata<T>(provided:PhysicalOperationV3HistoryReadOptions,visit:(work:ColdRoomMetadataTargetWork)=>Promise<T>):Promise<T>{
  try{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||!this.#originalCleanupDone||!targets.ready.call(this.#targets)||!this.#approvedMetadataTarget||typeof visit!=='function')throw fail('room_execution_closed');}catch(error){return Promise.reject(error);}
  let reads:PhysicalOperationV3HistoryReadOptions|undefined,error:unknown;
  const controller=new AbortController(),unwatch:(()=>void)[]=[];
  // Publish the real operation before reflecting on host options. A reentrant
  // Take/Close cannot extract the successor during admission or a late visit.
  const task=Promise.resolve().then(async()=>{
   if(!reads)throw error;this.#checkMetadataTarget();
   return targets.metadata.call(this.#targets,reads,async scope=>{
    const check=()=>{this.#checkMetadataTarget();scope.check();this.#checkMetadataTarget();};check();
    const result=await visit(Object.freeze({scope,identity:this.#options.run.expected,approved:this.#approvedMetadataTarget!,check}));check();return result;
   }) as Promise<T>;
  });this.#running=task;
  try{
   const chosen=snapshotPhysicalHistoryReadOptions(provided);
   for(const signal of [this.#targetStop.signal,chosen.signal])if(signal){const cancel=()=>controller.abort();if(signal.aborted)cancel();else{add.call(signal,'abort',cancel,{once:true});unwatch.push(()=>remove.call(signal,'abort',cancel));}}
   reads={...chosen,signal:controller.signal,checkAuthority:()=>{this.#checkMetadataTarget();chosen.checkAuthority();this.#checkMetadataTarget();}};
  }catch(reason){error=reason;}
  return task.finally(()=>{for(const stop of unwatch)stop();controller.abort();if(this.#running===task)this.#running=undefined;});
 }
 static{visitColdTarget=(owner,reads,visit)=>{if(!owner||typeof owner!=='object'||!(#targets in owner))return Promise.reject(fail('room_execution_policy'));return owner.#visitMetadata(reads,visit);};}
 /** Cleanup-only retry AFTER the common barrier. Never rerun native promotion. */
 complete():Promise<void>{try{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||!targets.ready.call(this.#targets))throw fail('room_execution_closed');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>this.#completeOriginal());this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 takeOwner():RetainedSelectedAssetOwner{if(this.#running||this.#taking)throw fail('room_execution_busy');if(this.#closing||this.#closed||!this.#originalCleanupDone||!targets.ready.call(this.#targets))throw fail('room_execution_closed');this.#taking=true;try{if(this.#scope)scopeClose.call(this.#scope);for(const stop of this.#unwatch)stop();this.#unwatch.length=0;if(this.#closing||this.#closed)throw fail('room_execution_closed');const owner=targets.take.call(this.#targets);this.#actors=undefined;this.#acquisition=undefined;this.#plan=undefined;this.#closed=true;return owner;}finally{this.#taking=false;}}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let start!:()=>void,stopError:unknown,stopFailed=false;const gate=new Promise<void>(resolve=>{start=resolve;});this.#cleanup=gate.then(async()=>{await this.#running?.catch(()=>{});await targets.close.call(this.#targets);if(this.#source){await this.#source.close();this.#source=undefined;}if(this.#journal){await journals.close.call(this.#journal);this.#journal=undefined;}if(this.#actors){await actor.release.call(this.#actors);this.#actors=undefined;}if(this.#acquisition){await actor.close.call(this.#acquisition);this.#acquisition=undefined;}for(const stop of this.#unwatch)stop();this.#unwatch.length=0;if(stopFailed)throw stopError;this.#closed=true;}).finally(()=>{this.#cleanup=undefined;});try{for(const stop of [()=>abort.call(this.#targetStop),()=>abort.call(this.#stop),()=>this.#scope&&scopeClose.call(this.#scope)])try{stop();}catch(error){if(!stopFailed){stopFailed=true;stopError=error;}}}finally{start();}return this.#cleanup;}
}
