import {retainActivationChoice} from '../room_native_activation_intent/retain_choice.js';
/** The actual joint owner. Source exclusion survives failed requests; actors
 * move only into an already-returned executor. The promoted replacement remains
 * private until a fresh authenticated publication reply and exact durable
 * observation both complete. Saved state never initializes runtime custody. */
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {PhysicalOperationV3HistoryReadOptions} from '../physical_room_operation_v3/history_read_contract.js';
import {snapshotPhysicalOperationV3Policy} from '../physical_room_operation_v3/policy_snapshot.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {RoomExecutionAttempt,withRoomExecutionMetadataTarget} from '../native_room_execution_run/attempt.js';
import type {RoomRunOptions} from '../native_room_execution_run/contract.js';
import {roomRunIdentity} from '../native_room_execution_run/identity.js';
import {readPreparedRoom} from '../native_room_preparation/coordinator.js';
import {RoomPreparationArchive} from '../native_room_preparation/archive.js';
import {SelectedLocalMetadataDelivery as Metadata} from '../selected_local_metadata_delivery/coordinator.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {previewHeldRoomMetadataContinuation,continueHeldRoomMetadata} from '../selected_local_metadata_continuation/coordinator.js';
import {metadataContinuationPreviewRequest,metadataContinuationRunRequest} from '../selected_local_metadata_continuation/requests.js';
import type {MetadataContinuationChoice,MetadataContinuationResult} from '../selected_local_metadata_continuation/contract.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {NativeActivationSourceSession,withNativeActivationSources,type JointSourceWork} from './source_session.js';
import {captureJointRoomActivationIntent} from './intent_capture.js';
import {JointActivationMetadataOrigin,jointActivationMetadataBundle} from './metadata_origin.js';
import {jointTargetHistoryReads} from './target_reads.js';
import type {JointRoomActivationIntentChoice} from './intent_contract.js';
import {JointRoomActivationIntentStore,jointRoomPublicationBinding} from './intent_store.js';
import {jointIntentFailure as fail,jointEqual as equal} from './intent_policy.js';
import type {JointRoomActivationPreparationInput,JointRoomNativeCommitInput,JointRoomReplacementInput,JointRoomMetadataInput,JointRoomPublicationInput} from './attempt_contract.js';
const metadataCommit=Metadata.prototype.commitNativeActivation,sourceRetire=NativeActivationSourceSession.prototype.retirePrepared,sourceInto=NativeActivationSourceSession.prototype.intoExecution;
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,abort=AbortController.prototype.abort,closeReads=RoomExecutionReadScope.prototype.close,key=Object.freeze({});
let visitSource:<T>(owner:JointRoomActivationAttempt,visit:(work:JointSourceWork)=>Promise<T>)=>Promise<T>;
let visitPublished:<T>(owner:JointRoomActivationAttempt,visit:(work:JointSourceWork)=>Promise<T>)=>Promise<T>;
/** Trusted SDK composition for preparing/reopening genuine metadata under this
 * exact held lifetime. The actual session and executor are never returned. */
export const withJointRoomActivationSources=<T>(owner:JointRoomActivationAttempt,visit:(work:JointSourceWork)=>Promise<T>):Promise<T>=>visitSource(owner,visit);
/** Post-publication SDK delivery only. This visitor cannot be used to bypass
 * the Native/metadata/publication barrier or extract the private executor. */
