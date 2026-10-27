import {checkStoppedSegmentedSourceActors}from'../persistence/segmented_session.js';
import type {StoppedActorBinding}from'../persistence/stopped_actor_source.js';
import {takeStoppedSegmentedSourceActors}from'../persistence/segmented_session.js';
import type {StoppedActorCustody}from'../persistence/stopped_actor_source.js';
import {inheritActorLeaseInput}from'../persistence/actor_lease_input.js';
/** Explicit generation-aware durable relay source. It never activates an entire room or stores credentials. */
import {retireOwnedCore} from '../owned_core_lifetime.js';
import {checkManagedCore} from '../managed_custody.js';
import {SharedSegmentedPersistentSession,captureSegmentedPersistentRecords} from "../persistence/segmented_session.js";
import {createGenerationRecordRead,type GenerationRecordRead} from '../persistence/generation_record_read.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {withSegmentedCompanion} from "../persistence/segmented_driver.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedReviewRelayProgress} from "../relay/review_types.js";
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSegmentedRelaySessionOptions,SharedSegmentedRelayRecovery,SharedSegmentedRelayRecoveryOptions,SharedSegmentedDocumentProgress,SharedSegmentedReviewReceipt} from "./contract.js";
import {SegmentedRelayCompanion} from "./companion.js";
import {closed} from "./validation.js";
import {registerSegmentedRelaySession} from "./admission.js";
import {SegmentedRetainedCompanion} from "./retained_companion.js";
import {withSegmentedRetainedPort,type SegmentedRetainedPort} from "./retained_port.js";
import type {SharedSegmentedRetainedSessionOptions,SharedSegmentedRetainedRecoveryOptions,SharedSegmentedRetainedRecovery,SegmentedRetainedKind,SegmentedRetainedRecords} from "./retained_contract.js";
import {SharedSuggestionQueue} from "../suggestions/queue.js";
import {SharedSuggestionRevisions} from "../suggestion_revisions/outbox.js";
import {SharedDocumentVersions} from "../versions/catalog.js";
import type {SharedSuggestionRevisionsOptions} from "../suggestion_revisions/types.js";
import type {SharedDocumentVersionsOptions} from "../versions/types.js";
import {generationNative,registerGenerationSource} from "../generation_source/admission.js";
import {generationRecords} from "../generation_source/records.js";
import {inheritGenerationOperationOrigin} from "../generation_operation/admission.js";

export type SharedSegmentedVersionsOpenOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedDocumentVersionsOptions<P>,"identity"|"database"|"storage"|"autoConnect">&{autoConnect?:false};
export type SharedSegmentedRevisionsOpenOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSuggestionRevisionsOptions<P>,"binding"|"database"|"storage"|"queue"|"autoStart">&{autoStart?:false};

