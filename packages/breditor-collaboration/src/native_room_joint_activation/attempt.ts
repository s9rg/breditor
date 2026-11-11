import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
/** The actual joint owner. Source exclusion survives failed requests; actors
 * move only into an already-returned executor. The promoted replacement remains
 * private until a fresh authenticated publication reply and exact durable
 * observation both complete. Saved state never initializes runtime custody. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {snapshotPhysicalOperationV3Policy} from '../physical_room_operation_v3/policy_snapshot.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {RoomExecutionAttempt,withRoomExecutionMetadataTarget} from '../native_room_execution_run/attempt.js';
import type {RoomRunOptions} from '../native_room_execution_run/contract.js';
import {roomRunIdentity} from '../native_room_execution_run/identity.js';
import {readPreparedRoom} from '../native_room_preparation/coordinator.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import type {SelectedLocalMetadataDelivery as Metadata} from '../selected_local_metadata_delivery/coordinator.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {NativeActivationSourceSession,withNativeActivationSources,type JointSourceWork} from './source_session.js';
import {jointActivationMetadataBundle,type JointActivationMetadataOrigin} from './metadata_origin.js';
import {jointTargetHistoryReads} from './target_reads.js';
import {jointRoomPublicationBinding,type JointRoomActivationIntentStore} from './intent_store.js';
import {jointIntentFailure as fail,jointEqual as equal} from './intent_policy.js';
import type {JointRoomReplacementInput} from './attempt_contract.js';
import {ordinaryJointActivation,handoverJointActivation,type JointActivationFamily,type JointActivationVariant,type OrdinaryJointActivation,type HandoverJointActivation} from './attempt_variant.js';
const sourceRetire=NativeActivationSourceSession.prototype.retirePrepared,sourceInto=NativeActivationSourceSession.prototype.intoExecution;
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,abort=AbortController.prototype.abort,closeReads=RoomExecutionReadScope.prototype.close,key=Object.freeze({});
type JointVisit=<T,F extends JointActivationFamily=OrdinaryJointActivation>(owner:JointRoomActivationAttempt<F>,visit:(work:JointSourceWork)=>Promise<T>)=>Promise<T>;
let visitSource:JointVisit;
let visitPublished:JointVisit;
/** Trusted SDK composition for preparing/reopening genuine metadata under this
 * exact held lifetime. The actual session and executor are never returned. */
export const withJointRoomActivationSources:JointVisit=(owner,visit)=>visitSource(owner,visit);
/** Post-publication SDK delivery only. This visitor cannot be used to bypass
 * the Native/metadata/publication barrier or extract the private executor. */
