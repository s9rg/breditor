/** SDK-private actual root custody. The original native/source/journal parents
 * remain alive, rather than being consumed individually or recreated from data.
 * The enclosing root-plus-stage coordinator must retain its durable basis and
 * current host decision BEFORE activating this prepared resource.
 *
 * Nothing here is incoming admission, server activation or a selected-asset
 * baseline. Creation is used only inside the genuine root's private barrier. */
import {takeRetainedNativeOriginCustody,type RetainedNativeReadBorrow,type RetainedNativeClient} from '../complete_operation_cohort/retained_native_read.js';
import type {OperationalAssetCustody} from '../operation_cohort/assets.js';
import {checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {RecoveryCleanupScope} from '../participant_recovery/cleanup_scope.js';
import {retireOwnedCore} from '../owned_core_lifetime.js';
import {snapshotPhysicalHistoryReadOptions} from './history_read.js';
import {visitPhysicalOperationV3RecordCut,type PhysicalRecordCutVisit} from './record_cut.js';
import type {PhysicalOperationV3Custody} from './operation.js';
import type {PhysicalOperationV3HistoryReadOptions} from './history_read_contract.js';
import type {PhysicalRoomRecordCutFile} from '../physical_room_record_cut/contract.js';
import type {SharedSelectionPolicy} from '../types.js';
import {sourceCoreMethods} from '../source_native_read.js';
import {physicalOperationV3Failure as fail} from './policy.js';
import {waitNativePendingWork} from '../native_pending_work.js';
import {PhysicalOperationV3Cancellation} from './storage_cancellation.js';
import {captureSelectedNativeCut} from '../selected_room_reconciliation/native_cut.js';
import type {SelectedNativeCutWitness} from '../selected_room_reconciliation/contract.js';
const key=Object.freeze({});
interface Origins{readonly clients:readonly RetainedNativeClient[];readonly assets:OperationalAssetCustody}
interface ReadableNative{readonly id:string;readonly family:RetainedNativeClient['family'];readonly document:string;readonly review:string|null}
export interface PreparedRetainedPhysicalRoot{
 readonly value:RetainedPhysicalRoot;
 /** Source checks and borrowed-capture disposal precede the first parent flag
  * consumption. Any failure still abandons only the actual donated origins. */
 prepareOrigins():void;
 /** Private flag write only, called inside the common no-application barrier. */
 activate():void;
 abandon():Promise<void>;
}
let prepare:(state:PhysicalOperationV3Custody,borrow:RetainedNativeReadBorrow,closeParents:(discard:boolean)=>Promise<void>)=>PreparedRetainedPhysicalRoot;
/** Internal trusted-root construction only; a public caller must reserve the
 * actual root through its private-brand checked transfer entry point. */
export const prepareRetainedPhysicalRoot=(state:PhysicalOperationV3Custody,borrow:RetainedNativeReadBorrow,closeParents:(discard:boolean)=>Promise<void>)=>prepare(state,borrow,closeParents);
let visitFinalCut:<P extends SharedSelectionPolicy,T>(owner:RetainedPhysicalRoot,input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:PhysicalRecordCutVisit)=>Promise<T>)=>Promise<T>;
/** Trusted final-source read on a genuine retained root, not a host driver. */
export const visitRetainedPhysicalFinalCut=<P extends SharedSelectionPolicy,T>(owner:RetainedPhysicalRoot,input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:PhysicalRecordCutVisit)=>Promise<T>):Promise<T>=>visitFinalCut(owner,input,visit);
export class RetainedPhysicalRoot{
 readonly #s:PhysicalOperationV3Custody;readonly #closeParents:(discard:boolean)=>Promise<void>;readonly #cleanup=new RecoveryCleanupScope(()=>fail());
 readonly #closingListeners=new Set<()=>void>();
 #origins:Origins|undefined;#readable:readonly ReadableNative[]|undefined;#active=false;#closing=false;#closed=false;#busy=false;#running:Promise<void>|undefined;#closeTask:Promise<void>|undefined;#closeMode:boolean|undefined;
 private constructor(token:object,state:PhysicalOperationV3Custody,closeParents:(discard:boolean)=>Promise<void>){if(token!==key)throw fail('physical_operation_v3_policy');this.#s=state;this.#closeParents=closeParents;Object.freeze(this);}
 #current=()=>{if(!this.#active||this.#closing||this.#closed||!this.#origins)throw fail('physical_operation_v3_closed');this.#s.readCurrent();this.#s.intent.checkReadCurrent();checkRecoveryLeasesHeld([this.#s.lease,this.#s.held.lease]);this.#origins.assets.check();};
 get clients():readonly RetainedNativeClient[]{this.#current();return this.#origins!.clients;}
 /** Immutable genuine-root data only, for independently pinned host matching.
  * This does not select the host's local origin or grant provider authority. */
 catalogMetadata(){this.#current();return this.#s.held.state.metadata;}
 /** A successfully captured complete native snapshot survives later close
  * failure. A disposed member can prevent that snapshot; ordinary durable source
  * records remain separate. This never re-enables a retired writer. */
 #snapshot():readonly ReadableNative[]{return Object.freeze(this.#origins!.clients.map(row=>{const review=sourceCoreMethods.reviewHistoryPolicy.call(row.core);return Object.freeze({id:row.id,family:row.family,document:sourceCoreMethods.checkpointJson.call(row.core),review:review===null?null:review==='segmented-v1'?sourceCoreMethods.reviewSegmentedCheckpoint.call(row.core):sourceCoreMethods.reviewCheckpoint.call(row.core)});}));}
 readableNative():readonly ReadableNative[]{if(!this.#active||this.#closed||!this.#origins)throw fail('physical_operation_v3_closed');return this.#readable??this.#snapshot();}
 #run<T>(work:()=>Promise<T>):Promise<T>{try{this.#current();}catch(error){return Promise.reject(error);}if(this.#busy)return Promise.reject(fail('physical_operation_v3_in_use'));this.#busy=true;let done!:()=>void;this.#running=new Promise(resolve=>{done=resolve;});let task:Promise<T>;try{task=work();}catch(error){task=Promise.reject(error);}return task.finally(()=>{this.#busy=false;this.#running=undefined;done();});}
 /** Current COMPLETE source data, not only the initial approved LIVE projection.
  * The temporary read borrows, and must not release, the actual origin token. */
 captureRecordCut<P extends SharedSelectionPolicy>(input:PhysicalOperationV3HistoryReadOptions<P>):Promise<PhysicalRoomRecordCutFile>{return this.visitRecordCut(input,async scope=>scope.cut);}
 /** SDK-only same-cut composition: selected uploads are captured while actual
  * source readers, full packet records and legacy origins remain held. */
 visitRecordCut<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:PhysicalRecordCutVisit)=>Promise<T>):Promise<T>{return this.#visitRecordCut(input,visit);}
 /** Distinct same-reservation native/source inspection. No caller DTO can
  * supply the clients, prepared identities, inventory or actual record scope. */
 visitReconciliationRecordCut<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:PhysicalRecordCutVisit,native:SelectedNativeCutWitness)=>Promise<T>):Promise<T>{return this.#visitRecordCut(input,async scope=>{const native=await captureSelectedNativeCut(this.#s,this.#origins!.clients,scope,this.#current);this.#current();return visit(scope,native);});}
 #visitRecordCut<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(scope:PhysicalRecordCutVisit)=>Promise<T>,retainFinal=false):Promise<T>{const chosen=snapshotPhysicalHistoryReadOptions(input);return this.#run(async()=>{await this.#cleanup.drain();const observation=new PhysicalOperationV3Cancellation(chosen.signal),check=()=>{this.#current();observation.check();};
  const watch=(cancel:()=>void)=>{const unwatch=observation.watch(cancel);if(this.#closing)cancel();else this.#closingListeners.add(cancel);return()=>{this.#closingListeners.delete(cancel);unwatch();};};
  try{await Promise.all(this.#origins!.clients.map(row=>waitNativePendingWork(row.core,{check,watch})));check();return await visitPhysicalOperationV3RecordCut(this.#s,this.#current,this.#cleanup,chosen,watch,visit,undefined,this.#origins!.assets,retainFinal?true:undefined);}
  finally{observation.close();}
 });}
 close():Promise<void>{return this.#close(false);}
 /** Explicitly abandon only unsaved native memory. All retained intent, source,
  * packet/journal and upload bytes remain; this never resets or deletes data. */
 discardAndClose():Promise<void>{return this.#close(true);}
 #close(discard:boolean):Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#closeTask)return this.#closeMode===discard?this.#closeTask:Promise.reject(fail('physical_operation_v3_in_use'));if(!this.#active||!this.#origins)return Promise.reject(fail('physical_operation_v3_closed'));
  // Irreversible retirement of EVERY actual member precedes fallible reads.
  // A disposed sibling must not keep later siblings writable after shutdown.
  this.#closing=true;this.#s.life.closing=true;for(const cancel of this.#closingListeners)cancel();this.#closingListeners.clear();for(const row of this.#origins.clients)retireOwnedCore(row.core);
  this.#closeMode=discard;this.#closeTask=Promise.resolve().then(async()=>{if(!discard)this.#readable??=this.#snapshot();await this.#running;await this.#cleanup.drain();await this.#origins!.assets.close();await this.#closeParents(discard);this.#origins=undefined;this.#readable=undefined;this.#closed=true;this.#active=false;}).finally(()=>{this.#closeTask=undefined;this.#closeMode=undefined;});return this.#closeTask;
 }
 static{visitFinalCut=(owner,input,visit)=>{if(!owner||typeof owner!=='object'||!(#s in owner))return Promise.reject(fail('physical_operation_v3_policy'));return owner.#visitRecordCut(input,visit,true);};prepare=(state,borrow,closeParents)=>{const owner=new RetainedPhysicalRoot(key,state,closeParents);let abandoned=false;
  return Object.freeze({value:owner,prepareOrigins(){if(abandoned||owner.#active||owner.#origins)throw fail('physical_operation_v3_closed');state.readCurrent();state.intent.checkReadCurrent();checkRecoveryLeasesHeld([state.lease,state.held.lease]);borrow.check();owner.#origins=takeRetainedNativeOriginCustody(borrow);},activate(){owner.#active=true;},async abandon(){if(owner.#active||abandoned)return;if(owner.#origins){await owner.#origins.assets.close();owner.#origins=undefined;}else await borrow.close();abandoned=true;}});
 };}
}
