/** Cold client owner for a separately selected Native restart association.
 * Original intents and earlier metadata remain immutable. Reconstruction,
 * preparation, actual confirmation, metadata and publication are independent
 * barriers; no saved receipt can expose the private target. */
import {ColdRoomExecutionAttempt as Cold} from '../cold_room_execution/attempt.js';
import {withColdRoomExecutionMetadataTarget,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import type {RoomRunReadOptions} from '../native_room_execution_run/contract.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {readHeldRoomActivation} from '../room_native_activation_intent/commit.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import type {SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import type {MetadataContinuationResult} from '../selected_local_metadata_continuation/contract.js';
import {JointRoomActivationIntentStore} from '../native_room_joint_activation/intent_store.js';
import {jointTargetHistoryReads} from '../native_room_joint_activation/target_reads.js';
import {jointRoomActivationIntentChoice} from '../native_room_joint_activation/intent_identity.js';
import {withColdJointActivationOrigin,type ColdJointActivationOriginWork} from '../native_room_joint_activation/cold_origin.js';
import {jointEqual as equal,jointIntentFailure as fail} from '../native_room_joint_activation/intent_policy.js';
import {jointReassociationChoice} from './identity.js';
import {prepareJointReassociation,resumeJointReassociationPreparation} from './prepare.js';
import {commitReassociatedNative} from './native_commit.js';
import {continueReassociatedMetadata} from './metadata_continue.js';
import {publishReassociatedRoom} from './publish.js';
import type {JointReassociationChoice} from './contract.js';
import type {JointReassociationBeginOptions,JointReassociationResumeOptions,JointReassociationReplacementInput,JointReassociationPreparationInput,JointReassociationPreparationResumeInput,JointReassociationCommitInput,JointReassociationCommitResult,JointReassociationMetadataInput,JointReassociationPublicationInput} from './attempt_contract.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
let visitPublished:<T>(owner:JointRoomReassociationAttempt,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>)=>Promise<T>;
/** Trusted SDK delivery after the actual publication barrier. */
export function withPublishedReassociatedRoomSources<T>(owner:JointRoomReassociationAttempt,visit:(scope:SelectedNativeRecoveryScope,sources:ReturnType<typeof selectedNativeDeliverySources>)=>Promise<T>):Promise<T>{return visitPublished(owner,scope=>visit(scope,selectedNativeDeliverySources(scope)));}
export class JointRoomReassociationAttempt {
 readonly #original;#choice:JointReassociationChoice|undefined;#prepared=false;readonly #cold:Cold;readonly #reads:RoomExecutionReadScope;readonly #stop=new AbortController();readonly #unwatch:(()=>void)[]=[];
 #recovered=false;#promoted=false;#native:SharedDurableNativeActivationReceipt|undefined;#continued:MetadataContinuationResult|undefined;#published:SharedNativeRoomPublicationReceipt|undefined;
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#closing=false;#closed=false;#taken=false;#taking=false;
 private constructor(token:object,provided:JointReassociationBeginOptions|JointReassociationResumeOptions,resume:boolean,preparedStart=false){
  if(token!==key)throw fail();const row=fields(provided,[resume?'expected':'original','execution']);if(resume){this.#choice=jointReassociationChoice(row['expected']);this.#original=this.#choice.plan.original;}else this.#original=jointRoomActivationIntentChoice(row['original']);
  const execution=row['execution'] as JointReassociationBeginOptions['execution'];
  let opened:RoomExecutionReadScope|undefined;try{
   const signal=execution.reads.signal;if(signal){const cancel=()=>this.#stop.abort();if(signal.aborted)cancel();else{add.call(signal,'abort',cancel,{once:true});this.#unwatch.push(()=>remove.call(signal,'abort',cancel));}}
   this.#reads=opened=new RoomExecutionReadScope({...execution.reads,signal:this.#stop.signal});
   const input={...execution,reads:this.#readOptions()};this.#cold=preparedStart?Cold.beginPrepared(input):Cold.resume(input);if(!equal(execution.run.expected,this.#original.plan.execution))throw fail('joint_activation_intent_stale');
  }catch(error){opened?.close();for(const stop of this.#unwatch)stop();throw error;}Object.freeze(this);
 }
 /** Construction creates no database, acquires no actor and sends no request. */
 static begin(provided:JointReassociationBeginOptions):JointRoomReassociationAttempt{return new JointRoomReassociationAttempt(key,provided,false);}
 /** A selected Native checkpoint may still be pending before any local run
  * event. Explicitly start its prepared execution, absent only. All Native,
  * metadata and publication barriers remain independent and unchanged. */
 static beginPrepared(provided:JointReassociationBeginOptions):JointRoomReassociationAttempt{return new JointRoomReassociationAttempt(key,provided,false,true);}
 static resume(provided:JointReassociationResumeOptions):JointRoomReassociationAttempt{return new JointRoomReassociationAttempt(key,provided,true);}
 #check=()=>{if(this.#closing||this.#closed||this.#taken||this.#stop.signal.aborted)throw fail('joint_activation_closed');this.#reads.check();};
 #run<T>(visit:()=>Promise<T>):Promise<T>{try{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>{this.#check();return visit();});this.#running=task;return task.finally(()=>{if(this.#running===task)this.#running=undefined;});}
 #readOptions():RoomRunReadOptions{return{wasm:this.#reads.integrity.wasm,reads:this.#reads.reads,signal:this.#stop.signal,checkAuthority:this.#check,...(this.#reads.assets?{assets:this.#reads.assets}:{})};}
 async #readExisting(){const store=new JointRoomActivationIntentStore(this.#original,{wasm:this.#reads.integrity.wasm,checkAuthority:this.#check,signal:this.#stop.signal});try{await store.open();this.#check();await readHeldRoomActivation(this.#original.plan.activation,{wasm:this.#reads.integrity.wasm,checkAuthority:this.#check,signal:this.#stop.signal});this.#check();}finally{await store.close();}}
 #target<T>(visit:(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,witness:RoomMetadataTargetWitness)=>Promise<T>):Promise<T>{return withColdRoomExecutionMetadataTarget(this.#cold,jointTargetHistoryReads(this.#reads,this.#stop.signal,this.#check),(scope,witness)=>withColdJointActivationOrigin(scope,witness,this.#original,origin=>visit(scope,origin,witness)));}

 /** Recover only local targets. Even an observed old publication receipt
  * cannot cross the fresh confirmation/publication barrier. */
 recoverReplacement(provided:JointReassociationReplacementInput):Promise<void>{return this.#run(async()=>{
  if(this.#promoted)throw fail('joint_activation_state');const r=fields(provided,['approveExecution','approvePromotion','checkAssetAuthority']);for(const name of Object.keys(r))if(typeof r[name]!=='function')throw fail();
  await this.#readExisting();
  if(!this.#recovered){const preview=await this.#cold.preview();await this.#cold.run({expected:preview.choice,approve:r['approveExecution'] as JointReassociationReplacementInput['approveExecution']});this.#recovered=true;}
  const expected=await this.#cold.previewPromotion();await this.#cold.promote({expected,approve:r['approvePromotion'] as JointReassociationReplacementInput['approvePromotion'],checkAssetAuthority:r['checkAssetAuthority'] as ()=>void});
  await this.#target(async(_scope,origin)=>{origin.check();});this.#check();this.#promoted=true;
 });}
 /** Retry only cleanup after an actual promotion whose cleanup failed. The
  * concrete cold executor must own a promoted target; saved run rows do not count. */
 completePromotion():Promise<void>{return this.#run(async()=>{await this.#cold.complete();await this.#target(async(_scope,origin)=>{origin.check();});this.#check();this.#promoted=true;});}
 /** Independently retained DATA only, including a partial preparation whose
  * committed bytes must be resumed explicitly. This supplies no readiness. */
 independentChoice():JointReassociationChoice{this.#check();if(!this.#choice)throw fail('joint_activation_state');return this.#choice;}
 #context(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,witness:RoomMetadataTargetWitness){if(!this.#choice||!this.#prepared)throw fail('joint_activation_state');return{scope,origin,witness,choice:this.#choice,options:this.#readOptions(),check:()=>{this.#check();origin.check();}};}
 prepare(provided:JointReassociationPreparationInput):Promise<JointReassociationChoice>{return this.#run(async()=>{
  if(!this.#promoted||this.#prepared||this.#native||this.#published||this.#choice)throw fail('joint_activation_state');
  const r=fields(provided,['database','nativeIntentDatabase','activation','publication','destinations','previous','prior','retainChoice']);if(typeof r['retainChoice']!=='function')throw fail();
  const {retainChoice,...input}=r;
  const choice=await this.#target((scope,origin)=>prepareJointReassociation(scope,origin,input as unknown as JointReassociationPreparationInput,this.#readOptions(),async value=>{
   await (retainChoice as JointReassociationPreparationInput['retainChoice'])(value);this.#check();if(this.#choice&&!equal(this.#choice,value))throw fail('joint_activation_intent_stale');this.#choice=value;
  }));this.#check();this.#choice=choice;this.#prepared=true;return choice;
 });}
 /** Complete exact retained DATA after interruption, even if its old service
  * requester is gone. This supplies no actual Native confirmation. */
 resumePreparation(provided:JointReassociationPreparationResumeInput):Promise<JointReassociationChoice>{return this.#run(async()=>{
  if(!this.#promoted||this.#prepared||this.#native||this.#published||!this.#choice)throw fail('joint_activation_state');const r=fields(provided,['retainChoice']);if(typeof r['retainChoice']!=='function')throw fail();
  const selected=this.#choice,choice=await this.#target((scope,origin)=>resumeJointReassociationPreparation(scope,origin,selected,this.#readOptions(),r['retainChoice'] as JointReassociationPreparationResumeInput['retainChoice']));this.#check();this.#choice=choice;this.#prepared=true;return choice;
 });}
 confirmNative(provided:JointReassociationCommitInput):Promise<JointReassociationCommitResult>{return this.#run(async()=>{
  if(!this.#promoted||!this.#prepared||this.#published)throw fail('joint_activation_state');const result=await this.#target((scope,origin,witness)=>commitReassociatedNative(this.#context(scope,origin,witness),provided));this.#check();this.#native=result.receipt;return result;
 });}
 continueMetadata(provided:JointReassociationMetadataInput):Promise<MetadataContinuationResult>{return this.#metadata(provided,false);}
 resumeMetadata(provided:JointReassociationMetadataInput):Promise<MetadataContinuationResult>{return this.#metadata(provided,true);}
 #metadata(provided:JointReassociationMetadataInput,resume:boolean):Promise<MetadataContinuationResult>{return this.#run(async()=>{
  if(!this.#promoted||!this.#prepared||!this.#native||this.#published)throw fail('joint_activation_state');const result=await this.#target((scope,origin,witness)=>continueReassociatedMetadata(this.#context(scope,origin,witness),provided,resume));this.#check();this.#continued=result;return result;
 });}
 publish(publication:SharedNativeRoomPublicationHost,provided:JointReassociationPublicationInput):Promise<SharedNativeRoomPublicationReceipt>{return this.#run(async()=>{
  if(!this.#promoted||!this.#prepared||!this.#native||!this.#continued)throw fail('joint_activation_state');const result=await this.#target((scope,origin,witness)=>publishReassociatedRoom(this.#context(scope,origin,witness),publication,provided,this.#continued!));this.#check();this.#continued=result.continued;this.#published=result.receipt;return result.receipt;
 });}
 /** Metadata DATA captured by the last completed publication. Publication
  * retries can advance these journals beyond an earlier continueMetadata
  * result. Reopen still re-admits the snapshot under a fresh actual target
  * visit; this result provides neither actors nor serving authority. */
 publishedMetadata():MetadataContinuationResult{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#published||!this.#continued)throw fail('joint_activation_state');return this.#continued;}
 takeOwner():RetainedSelectedAssetOwner{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#published||!this.#continued||!this.#native)throw fail('joint_activation_state');this.#taking=true;try{this.#reads.close();for(const stop of this.#unwatch)stop();this.#unwatch.length=0;if(this.#closing||this.#stop.signal.aborted)throw fail('joint_activation_closed');const owner=this.#cold.takeOwner();this.#taken=true;return owner;}finally{this.#taking=false;}}
 close():Promise<void>{if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let start!:()=>void;const gate=new Promise<void>(resolve=>{start=resolve;});const errors:unknown[]=[];this.#cleanup=gate.then(async()=>{await this.#running?.catch(()=>{});try{await this.#cold.close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Cold joint cleanup did not drain');this.#reads.close();for(const stop of this.#unwatch)stop();this.#unwatch.length=0;this.#closed=true;}).finally(()=>{this.#cleanup=undefined;});try{this.#stop.abort();}catch(error){errors.push(error);}finally{start();}return this.#cleanup;}
 static{visitPublished=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#cold in owner))return Promise.reject(fail());return owner.#run(()=>{if(!owner.#published)throw fail('joint_activation_state');return withColdRoomExecutionMetadataTarget(owner.#cold,jointTargetHistoryReads(owner.#reads,owner.#stop.signal,owner.#check),scope=>visit(scope));});};}
}
