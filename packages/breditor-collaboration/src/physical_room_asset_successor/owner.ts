/** SDK-private same-native selected-asset ownership for warm transfer and cold
 * resume. Genuine retained resources, fresh decisions and participant policies
 * are required; saved approval is immutable data, not provider/server authority. */
import {RichAssetStore,RichAssetStoreCustody,RichAssetReconciledBase} from '@breditor/experimental-rich-content';
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
const visitReconciliation=RetainedPhysicalRoot.prototype.visitReconciliationRecordCut,catalogMetadata=RetainedPhysicalRoot.prototype.catalogMetadata,closeFinalCancellation=OperationalReadCancellation.prototype.close;
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
export class RetainedSelectedAssetOwner{
 readonly #root;readonly #record;readonly #basis;readonly #approval;readonly #authority;
 readonly #ports=new Map<string,ReturnType<typeof selectedAssetPort>>();
 readonly #readCleanup=new RecoveryCleanupScope(()=>fail());
 readonly #closingListeners=new Set<()=>void>();
 #uploadBaseline:ReadonlyMap<string,Blob>|undefined;
 #active=false;#closing=false;#closed=false;#busy=false;#checking=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#cleanupMode:boolean|undefined;
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
  try{const provider=selectedRoomProvider(host,catalogMetadata.call(this.#root),this.#record);return this.#visit(input,async(cut,scope,check,native)=>{if(!native)throw fail('asset_adoption_policy');const result=await provider(cut,scope,check);check();native.finalCheck();return frozen(structuredClone({format:'breditor/selected-room-reconciliation-read' as const,formatVersion:1 as const,scope:'held-complete-native-source-and-whole-uploads-at-authenticated-cut' as const,kind:native.data.kind==='covered'&&result.kind==='checked'?'checked' as const:'pending' as const,native:native.data,provider:result}));},true,true);}catch(error){return Promise.reject(error);}
 }
 #visit<P extends SharedSelectionPolicy,T>(input:PhysicalOperationV3HistoryReadOptions<P>,visit:(cut:SelectedAssetCurrentCut,scope:PhysicalRecordCutVisit,check:()=>void,native?:SelectedNativeCutWitness)=>Promise<T>,verifyUploads:boolean,inspectNative?:true):Promise<T>{
  let chosen:PhysicalOperationV3HistoryReadOptions<P>;try{chosen=snapshotPhysicalHistoryReadOptions(input);this.#current();if(this.#busy)return Promise.reject(fail('asset_adoption_busy'));}catch(error){return Promise.reject(error);}this.#busy=true;
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
    };const result=await(inspectNative?visitReconciliation.call(this.#root,readOptions,visitor):this.#root.visitRecordCut(readOptions,visitor));check();complete=true;return result as {cut:SelectedAssetCurrentCut;value:T};
   }finally{try{const released=await Promise.allSettled(tickets.reverse().map(ticket=>ticket.rollback()));if(released.some(row=>row.status==='rejected'))throw fail();if(complete)check();}finally{this.#closingListeners.delete(cancel);unwatch();observation.close();caller.close();}}
  })();this.#running=work;return work.then(result=>{const baseline=new Map(result.cut.uploads.map(row=>[row.id,row.file]));if(inspectNative){this.#current();finalCancellation!.check(()=>fail('asset_adoption_aborted'));chosen.checkAuthority();this.#current();finalNative!.finalCheck();finalCancellation!.check(()=>fail('asset_adoption_aborted'));}this.#uploadBaseline=baseline;return result.value;}).finally(()=>{if(finalCancellation)closeFinalCancellation.call(finalCancellation);this.#running=undefined;this.#busy=false;});
 }
 /** Native retirement happens synchronously. Actual asset jobs are observed
  * and settle before any selected namespace lease is released. No bytes reset. */
 close():Promise<void>{return this.#close(false);}
 /** Explicit terminal alternative after a failed durable close. Unsaved memory
  * may be abandoned; existing durable recovery, queues and receipts stay intact. */
 discardAndClose():Promise<void>{return this.#close(true);}
 #close(discard:boolean):Promise<void>{
  if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanupMode===discard?this.#cleanup:Promise.reject(fail('asset_adoption_busy'));if(!this.#active)return Promise.reject(fail('asset_adoption_closed'));
  this.#closing=true;for(const cancel of this.#closingListeners)cancel();this.#closingListeners.clear();const native=discard?this.#root.discardAndClose():this.#root.close();void native.catch(()=>{});this.#cleanupMode=discard;
  // A capture may own fresh temporary custody. Let that cancelled read clean
  // itself up before closing stores; a raw close must not steal its locks.
  this.#cleanup=(async()=>{await this.#running?.catch(()=>{});await this.#readCleanup.drain();for(const target of this.#basis.resources.targets.values())methods.close.call(target.store);await Promise.all([...this.#ports.values()].map(port=>port.settle()));for(const target of this.#basis.resources.targets.values())await methods.finish.call(target.custody);await native;await this.#basis.resources.intent?.close();await this.#basis.resources.store!.close();for(const[id,lease]of [...this.#basis.resources.targetLeases].reverse()){await lease.close();this.#basis.resources.targetLeases.delete(id);}await this.#basis.resources.intentLease?.close();await this.#basis.resources.lease!.close();this.#closed=true;this.#active=false;})().finally(()=>{this.#cleanup=undefined;this.#cleanupMode=undefined;});return this.#cleanup;
 }
 static{prepare=(root,record,basis,approval,authority)=>{const owner=new RetainedSelectedAssetOwner(key,root,record,basis,approval,authority);let abandoned=false;
  return Object.freeze({value:owner,check(){if(abandoned||owner.#active)throw fail('asset_adoption_closed');basis.current();checkRecoveryLeasesHeld([basis.resources.lease!,...basis.resources.targetLeases.values()]);for(const target of basis.resources.targets.values()){methods.check.call(target.store);methods.held.call(target.custody);}},activate(){owner.#active=true;for(const target of basis.resources.targets.values())methods.release.call(target.custody);},async abandon(){if(owner.#active)return;abandoned=true;}});
 };}
}
