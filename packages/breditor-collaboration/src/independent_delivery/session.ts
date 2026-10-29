import {registerCompoundMetadataSource,type PreparedCompoundMetadata} from '../metadata/compound_preparation.js';
import {withHeldMetadataOpen} from '../metadata/held_open.js';
import {dormantMetadataTransport,unconfiguredMetadataToken} from '../metadata/dormant_transport.js';
import type {NativeRelayDeliveryPort} from '../relay/native_delivery.js';
import {registerRetainedStoreOwner} from '../delivery_ports/retained.js';
import {registerSessionDeliveryIO} from '../delivery_source/io.js';
import {waitRetiredRelayWork} from '../relay/work_custody.js';
import {checkStoppedIndependentSourceActors}from'../independent_history/session.js';
import type {StoppedActorBinding}from'../persistence/stopped_actor_source.js';
import {takeStoppedIndependentSourceActors}from'../independent_history/session.js';
import type {StoppedActorCustody}from'../persistence/stopped_actor_source.js';
import {inheritActorLeaseInput}from'../persistence/actor_lease_input.js';
/** Own actual independent native lanes, receipts and all selected retained outboxes in one DB cut. */
import {SharedIndependentHistoryPersistentSession} from '../independent_history/session.js';
import {independentHistoryNative,type IndependentHistoryNativePort} from '../independent_history/native_port.js';
import {withIndependentDeliveryCompanion} from '../independent_history/driver.js';
import {forwardIndependentBootstrapPolicy} from '../independent_history/bootstrap_policy.js';
import {makeIndependentHistoryCut,canonicalIndependentHistoryIdentity} from '../independent_history/cut.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {retireOwnedCore} from '../owned_core_lifetime.js';
import {SharedRelayError} from '../relay/validation.js';
import {closed} from '../segmented_relay/validation.js';
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewRelayProgress} from '../relay/review_types.js';
import type {SharedSegmentedDocumentProgress,SharedSegmentedReviewReceipt} from '../segmented_relay/contract.js';
import type {SegmentedRetainedKind,SegmentedRetainedRecords} from '../segmented_relay/retained_contract.js';
import {withIndependentRetainedPort,type RetainedStorePort} from '../delivery_ports/retained.js';
import {SharedSuggestionQueue} from '../suggestions/queue.js';
import {SharedSuggestionRevisions} from '../suggestion_revisions/outbox.js';
import {SharedDocumentVersions} from '../versions/catalog.js';
import type {SharedSuggestionRevisionsOptions} from '../suggestion_revisions/types.js';
import type {SharedDocumentVersionsOptions} from '../versions/types.js';
import {IndependentDeliveryCompanion} from './companion.js';
import {registerIndependentDeliverySession} from './admission.js';
import {registerIndependentDeliverySource} from '../independent_delivery_source/admission.js';
import {guardedIndependentCompanion} from '../independent_operation/native_capture_guard.js';
import {journaledIndependentCompanion,operationJournalSelected,selectedOperationJournal} from '../independent_operation/journal_binding.js';
import type {IndependentOperationCutJournal} from '../independent_operation/cut_journal.js';
import {restoredIndependentCompanion,selectedRestoredOperationJournal} from '../restored_operation/source_binding.js';
import type {RestoredOperationJournal} from '../restored_operation/journal.js';
import {MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES,type SharedIndependentDeliveryOptions,type SharedIndependentDeliveryRecovery,type SharedIndependentDeliveryRecoveryOptions} from './contract.js';

export type SharedIndependentVersionsOpenOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedDocumentVersionsOptions<P>,'identity'|'database'|'storage'|'autoConnect'>&{autoConnect?:false};
export type SharedIndependentRevisionsOpenOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSuggestionRevisionsOptions<P>,'binding'|'database'|'storage'|'queue'|'autoStart'>&{autoStart?:false};
const metadataRead={versions:SharedDocumentVersions.prototype.exportRecovery,suggestions:SharedSuggestionQueue.prototype.exportRecovery,revisions:SharedSuggestionRevisions.prototype.exportRecovery};
const constructionKey=Object.freeze({});
let checkActorCustody:(owner:SharedIndependentDeliverySession)=>StoppedActorBinding;
export const checkStoppedIndependentDeliveryActors=<P extends SharedSelectionPolicy>(owner:SharedIndependentDeliverySession<P>):StoppedActorBinding=>checkActorCustody(owner as unknown as SharedIndependentDeliverySession);
let takeActorCustody:(owner:SharedIndependentDeliverySession)=>StoppedActorCustody;
export const takeStoppedIndependentDeliveryActors=<P extends SharedSelectionPolicy>(owner:SharedIndependentDeliverySession<P>):StoppedActorCustody=>takeActorCustody(owner as unknown as SharedIndependentDeliverySession);
export class SharedIndependentDeliverySession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #session:SharedIndependentHistoryPersistentSession<P>;readonly #native:IndependentHistoryNativePort;
 readonly #metadataCurrent=()=>this.#check();
 readonly #core:SharedRichEditor<P>;readonly #companion:IndependentDeliveryCompanion;readonly #operation:boolean;
 readonly #storage:{readonly core:SharedRichEditor<P>;save():void;flush():Promise<void>};
 #retiring=false;#adapters=new Set<WeakRef<{dispose():void}>>();#openings=new Set<Promise<unknown>>();
 #queue:SharedSuggestionQueue<P>|undefined;#revisions:SharedSuggestionRevisions<P>|undefined;#versions:SharedDocumentVersions<P>|undefined;
 #closing:Promise<void>|undefined;#discarding:Promise<void>|undefined;#released:Promise<void>|undefined;#releaseComplete=false;
 private constructor(key:object,session:SharedIndependentHistoryPersistentSession<P>,companion:IndependentDeliveryCompanion,operation?:IndependentOperationCutJournal|RestoredOperationJournal){
  if(key!==constructionKey)throw new SharedRelayError('managed_source_construction');
  this.#session=session;this.#native=independentHistoryNative(session);if(!this.#native.companion)throw new SharedRelayError('independent_delivery_required');this.#core=session.core;this.#companion=companion;this.#operation=!!operation;
  this.#storage=Object.freeze({core:this.#core,save:()=>this.#session.save(),flush:()=>this.#flushSource()});
  registerCompoundMetadataSource(this,this.#core,port=>this.#prepareMetadata(port));
  const saved=this.#native.savedCompanion();if(saved===null)throw new SharedRelayError('independent_delivery_unsaved');companion.acknowledged(saved);companion.setRetireHook(()=>this.#stop());
  registerIndependentDeliverySession(this,{core:this.#native.core,binding:structuredClone(companion.binding),check:()=>this.#check(),save:()=>this.#session.save(),flush:()=>this.#flushSource(),durable:()=>companion.durable(),persistDocument:progress=>this.#persistDocument(progress),persistReview:(progress,receipt)=>this.#persistReview(progress,receipt),track:adapter=>{this.#check();for(const ref of this.#adapters)if(!ref.deref())this.#adapters.delete(ref);this.#adapters.add(new WeakRef(adapter));}});
  registerSessionDeliveryIO(this,{core:this.#core,check:()=>this.#check(),save:()=>this.#session.save(),flush:()=>this.#flushSource(),review:{identity:()=>structuredClone(this.#companion.binding.review),progress:()=>{const progress=this.#companion.durable().review;if(!progress)throw new SharedRelayError('native_delivery_review_unbound');return progress;},persist:progress=>this.#persistReview(progress)}});
  registerIndependentDeliverySource(this,{core:this.#native.core,identity:companion.identity,...(operation?{operation}:{}),check:()=>this.#checkReadable(),stamp:()=>{this.#checkReadable();return[this.#native.stamp(),companion.sourceStamp()];},read:()=>this.#readRecovery()});
 }
 static{const inspect=(owner:SharedIndependentDeliverySession):StoppedActorBinding=>{if(!owner||typeof owner!=='object'||!(#session in owner)||Object.hasOwn(owner,'core'))throw new SharedRelayError('actor_source_unavailable');if(owner.#openings.size||owner.#closing||owner.#discarding)throw new SharedRelayError('actor_source_in_use');return checkStoppedIndependentSourceActors(owner.#session);};checkActorCustody=inspect;takeActorCustody=owner=>{inspect(owner);return takeStoppedIndependentSourceActors(owner.#session);};}
 static async open<Q extends SharedSelectionPolicy>(input:SharedIndependentDeliveryOptions<Q>):Promise<SharedIndependentDeliverySession<Q>>{
  if(this!==SharedIndependentDeliverySession)throw new SharedRelayError('independent_delivery_factory_receiver');
  if(operationJournalSelected(input)&&selectedRestoredOperationJournal(input))throw new SharedRelayError('independent_operation_factory');
  const {binding,retained,...options}=input,companion=new IndependentDeliveryCompanion(input),journal=journaledIndependentCompanion(input,companion)??restoredIndependentCompanion(input,companion),session=await SharedIndependentHistoryPersistentSession.open(inheritActorLeaseInput(input,forwardIndependentBootstrapPolicy(input,withIndependentDeliveryCompanion(options,journal??guardedIndependentCompanion(input,companion)))));
  try{return new SharedIndependentDeliverySession(constructionKey,session,companion,selectedOperationJournal(input)??selectedRestoredOperationJournal(input));}catch(error){await session.discardAndClose();throw error;}
 }
 static async restoreRecovery<Q extends SharedSelectionPolicy>(input:SharedIndependentDeliveryRecoveryOptions<Q>):Promise<SharedIndependentDeliverySession<Q>>{
  if(this!==SharedIndependentDeliverySession)throw new SharedRelayError('independent_delivery_factory_receiver');if(operationJournalSelected(input)||selectedRestoredOperationJournal(input))throw new SharedRelayError('independent_operation_factory');requireBackupRecovery(input.writerRecovery);
  const r=input.recovery;closed(r,'format,formatVersion,relay,retained,retainedBinding,source');if(r.format!=='breditor/shared-independent-delivery-recovery'||r.formatVersion!==1||new TextEncoder().encode(JSON.stringify(r)).length>MAX_INDEPENDENT_DELIVERY_RECOVERY_BYTES)throw new SharedRelayError('independent_delivery_recovery');
  closed(r.source,'documentCheckpoint,format,formatVersion,identity,reviewCheckpoint,versions');if(r.source.format!=='breditor/shared-independent-history-recovery'||r.source.formatVersion!==1||!Array.isArray(r.source.versions))throw new SharedRelayError('independent_delivery_recovery');
  const recovery=structuredClone(r),identity=canonicalIndependentHistoryIdentity(recovery.source.identity),companion=new IndependentDeliveryCompanion(input,recovery),cut=await makeIndependentHistoryCut(recovery.source.documentCheckpoint,recovery.source.reviewCheckpoint,identity,recovery.source.versions);
  companion.wrap(JSON.parse(cut.head),companion.capture());
  const {binding,retained,recovery:_recovery,writerRecovery,...options}=input,session=await SharedIndependentHistoryPersistentSession.restoreRecovery(inheritActorLeaseInput(input,forwardIndependentBootstrapPolicy(input,withIndependentDeliveryCompanion(options,guardedIndependentCompanion(input,companion)))),recovery.source,writerRecovery);
  try{return new SharedIndependentDeliverySession(constructionKey,session,companion);}catch(error){await session.discardAndClose();throw error;}
 }
 get core():SharedRichEditor<P>{return this.#core;}
 get recovered():boolean{return this.#session.recovered;}
 #check():void{if(this.#retiring||Object.hasOwn(this,'core'))throw new SharedRelayError('independent_delivery_retired');this.#native.checkManaged();this.#native.checkBorrowed(this.#core);}
 #checkReadable():void{if(Object.hasOwn(this,'core'))throw new SharedRelayError('independent_delivery_source');this.#native.check();}
 state(){return this.#session.state();}
 relayProgress(){return this.#companion.durable();}
 reviewRelayIdentity(){return structuredClone(this.#companion.binding.review);}
 reviewRelayProgress():SharedReviewRelayProgress{const progress=this.#companion.durable().review;if(!progress)throw new SharedRelayError('independent_delivery_binding');return progress;}
 persistReviewRelayProgress(progress:SharedReviewRelayProgress):Promise<void>{return this.#persistReview(progress);}
 async #persistReview(progress:SharedReviewRelayProgress,receipt?:SharedSegmentedReviewReceipt):Promise<void>{this.#check();const before=this.#companion.current();this.#companion.propose({...before,review:progress,reviewReceipt:receipt??before.reviewReceipt});await this.#flushSource();}
 async #persistDocument(progress:SharedSegmentedDocumentProgress):Promise<void>{this.#check();this.#companion.propose({...this.#companion.current(),document:progress});await this.#flushSource();}
 save():void{this.#session.save();}
 async #flushSource():Promise<void>{this.#session.save();await this.#session.flush();}
 flush():Promise<void>{return this.#flushSource();}
 async retry():Promise<void>{await this.#session.retry();if(this.#queue&&!this.#queue.state().closed)await this.#queue.retry();if(this.#revisions&&this.#revisions.state().status!=='closed')await this.#revisions.retry();if(this.#versions&&this.#versions.state().status!=='closed')await this.#versions.retry();}
 async sealDocumentGeneration(next:string):Promise<void>{this.#check();await this.#session.sealDocumentGeneration(next);}
 async sealReadOnlyDocumentGeneration(next:string):Promise<void>{this.#check();await this.#session.sealReadOnlyDocumentGeneration(next);}
 async sealReviewGeneration(next:string):Promise<void>{this.#check();await this.#session.sealReviewGeneration(next);}
 async sealReadOnlyReviewGeneration(next:string):Promise<void>{this.#check();await this.#session.sealReadOnlyReviewGeneration(next);}
 versions(){return this.#session.versions();}
 versionPacket(id:string){return this.#session.versionPacket(id);}
 async retainVersion(packet:string){this.#check();return this.#session.retainVersion(packet);}
 #readRecovery():SharedIndependentDeliveryRecovery{
  this.#checkReadable();const stamp=this.#native.stamp(),delivery=this.#companion.sourceStamp(),source=this.#native.read(),relay=this.#companion.current(),retained=this.#companion.records();
  this.#native.check();if(this.#native.stamp()!==stamp||this.#companion.sourceStamp()!==delivery)throw new SharedRelayError('independent_delivery_changed');
  return{format:'breditor/shared-independent-delivery-recovery',formatVersion:1,source,relay,retainedBinding:structuredClone(this.#companion.retainedBinding),retained};
 }
 exportRecovery():SharedIndependentDeliveryRecovery{if(this.#operation)throw new SharedRelayError('independent_operation_export_required');return this.#readRecovery();}
 retainedRecords():SegmentedRetainedRecords{if(this.#session.state().status==='closed')throw new SharedRelayError('independent_delivery_closed');return this.#companion.durableRecords();}
 #port<K extends SegmentedRetainedKind>(kind:K):RetainedStorePort<K>{const c=this.#companion;if(c.retainedBinding[kind]===null)throw new SharedRelayError('independent_retained_unselected');const port:RetainedStorePort<K>={kind,check:()=>this.#native.checkBorrowed(this.#core),writable:()=>this.#check(),read:()=>c.records()[kind] as NonNullable<SegmentedRetainedRecords[K]>,stage:record=>{this.#check();c.proposeRecord(kind,record);},write:async()=>{this.#native.checkBorrowed(this.#core);await this.#flushSource();}};registerRetainedStoreOwner(port,this,this.#core,()=>c.durableRecords()[kind]);return port;}
 #opening<T>(create:()=>Promise<T>,discard:(value:T)=>Promise<void>):Promise<T>{this.#check();const work=(async()=>{const value=await create();try{this.#check();return value;}catch(error){await discard(value);throw error;}})();this.#openings.add(work);void work.finally(()=>this.#openings.delete(work)).catch(()=>{});return work;}
 async openSuggestionQueue():Promise<SharedSuggestionQueue<P>>{return this.#openQueue();}
 #openQueue(held?:NativeRelayDeliveryPort):Promise<SharedSuggestionQueue<P>>{return this.#opening(async()=>{const b=this.#companion.retainedBinding.suggestions;if(!b)throw new SharedRelayError('independent_retained_unselected');const value=await SharedSuggestionQueue.open(this.#held(withIndependentRetainedPort({database:'atomic-independent-delivery',identity:b.identity,storage:this.#storage,...(b.ownedHistory?{ownedHistory:b.ownedHistory}:{})},this.#port('suggestions')),held));this.#queue=value;return value;},value=>value.discardAndClose());}
 async openSuggestionRevisions(input:SharedIndependentRevisionsOpenOptions<P>):Promise<SharedSuggestionRevisions<P>>{return this.#openRevisions(input);}
 #openRevisions(input:SharedIndependentRevisionsOpenOptions<P>,held?:NativeRelayDeliveryPort):Promise<SharedSuggestionRevisions<P>>{return this.#opening(async()=>{for(const key of ['storage','database','binding','queue'])if(key in input)throw new SharedRelayError('independent_retained_factory_policy');if(input.autoStart!==undefined&&input.autoStart!==false)throw new SharedRelayError('independent_retained_factory_policy');const b=this.#companion.retainedBinding.revisions;if(!b||!this.#queue)throw new SharedRelayError('independent_retained_queue_required');const value=await SharedSuggestionRevisions.open(this.#held(withIndependentRetainedPort({...input,autoStart:false,database:'atomic-independent-delivery',binding:b.binding,queue:this.#queue,storage:this.#storage},this.#port('revisions')),held));this.#revisions=value;return value;},value=>value.discardAndClose());}
 async openVersionCatalog(input:SharedIndependentVersionsOpenOptions<P>):Promise<SharedDocumentVersions<P>>{return this.#openVersions(input);}
 #openVersions(input:SharedIndependentVersionsOpenOptions<P>,held?:NativeRelayDeliveryPort):Promise<SharedDocumentVersions<P>>{return this.#opening(async()=>{for(const key of ['storage','database','identity'])if(key in input)throw new SharedRelayError('independent_retained_factory_policy');if(input.autoConnect!==undefined&&input.autoConnect!==false)throw new SharedRelayError('independent_retained_factory_policy');const b=this.#companion.retainedBinding.versions;if(!b)throw new SharedRelayError('independent_retained_unselected');const value=await SharedDocumentVersions.open(this.#held(withIndependentRetainedPort({...input,autoConnect:false,database:'atomic-independent-delivery',identity:b,storage:this.#storage},this.#port('versions')),held));this.#versions=value;return value;},value=>value.discardAndClose());}
 #held<T extends object>(input:T,port:NativeRelayDeliveryPort|undefined):T{return port?withHeldMetadataOpen(input,port):input;}
 #prepareMetadata(port:NativeRelayDeliveryPort):Promise<PreparedCompoundMetadata<P>>{return this.#opening(async()=>{
  port.check();const b=this.#companion.retainedBinding;
  if(b.suggestions&&!this.#queue)this.#queue=await this.#openQueue(port);
  port.check();if(b.revisions&&!this.#revisions){if(!this.#queue||!b.suggestions)throw new SharedRelayError('metadata_preparation_source');const transport=dormantMetadataTransport(this.#core,b.suggestions.identity,b.revisions.binding,this.#metadataCurrent);this.#revisions=await this.#openRevisions({transport,autoStart:false},port);}
  port.check();if(b.versions&&!this.#versions)this.#versions=await this.#openVersions({getToken:unconfiguredMetadataToken,autoConnect:false},port);
  port.check();if(this.#versions)metadataRead.versions.call(this.#versions);if(this.#queue)metadataRead.suggestions.call(this.#queue);if(this.#revisions)metadataRead.revisions.call(this.#revisions);port.check();return Object.freeze({versions:this.#versions??null,suggestions:this.#queue??null,revisions:this.#revisions??null});
 },async()=>{});}
 #stop():void{this.#retiring=true;for(const value of [this.#revisions,this.#versions])try{value?.disconnect();}catch{/* Retirement still fences every adapter. */}for(const ref of this.#adapters)try{ref.deref()?.dispose();}catch{/* A failed adapter cleanup cannot release source ownership early. */}this.#adapters.clear();}
 #releaseRecords():void{this.#queue=undefined;this.#revisions=undefined;this.#versions=undefined;this.#companion.releaseRecords();}
 /** A closed native source can still owe a journal/namespace release. Retry
  * that same real cleanup; never return a rejected attempt as completion. */
 close():Promise<void>{try{if(this.#releaseComplete)return this.#released??Promise.resolve();if(this.#discarding)return this.#discarding;if(this.#closing)return this.#closing;this.#stop();retireOwnedCore(this.#core);this.#closing=Promise.resolve().then(async()=>{await Promise.allSettled([...this.#openings]);await waitRetiredRelayWork(this.#core,[this.#queue,this.#revisions,this.#versions].filter((value):value is NonNullable<typeof value>=>value!==undefined));await this.#revisions?.close();await this.#queue?.close();await this.#versions?.close();await waitRetiredRelayWork(this.#core);await this.#session.close();this.#releaseRecords();this.#releaseComplete=true;}).finally(()=>{this.#closing=undefined;});this.#released=this.#closing;return this.#closing;}catch(error){return Promise.reject(error);}}
 discardAndClose():Promise<void>{try{if(this.#releaseComplete)return this.#released??Promise.resolve();if(this.#discarding)return this.#discarding;this.#stop();retireOwnedCore(this.#core);const closing=this.#closing;this.#discarding=Promise.resolve().then(async()=>{await Promise.allSettled([...this.#openings,...(closing?[closing]:[])]);await waitRetiredRelayWork(this.#core,[this.#queue,this.#revisions,this.#versions].filter((value):value is NonNullable<typeof value>=>value!==undefined));if(this.#releaseComplete)return;await this.#revisions?.discardAndClose();await this.#queue?.discardAndClose();await this.#versions?.discardAndClose();await waitRetiredRelayWork(this.#core);await this.#session.discardAndClose();this.#releaseRecords();this.#releaseComplete=true;}).finally(()=>{this.#discarding=undefined;});this.#released=this.#discarding;return this.#discarding;}catch(error){return Promise.reject(error);}}
}
