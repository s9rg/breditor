import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {deliveryResumeInputs,authorizeDeliveryResume,type DeliveryResumeInputs} from './resume_admission.js';
import {handoverResumeInputs,handoverRecordingInputs,inspectHandoverResume,type DeliveryJournalHandoverResumeInput,type DeliveryJournalHandoverRecordingInput,type HandoverResumeInputs} from './handover_resume.js';
import type {DeliveryJournalResumeInput} from './resume_contract.js';
import {checkSelectedNativeDeliveryScope} from '../relay/native_delivery.js';
/** One real gate, actual adapter work and factual journal lifecycle. Cold resume
 * separately revalidates every cut and requires fresh approval. A failed record stops writers;
 * retained facts may still be inspected without regranting adapter admission. */
import {assertPreparedSelectedDeliveryPair,claimPreparedSelectedDelivery,resumePreparedSelectedNativeDelivery,type PreparedSelectedNativeDelivery} from '../selected_delivery_preparation/coordinator.js';
import type {PreparedDeliveryDriver} from '../selected_delivery_preparation/driver_contract.js';
import {retainSelectedNativeDeliveryResource} from '../relay/native_delivery.js';
import type {NativeRelayDelivery} from '../relay/native_delivery.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';
import type {SharedReviewAccess} from '../review_types.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {DeliveryJournalResources} from './resources.js';
import {journalIdentity} from './identity.js';
import {journalNativeInputs} from './native_inputs.js';
import {DeliveryJournalError,fail,fields} from './policy.js';
import type {DeliveryJournalSnapshot,DeliveryJournalIdentity,DeliveryJournalControl} from './contract.js';
import type {DeliveryJournalOpeningInput,DeliveryJournalRecordingInput} from './coordinator_contract.js';
const key=Object.freeze({}),resources={open:DeliveryJournalResources.prototype.open,read:DeliveryJournalResources.prototype.readFresh,append:DeliveryJournalResources.prototype.append,close:DeliveryJournalResources.prototype.close};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function publicError(error:unknown){return error instanceof DeliveryJournalError?error:retainInternalFailureCause(fail('delivery_journal_integrity'),error);}
export class SelectedNativeDeliveryJournal{
 readonly #scope;#driver:PreparedDeliveryDriver|undefined;readonly #resources;readonly #identity;readonly #authority;
 #active=false;#failed=false;#busy=false;#dirty=false;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#ending:Promise<void>|undefined;
 private constructor(token:object,scope:SelectedNativeRecoveryScope,driver:PreparedDeliveryDriver|undefined,identity:DeliveryJournalIdentity,authority:()=>void){if(token!==key)throw fail('delivery_journal_policy');this.#scope=scope;this.#driver=driver;this.#identity=identity;this.#authority=authority;this.#resources=new DeliveryJournalResources();Object.freeze(this);}
 #guard=()=>{if(this.#closing||this.#closed)throw fail('delivery_journal_closed');this.#scope.check();this.#resources.check();try{this.#authority();}catch{throw fail('delivery_journal_authority');}this.#scope.check();if(this.#closing||this.#closed)throw fail('delivery_journal_closed');};
 #delivery():PreparedDeliveryDriver{if(!this.#driver)throw fail('delivery_journal_closed');return this.#driver;}
 #writer(){this.#guard();if(!this.#active||this.#failed)throw fail('delivery_journal_closed');this.#delivery().check();this.#guard();}
 #run<T>(work:()=>Promise<T>,write:boolean,detach?:()=>void):Promise<T>{if(this.#busy)return Promise.reject(fail('delivery_journal_busy'));if(this.#closed||this.#closing)return Promise.reject(fail('delivery_journal_closed'));this.#busy=true;let refused=false,reason:unknown;try{detach?.();this.#guard();if(write)this.#writer();}catch(error){refused=true;reason=error;}
  const job=Promise.resolve().then(()=>{if(refused)throw reason;this.#guard();return work();}).catch(async error=>{this.#failed=true;try{await this.#driver?.close();}catch{throw fail('delivery_journal_storage');}throw publicError(error);}).finally(()=>{this.#busy=false;this.#running=undefined;});this.#running=job;return job;
 }
 /** Absent-only initialization completes and is rechecked before any adapter
  * is admitted. The journal cleanup owner is registered BEFORE the first await. */
 static async open(scope:SelectedNativeRecoveryScope,gate:PreparedSelectedNativeDelivery,supplied:DeliveryJournalOpeningInput):Promise<SelectedNativeDeliveryJournal>{
  assertPreparedSelectedDeliveryPair(gate,scope);const options={...supplied};fields(options,['database','host','server','inventory','checkAuthority']);const current=generationRecoveryHostPort(options.host),native=journalNativeInputs(options.server,options.inventory),authority=participantAuthority(options.checkAuthority);let driver:PreparedDeliveryDriver|undefined,owner:SelectedNativeDeliveryJournal|undefined;
  try{driver=claimPreparedSelectedDelivery(gate,scope);const identity=journalIdentity({format:'breditor/selected-native-delivery-journal',formatVersion:1,database:options.database,prepared:driver.prepared.choice});owner=new SelectedNativeDeliveryJournal(key,scope,driver,identity,authority);const held=owner;retainSelectedNativeDeliveryResource(scope,Object.freeze({check:()=>held.#guard(),close:()=>held.#close()}));
   owner.#busy=true;const initializing=Promise.resolve().then(()=>driver!.quiesce(async()=>{held.#guard();native.check();if(!equal(current.selection,identity.prepared.server)||!equal(native.source,current.selection.source.server)||!equal(native.participants,current.selection.source.participants))throw fail();await current.check(scope.signal);const before=await scope.retainCurrent();if(!equal(before.current.selection,identity.prepared.before))throw fail();native.check();held.#guard();await resources.open.call(held.#resources,identity,{wasm:before.integrity.wasm,checkAuthority:held.#guard,signal:scope.signal},{control:{kind:'initial',selection:current.selection},current:before.current,server:native.server,inventory:native.inventory});native.check();await current.check(scope.signal);if(!equal((await scope.retainCurrent()).current.selection,identity.prepared.before))throw fail();held.#guard();})).finally(()=>{held.#busy=false;held.#running=undefined;});owner.#running=initializing;await initializing;
   owner.#active=true;owner.#writer();return owner;
  }catch(error){if(owner){owner.#failed=true;try{await owner.#close();}catch{throw fail('delivery_journal_storage');}}else if(driver)await driver.close();throw publicError(error);}
 }

 /** Cold resume consumes no old gate. Existing-only facts, all real native/client
  * predecessors and fresh approval precede a NEW gate and durable checkpoint.
  * Actual initialization/cleanup is owned before its first asynchronous read. */
 static async resume(scope:SelectedNativeRecoveryScope,supplied:DeliveryJournalResumeInput):Promise<SelectedNativeDeliveryJournal>{
  checkSelectedNativeDeliveryScope(scope);
  return SelectedNativeDeliveryJournal.#resume(scope,deliveryResumeInputs(supplied,true));
 }
 /** Existing-only handover resume. The original before-file and all earlier events remain literal. */
 static async resumeAcrossHandover(scope:SelectedNativeRecoveryScope,supplied:DeliveryJournalHandoverResumeInput):Promise<SelectedNativeDeliveryJournal>{
  checkSelectedNativeDeliveryScope(scope);
  return SelectedNativeDeliveryJournal.#resume(scope,handoverResumeInputs(supplied,true));
 }
 static async #resume(scope:SelectedNativeRecoveryScope,input:DeliveryResumeInputs|HandoverResumeInputs):Promise<SelectedNativeDeliveryJournal>{
  const owner=new SelectedNativeDeliveryJournal(key,scope,undefined,input.identity,input.authority),held=owner;
  const checkNative=async()=>{
   input.native.check();
   await input.path.check(scope.signal);
   if('previous' in input)await input.previous.check(scope.signal);
  };
  const control:DeliveryJournalControl='handover' in input?{kind:'handover',selection:input.handover}:{kind:'advanced',selection:input.previous.selection};
  retainSelectedNativeDeliveryResource(scope,Object.freeze({check:()=>held.#guard(),close:()=>held.#close()}));owner.#busy=true;
  const initializing=Promise.resolve().then(async()=>{held.#guard();const actual=await scope.retainCurrent();await resources.open.call(held.#resources,input.identity,{wasm:actual.integrity.wasm,checkAuthority:held.#guard,signal:scope.signal});
   const authorized=await authorizeDeliveryResume(scope,held.#resources,input,held.#guard),gate=await resumePreparedSelectedNativeDelivery(scope,authorized.admission);try{held.#driver=claimPreparedSelectedDelivery(gate,scope);}catch(error){await gate.close();throw error;}
   await held.#driver.quiesce(async()=>{held.#guard();await checkNative();
    if(!equal((await scope.retainCurrent()).current.selection,authorized.current.current.selection))throw fail();
    // A new factual checkpoint records the genuinely reopened current owner.
    // The immutable original before-cut and all older events remain literal.
    await resources.append.call(held.#resources,authorized.snapshot,{control,current:authorized.current.current,server:input.native.server,inventory:input.native.inventory});
    await checkNative();if(!equal((await scope.retainCurrent()).current.selection,authorized.current.current.selection))throw fail();held.#guard();
   });
  }).finally(()=>{held.#busy=false;held.#running=undefined;});owner.#running=initializing;
  try{await initializing;owner.#active=true;owner.#writer();return owner;}catch(error){owner.#failed=true;try{await owner.#close();}catch{throw fail('delivery_journal_storage');}throw publicError(error);}
 }
 /** Detached journal identity is DATA only, never a fresh runtime admission. */
 identity():DeliveryJournalIdentity{return this.#identity;}
 /** One source step at a time. Both document/comment adapters share its same
  * actual context; another context requires a successful factual checkpoint. */
 createDelivery(source:RetainedDeliverySource,ceiling:SharedReviewAccess):NativeRelayDelivery{if(this.#closed||this.#closing||this.#failed||!this.#active)throw fail('delivery_journal_closed');if(this.#busy||this.#dirty)throw fail('delivery_journal_busy');this.#busy=true;try{this.#writer();this.#dirty=true;return this.#delivery().create(source,ceiling,()=>{this.#guard();if(!this.#active||this.#failed)throw fail('delivery_journal_closed');});}catch(error){this.#failed=true;void this.#driver?.close().catch(()=>{});throw publicError(error);}finally{this.#busy=false;}}
 /** Failed records may be inspected while the same root is still owned.
  * This fresh DATA read neither reopens the gate nor creates an ACK. */
 readFacts():Promise<DeliveryJournalSnapshot>{return this.#run(()=>resources.read.call(this.#resources),false);}
 record(supplied:DeliveryJournalRecordingInput):Promise<DeliveryJournalSnapshot>{let chosen!:Readonly<{host:DeliveryJournalRecordingInput['baseline'];baseline:ReturnType<typeof generationDeliveryRecoveryHostPort>;previous:ReturnType<typeof generationDeliveryRecoveryHostPort>;native:ReturnType<typeof journalNativeInputs>}>;
  return this.#run(()=>this.#delivery().quiesce(async()=>{if(!this.#dirty)throw fail('delivery_journal_policy');this.#guard();chosen.native.check();const before=await resources.read.call(this.#resources),last=before.entries.at(-1)!,baseline=chosen.baseline.selection.continuation,previous=chosen.previous.selection.continuation;
   if(!equal(baseline.previous,this.#identity.prepared.server.source.server)||!equal(previous.previous,last.event.server.identity)||!equal(baseline.current,previous.current)||!equal(previous.current.origin,this.#identity.prepared.server.source.origin)||!equal(chosen.native.source,previous.current.server)||!equal(chosen.native.participants,previous.current.participants))throw fail();
   await chosen.baseline.check(this.#scope.signal);await chosen.previous.check(this.#scope.signal);const retained=await this.#scope.retainExtendingAll(before.entries.map(row=>row.current));await this.#scope.readDeliveryReconciliation(chosen.host,chosen.native.reader);chosen.native.check();this.#guard();if(!equal((await this.#scope.retainCurrent()).current.selection,retained.current.selection))throw fail();await chosen.baseline.check(this.#scope.signal);await chosen.previous.check(this.#scope.signal);
   const after=await resources.append.call(this.#resources,before,{control:{kind:'advanced',selection:chosen.previous.selection},current:retained.current,server:chosen.native.server,inventory:chosen.native.inventory});chosen.native.check();await chosen.baseline.check(this.#scope.signal);await chosen.previous.check(this.#scope.signal);if(!equal((await this.#scope.retainCurrent()).current.selection,retained.current.selection))throw fail();this.#guard();this.#dirty=false;return after;
  }),true,()=>{const input={...supplied};fields(input,['baseline','previous','server','inventory']);chosen=Object.freeze({host:input.baseline,baseline:generationDeliveryRecoveryHostPort(input.baseline),previous:generationDeliveryRecoveryHostPort(input.previous),native:journalNativeInputs(input.server,input.inventory)});});
 }
 /** Append a new factual cut after delivery on the successor. */
 recordAcrossHandover(supplied:DeliveryJournalHandoverRecordingInput):Promise<DeliveryJournalSnapshot>{
  let chosen!:ReturnType<typeof handoverRecordingInputs>;
  return this.#run(()=>this.#delivery().quiesce(async()=>{
   if(!this.#dirty)throw fail('delivery_journal_policy');
   const before=await inspectHandoverResume(this.#scope,this.#resources,chosen,this.#identity,this.#guard);
   const after=await resources.append.call(this.#resources,before.snapshot,{
    control:{kind:'handover',selection:chosen.handover},current:before.current.current,
    server:chosen.native.server,inventory:chosen.native.inventory,
   });
   chosen.native.check();await chosen.path.check(this.#scope.signal);
   if(!equal((await this.#scope.retainCurrent()).current.selection,before.current.current.selection))throw fail();
   this.#guard();this.#dirty=false;return after;
  }),true,()=>{const input={...supplied};fields(input,['path','server','inventory']);chosen=handoverRecordingInputs(input);});
 }
 close():Promise<void>{return this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;const stopping=this.#driver?.close(),active=this.#running;this.#ending=(async()=>{const result=await Promise.allSettled([stopping,active]);if(result[0]?.status==='rejected')throw fail('delivery_journal_storage');await resources.close.call(this.#resources);this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;}
}
