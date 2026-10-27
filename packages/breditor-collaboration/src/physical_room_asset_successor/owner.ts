/** SDK-private same-native selected-asset ownership for warm transfer and cold
 * resume. Genuine retained resources, fresh decisions and participant policies
 * are required; saved approval is immutable data, not provider/server authority. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetReconciledBase} from '@breditor/experimental-rich-content';
import {closeRetainedPhysicalKeepingActors,takeRetainedPhysicalActors,retainedPhysicalHasActors} from '../physical_room_operation_v3/retained_root.js';
import type {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import {RetainedPhysicalRoot} from '../physical_room_operation_v3/retained_root.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import type {PhysicalRoomRecordCutFile} from '../physical_room_record_cut/contract.js';
import {snapshotPhysicalHistoryReadOptions} from '../physical_room_operation_v3/history_read.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import type {SharedSelectionPolicy} from '../types.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {sameAdoptionBytes} from '../physical_room_asset_adoption/storage.js';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {RoomAssetApprovalFile} from '../physical_room_asset_approval/contract.js';
import type {SelectedAssetBasis} from './custody.js';
import {selectedAssetPort,type SelectedAssetPort} from './asset_port.js';
import {waitSelectedAssetWork} from './wait_work.js';
import {verifySelectedUploadContinuation} from './asset_continuation.js';
import {fail} from '../physical_room_asset_adoption/policy.js';
import type {SharedPhysicalRoomRecoveryHost} from '../physical_recovery_control/host.js';
import {selectedRoomProvider} from '../selected_room_provider/check.js';
import type {SelectedRoomProviderRead} from '../selected_room_provider/contract.js';
import type {PhysicalRecordCutVisit} from '../physical_room_operation_v3/record_cut.js';
import type {SelectedRoomReconciliationRead,SelectedNativeCutWitness} from '../selected_room_reconciliation/contract.js';
import {frozen} from '../room_participant_inventory/policy.js';
import {OperationalReadCancellation} from '../operation_read/cancellation.js';
import {reserveNativeRecovery} from '../core.js';
import type {NativeRecoveryReservation} from '../native_recovery/contract.js';
import {nativeRecoveryFailure} from '../native_recovery/policy.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {waitNativePendingWork} from '../native_pending_work.js';
import {visitRetainedPhysicalFinalCut} from '../physical_room_operation_v3/retained_root.js';
import type {FinalNativeCutWitness} from '../complete_operation_cohort/final_native_cut.js';
import {encodeSelectedRoomCurrent} from '../selected_room_current/archive.js';
import {retainExtendingSelectedCurrent,retainExtendingSelectedCurrents} from '../selected_native_recovery/continuation.js';
const visitReconciliation=RetainedPhysicalRoot.prototype.visitReconciliationRecordCut,catalogMetadata=RetainedPhysicalRoot.prototype.catalogMetadata,closeFinalCancellation=OperationalReadCancellation.prototype.close;
const closeRoot=RetainedPhysicalRoot.prototype.close,discardRoot=RetainedPhysicalRoot.prototype.discardAndClose;
const rootClients=Object.getOwnPropertyDescriptor(RetainedPhysicalRoot.prototype,'clients')!.get!,visitRecordCut=RetainedPhysicalRoot.prototype.visitRecordCut;
const methods={check:RichAssetStore.prototype.checkOpen,acquire:RichAssetStore.prototype.acquireRecoveryCustody,capture:RichAssetStore.prototype.captureBackup,close:RichAssetStore.prototype.close,held:RichAssetStoreCustody.prototype.check,release:RichAssetStoreCustody.prototype.release,finish:RichAssetStoreCustody.prototype.close};
const base={read:RichAssetReconciledBase.read,verify:RichAssetReconciledBase.prototype.verifySuccessor,dispose:RichAssetReconciledBase.prototype.dispose};
const key=Object.freeze({});
export interface SelectedAssetCurrentCut{
 readonly approval:RoomAssetApprovalFile;
 readonly root:PhysicalRoomRecordCutFile;
 readonly uploads:readonly Readonly<{id:string;database:string;file:Blob;sha256:string}>[];
}
export interface PreparedSelectedAssetOwner{readonly value:RetainedSelectedAssetOwner;check():void;activate():void;abandon():Promise<void>}
let prepare:(root:RetainedPhysicalRoot,record:RoomAssetAdoptionRecord,basis:SelectedAssetBasis,approval:RoomAssetApprovalFile,authority:()=>void)=>PreparedSelectedAssetOwner;
export const prepareSelectedAssetOwner=(root:RetainedPhysicalRoot,record:RoomAssetAdoptionRecord,basis:SelectedAssetBasis,approval:RoomAssetApprovalFile,authority:()=>void)=>prepare(root,record,basis,approval,authority);
let withNativeRecovery:<P extends SharedSelectionPolicy,T>(owner:RetainedSelectedAssetOwner,input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>)=>Promise<T>;
let withNativeExecution:typeof withNativeRecovery;
let withNativeRetirement:typeof withNativeRecovery;
let withActorRetirement:typeof withNativeRecovery;
let reserveActorExecution:(owner:RetainedSelectedAssetOwner)=>SelectedActorExecutionReservation;
let releaseActorExecution:(owner:RetainedSelectedAssetOwner,token:object)=>void;
let reservationState:(reservation:SelectedActorExecutionReservation)=>Readonly<{owner:RetainedSelectedAssetOwner;token:object}>;
let makeActorExecution:(owner:RetainedSelectedAssetOwner,token:object)=>SelectedActorExecutionReservation;
let reservedRetirement:<P extends SharedSelectionPolicy,T>(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>)=>Promise<T>;
let reservedCleanup:(reservation:SelectedActorExecutionReservation)=>Promise<void>;
let reservedTake:(reservation:SelectedActorExecutionReservation)=>StoppedActorCohort;
/** One actual old-owner reservation, not a stage/identity map. Other attempts,
 * ordinary retirement and ordinary Close cannot consume it concurrently. */
