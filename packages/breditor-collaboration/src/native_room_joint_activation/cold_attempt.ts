/** Cold recipient for a complete existing joint attempt. Fresh actors and
 * reconstructed targets remain private until actual authenticated Native
 * confirmation, metadata continuation and a fresh publication reply complete.
 * A restarted Native service needs a new independently selected association;
 * this exact-descriptor action deliberately refuses a different control. */
import {ColdRoomExecutionAttempt as Cold} from '../cold_room_execution/attempt.js';
import {withColdRoomExecutionMetadataTarget,type RoomMetadataTargetWitness} from '../native_room_execution_run/attempt.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import type {RoomRunReadOptions} from '../native_room_execution_run/contract.js';
import type {RetainedSelectedAssetOwner} from '../physical_room_asset_successor/owner.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import {selectedNativeDeliverySources} from '../relay/native_delivery.js';
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {decideFreshAssetChoice} from '../physical_room_asset_approval/decision.js';
import {readHeldRoomActivation,type RoomActivationCommitResult} from '../room_native_activation_intent/commit.js';
import {nativeActivationHostPort} from '../native_activation_control/host.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {activationFailure} from '../native_activation_control/policy.js';
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {previewHeldRoomMetadataContinuation,continueHeldRoomMetadata} from '../selected_local_metadata_continuation/coordinator.js';
import {metadataContinuationPreviewRequest,metadataContinuationRunRequest} from '../selected_local_metadata_continuation/requests.js';
import type {MetadataContinuationResult} from '../selected_local_metadata_continuation/contract.js';
import {JointRoomActivationIntentStore,jointRoomPublicationBinding} from './intent_store.js';
import {jointTargetHistoryReads} from './target_reads.js';
import {jointRoomActivationIntentChoice} from './intent_identity.js';
import {withColdJointActivationOrigin,type ColdJointActivationOriginWork} from './cold_origin.js';
import {inspectColdJointNativeCapture} from './cold_native_inspection.js';
import {jointEqual as equal,jointIntentFailure as fail} from './intent_policy.js';
import type {JointRoomNativeCommitInput,JointRoomMetadataInput,JointRoomPublicationInput} from './attempt_contract.js';
import type {ColdJointRoomActivationOptions,ColdJointRoomReplacementInput} from './cold_contract.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
let visitPublished:<T>(owner:ColdJointRoomActivationAttempt,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>)=>Promise<T>;
/** Trusted SDK delivery after the actual publication barrier. */
export function withPublishedColdJointRoomSources<T>(owner:ColdJointRoomActivationAttempt,visit:(scope:SelectedNativeRecoveryScope,sources:ReturnType<typeof selectedNativeDeliverySources>)=>Promise<T>):Promise<T>{return visitPublished(owner,scope=>visit(scope,selectedNativeDeliverySources(scope)));}
export class ColdJointRoomActivationAttempt {
 readonly #choice;readonly #cold:Cold;readonly #reads:RoomExecutionReadScope;readonly #stop=new AbortController();readonly #unwatch:(()=>void)[]=[];
 #recovered=false;#promoted=false;#native:SharedDurableNativeActivationReceipt|undefined;#continued:MetadataContinuationResult|undefined;#published:SharedNativeRoomPublicationReceipt|undefined;
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#closing=false;#closed=false;#taken=false;#taking=false;
 private constructor(token:object,provided:ColdJointRoomActivationOptions){
  if(token!==key)throw fail();const row=fields(provided,['expected','execution']);this.#choice=jointRoomActivationIntentChoice(row['expected']);
  const execution=row['execution'] as ColdJointRoomActivationOptions['execution'];
  let opened:RoomExecutionReadScope|undefined;try{
   const signal=execution.reads.signal;if(signal){const cancel=()=>this.#stop.abort();if(signal.aborted)cancel();else{add.call(signal,'abort',cancel,{once:true});this.#unwatch.push(()=>remove.call(signal,'abort',cancel));}}
   this.#reads=opened=new RoomExecutionReadScope({...execution.reads,signal:this.#stop.signal});
   this.#cold=Cold.resume({...execution,reads:this.#readOptions()});if(!equal(execution.run.expected,this.#choice.plan.execution))throw fail('joint_activation_intent_stale');
  }catch(error){opened?.close();for(const stop of this.#unwatch)stop();throw error;}Object.freeze(this);
 }
 /** Construction creates no database, acquires no actor and sends no request. */
 static resume(provided:ColdJointRoomActivationOptions):ColdJointRoomActivationAttempt{return new ColdJointRoomActivationAttempt(key,provided);}
 #check=()=>{if(this.#closing||this.#closed||this.#taken||this.#stop.signal.aborted)throw fail('joint_activation_closed');this.#reads.check();};
 #run<T>(visit:()=>Promise<T>):Promise<T>{try{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>{this.#check();return visit();});this.#running=task;return task.finally(()=>{if(this.#running===task)this.#running=undefined;});}
 #readOptions():RoomRunReadOptions{return{wasm:this.#reads.integrity.wasm,reads:this.#reads.reads,signal:this.#stop.signal,checkAuthority:this.#check,...(this.#reads.assets?{assets:this.#reads.assets}:{})};}
 async #readExisting(){const store=new JointRoomActivationIntentStore(this.#choice,{wasm:this.#reads.integrity.wasm,checkAuthority:this.#check,signal:this.#stop.signal});try{await store.open();this.#check();await readHeldRoomActivation(this.#choice.plan.activation,{wasm:this.#reads.integrity.wasm,checkAuthority:this.#check,signal:this.#stop.signal});this.#check();}finally{await store.close();}}
 #target<T>(visit:(scope:SelectedNativeRecoveryScope,origin:ColdJointActivationOriginWork,witness:RoomMetadataTargetWitness)=>Promise<T>):Promise<T>{return withColdRoomExecutionMetadataTarget(this.#cold,jointTargetHistoryReads(this.#reads,this.#stop.signal,this.#check),(scope,witness)=>withColdJointActivationOrigin(scope,witness,this.#choice,origin=>visit(scope,origin,witness)));}
 #decide<T>(scope:SelectedNativeRecoveryScope,choice:T,approve:(value:T)=>boolean|Promise<boolean>,check:()=>void){return decideFreshAssetChoice(choice,approve,{check,signal:scope.signal,watchClosing:cancel=>{add.call(scope.signal,'abort',cancel,{once:true});return()=>remove.call(scope.signal,'abort',cancel);}});}
 /** Recover only local targets. Even an observed old publication receipt
  * cannot cross the fresh confirmation/publication barrier. */
 recoverReplacement(provided:ColdJointRoomReplacementInput):Promise<void>{return this.#run(async()=>{
  if(this.#promoted)throw fail('joint_activation_state');const r=fields(provided,['approveExecution','approvePromotion','checkAssetAuthority']);for(const name of Object.keys(r))if(typeof r[name]!=='function')throw fail();
  await this.#readExisting();
  if(!this.#recovered){const preview=await this.#cold.preview();await this.#cold.run({expected:preview.choice,approve:r['approveExecution'] as ColdJointRoomReplacementInput['approveExecution']});this.#recovered=true;}
  const expected=await this.#cold.previewPromotion();await this.#cold.promote({expected,approve:r['approvePromotion'] as ColdJointRoomReplacementInput['approvePromotion'],checkAssetAuthority:r['checkAssetAuthority'] as ()=>void});
  await this.#target(async(_scope,origin)=>{origin.check();});this.#check();this.#promoted=true;
 });}
 /** Retry only cleanup after an actual promotion whose cleanup failed. The
  * concrete cold executor must own a promoted target; saved run rows do not count. */
 completePromotion():Promise<void>{return this.#run(async()=>{await this.#cold.complete();await this.#target(async(_scope,origin)=>{origin.check();});this.#check();this.#promoted=true;});}
 /** Explicit same-control confirmation, including an earlier lost reply. All
  * original Native/packet/provider facts are inspected before and after a fresh
  * decision. A different process/control requires a new association. */
 confirmNative(provided:JointRoomNativeCommitInput):Promise<RoomActivationCommitResult>{return this.#run(async()=>{
  if(!this.#promoted||this.#published)throw fail('joint_activation_state');const r=fields(provided,['activation','inspection','approve'],['limits']),input=r as unknown as JointRoomNativeCommitInput,port=nativeActivationHostPort(input.activation);generationRecoveryHostPort(input.inspection);
  if(typeof input.approve!=='function'||!equal(port.selection,this.#choice.plan.activation.activation))throw fail('joint_activation_intent_stale');
  const receipt=await this.#target(async(scope,origin)=>{
   const check=()=>{this.#check();origin.check();port.check();};check();await inspectColdJointNativeCapture(scope,origin,input);check();
   await this.#decide(scope,this.#choice.plan.activation,input.approve,check);check();await inspectColdJointNativeCapture(scope,origin,input);check();let started=false;
   try{started=true;await origin.observeNativeStarted();check();const result=await port.commit(check,scope.signal);check();await origin.observeNativeReceipt(result);check();return result;}catch(error){if(started)throw activationFailure('activation_outcome_unknown');throw error;}
  });this.#check();this.#native=receipt;return Object.freeze({format:'breditor/coordinated-native-activation-result',formatVersion:1,scope:'held-client-metadata-upload-cut-and-actual-native-service',intent:this.#choice.plan.activation,receipt});
 });}
 #metadataInput(provided:JointRoomMetadataInput,publication=false){const r=fields(provided,['host','inventory','checkAuthority','approve',...(publication?['approvePublication']:[])]);if(typeof r['approve']!=='function'||publication&&typeof r['approvePublication']!=='function')throw fail();return{...this.#choice.plan.destinations,host:r['host'] as JointRoomMetadataInput['host'],inventory:r['inventory'] as JointRoomMetadataInput['inventory'],checkAuthority:participantAuthority(r['checkAuthority'] as ()=>void),approve:r['approve'] as JointRoomMetadataInput['approve'],...(publication?{approvePublication:r['approvePublication'] as JointRoomPublicationInput['approvePublication']}:{})};}
 continueMetadata(provided:JointRoomMetadataInput,resume=false):Promise<MetadataContinuationResult>{return this.#run(async()=>{
  if(!this.#promoted||!this.#native||this.#published)throw fail('joint_activation_state');const input=this.#metadataInput(provided);
  const result=await this.#target(async(scope,origin,witness)=>{const supplied={...input,origin:origin.original.bundle},expected=await previewHeldRoomMetadataContinuation(scope,witness,metadataContinuationPreviewRequest(supplied));origin.check();
   return continueHeldRoomMetadata(scope,witness,metadataContinuationRunRequest({...supplied,expected}),resume);
  });this.#check();this.#continued=result;return result;
 });}
 /** Publication always uses a freshly supplied genuine control and a fresh
  * actual target/metadata visit, including a stored receipt-observed retry. */
 publish(publication:SharedNativeRoomPublicationHost,provided:JointRoomPublicationInput):Promise<SharedNativeRoomPublicationReceipt>{return this.#run(async()=>{
  if(!this.#promoted||!this.#native||!this.#continued)throw fail('joint_activation_state');const input=this.#metadataInput(provided,true),port=nativePublicationHostPort(publication);if(!equal(port.selection,this.#choice.plan.publication))throw fail('joint_activation_intent_stale');
  const receipt=await this.#target(async(scope,origin,witness)=>{
   const supplied={...input,origin:origin.original.bundle},expected=await previewHeldRoomMetadataContinuation(scope,witness,metadataContinuationPreviewRequest(supplied));origin.check();if(!equal(expected,this.#continued!.choice))throw fail('joint_activation_intent_stale');
   const continued=await continueHeldRoomMetadata(scope,witness,metadataContinuationRunRequest({...supplied,expected}),true);origin.check();
   const check=()=>{this.#check();origin.check();input.checkAuthority();origin.check();port.check();};
   await this.#decide(scope,this.#choice,input.approvePublication!,check);check();if(!equal((await scope.retainCurrent()).current.selection,continued.choice.target))throw fail('joint_activation_intent_stale');check();let started=false;
   try{started=true;await origin.observePublicationStarted();check();const result=await port.publish(jointRoomPublicationBinding(this.#choice),check,scope.signal);check();await origin.observePublicationReceipt(result);check();this.#continued=continued;return result;}catch(error){if(started)throw publicationFailure('publication_outcome_unknown');throw error;}
  });this.#check();this.#published=receipt;return receipt;
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