export const withPublishedJointRoomSources=<T>(owner:JointRoomActivationAttempt,visit:(work:JointSourceWork)=>Promise<T>):Promise<T>=>visitPublished(owner,visit);
export class JointRoomActivationAttempt {
 readonly #source:NativeActivationSourceSession;readonly #stop=new AbortController();
 #reads:RoomExecutionReadScope|undefined;#runOptions:RoomRunOptions|undefined;#execution:RoomExecutionAttempt|undefined;
 #choice:JointRoomActivationIntentChoice|undefined;#origin:JointActivationMetadataOrigin|undefined;#metadata:Metadata|undefined;#publication:SharedNativeRoomPublicationHost|undefined;
 #nativeReceipt:SharedDurableNativeActivationReceipt|undefined;#publicationReceipt:SharedNativeRoomPublicationReceipt|undefined;#continued:MetadataContinuationResult|undefined;
 #prepared=false;#retired=false;#recovered=false;#promoted=false;#running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#taking=false;#closing=false;#closed=false;#taken=false;
 private constructor(token:object,old:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions){if(token!==key)throw fail();this.#source=NativeActivationSourceSession.begin(old,reads);Object.freeze(this);}
 /** Source reservation is synchronous, before reflection or any application
  * callback. Construction sends no request and creates no replacement. */
 static begin(old:RetainedSelectedAssetOwner,reads:PhysicalOperationV3HistoryReadOptions):JointRoomActivationAttempt{return new JointRoomActivationAttempt(key,old,reads);}
 ready():Promise<void>{return this.#source.ready();}
 #check=()=>{if(this.#closing||this.#closed||this.#taken||this.#stop.signal.aborted)throw fail('joint_activation_closed');};
 #run<T>(work:()=>Promise<T>):Promise<T>{try{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>{this.#check();return work();});this.#running=task;return task.finally(()=>{if(this.#running===task)this.#running=undefined;});}
 #readOptions(){const reads=this.#reads!;return{wasm:reads.integrity.wasm,reads:reads.reads,checkAuthority:()=>{this.#check();reads.check();this.#check();},signal:this.#stop.signal,...(reads.assets?{assets:reads.assets}:{})};}
 #targetReadOptions(){return jointTargetHistoryReads(this.#reads!,this.#stop.signal,this.#check);}
 #withStore<T>(check:()=>void,visit:(store:JointRoomActivationIntentStore)=>Promise<T>,create=false):Promise<T>{return(async()=>{this.#check();const store=new JointRoomActivationIntentStore(this.#choice!,{wasm:this.#reads!.integrity.wasm,checkAuthority:()=>{this.#check();check();this.#check();},signal:this.#stop.signal});try{await store.open(create);this.#check();return await visit(store);}finally{await store.close();}})();}
 /** Existing-only resume re-reads the same complete original source and local
  * execution. A saved descriptor cannot introduce a replacement owner. */
 prepare(provided:JointRoomActivationPreparationInput,resume=false):Promise<JointRoomActivationIntentChoice>{return this.#run(()=>withNativeActivationSources(this.#source,async work=>{
  if(this.#prepared||this.#retired||this.#execution)throw fail('joint_activation_state');
  const r=fields(provided,['database','metadata','activation','execution','publication','destinations','reads','run','retainChoice']),run=fields(r['run'],['expected','participants']),expected=roomRunIdentity(run['expected']);
  if(typeof r['retainChoice']!=='function'||!equal(expected,roomRunIdentity(r['execution'])))throw fail();
  if(!this.#reads)this.#reads=new RoomExecutionReadScope(r['reads'] as JointRoomActivationPreparationInput['reads']);
  const participants=snapshotPhysicalOperationV3Policy(run['participants'] as RoomRunOptions['participants']),captured=await captureJointRoomActivationIntent(work.scope,this.#readOptions(),r as unknown as JointRoomActivationPreparationInput);work.check();this.#check();
  if(this.#choice&&!equal(this.#choice,captured.choice))throw fail('joint_activation_intent_stale');
  this.#choice=captured.choice;this.#origin=captured.origin;this.#metadata=r['metadata'] as Metadata;this.#publication=r['publication'] as SharedNativeRoomPublicationHost;this.#runOptions=Object.freeze({expected,participants});
  await retainActivationChoice(captured.choice,r['retainChoice'] as JointRoomActivationPreparationInput['retainChoice'],()=>{work.check();this.#check();},[this.#stop.signal,work.signal]);work.check();this.#check();
  await this.#withStore(work.check,async()=>{work.check();this.#check();},!resume);work.check();this.#check();this.#prepared=true;return captured.choice;
 }));}
 /** Only the genuine metadata coordinator and authenticated Native requester
  * can produce this runtime receipt. Failed/unknown outcomes retain sources. */
 commitNative(provided:JointRoomNativeCommitInput){return this.#run(()=>withNativeActivationSources(this.#source,async work=>{
  if(!this.#prepared||this.#retired||this.#execution)throw fail('joint_activation_state');const r=fields(provided,['activation','inspection','approve'],['limits']);
  return this.#withStore(work.check,async()=>{const result=await metadataCommit.call(this.#metadata!,{...r,expected:this.#choice!.plan.activation} as Parameters<typeof metadataCommit>[0]);work.check();this.#check();this.#nativeReceipt=result.receipt;return result;});
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
 #metadataInput(provided:JointRoomMetadataInput,publication=false){const r=fields(provided,['host','inventory','checkAuthority','approve',...(publication?['approvePublication']:[])]);if(typeof r['approve']!=='function'||publication&&typeof r['approvePublication']!=='function')throw fail();const authority=participantAuthority(r['checkAuthority'] as ()=>void);return{...this.#choice!.plan.destinations,host:r['host'] as JointRoomMetadataInput['host'],inventory:r['inventory'] as JointRoomMetadataInput['inventory'],checkAuthority:authority,approve:r['approve'] as JointRoomMetadataInput['approve'],...(publication?{approvePublication:r['approvePublication'] as JointRoomPublicationInput['approvePublication']}:{})};}
 /** A new affirmative decision and full original-history replay precede fresh
  * namespace creation or existing-only continuation. Sources stay immutable. */
 continueMetadata(provided:JointRoomMetadataInput,resume=false):Promise<MetadataContinuationResult>{return this.#run(async()=>{
  if(!this.#promoted||!this.#execution||this.#publicationReceipt)throw fail('joint_activation_state');const input=this.#metadataInput(provided);
  return withRoomExecutionMetadataTarget(this.#execution,this.#targetReadOptions(),async(scope,witness)=>{
   const origin=jointActivationMetadataBundle(this.#origin!,witness,scope),expected=await previewHeldRoomMetadataContinuation(scope,witness,metadataContinuationPreviewRequest({...input,origin}));scope.check();this.#check();
   const result=await continueHeldRoomMetadata(scope,witness,metadataContinuationRunRequest({...input,origin,expected}),resume);scope.check();this.#check();this.#continued=result;return result;
  });
 });}
 /** The final request runs under a fresh actual target visit, never an ended
  * source signal. Explicit retries re-admit metadata and query the same Native
  * publication owner; a saved receipt alone cannot release the replacement. */
 publish(provided:JointRoomPublicationInput):Promise<SharedNativeRoomPublicationReceipt>{return this.#run(async()=>{
  if(!this.#promoted||!this.#execution||!this.#continued)throw fail('joint_activation_state');const input=this.#metadataInput(provided,true),port=nativePublicationHostPort(this.#publication!);if(!equal(port.selection,this.#choice!.plan.publication))throw fail();
  return withRoomExecutionMetadataTarget(this.#execution,this.#targetReadOptions(),async(scope,witness)=>{
   const origin=jointActivationMetadataBundle(this.#origin!,witness,scope),expected=await previewHeldRoomMetadataContinuation(scope,witness,metadataContinuationPreviewRequest({...input,origin}));scope.check();this.#check();if(!equal(expected,this.#continued!.choice))throw fail('joint_activation_intent_stale');
   const continued=await continueHeldRoomMetadata(scope,witness,metadataContinuationRunRequest({...input,origin,expected}),true);scope.check();this.#check();
   return this.#withStore(scope.check,async store=>{
    const check=()=>{this.#check();scope.check();input.checkAuthority();scope.check();store.check();this.#check();};
    await decideFreshAssetChoice(this.#choice!,input.approvePublication!,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});check();await store.read();check();
    if(!equal((await scope.retainCurrent()).current.selection,continued.choice.target))throw fail('joint_activation_intent_stale');check();let begun=false;
    try{begun=true;await store.markPublicationStarted();check();const receipt=await port.publish(jointRoomPublicationBinding(this.#choice!),check,scope.signal);check();await store.markPublicationObserved(receipt);check();this.#continued=continued;return receipt;}catch(error){if(begun)throw publicationFailure('publication_outcome_unknown');throw error;}
   });
  }).then(receipt=>{this.#check();this.#publicationReceipt=receipt;return receipt;});
 });}
 /** One-shot synchronous transfer only after a fresh actual publication. */
 /** Metadata DATA captured by the last completed publication. Publication
  * retries can advance these journals beyond an earlier continueMetadata
  * result. Reopen still re-admits the snapshot under a fresh actual target
  * visit; this result provides neither actors nor serving authority. */
 publishedMetadata():MetadataContinuationResult{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#publicationReceipt||!this.#continued)throw fail('joint_activation_state');return this.#continued;}
 takeOwner():RetainedSelectedAssetOwner{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#publicationReceipt||!this.#continued||!this.#execution)throw fail('joint_activation_state');this.#taking=true;try{if(this.#reads)closeReads.call(this.#reads);this.#check();const owner=this.#execution.takeOwner();this.#taken=true;return owner;}finally{this.#taking=false;}}
 close():Promise<void>{if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let stopError:unknown,stopFailed=false;const task=Promise.resolve().then(async()=>{await this.#running?.catch(()=>{});await this.#execution?.close();await this.#source.close();if(this.#reads)closeReads.call(this.#reads);if(stopFailed)throw stopError;this.#closed=true;});this.#cleanup=task.finally(()=>{this.#cleanup=undefined;});try{abort.call(this.#stop);if(this.#taking&&this.#execution)void this.#execution.close().catch(()=>{});}catch(error){stopFailed=true;stopError=error;}return this.#cleanup;}
 static{
  visitSource=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#source in owner))return Promise.reject(fail());return owner.#run(()=>withNativeActivationSources(owner.#source,visit));};
  visitPublished=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#source in owner))return Promise.reject(fail());return owner.#run(()=>{if(!owner.#publicationReceipt||!owner.#execution||typeof visit!=='function')throw fail('joint_activation_state');return withRoomExecutionMetadataTarget(owner.#execution,owner.#targetReadOptions(),scope=>visit(Object.freeze({scope,sources:selectedNativeDeliverySources(scope),signal:scope.signal,check:()=>{owner.#check();scope.check();}})));});};
 }
}