const constructionKey=Object.freeze({});
let readRelayGenerationRecords:(owner:SharedSegmentedRelaySession,authority:()=>void,signal?:AbortSignal)=>Promise<GenerationRecordRead>;
let checkActorCustody:(owner:SharedSegmentedRelaySession)=>StoppedActorBinding;
export const checkStoppedSegmentedRelayActors=<P extends SharedSelectionPolicy>(owner:SharedSegmentedRelaySession<P>):StoppedActorBinding=>checkActorCustody(owner as unknown as SharedSegmentedRelaySession);
let takeActorCustody:(owner:SharedSegmentedRelaySession)=>StoppedActorCustody;
export const takeStoppedSegmentedRelayActors=<P extends SharedSelectionPolicy>(owner:SharedSegmentedRelaySession<P>):StoppedActorCustody=>takeActorCustody(owner as unknown as SharedSegmentedRelaySession);
export class SharedSegmentedRelaySession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #session:SharedSegmentedPersistentSession<P>;readonly #companion:SegmentedRelayCompanion;
 readonly #core:SharedRichEditor<P>;#retiring=false;#adapters=new Set<WeakRef<{dispose():void}>>();
 #queue:SharedSuggestionQueue<P>|undefined;#revisions:SharedSuggestionRevisions<P>|undefined;#versions:SharedDocumentVersions<P>|undefined;
 #openings=new Set<Promise<unknown>>();#closing:Promise<void>|undefined;#discarding:Promise<void>|undefined;#released:Promise<void>|undefined;
 private constructor(key:object,session:SharedSegmentedPersistentSession<P>,companion:SegmentedRelayCompanion){
  if(key!==constructionKey)throw new SharedRelayError('managed_source_construction');
  this.#session=session;this.#companion=companion;this.#core=session.core;companion.confirm(session.savedCompanion());
  const native=generationNative(session),retained=companion instanceof SegmentedRetainedCompanion?companion:null,check=()=>{native.check();if(Object.hasOwn(this,"core")||native.core!==this.#core)throw new SharedRelayError("segmented_relay_source_retired");};
  registerGenerationSource(this,{core:native.core,identity:{kind:retained?"retained":"relay",native:structuredClone(native.identity),review:structuredClone(native.review),relay:structuredClone(companion.binding),retained:retained?structuredClone(retained.retainedBinding):null},check,checkManaged:()=>{check();native.checkManaged();},stamp:()=>{check();return[native.stamp(),companion.sourceStamp()];},read:()=>{check();return generationRecords(native.read(),companion.current(),retained?.records());}});
  companion.setRetireHook(()=>this.#stop());
  registerSegmentedRelaySession(this,{core:this.#core as unknown as SharedRichEditor<SharedSelectionPolicy>,binding:structuredClone(companion.binding),check:()=>this.#check(),save:()=>this.#session.save(),flush:()=>this.#flushSource(),durable:()=>companion.durable(),persistDocument:p=>this.#persistDocument(p),persistReview:(p,r)=>this.#persistReview(p,r),track:a=>{this.#check();for(const ref of this.#adapters)if(!ref.deref())this.#adapters.delete(ref);this.#adapters.add(new WeakRef(a));}});
 }
 static{const inspect=(owner:SharedSegmentedRelaySession):StoppedActorBinding=>{if(!owner||typeof owner!=='object'||!(#session in owner)||Object.hasOwn(owner,'core'))throw new SharedRelayError('actor_source_unavailable');if(owner.#openings.size||owner.#closing||owner.#discarding)throw new SharedRelayError('actor_source_in_use');return checkStoppedSegmentedSourceActors(owner.#session);};checkActorCustody=inspect;takeActorCustody=owner=>{inspect(owner);return takeStoppedSegmentedSourceActors(owner.#session);};}
 static{readRelayGenerationRecords=async(owner,provided,signal)=>{
  if(!owner||typeof owner!=='object'||!(#session in owner))throw new SharedRelayError('generation_record_read_source');const authority=participantAuthority(provided);owner.#check();let inner:GenerationRecordRead|undefined,result:GenerationRecordRead|undefined;
  try{inner=await captureSegmentedPersistentRecords(owner.#session,authority,signal);owner.#check();const read=inner;result=createGenerationRecordRead(read.metadata(),{check(){owner.#check();read.check();owner.#check();},current(){owner.#check();read.checkCurrent();owner.#check();},async verify(){owner.#check();await read.verify();owner.#check();},release(){read.dispose();}});result.check();return result;}catch(error){result?.dispose();inner?.dispose();throw error;}
 };}
 static async open<Q extends SharedSelectionPolicy>(input:SharedSegmentedRelaySessionOptions<Q>):Promise<SharedSegmentedRelaySession<Q>>{
  if(this!==SharedSegmentedRelaySession)throw new SharedRelayError("segmented_relay_factory_receiver");
  const {binding,...options}=input,companion=new SegmentedRelayCompanion(input as SharedSegmentedRelaySessionOptions),session=await SharedSegmentedPersistentSession.open(inheritActorLeaseInput(input,inheritGenerationOperationOrigin(input,withSegmentedCompanion(options,companion))));
  try{return new SharedSegmentedRelaySession(constructionKey,session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 static async restoreRecovery<Q extends SharedSelectionPolicy>(input:SharedSegmentedRelayRecoveryOptions<Q>):Promise<SharedSegmentedRelaySession<Q>>{
  if(this!==SharedSegmentedRelaySession)throw new SharedRelayError("segmented_relay_factory_receiver");
  closed(input.recovery,"format,formatVersion,relay,source");const r=input.recovery;if(r.format!=="breditor/shared-relay-generation-recovery"||r.formatVersion!==1)throw new SharedRelayError("segmented_relay_recovery");
  const {binding,recovery,...options}=input,companion=new SegmentedRelayCompanion({...options,binding,initialGenerations:{root:"recovery",active:"restore"},create:()=>{throw new SharedRelayError("segmented_relay_recovery");}} as SharedSegmentedRelaySessionOptions,r.relay);
  const session=await SharedSegmentedPersistentSession.restoreRecovery(inheritActorLeaseInput(input,withSegmentedCompanion({...options,recovery:r.source},companion)));try{return new SharedSegmentedRelaySession(constructionKey,session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 /** Explicit new atomic family. Old relay/local opens never infer it from stored fields. */
 static async openRetained<Q extends SharedSelectionPolicy>(input:SharedSegmentedRetainedSessionOptions<Q>):Promise<SharedSegmentedRelaySession<Q>>{
  if(this!==SharedSegmentedRelaySession)throw new SharedRelayError("segmented_relay_factory_receiver");
  const {binding,retained,...options}=input,companion=new SegmentedRetainedCompanion(input as SharedSegmentedRetainedSessionOptions),session=await SharedSegmentedPersistentSession.open(inheritActorLeaseInput(input,inheritGenerationOperationOrigin(input,withSegmentedCompanion(options,companion))));
  try{return new SharedSegmentedRelaySession(constructionKey,session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 static async restoreRetainedRecovery<Q extends SharedSelectionPolicy>(input:SharedSegmentedRetainedRecoveryOptions<Q>):Promise<SharedSegmentedRelaySession<Q>>{
  if(this!==SharedSegmentedRelaySession)throw new SharedRelayError("segmented_relay_factory_receiver");const r=input.recovery;closed(r,"format,formatVersion,relay,retained,retainedBinding,source");if(r.format!=="breditor/shared-relay-generation-retained-recovery"||r.formatVersion!==1)throw new SharedRelayError("segmented_retained_recovery");
  const {binding,retained,recovery,...options}=input,companion=new SegmentedRetainedCompanion({...options,binding,retained,initialGenerations:{root:"recovery",active:"restore"},create:()=>{throw new SharedRelayError("segmented_retained_recovery");}} as SharedSegmentedRetainedSessionOptions,r),session=await SharedSegmentedPersistentSession.restoreRecovery(inheritActorLeaseInput(input,withSegmentedCompanion({...options,recovery:r.source},companion)));
  try{return new SharedSegmentedRelaySession(constructionKey,session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 get core():SharedRichEditor<P>{return this.#core;}
 get recovered():boolean{return this.#session.recovered;}
 #check():void{if(this.#retiring||Object.hasOwn(this,"core"))throw new SharedRelayError("segmented_relay_source_retired");this.#session.checkBorrowedSource(this.#core);checkManagedCore(this.#core);}
 state(){return this.#session.state();}
 relayProgress(){return this.#companion.durable();}
 /** Paired transport progress readers return detached metadata, not live server grants. */
 reviewRelayIdentity(){return structuredClone(this.#companion.binding.review);}
 reviewRelayProgress():SharedReviewRelayProgress{const p=this.#companion.durable().review;if(!p)throw new SharedRelayError("segmented_review_binding_required");return p;}
 async persistReviewRelayProgress(progress:SharedReviewRelayProgress):Promise<void>{await this.#persistReview(progress);}
 async #persistReview(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>{this.#check();const current=this.#companion.current();if(!current.binding.review)throw new SharedRelayError("segmented_review_binding_required");this.#companion.propose({...current,review:progress,reviewReceipt:receipt??current.reviewReceipt});await this.#flushSource();}
 async #persistDocument(document:SharedSegmentedDocumentProgress):Promise<void>{this.#check();this.#companion.propose({...this.#companion.current(),document});await this.#flushSource();}
 save():void{this.#session.save();}
 async #flushSource():Promise<void>{this.#session.save();await this.#session.flush();}
 async flush():Promise<void>{await this.#flushSource();}
 async retry():Promise<void>{await this.#session.retry();if(this.#queue&&!this.#queue.state().closed)await this.#queue.retry();if(this.#revisions&&this.#revisions.state().status!=="closed")await this.#revisions.retry();if(this.#versions&&this.#versions.state().status!=="closed")await this.#versions.retry();}
 async sealGeneration(next:string):Promise<void>{this.#check();await this.#session.sealGeneration(next);}
 async sealObserverGeneration(next:string):Promise<void>{this.#check();await this.#session.sealObserverGeneration(next);}
 /** Same atomic native/relay/retained cut, without unlocking a current read-only former author. */
 async sealReadOnlyGeneration(next:string):Promise<void>{this.#check();await this.#session.sealReadOnlyGeneration(next);}
 exportRecovery():SharedSegmentedRelayRecovery{if(this.#companion instanceof SegmentedRetainedCompanion)throw new SharedRelayError("segmented_retained_recovery_required");return {format:"breditor/shared-relay-generation-recovery",formatVersion:1,source:this.#session.exportRecovery(),relay:this.#companion.current()};}
 #retained():SegmentedRetainedCompanion{if(!(this.#companion instanceof SegmentedRetainedCompanion))throw new SharedRelayError("segmented_retained_session_required");return this.#companion;}
 exportRetainedRecovery():SharedSegmentedRetainedRecovery{const c=this.#retained();return {format:"breditor/shared-relay-generation-retained-recovery",formatVersion:1,source:this.#session.exportRecovery(),relay:c.current(),retainedBinding:structuredClone(c.retainedBinding),retained:c.records()};}
 /** Confirmed atomic store cut, not an account grant or server publication claim. */
 retainedRecords():SegmentedRetainedRecords{if(this.#session.state().status==="closed")throw new SharedRelayError("segmented_session_closed");return this.#retained().durableRecords();}
 #port<K extends SegmentedRetainedKind>(kind:K):SegmentedRetainedPort<K>{const c=this.#retained();if(c.retainedBinding[kind]===null)throw new SharedRelayError("segmented_retained_store_unselected");return {kind,check:()=>this.#session.checkBorrowedSource(this.#core),writable:()=>this.#check(),read:()=>c.records()[kind] as NonNullable<SegmentedRetainedRecords[K]>,stage:record=>{this.#check();c.proposeRecord(kind,record);},write:async()=>{this.#session.checkBorrowedSource(this.#core);await this.#flushSource();}};}
 #opening<T>(create:()=>Promise<T>,discard:(value:T)=>Promise<void>):Promise<T>{this.#check();const work=(async()=>{const value=await create();try{this.#check();return value;}catch(error){await discard(value);throw error;}})();this.#openings.add(work);void work.finally(()=>this.#openings.delete(work)).catch(()=>{});return work;}
 async openSuggestionQueue():Promise<SharedSuggestionQueue<P>>{return this.#opening(async()=>{const c=this.#retained(),b=c.retainedBinding.suggestions;if(!b)throw new SharedRelayError("segmented_retained_store_unselected");const value=await SharedSuggestionQueue.open(withSegmentedRetainedPort({database:"atomic-generation-retained",identity:b.identity,storage:this,...(b.ownedHistory?{ownedHistory:b.ownedHistory}:{})},this.#port("suggestions")));this.#queue=value;return value;},value=>value.discardAndClose());}
 async openSuggestionRevisions(input:SharedSegmentedRevisionsOpenOptions<P>):Promise<SharedSuggestionRevisions<P>>{return this.#opening(async()=>{for(const key of ["storage","database","binding","queue"])if(key in input)throw new SharedRelayError("segmented_retained_factory_policy");if(input.autoStart!==undefined&&input.autoStart!==false)throw new SharedRelayError("segmented_retained_factory_policy");const b=this.#retained().retainedBinding.revisions;if(!b||!this.#queue)throw new SharedRelayError("segmented_retained_queue_required");const value=await SharedSuggestionRevisions.open(withSegmentedRetainedPort({...input,autoStart:false,database:"atomic-generation-retained",binding:b.binding,queue:this.#queue,storage:this},this.#port("revisions")));this.#revisions=value;return value;},value=>value.discardAndClose());}
 async openVersionCatalog(input:SharedSegmentedVersionsOpenOptions<P>):Promise<SharedDocumentVersions<P>>{return this.#opening(async()=>{for(const key of ["storage","database","identity"])if(key in input)throw new SharedRelayError("segmented_retained_factory_policy");if(input.autoConnect!==undefined&&input.autoConnect!==false)throw new SharedRelayError("segmented_retained_factory_policy");const b=this.#retained().retainedBinding.versions;if(!b)throw new SharedRelayError("segmented_retained_store_unselected");const value=await SharedDocumentVersions.open(withSegmentedRetainedPort({...input,autoConnect:false,database:"atomic-generation-retained",identity:b,storage:this},this.#port("versions")));this.#versions=value;return value;},value=>value.discardAndClose());}
 saveVersion(name:string,createdAtMs:string){return this.#session.saveVersion(name,createdAtMs);}
 retainVersion(packet:string){return this.#session.retainVersion(packet);}
 versions(){return this.#session.versions();}
 versionPacket(id:string){return this.#session.versionPacket(id);}
 #stop():void{this.#retiring=true;this.#revisions?.disconnect();this.#versions?.disconnect();for(const ref of this.#adapters)try{ref.deref()?.dispose();}catch{/* Source retirement still fences transport and releases no writer early. */}this.#adapters.clear();}
 #releaseRetained():void{this.#queue=undefined;this.#revisions=undefined;this.#versions=undefined;this.#retained().releaseRecords();}
 close():Promise<void>{try{if(!(this.#companion instanceof SegmentedRetainedCompanion)){this.#stop();return this.#session.close();}if(this.#session.state().status==="closed")return this.#released??Promise.resolve();if(this.#discarding)return this.#discarding;if(this.#closing)return this.#closing;this.#stop();retireOwnedCore(this.#core);this.#closing=Promise.resolve().then(async()=>{await Promise.allSettled([...this.#openings]);await this.#revisions?.close();await this.#queue?.close();await this.#versions?.close();await this.#session.close();this.#releaseRetained();}).finally(()=>{this.#closing=undefined;});this.#released=this.#closing;return this.#closing;}catch(error){return Promise.reject(error);}}
 discardAndClose():Promise<void>{try{if(!(this.#companion instanceof SegmentedRetainedCompanion)){this.#stop();return this.#session.discardAndClose();}if(this.#session.state().status==="closed")return this.#released??Promise.resolve();if(this.#discarding)return this.#discarding;this.#stop();retireOwnedCore(this.#core);const closing=this.#closing;this.#discarding=Promise.resolve().then(async()=>{await Promise.allSettled([...this.#openings,...(closing?[closing]:[])]);if(this.#session.state().status==="closed")return;await this.#revisions?.discardAndClose();await this.#queue?.discardAndClose();await this.#versions?.discardAndClose();await this.#session.discardAndClose();this.#releaseRetained();}).finally(()=>{this.#discarding=undefined;});this.#released=this.#discarding;return this.#discarding;}catch(error){return Promise.reject(error);}}
}
/** Genuine relay/retained parent only; no caller-selected head reader or LIVE
 * child export may stand in for this atomic durable source. */
export function captureRelayGenerationRecords<P extends SharedSelectionPolicy>(owner:SharedSegmentedRelaySession<P>,checkAuthority:()=>void,signal?:AbortSignal){return readRelayGenerationRecords(owner as unknown as SharedSegmentedRelaySession,checkAuthority,signal);}
