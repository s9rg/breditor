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
import type {SharedDurableNativeActivationReceipt} from '../native_activation_control/contract.js';
import {nativePublicationHostPort,type SharedNativeRoomPublicationHost} from '../native_publication_control/host.js';
import {publicationFailure} from '../native_publication_control/policy.js';
import type {SharedNativeRoomPublicationReceipt} from '../native_publication_control/contract.js';
import {NativeReconstructionWaits} from '../selected_native_reconstruction/read_waits.js';
import {jointRoomPublicationBinding} from './intent_store.js';
import {jointTargetHistoryReads} from './target_reads.js';
import {jointEqual as equal,jointIntentFailure as fail} from './intent_policy.js';
import type {ColdJointRoomActivationOptions,ColdJointHandoverActivationOptions,ColdJointRoomReplacementInput} from './cold_contract.js';
import {coldOrdinaryActivation,coldHandoverActivation,decideColdActivation,type ColdActivationFamily,type ColdActivationVariant,type ColdOrdinaryActivation,type ColdHandoverActivation} from './cold_variant.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
let visitPublished:<T,F extends ColdActivationFamily=ColdOrdinaryActivation>(owner:ColdJointRoomActivationAttempt<F>,visit:(scope:SelectedNativeRecoveryScope)=>Promise<T>)=>Promise<T>;
/** Trusted SDK delivery after the actual publication barrier. */
export function withPublishedColdJointRoomSources<T,F extends ColdActivationFamily=ColdOrdinaryActivation>(owner:ColdJointRoomActivationAttempt<F>,visit:(scope:SelectedNativeRecoveryScope,sources:ReturnType<typeof selectedNativeDeliverySources>)=>Promise<T>):Promise<T>{return visitPublished(owner,scope=>visit(scope,selectedNativeDeliverySources(scope)));}
export class ColdJointRoomActivationAttempt<F extends ColdActivationFamily=ColdOrdinaryActivation> {
 readonly #choice:F['choice'];readonly #variant:ColdActivationVariant<F>;readonly #cold:Cold;readonly #reads:RoomExecutionReadScope;readonly #stop=new AbortController();readonly #unwatch:(()=>void)[]=[];
 #recovered=false;#promoted=false;#native:SharedDurableNativeActivationReceipt|undefined;#continued:F['continued']|undefined;#published:SharedNativeRoomPublicationReceipt|undefined;
 #running:Promise<unknown>|undefined;#cleanup:Promise<void>|undefined;#closing=false;#closed=false;#taken=false;#taking=false;
 private constructor(token:object,provided:F['options'],variant:ColdActivationVariant<F>){
  if(token!==key)throw fail();
  this.#variant=variant;
  const row=fields(provided,['expected','execution']);this.#choice=variant.parseChoice(row['expected']);
  const execution=row['execution'] as ColdJointRoomActivationOptions['execution'];
  let opened:RoomExecutionReadScope|undefined;try{
   const signal=execution.reads.signal;if(signal){const cancel=()=>this.#stop.abort();if(signal.aborted)cancel();else{add.call(signal,'abort',cancel,{once:true});this.#unwatch.push(()=>remove.call(signal,'abort',cancel));}}
   this.#reads=opened=new RoomExecutionReadScope({...execution.reads,signal:this.#stop.signal});
   this.#cold=Cold.resume({...execution,reads:this.#readOptions()});if(!equal(execution.run.expected,this.#choice.plan.execution))throw fail('joint_activation_intent_stale');
  }catch(error){opened?.close();for(const stop of this.#unwatch)stop();throw error;}Object.freeze(this);
 }
 /** Construction creates no database, acquires no actor and sends no request. */
 static resume(provided:ColdJointRoomActivationOptions):ColdJointRoomActivationAttempt{return new ColdJointRoomActivationAttempt(key,provided,coldOrdinaryActivation);}
 static resumeAcrossHandover(provided:ColdJointHandoverActivationOptions):ColdJointRoomActivationAttempt<ColdHandoverActivation>{
  return new ColdJointRoomActivationAttempt(key,provided,coldHandoverActivation);
 }
 #check=()=>{if(this.#closing||this.#closed||this.#taken||this.#stop.signal.aborted)throw fail('joint_activation_closed');this.#reads.check();};
 #run<T>(visit:()=>Promise<T>):Promise<T>{try{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');}catch(error){return Promise.reject(error);}const task=Promise.resolve().then(()=>{this.#check();return visit();});this.#running=task;return task.finally(()=>{if(this.#running===task)this.#running=undefined;});}
 #readOptions():RoomRunReadOptions{return{wasm:this.#reads.integrity.wasm,reads:this.#reads.reads,signal:this.#stop.signal,checkAuthority:this.#check,...(this.#reads.assets?{assets:this.#reads.assets}:{})};}
 async #readExisting(){
  const options={wasm:this.#reads.integrity.wasm,checkAuthority:this.#check,signal:this.#stop.signal};
  const store=this.#variant.store(this.#choice,options);
  try{await store.open();this.#check();await this.#variant.readNative(this.#choice,options);this.#check();}finally{await store.close();}
 }
 #target<T>(visit:(scope:SelectedNativeRecoveryScope,origin:F['origin'],witness:RoomMetadataTargetWitness)=>Promise<T>):Promise<T>{
  return withColdRoomExecutionMetadataTarget(this.#cold,jointTargetHistoryReads(this.#reads,this.#stop.signal,this.#check),
   (scope,witness)=>this.#variant.withOrigin(scope,witness,this.#choice,origin=>visit(scope,origin,witness)));
 }
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
 confirmNative(provided:F['commit']):Promise<F['committed']>{return this.#run(async()=>{
  if(!this.#promoted||this.#published)throw fail('joint_activation_state');
  const result=await this.#target((scope,origin)=>this.#variant.confirm(scope,origin,provided,this.#check));
  this.#check();this.#native=result.receipt;return result;
 });}
 continueMetadata(provided:F['metadata'],resume=false):Promise<F['continued']>{return this.#run(async()=>{
  if(!this.#promoted||!this.#native||this.#published)throw fail('joint_activation_state');
  const result=await this.#target(async(scope,origin,witness)=>{
   const target=this.#variant.target(scope,witness,origin.original.bundle,this.#choice,provided,false);
   try{const expected=await target.preview();origin.check();return await target.run(expected,resume);}
   finally{target.close();}
  });this.#check();this.#continued=result;return result;
 });}
 /** Publication always uses a freshly supplied genuine control and a fresh
  * actual target/metadata visit, including a stored receipt-observed retry. */
 publish(publication:SharedNativeRoomPublicationHost,provided:F['publication']):Promise<SharedNativeRoomPublicationReceipt>{return this.#run(async()=>{
  if(!this.#promoted||!this.#native||!this.#continued)throw fail('joint_activation_state');
  const port=nativePublicationHostPort(publication);if(!equal(port.selection,this.#choice.plan.publication))throw fail('joint_activation_intent_stale');
  const receipt=await this.#target(async(scope,origin,witness)=>{
   const target=this.#variant.target(scope,witness,origin.original.bundle,this.#choice,provided,true);
   let waits:NativeReconstructionWaits|undefined,started=false;
   try{
    const expected=await target.preview();origin.check();
    if(!equal(expected,this.#continued!.choice))throw fail('joint_activation_intent_stale');
    const continued=await target.run(expected,true);origin.check();
    waits=new NativeReconstructionWaits(()=>{this.#check();origin.check();target.check();origin.check();port.check();},[target.signal,origin.revoked]);
    const check=waits.check;
    await decideColdActivation(this.#choice,target.approvePublication!,waits);check();
    if(!equal((await scope.retainCurrent()).current.selection,this.#variant.cut(continued)))throw fail('joint_activation_intent_stale');
    await target.verify();check();
    started=true;await origin.observePublicationStarted();check();
    const result=await port.publish(jointRoomPublicationBinding(this.#choice),check,waits.signal);check();
    await origin.observePublicationReceipt(result);check();this.#continued=continued;return result;
   }catch(error){if(started)throw publicationFailure('publication_outcome_unknown',error);throw error;}
   finally{waits?.close();target.close();}
  });this.#check();this.#published=receipt;return receipt;
 });}
 /** Metadata DATA captured by the last completed publication. Publication
  * retries can advance these journals beyond an earlier continueMetadata
  * result. Reopen still re-admits the snapshot under a fresh actual target
  * visit; this result provides neither actors nor serving authority. */
 publishedMetadata():F['continued']{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#published||!this.#continued)throw fail('joint_activation_state');return this.#continued;}
 takeOwner():RetainedSelectedAssetOwner{this.#check();if(this.#running||this.#taking)throw fail('joint_activation_busy');if(!this.#published||!this.#continued||!this.#native)throw fail('joint_activation_state');this.#taking=true;try{this.#reads.close();for(const stop of this.#unwatch)stop();this.#unwatch.length=0;if(this.#closing||this.#stop.signal.aborted)throw fail('joint_activation_closed');const owner=this.#cold.takeOwner();this.#taken=true;return owner;}finally{this.#taking=false;}}
 close():Promise<void>{if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;let start!:()=>void;const gate=new Promise<void>(resolve=>{start=resolve;});const errors:unknown[]=[];this.#cleanup=gate.then(async()=>{await this.#running?.catch(()=>{});try{await this.#cold.close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Cold joint cleanup did not drain');this.#reads.close();for(const stop of this.#unwatch)stop();this.#unwatch.length=0;this.#closed=true;}).finally(()=>{this.#cleanup=undefined;});try{this.#stop.abort();}catch(error){errors.push(error);}finally{start();}return this.#cleanup;}
 static{visitPublished=(owner,visit)=>{if(!owner||typeof owner!=='object'||!(#cold in owner))return Promise.reject(fail());return owner.#run(()=>{if(!owner.#published)throw fail('joint_activation_state');return withColdRoomExecutionMetadataTarget(owner.#cold,jointTargetHistoryReads(owner.#reads,owner.#stop.signal,owner.#check),scope=>visit(scope));});};}
}