export const withPublishedJointRoomSources:JointVisit=(owner,visit)=>visitPublished(owner,visit);
export class JointRoomActivationAttempt<F extends JointActivationFamily=OrdinaryJointActivation> {
 readonly #source:NativeActivationSourceSession;readonly #stop=new AbortController();
 readonly #variant:JointActivationVariant<F>;
 #reads:RoomExecutionReadScope|undefined;#runOptions:RoomRunOptions|undefined;#execution:RoomExecutionAttempt|undefined;
 #choice:F['choice']|undefined;#origin:JointActivationMetadataOrigin<F['choice']['plan']['origin']['selection']>|undefined;#metadata:Metadata|undefined;#publication:SharedNativeRoomPublicationHost|undefined;
 #nativeReceipt:SharedDurableNativeActivationReceipt|undefined;#publicationReceipt:SharedNativeRoomPublicationReceipt|undefined;#continued:F['continued']|undefined;
 #prepared=false;#retired=false;#recovered=false;#promoted=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#taking=false;#closing=false;#closed=false;#taken=false;
 private constructor(token:object,old:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions,variant:JointActivationVariant<F>){
  if(token!==key)throw fail();
  this.#source=NativeActivationSourceSession.begin(old,reads);this.#variant=variant;Object.freeze(this);
 }
 /** Source reservation is synchronous, before reflection or any application
  * callback. Construction sends no request and creates no replacement. */
 static begin(old:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions):JointRoomActivationAttempt{
  return new JointRoomActivationAttempt(key,old,reads,ordinaryJointActivation);
 }
 /** Reserve the actual old owners for a new sealed Native successor. */
 static beginAcrossHandover(old:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions):JointRoomActivationAttempt<HandoverJointActivation>{
  return new JointRoomActivationAttempt(key,old,reads,handoverJointActivation);
 }
 ready():Promise<void>{return this.#source.ready();}
 #check=()=>{if(this.#closing||this.#closed||this.#taken||this.#stop.signal.aborted)throw fail('joint_activation_closed');};
 #run<T>(work:()=>Promise<T>):Promise<T>{try{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>{this.#check();return work();});this.#running=task;return task.finally(()=>{if(this.#running===task)this.#running=undefined;});}
 #readOptions(){const reads=this.#reads!;return{wasm:reads.integrity.wasm,reads:reads.reads,checkAuthority:()=>{this.#check();reads.check();this.#check();},signal:this.#stop.signal,...(reads.assets?{assets:reads.assets}:{})};}
 #targetReadOptions(){return jointTargetHistoryReads(this.#reads!,this.#stop.signal,this.#check);}
 #withStore<T>(check:()=>void,visit:(store:JointRoomActivationIntentStore)=>Promise<T>,create=false,signal=this.#stop.signal):Promise<T>{return(async()=>{this.#check();const store=this.#variant.store(this.#choice!,{wasm:this.#reads!.integrity.wasm,checkAuthority:()=>{this.#check();check();this.#check();},signal});try{await store.open(create);this.#check();return await visit(store);}finally{await store.close();}})();}
 /** Existing-only resume re-reads the same complete original source and local
  * execution. A saved descriptor cannot introduce a replacement owner. */
 prepare(provided:F['prepare'],resume=false):Promise<F['choice']>{return this.#run(()=>withNativeActivationSources(this.#source,async work=>{
  if(this.#prepared||this.#retired||this.#execution)throw fail('joint_activation_state');
  const r=fields(provided,['database','metadata','activation','execution','publication','destinations','reads','run','retainChoice']),run=fields(r['run'],['expected','participants']),expected=roomRunIdentity(run['expected']);
  if(typeof r['retainChoice']!=='function'||!equal(expected,roomRunIdentity(r['execution'])))throw fail();
  if(!this.#reads)this.#reads=new RoomExecutionReadScope(r['reads'] as F['prepare']['reads']);
  const participants=snapshotPhysicalOperationV3Policy(run['participants'] as RoomRunOptions['participants']),captured=await this.#variant.capture(work.scope,this.#readOptions(),r as unknown as F['prepare']);work.check();this.#check();
  if(this.#choice&&!equal(this.#choice,captured.choice))throw fail('joint_activation_intent_stale');
  this.#choice=captured.choice;this.#origin=captured.origin;this.#metadata=r['metadata'] as Metadata;this.#publication=r['publication'] as SharedNativeRoomPublicationHost;this.#runOptions=Object.freeze({expected,participants});
  await retainActivationChoice(captured.choice,r['retainChoice'] as (choice:F['choice'])=>void|Promise<void>,()=>{work.check();this.#check();},[this.#stop.signal,work.signal]);work.check();this.#check();
  await this.#withStore(work.check,async()=>{work.check();this.#check();},!resume);work.check();this.#check();this.#prepared=true;return captured.choice;
 }));}
 /** Only the genuine metadata coordinator and authenticated Native requester
  * can produce this runtime receipt. Failed/unknown outcomes retain sources. */
 commitNative(provided:F['commit']):Promise<F['committed']>{return this.#run(()=>withNativeActivationSources(this.#source,async work=>{
  if(!this.#prepared||this.#retired||this.#execution)throw fail('joint_activation_state');
  return this.#withStore(work.check,async()=>{const result=await this.#variant.commit(this.#metadata!,this.#choice!,provided);work.check();this.#check();this.#nativeReceipt=result.receipt;return result;});
 }));}
 /** Durable source retirement, concrete reconstruction and fresh promotion.
  * No replacement is exposed by the returned DATA or the saved run journal. */
 recoverReplacement(provided:JointRoomReplacementInput){return this.#run(async()=>{
  if(!this.#prepared||!this.#nativeReceipt||this.#promoted)throw fail('joint_activation_state');
  const r=fields(provided,['approveRetirement','approveExecution','approvePromotion','checkAssetAuthority']);for(const name of ['approveRetirement','approveExecution','approvePromotion','checkAssetAuthority'])if(typeof r[name]!=='function')throw fail();
  if(!this.#retired){
   await this.#withStore(()=>this.#reads!.check(),async()=>{});const preparation=this.#choice!.plan.execution.execution.plan.preparation,reads=this.#readOptions(),integrity={wasm:reads.wasm,checkAuthority:reads.checkAuthority,signal:reads.signal},saved=await readPreparedRoom(preparation,integrity);let archive:RoomPreparationArchive|undefined;
   try{archive=await RoomPreparationArchive.read(saved.file,saved.choice,integrity);this.#check();await sourceRetire.call(this.#source,{expected:preparation,retained:archive.retained(),...(reads.assets?{assets:reads.assets}:{}),approve:r['approveRetirement'] as JointRoomReplacementInput['approveRetirement']});this.#retired=true;}finally{archive?.dispose();}
  }
  // No callback or await separates the actual transfer from assignment into
  // this already-returned joint owner, including a constructor refusal retry.
  if(!this.#execution)this.#execution=sourceInto.call(this.#source,this.#readOptions(),this.#runOptions!);
  if(!this.#recovered){await this.#execution.run(r['approveExecution'] as JointRoomReplacementInput['approveExecution']);this.#recovered=true;}this.#check();const expected=await this.#execution.previewPromotion();this.#check();const result=await this.#execution.promote({expected,approve:r['approvePromotion'] as JointRoomReplacementInput['approvePromotion'],checkAssetAuthority:r['checkAssetAuthority'] as ()=>void});this.#promoted=true;this.#check();return result;
 });}
 /** A new affirmative decision and full original-history replay precede fresh
  * namespace creation or existing-only continuation. Sources stay immutable. */
 continueMetadata(provided:F['metadata'],resume=false):Promise<F['continued']>{return this.#run(async()=>{
  if(!this.#promoted||!this.#execution||this.#publicationReceipt)throw fail('joint_activation_state');
  return withRoomExecutionMetadataTarget(this.#execution,this.#targetReadOptions(),async(scope,witness)=>{
   const origin=jointActivationMetadataBundle(this.#origin!,witness,scope);
   const target=this.#variant.target(scope,witness,origin,this.#choice!,provided,false);
   try{
    const expected=await target.preview();target.check();this.#check();
    const result=await target.run(expected,resume);target.check();this.#check();this.#continued=result;return result;
   }finally{target.close();}
  });
 });}
 /** The final request runs under a fresh actual target visit, never an ended
  * source signal. Explicit retries re-admit metadata and query the same Native
  * publication owner; a saved receipt alone cannot release the replacement. */
 publish(provided:F['publication']):Promise<SharedNativeRoomPublicationReceipt>{return this.#run(async()=>{
  if(!this.#promoted||!this.#execution||!this.#continued)throw fail('joint_activation_state');
  const port=nativePublicationHostPort(this.#publication!);if(!equal(port.selection,this.#choice!.plan.publication))throw fail();
  return withRoomExecutionMetadataTarget(this.#execution,this.#targetReadOptions(),async(scope,witness)=>{
   const origin=jointActivationMetadataBundle(this.#origin!,witness,scope);
   const target=this.#variant.target(scope,witness,origin,this.#choice!,provided,true),signal=target.signal;
   try{
    const expected=await target.preview();target.check();this.#check();
    if(!equal(expected,this.#continued!.choice))throw fail('joint_activation_intent_stale');
    const continued=await target.run(expected,true);target.check();this.#check();
    return await this.#withStore(target.check,async store=>{
     const waits=new NativeReconstructionWaits(()=>{this.#check();target.check();store.check();this.#check();},[signal,store.revoked]);
     const check=waits.check,publicationSignal=waits.signal;
     try{
      await decideFreshAssetChoice(this.#choice!,target.approvePublication!,{check,signal:publicationSignal,watchClosing:cancel=>{add.call(publicationSignal,'abort',cancel,{once:true});return()=>remove.call(publicationSignal,'abort',cancel);}});
      check();await store.read();check();
      if(!equal((await scope.retainCurrent()).current.selection,this.#variant.cut(continued)))throw fail('joint_activation_intent_stale');
      await target.verify(publicationSignal);check();
      try{
       await store.markPublicationStarted();check();
       const receipt=await port.publish(jointRoomPublicationBinding(this.#choice!),check,publicationSignal);check();
       await store.markPublicationObserved(receipt);check();this.#continued=continued;return receipt;
      }catch(error){throw publicationFailure('publication_outcome_unknown',error);}
     }finally{waits.close();}
    },false,signal);
   }finally{target.close();}
  }).then(receipt=>{this.#check();this.#publicationReceipt=receipt;return receipt;});
 });}
 /** One-shot synchronous transfer only after a fresh actual publication. */
 /** Metadata DATA captured by the last completed publication. Publication
  * retries can advance these journals beyond an earlier continueMetadata
  * result. Reopen still re-admits the snapshot under a fresh actual target
  * visit; this result provides neither actors nor serving authority. */
 publishedMetadata():F['continued']{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#publicationReceipt||!this.#continued)throw fail('joint_activation_state');return this.#continued;}
 takeOwner():RetainedSelectedAssetOwner{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#publicationReceipt||!this.#continued||!this.#execution)throw fail('joint_activation_state');this.#taking=true;try{if(this.#reads)closeReads.call(this.#reads);this.#check();const owner=this.#execution.takeOwner();this.#taken=true;return owner;}finally{this.#taking=false;}}
 close():Promise<void>{if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let stopError:unknown,stopFailed=false;const task=Promise.resolve().then(async()=>{await this.#running?.catch(()=>{});await this.#execution?.close();await this.#source.close();if(this.#reads)closeReads.call(this.#reads);if(stopFailed)throw stopError;this.#closed=true;});this.#cleanup=task.finally(()=>{this.#cleanup=undefined;});try{abort.call(this.#stop);if(this.#taking&&this.#execution)void this.#execution.close().catch(()=>{});}catch(error){stopFailed=true;stopError=error;}return this.#cleanup;}
 static{
  visitSource=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#source in owner))return Promise.reject(fail());return owner.#run(()=>withNativeActivationSources(owner.#source,visit));};
  visitPublished=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#source in owner))return Promise.reject(fail());return owner.#run(()=>{if(!owner.#publicationReceipt||!owner.#execution||typeof visit!=='function')throw fail('joint_activation_state');return withRoomExecutionMetadataTarget(owner.#execution,owner.#targetReadOptions(),scope=>visit(Object.freeze({scope,sources:selectedNativeDeliverySources(scope),signal:scope.signal,check:()=>{owner.#check();scope.check();}})));});};
 }
}