export class SelectedActorExecutionReservation {
 readonly #owner:RetainedSelectedAssetOwner;readonly #token:object;#released=false;
 private constructor(owner:RetainedSelectedAssetOwner,token:object){this.#owner=owner;this.#token=token;Object.freeze(this);}
 release():void{if(this.#released)return;releaseActorExecution(this.#owner,this.#token);this.#released=true;}
 static{makeActorExecution=(owner,token)=>new SelectedActorExecutionReservation(owner,token);
  reservationState=value=>{if(!value||typeof value!=='object'||!(#owner in value)||value.#released)throw fail('asset_adoption_policy');return{owner:value.#owner,token:value.#token};};
 }
}
const releaseExecution=SelectedActorExecutionReservation.prototype.release;
export const reserveSelectedActorExecution=(owner:RetainedSelectedAssetOwner)=>reserveActorExecution(owner);
export const releaseSelectedActorExecution=(reservation:SelectedActorExecutionReservation)=>releaseExecution.call(reservation);
export const withReservedSelectedActorRetirement=<P extends SharedSelectionPolicy,T>(owner:RetainedSelectedAssetOwner,reservation:SelectedActorExecutionReservation,input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>):Promise<T>=>reservedRetirement(owner,reservation,input,visit);
export const retryReservedSelectedActorCleanup=(reservation:SelectedActorExecutionReservation)=>reservedCleanup(reservation);
export const takeReservedSelectedActors=(reservation:SelectedActorExecutionReservation)=>reservedTake(reservation);
let checkSelectedCurrent:(owner:RetainedSelectedAssetOwner)=>void;
let discardSelected:(owner:RetainedSelectedAssetOwner)=>Promise<void>;
/** Genuine active-owner checks/cleanup for internal already-reachable recipients.
 * No public method override or DTO supplies source/selected-store ownership. */
export const checkSelectedAssetOwnerCurrent=(owner:RetainedSelectedAssetOwner)=>checkSelectedCurrent(owner);
export const discardSelectedAssetOwner=(owner:RetainedSelectedAssetOwner)=>discardSelected(owner);
let hasRetiredActors:(owner:RetainedSelectedAssetOwner)=>boolean;
let retryActorCleanup:(owner:RetainedSelectedAssetOwner)=>Promise<void>;
/** Closed SDK cleanup path. Neither a journal marker nor a refused preflight
 * can authorize discarding a still-live original cohort. */
export const selectedOwnerHasRetiredActors=(owner:RetainedSelectedAssetOwner):boolean=>hasRetiredActors(owner);
export const retrySelectedActorCleanup=(owner:RetainedSelectedAssetOwner):Promise<void>=>retryActorCleanup(owner);
let takeRetiredActors:(owner:RetainedSelectedAssetOwner)=>StoppedActorCohort;
/** Trusted coordinator composition only. Data, public overrides and copied
 * methods cannot supply native clients, root custody or a selected store set. */
export const withSelectedNativeRecovery=<P extends SharedSelectionPolicy,T>(owner:RetainedSelectedAssetOwner,input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>):Promise<T>=>withNativeRecovery(owner,input,visit);
/** Internal durable-execution composition. The coordinator must retain input
 * and a prepared journal BEFORE admission. After any admission attempt, every
 * failed handoff retires all real members before exclusion is released. */
export const withSelectedNativeExecution:typeof withSelectedNativeRecovery=(owner,input,visit)=>withNativeExecution(owner,input,visit);
/** Trusted explicit retirement, not an import or activation. The coordinator
 * must re-admit complete durable reconstruction DATA and obtain a fresh decision.
 * All members retire synchronously before native exclusion releases; actual
 * cleanup is awaited only after the visitor completion promise is released. */
export const withSelectedNativeRetirement:typeof withSelectedNativeRecovery=(owner,input,visit)=>withNativeRetirement(owner,input,visit);
/** Private retained-actor alternative; ordinary retirement keeps its original
 * release semantics. The trusted coordinator must admit durable complete data
 * and obtain fresh approval before returning from the visitor. */
export const withSelectedNativeActorRetirement:typeof withSelectedNativeRecovery=(owner,input,visit)=>withActorRetirement(owner,input,visit);
export const takeSelectedRetiredActors=(owner:RetainedSelectedAssetOwner):StoppedActorCohort=>takeRetiredActors(owner);
export class RetainedSelectedAssetOwner{
 readonly #root;readonly #record;readonly #basis;readonly #approval;readonly #authority;
 readonly #ports=new Map<string,ReturnType<typeof selectedAssetPort>>();
 readonly #readCleanup=new RecoveryCleanupScope(()=>fail());
 readonly #closingListeners=new Set<()=>void>();
 #uploadBaseline:ReadonlyMap<string,Blob>|undefined;
 #active=false;#closing=false;#closed=false;#busy=false;#checking=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:boolean|undefined;
 #nativeRecoveryToken:object|undefined;#actorExecution:object|undefined;
 private constructor(token:object,root:RetainedPhysicalRoot,record:RoomAssetAdoptionRecord,basis:SelectedAssetBasis,approval:RoomAssetApprovalFile,authority:()=>void){
  if(token!==key)throw fail('asset_adoption_policy');this.#root=root;this.#record=record;this.#basis=basis;this.#approval=approval;this.#authority=participantAuthority(authority);this.#uploadBaseline=basis.currentUploads?new Map(basis.currentUploads):undefined;
  for(const row of record.participants){const target=basis.resources.targets.get(row.id);if(!target)throw fail('asset_adoption_missing');this.#ports.set(row.id,selectedAssetPort(target.store,this.#assetPermission));}Object.freeze(this);
 }
 #current=()=>{if(!this.#active||this.#closing||this.#closed)throw fail('asset_adoption_closed');this.#basis.current();checkRecoveryLeasesHeld([this.#basis.resources.lease!,...this.#basis.resources.targetLeases.values()]);for(const target of this.#basis.resources.targets.values())methods.check.call(target.store);};
 #assetPermission=()=>{this.#current();if(this.#busy||this.#checking)throw fail('asset_adoption_busy');this.#checking=true;try{this.#authority();this.#current();if(this.#busy)throw fail('asset_adoption_busy');}finally{this.#checking=false;}};
 get clients(){this.#current();return this.#root.clients;}
 assets(id:string):SelectedAssetPort{this.#current();const port=this.#ports.get(id);if(!port)throw fail('asset_adoption_policy');return port.port;}
 approval():RoomAssetApprovalFile{this.#current();return this.#approval;}
 async #retained(check:()=>void,signal?:AbortSignal):Promise<void>{
  check();const saved=await this.#basis.resources.store!.readFresh(check,signal);check();
  if(JSON.stringify(saved.record)!==JSON.stringify(this.#record)||saved.files.size!==this.#basis.files.size||[...saved.files].some(([id,bytes])=>!sameAdoptionBytes(this.#basis.files.get(id),bytes)))throw fail('asset_adoption_diverged');
  await this.#basis.resources.intent?.verifyFresh(check,signal);check();
 }
 /** Keeps the approved baseline separately from CURRENT complete records and
  * CURRENT selected uploads. Both losing asset inputs remain in approval. */
 capture<P extends SharedSelectionPolicy>(input:PhysicalOperationV3HistoryReadOptions<P>):Promise<SelectedAssetCurrentCut>{
  return this.#visit(input,async cut=>cut,false);
 }
 /** Authenticated point-in-time availability of both whole upload generations.
  * No queue changes, implicit uploads, registration closure or activation. */
 readHistoryAssets<P extends SharedSelectionPolicy>(host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions<P>):Promise<SelectedRoomProviderRead>{
  try{return this.#visit(input,selectedRoomProvider(host,this.#root.catalogMetadata(),this.#record),true);}catch(error){return Promise.reject(error);}
 }
 /** Complete native/source/whole-upload evidence at one fresh authenticated
  * cut. Missing peers or unbound comments stay pending; this grants no edits,
  * connection, acknowledgement, credential, adoption or room activation. */
 readReconciliation<P extends SharedSelectionPolicy>(host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions<P>):Promise<SelectedRoomReconciliationRead>{
  try{return this.#reconciliation(host,input);}catch(error){return Promise.reject(error);}
 }
 #reconciliation<P extends SharedSelectionPolicy>(host:SharedPhysicalRoomRecoveryHost,input:PhysicalOperationV3HistoryReadOptions<P>,recovery?:object):Promise<SelectedRoomReconciliationRead>{
  try{const provider=selectedRoomProvider(host,catalogMetadata.call(this.#root),this.#record);return this.#visit(input,async(cut,scope,check,native)=>{if(!native)throw fail('asset_adoption_policy');const result=await provider(cut,scope,check);check();native.finalCheck();return frozen(structuredClone({format:'breditor/selected-room-reconciliation-read' as const,formatVersion:1 as const,scope:'held-complete-native-source-and-whole-uploads-at-authenticated-cut' as const,kind:native.data.kind==='covered'&&result.kind==='checked'?'checked' as const:'pending' as const,native:native.data,provider:result}));},true,true,recovery);}catch(error){return Promise.reject(error);}
 }
 #recover<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>,quarantine=false,retireOnSuccess=false,keepActors=false,actorExecution?:object):Promise<T>{
  try{this.#current();if(this.#actorExecution&&this.#actorExecution!==actorExecution)throw fail('asset_adoption_busy');if(this.#busy||this.#checking)throw fail('asset_adoption_busy');if(typeof visit!=='function')throw fail('asset_adoption_policy');}catch(error){return Promise.reject(error);}
  this.#busy=true;const token=Object.freeze({});this.#nativeRecoveryToken=token;let finished!:()=>void;this.#running=new Promise<void>(resolve=>{finished=resolve;});
  let native:NativeRecoveryReservation|undefined,chosen:PhysicalOperationV3HistoryReadOptions<P>,clients:SelectedNativeRecoveryScope['clients'],finalCancellation:OperationalReadCancellation|undefined,attempted=false,closing:Promise<void>|undefined,finalCut:FinalNativeCutWitness|undefined,finalCutRelease:ReturnType<RecoveryCleanupScope['retain']>|undefined;
  const release=()=>{native?.close();this.#nativeRecoveryToken=undefined;this.#running=undefined;this.#busy=false;finished();};
  try{clients=Object.freeze((rootClients.call(this.#root) as SelectedNativeRecoveryScope['clients']).map(row=>Object.freeze({...row})));native=reserveNativeRecovery(clients.map(row=>row.core));chosen=snapshotPhysicalHistoryReadOptions(input);this.#current();native.check();}catch(error){release();return Promise.reject(error);}
  const work=(async()=>{const controller=new AbortController(),cancel=()=>controller.abort();let caller:PhysicalOperationV3Cancellation|undefined,observation:PhysicalOperationV3Cancellation|undefined,unwatch=()=>{},active=true,phase=false,authorizing=false,reading:Promise<unknown>|undefined;
   const check=()=>{if(!active)throw nativeRecoveryFailure('native_recovery_closed');this.#current();caller!.check();observation!.check();native!.check();this.#current();},authorize=()=>{check();if(authorizing)throw nativeRecoveryFailure('native_recovery_busy');authorizing=true;try{chosen.checkAuthority();check();}finally{authorizing=false;}};
   const readingPhase=<R>(read:()=>Promise<R>):Promise<R>=>{try{check();if(phase||authorizing)throw nativeRecoveryFailure('native_recovery_busy');}catch(error){return Promise.reject(error);}phase=true;let task:Promise<R>;try{task=read();}catch(error){task=Promise.reject(error);}const result=task.then(value=>{check();return value;}).finally(()=>{if(reading===result){reading=undefined;phase=false;}});reading=result;return result;};
   const importCheck=()=>{check();if(phase||authorizing)throw nativeRecoveryFailure('native_recovery_busy');authorize();};
   this.#closingListeners.add(cancel);
   try{finalCancellation=new OperationalReadCancellation(chosen.signal);caller=new PhysicalOperationV3Cancellation(chosen.signal);observation=new PhysicalOperationV3Cancellation(controller.signal);unwatch=caller.watch(cancel);authorize();await this.#readCleanup.drain();check();
    await waitSelectedAssetWork(Promise.all([...this.#ports.values()].map(port=>port.settle())),check,notify=>observation!.watch(notify));
    await Promise.all(clients.map(row=>waitNativePendingWork(row.core,{check,watch:notify=>observation!.watch(notify)})));authorize();
    const readOptions={...chosen,signal:controller.signal,checkAuthority:authorize},imports:SelectedNativeRecoveryScope['native']=Object.freeze({check:importCheck,
     receiveDocument<Q extends SharedSelectionPolicy>(core:import('../core.js').SharedRichEditor<Q>,frame:string){importCheck();attempted=true;const value=native!.receiveDocument(core,frame);authorize();return value;},
     reconcileDocumentBranch<Q extends SharedSelectionPolicy,R extends SharedSelectionPolicy>(core:import('../core.js').SharedRichEditor<Q>,source:import('../core.js').SharedRichEditor<R>){importCheck();attempted=true;const value=native!.reconcileDocumentBranch(core,source);authorize();return value;},
     reconcileNativeBranch<Q extends SharedSelectionPolicy,R extends SharedSelectionPolicy>(core:import('../core.js').SharedRichEditor<Q>,source:import('../core.js').SharedRichEditor<R>,authorizations:readonly import('../native_branch_union_types.js').SharedNativeBranchUnionAuthorization[]){importCheck();attempted=true;const value=native!.reconcileNativeBranch(core,source,authorizations);authorize();return value;},
     receiveReview<Q extends SharedSelectionPolicy>(core:import('../core.js').SharedRichEditor<Q>,frame:string,verified:import('../review_types.js').SharedReviewPolicy){importCheck();attempted=true;const value=native!.receiveReview(core,frame,verified);authorize();return value;},
    }),scope:SelectedNativeRecoveryScope=Object.freeze({clients,native:imports,signal:controller.signal,check,capture:()=>readingPhase(()=>this.#visit(readOptions,async cut=>cut,false,undefined,token)),retainCurrent:()=>readingPhase(()=>this.#visit(readOptions,async(cut,held,current)=>Object.freeze({current:await encodeSelectedRoomCurrent(cut,{wasm:held.wasm,checkAuthority:()=>{authorize();current();},signal:controller.signal}),integrity:Object.freeze({wasm:held.wasm,checkAuthority:authorize,signal:controller.signal})}),false,undefined,token)),retainRetirementCurrent:()=>readingPhase(()=>{if(!retireOnSuccess||finalCut)throw fail('asset_adoption_policy');return this.#visit(readOptions,async(cut,held,current)=>{if(!held.retainFinalNative)throw fail('asset_adoption_policy');finalCut=held.retainFinalNative();const selected=finalCut;finalCutRelease=this.#readCleanup.retain(async()=>selected.dispose());return Object.freeze({current:await encodeSelectedRoomCurrent(cut,{wasm:held.wasm,checkAuthority:()=>{authorize();current();},signal:controller.signal}),integrity:Object.freeze({wasm:held.wasm,checkAuthority:authorize,signal:controller.signal})});},false,undefined,token,true);}),retainExtending:(previous:import('../selected_room_current/contract.js').SelectedRoomCurrentFile)=>readingPhase(()=>this.#visit(readOptions,(cut,held,current)=>retainExtendingSelectedCurrent(previous,cut,held,readOptions,clients,authorize,current),false,undefined,token)),retainExtendingAll:(previous:readonly import('../selected_room_current/contract.js').SelectedRoomCurrentFile[])=>readingPhase(()=>this.#visit(readOptions,(cut,held,current)=>retainExtendingSelectedCurrents(previous,cut,held,readOptions,clients,authorize,current),false,undefined,token)),readReconciliation:(host:SharedPhysicalRoomRecoveryHost)=>readingPhase(()=>this.#reconciliation(host,readOptions,token))});
    const value=await visit(scope);if(reading){controller.abort();await reading.catch(()=>{});throw nativeRecoveryFailure('native_recovery_busy');}authorize();return value;
   }finally{controller.abort();try{await reading?.catch(()=>{});}finally{active=false;this.#closingListeners.delete(cancel);unwatch();observation?.close();caller?.close();}}
  })();
  // Cleanup can yield after the visit's last grant. Keep an independent caller
  // observation and every native/owner barrier until this final synchronous
  // handoff. No promise continuation may split the fence from flag release.
  const finish=()=>{if(finalCancellation)closeFinalCancellation.call(finalCancellation);release();};
  const refuse=(error:unknown):never=>{try{if(quarantine&&attempted){closing=this.#close(false);void closing.catch(()=>{});}}finally{finish();}throw error;};
  const result=work.then(value=>{try{this.#current();finalCancellation!.check(()=>fail('asset_adoption_aborted'));native!.check();chosen.checkAuthority();this.#current();native!.check();finalCancellation!.check(()=>fail('asset_adoption_aborted'));if(retireOnSuccess){if(!finalCut)throw fail('asset_adoption_policy');finalCut.check();closing=this.#close(true,keepActors?native:undefined,actorExecution);void closing.catch(()=>{});}finish();return value;}catch(error){return refuse(error);}},refuse);
  // Retirement above is synchronous and precedes pure flag release. Observe
  // actual durable close only AFTER releasing this context's completion promise;
  // awaiting it inside the visitor would wait on the context itself.
  return retireOnSuccess?result.then(async value=>{await closing;return value;},async error=>{if(closing)await closing;else await finalCutRelease?.rollback();throw error;}):quarantine?result.catch(async error=>{if(closing)await closing;throw error;}):result;
 }
 #visit<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(cut:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,check:()=>void,native?:SelectedNativeCutWitness)=>Promise<T>,verifyUploads:boolean,inspectNative?:true,recovery?:object,retainFinal=false):Promise<T>{
  const borrowed=recovery!==undefined;let chosen:PhysicalOperationV3HistoryReadOptions<P>;try{chosen=snapshotPhysicalHistoryReadOptions(input);this.#current();if(borrowed&&recovery!==this.#nativeRecoveryToken||this.#busy&&(!borrowed||recovery!==this.#nativeRecoveryToken))return Promise.reject(fail('asset_adoption_busy'));}catch(error){return Promise.reject(error);}this.#busy=true;
  let finalNative:SelectedNativeCutWitness|undefined,finalCancellation:OperationalReadCancellation|undefined;
  const work=(async()=>{const held:RichAssetStoreCustody[]=[],tickets:ReturnType<RecoveryCleanupScope['retain']>[]=[],controller=new AbortController(),caller=new PhysicalOperationV3Cancellation(chosen.signal),observation=new PhysicalOperationV3Cancellation(controller.signal),cancel=()=>controller.abort(),check=()=>{this.#current();observation.check();caller.check();};let unwatch=()=>{},complete=false;this.#closingListeners.add(cancel);
   try{
    unwatch=caller.watch(cancel);
    if(inspectNative)finalCancellation=new OperationalReadCancellation(chosen.signal);
    await this.#readCleanup.drain();check();
    // Only already-running asset work is awaited. No implicit upload/retry/save.
    await waitSelectedAssetWork(Promise.all([...this.#ports.values()].map(port=>port.settle())),check,notify=>observation.watch(notify));check();
    for(const row of this.#record.participants){const target=this.#basis.resources.targets.get(row.id)!,custody=await methods.acquire.call(target.store);held.push(custody);tickets.push(this.#readCleanup.retain(()=>methods.finish.call(custody)));check();}
    const readOptions={...chosen,signal:controller.signal,checkAuthority:()=>{check();chosen.checkAuthority();check();}},visitor=async(scope:PhysicalRecordCutVisit,native?:SelectedNativeCutWitness)=>{
     if(inspectNative){if(!native)throw fail('asset_adoption_policy');finalNative=native;}
     const current=()=>{check();scope.assets.check();for(const lease of held)methods.held.call(lease);};await this.#retained(current,chosen.signal);const uploads=[];
     for(const row of this.#record.participants){const target=this.#basis.resources.targets.get(row.id)!,snapshot=await methods.capture.call(target.store,()=>{current();return undefined;},chosen.signal?{signal:chosen.signal}:{});current();const reader=await base.read.call(RichAssetReconciledBase,new Blob([this.#basis.files.get(row.id)!]),{limits:row.limits,...(chosen.signal?{signal:chosen.signal}:{})});
      try{await base.verify.call(reader,snapshot.backup,{limits:row.limits,...(chosen.signal?{signal:chosen.signal}:{})});const prior=this.#uploadBaseline?.get(row.id);if(prior)await verifySelectedUploadContinuation(prior,snapshot.backup,row.limits,current,chosen.signal);current();uploads.push(Object.freeze({id:row.id,database:row.targetDatabase,file:snapshot.backup,sha256:await scope.assets.digest(snapshot.backup)}));}finally{base.dispose.call(reader);}
     }
     const cut=Object.freeze({approval:this.#approval,root:scope.cut,uploads:Object.freeze(uploads)}),value=await visit(cut,scope,current,native);current();
     // Provider authentication/network I/O can race direct IndexedDB changes.
     // Re-admit every actual selected queue, not just old receipts or aliases.
     if(verifyUploads)for(const row of cut.uploads){const target=this.#basis.resources.targets.get(row.id)!,actual=await methods.capture.call(target.store,()=>{current();return undefined;},chosen.signal?{signal:chosen.signal}:{});current();if(actual.backup.size!==row.file.size||await scope.assets.digest(actual.backup)!==row.sha256)throw fail('asset_adoption_diverged');}
     await this.#retained(current,chosen.signal);await scope.verify();current();return{cut,value};
    };const result=await(inspectNative?visitReconciliation.call(this.#root,readOptions,visitor):retainFinal?visitRetainedPhysicalFinalCut(this.#root,readOptions,visitor):borrowed?visitRecordCut.call(this.#root,readOptions,visitor):this.#root.visitRecordCut(readOptions,visitor));check();complete=true;return result as {cut:SelectedAssetCurrentCut;value:T};
   }finally{try{const released=await Promise.allSettled(tickets.reverse().map(ticket=>ticket.rollback()));if(released.some(row=>row.status==='rejected'))throw fail();if(complete)check();}finally{this.#closingListeners.delete(cancel);unwatch();observation.close();caller.close();}}
  })();if(!borrowed)this.#running=work;return work.then(result=>{const baseline=new Map(result.cut.uploads.map(row=>[row.id,row.file]));if(inspectNative){this.#current();finalCancellation!.check(()=>fail('asset_adoption_aborted'));chosen.checkAuthority();this.#current();finalNative!.finalCheck();finalCancellation!.check(()=>fail('asset_adoption_aborted'));}this.#uploadBaseline=baseline;return result.value;}).finally(()=>{if(finalCancellation)closeFinalCancellation.call(finalCancellation);if(!borrowed){this.#running=undefined;this.#busy=false;}});
 }
 /** Native retirement happens synchronously. Actual asset jobs are observed
  * and settle before any selected namespace lease is released. No bytes reset. */
 close():Promise<void>{return this.#close(false);}
 /** Explicit terminal alternative after a failed durable close. Unsaved memory
  * may be abandoned; existing durable recovery, queues and receipts stay intact. */
 discardAndClose():Promise<void>{return this.#close(true);}
 #close(discard:boolean,reservation?:NativeRecoveryReservation,actorExecution?:object):Promise<void>{
  if(this.#actorExecution&&this.#actorExecution!==actorExecution)return Promise.reject(fail('asset_adoption_busy'));
  if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===discard?this.#cleanup:Promise.reject(fail('asset_adoption_busy'));if(!this.#active)return Promise.reject(fail('asset_adoption_closed'));
  // Actor readiness can still refuse without retiring any writer. In the
  // retained route, actual root retirement/move precedes all owner observers.
  const retained=reservation?closeRetainedPhysicalKeepingActors(this.#root,reservation):undefined;
  this.#closing=true;for(const cancel of this.#closingListeners)cancel();this.#closingListeners.clear();const native=retained??(discard?discardRoot.call(this.#root):closeRoot.call(this.#root));void native.catch(()=>{});this.#cleanupMode=discard;
  // A capture may own fresh temporary custody. Let that cancelled read clean
  // itself up before closing stores; a raw close must not steal its locks.
  this.#cleanup=(async()=>{await this.#running?.catch(()=>{});await this.#readCleanup.drain();for(const target of this.#basis.resources.targets.values())methods.close.call(target.store);await Promise.all([...this.#ports.values()].map(port=>port.settle()));for(const target of this.#basis.resources.targets.values())await methods.finish.call(target.custody);await native;await this.#basis.resources.intent?.close();await this.#basis.resources.store!.close();for(const[id,lease]of [...this.#basis.resources.targetLeases].reverse()){await lease.close();this.#basis.resources.targetLeases.delete(id);}await this.#basis.resources.intentLease?.close();await this.#basis.resources.lease!.close();this.#closed=true;this.#active=false;})().finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;
 }
 static{checkSelectedCurrent=owner=>{if(!owner||typeof owner!=='object'||!(#root in owner))throw fail('asset_adoption_policy');owner.#current();};
 discardSelected=owner=>{if(!owner||typeof owner!=='object'||!(#root in owner))return Promise.reject(fail('asset_adoption_policy'));return owner.#close(true);};
 reserveActorExecution=owner=>{if(!owner||typeof owner!=='object'||!(#root in owner)||owner.#actorExecution||owner.#busy||owner.#checking)throw fail('asset_adoption_busy');
  owner.#current();const token=Object.freeze({});owner.#actorExecution=token;return makeActorExecution(owner,token);};
 releaseActorExecution=(owner,token)=>{if(owner.#actorExecution!==token||owner.#busy||retainedPhysicalHasActors(owner.#root))throw fail('asset_adoption_busy');owner.#actorExecution=undefined;};
 reservedRetirement=(owner,reservation,input,visit)=>{const held=reservationState(reservation);if(owner!==held.owner||owner.#actorExecution!==held.token)return Promise.reject(fail('asset_adoption_policy'));return owner.#recover(input,visit,false,true,true,held.token);};
 reservedCleanup=reservation=>{const{owner,token}=reservationState(reservation);if(owner.#actorExecution!==token||!retainedPhysicalHasActors(owner.#root))return Promise.reject(fail('asset_adoption_policy'));return owner.#close(true,undefined,token);};
 reservedTake=reservation=>{const{owner,token}=reservationState(reservation);if(owner.#actorExecution!==token||!owner.#closed)throw fail('asset_adoption_closed');return takeRetainedPhysicalActors(owner.#root);};
 withActorRetirement=(owner,input,visit)=>{if(!owner||typeof owner!=='object'||!(#root in owner))return Promise.reject(fail('asset_adoption_policy'));return owner.#recover(input,visit,false,true,true);};
 hasRetiredActors=owner=>{if(!owner||typeof owner!=='object'||!(#root in owner))throw fail('asset_adoption_policy');return retainedPhysicalHasActors(owner.#root);};
 retryActorCleanup=owner=>{if(!owner||typeof owner!=='object'||!(#root in owner)||!retainedPhysicalHasActors(owner.#root))return Promise.reject(fail('asset_adoption_policy'));return owner.#close(true);};
 takeRetiredActors=owner=>{if(!owner||typeof owner!=='object'||!(#root in owner)||!owner.#closed||owner.#actorExecution)throw fail('asset_adoption_closed');return takeRetainedPhysicalActors(owner.#root);};
 prepare=(root,record,basis,approval,authority)=>{const owner=new RetainedSelectedAssetOwner(key,root,record,basis,approval,authority);let abandoned=false;
  return Object.freeze({value:owner,check(){if(abandoned||owner.#active)throw fail('asset_adoption_closed');basis.current();checkRecoveryLeasesHeld([basis.resources.lease!,...basis.resources.targetLeases.values()]);for(const target of basis.resources.targets.values()){methods.check.call(target.store);methods.held.call(target.custody);}},activate(){owner.#active=true;for(const target of basis.resources.targets.values())methods.release.call(target.custody);},async abandon(){if(owner.#active)return;abandoned=true;}});
 };withNativeRecovery=(owner,input,visit)=>{if(!owner||typeof owner!=='object'||!(#root in owner))return Promise.reject(fail('asset_adoption_policy'));return owner.#recover(input,visit);};withNativeExecution=(owner,input,visit)=>{if(!owner||typeof owner!=='object'||!(#root in owner))return Promise.reject(fail('asset_adoption_policy'));return owner.#recover(input,visit,true);};withNativeRetirement=(owner,input,visit)=>{if(!owner||typeof owner!=='object'||!(#root in owner))return Promise.reject(fail('asset_adoption_policy'));return owner.#recover(input,visit,false,true);};}
}
