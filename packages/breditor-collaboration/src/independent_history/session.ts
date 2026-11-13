import {registerSessionDeliveryIO} from '../delivery_source/io.js';
import {requireLiveActorCore}from'../persistence/stopped_actor_source.js';
import {registerNativeActorSource}from'../persistence/native_actor_source.js';
import {checkSharedWriterLeaseForEscrow}from'../persistence/writer_lease.js';
import {checkReviewWriterLeaseForEscrow}from'../persistence/review_writer_lease.js';
import type {StoppedActorBinding}from'../persistence/stopped_actor_source.js';
import {ActorLeaseEscrow}from'../persistence/actor_lease_escrow.js';
import {createSharedWriterLeaseEscrow}from'../persistence/writer_lease.js';
import {requireStoppedActorCore,type StoppedActorCustody}from'../persistence/stopped_actor_source.js';
import {inheritActorLeaseInput,takeActorDocumentLease,takeActorReviewLease}from'../persistence/actor_lease_input.js';
/** Own one genuine editor and one atomic pair of independently selected native history lanes. */
import {retireOwnedCore,disposeOwnedCore} from '../owned_core_lifetime.js';
import {registerNativePendingWork} from '../native_pending_work.js';
import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from '../core.js';
import {initializeSharedReadOnly} from '../initialize_read_only.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import type {SharedSelectionPolicy,SharedEditorOptions,SharedRustOwner} from '../types.js';
import type {SharedDocumentVersionInfo} from '../version_types.js';
import {SharedWriterLease} from '../persistence/writer_lease.js';
import {ReviewWriterLease} from '../persistence/review_writer_lease.js';
import {fenceOpeningDatabase} from '../persistence/opening_database.js';
import {admitPairedVersions} from '../persistence/review_record_admission.js';
import {requireBackupRecovery} from '../backups/identity.js';
import {checkManagedCore} from '../managed_custody.js';
import {sourceCoreMethods as nativeCore} from '../source_native_read.js';
import {registerIndependentSource} from '../independent_source/admission.js';
import {registerIndependentHistoryNative} from './native_port.js';
import {independentOptionsIdentity} from './identity.js';
import {independentDeliveryCompanion,type IndependentHistoryCompanion} from './driver.js';
import {independentBootstrapDestination,independentBootstrapPolicy,independentBootstrapSignal} from './bootstrap_policy.js';
import {independentLocalHistoryCapturePolicy} from '../independent_local_operation/source_policy.js';
import {selectedLocalOperationDriver} from './local_driver.js';
import type {IndependentLocalOperationDriver} from './local_driver.js';
import {canonicalIndependentHistoryIdentity,makeIndependentHistoryCut} from './cut.js';
import {readExactHistoryDestination,type ExactHistoryDestination} from './exact_destination.js';
import {independentHistoryStores,openIndependentHistoryDatabase,readIndependentHistoryCut,writeIndependentHistoryCut} from './database.js';
import type {IndependentHistoryIdentity,IndependentHistoryCut,SharedIndependentHistorySessionOptions,SharedIndependentHistorySaveState,SharedIndependentHistoryRecovery} from './contract.js';
const constructionKey=Object.freeze({});
interface Capture {documentCheckpoint:string;reviewCheckpoint:string;versions:string[];documentRevision:string;reviewRevision:string;companion:string|null}
interface Attempt {capture:Capture;cut:IndependentHistoryCut|undefined}
const same=(a:Capture|undefined,b:Capture)=>!!a&&a.documentCheckpoint===b.documentCheckpoint&&a.reviewCheckpoint===b.reviewCheckpoint&&JSON.stringify(a.versions)===JSON.stringify(b.versions)&&a.companion===b.companion;
let readyActorCustody:(owner:SharedIndependentHistoryPersistentSession)=>StoppedActorBinding;
export const checkReadyIndependentSourceActors=<P extends SharedSelectionPolicy>(owner:SharedIndependentHistoryPersistentSession<P>):StoppedActorBinding=>readyActorCustody(owner as unknown as SharedIndependentHistoryPersistentSession);
let checkActorCustody:(owner:SharedIndependentHistoryPersistentSession)=>StoppedActorBinding;
export const checkStoppedIndependentSourceActors=<P extends SharedSelectionPolicy>(owner:SharedIndependentHistoryPersistentSession<P>):StoppedActorBinding=>checkActorCustody(owner as unknown as SharedIndependentHistoryPersistentSession);
let takeActorCustody:(owner:SharedIndependentHistoryPersistentSession)=>StoppedActorCustody;
/** Actual private source/lease fields only, never a copied stopped-state DTO. */
export const takeStoppedIndependentSourceActors=<P extends SharedSelectionPolicy>(owner:SharedIndependentHistoryPersistentSession<P>):StoppedActorCustody=>takeActorCustody(owner as unknown as SharedIndependentHistoryPersistentSession);
export class SharedIndependentHistoryPersistentSession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;readonly recovered:boolean;
 readonly #ownedCore:SharedRichEditor<P>;readonly #db:IDBDatabase;readonly #documentLease:SharedWriterLease;readonly #reviewLease:ReviewWriterLease;readonly #identity:IndependentHistoryIdentity;
 readonly #onError:((error:unknown)=>void)|undefined;readonly #onState:((state:SharedIndependentHistorySaveState)=>void)|undefined;
 readonly #companion:IndependentHistoryCompanion|undefined;
 readonly #localDriver:IndependentLocalOperationDriver|undefined;
 readonly #captureGuard:IndependentHistoryCompanion['nativeCaptureGuard'];
 readonly #persistenceSignal:AbortSignal|undefined;
 #bootstrapCheck:(()=>void)|undefined;
 #bootstrapDestination:ExactHistoryDestination|undefined;
 #bootstrapSignal:AbortSignal|undefined;
 #versions:Map<string,string>;#sourceStamp:object=Object.freeze({});#off:(()=>void)[]=[];#savedHead:string|null;#saved:Capture|undefined;#pending:Capture|undefined;#attempt:Attempt|undefined;#running:Promise<void>|undefined;#failure:unknown;
 #retiring=false;#storageChanged=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;#closedRevisions:{documentRevision:string|null;reviewRevision:string|null}|undefined;
 readonly #releasePendingWork:()=>void;
 private constructor(key:object,db:IDBDatabase,documentLease:SharedWriterLease,reviewLease:ReviewWriterLease,core:SharedRichEditor<P>,options:SharedIndependentHistorySessionOptions<P>,identity:IndependentHistoryIdentity,savedHead:string|null,versions:readonly string[],recovered:boolean,companion?:IndependentHistoryCompanion,bootstrapCheck?:()=>void,bootstrapSignal?:AbortSignal,localCapture?:ReturnType<typeof independentLocalHistoryCapturePolicy>,localDriver?:IndependentLocalOperationDriver,bootstrapDestination?:ExactHistoryDestination){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual independent history open or recovery factory');
  this.#db=db;this.#documentLease=documentLease;this.#reviewLease=reviewLease;this.core=core;this.#ownedCore=core;this.#identity=identity;this.#savedHead=savedHead;this.#onError=options.onError;this.#onState=options.onState;this.recovered=recovered;this.#versions=admitPairedVersions(core,versions);
  this.#releasePendingWork=registerNativePendingWork(core,()=>this.#running);
  this.#bootstrapCheck=bootstrapCheck;this.#bootstrapSignal=bootstrapSignal;this.#bootstrapDestination=bootstrapDestination;this.#bootstrapCheck?.();this.#companion=companion;this.#localDriver=localDriver;this.#captureGuard=localDriver?.nativeCaptureGuard??localCapture??companion?.nativeCaptureGuard;this.#persistenceSignal=localDriver?.nativeCaptureGuard.signal??localCapture?.signal;companion?.admit(core as unknown as SharedRichEditor<SharedSelectionPolicy>);
  this.#captureGuard?.capture(core as unknown as SharedRichEditor<SharedSelectionPolicy>,[...this.#versions.values()]);
  const check=()=>{this.#live();const owned=this.#bound();if((nativeCore.segmentedHistoryPolicy.call(owned)??'original')!==identity.documentHistory||nativeCore.reviewHistoryPolicy.call(owned)!==identity.reviewHistory)throw new SharedEditorError('independent_history_source','Both actual native families must remain selected');};
  const port={identity:structuredClone(identity),core:core as unknown as SharedRichEditor<SharedSelectionPolicy>,companion:!!companion,...(localDriver?{localOperation:localDriver.operation}:{}),check,checkManaged:()=>{check();this.#managed();},stamp:()=>{check();return this.#sourceStamp;},read:()=>{check();return this.#recovery();},checkBorrowed:(expected:object)=>{check();if(expected!==this.#ownedCore||this.#retiring||this.#storageChanged)throw new SharedEditorError('independent_history_retired','The original independent storage owner is no longer available');},savedCompanion:()=>{this.#live();return this.#saved?.companion??null;},persisted:()=>{check();this.#managed();const saved=this.#saved;if(!saved||this.#running||this.#pending||this.#attempt||this.#failure||!same(saved,this.#capture()))throw new SharedEditorError('independent_history_unsaved','Settle the actual complete paired save before retaining delivery progress');return{format:'breditor/shared-independent-history-recovery' as const,formatVersion:1 as const,identity:structuredClone(this.#identity),documentCheckpoint:saved.documentCheckpoint,reviewCheckpoint:saved.reviewCheckpoint,versions:Object.freeze([...saved.versions])};}};
  registerIndependentHistoryNative(this,localDriver?Object.freeze(port):port);if(!companion&&!localDriver)registerIndependentSource(this,port);
  registerSessionDeliveryIO(this,{core,check:port.checkManaged,save:()=>deliverySaveIntrinsic.call(this),flush:()=>deliveryFlushIntrinsic.call(this)});
  registerNativeActorSource(this,'independent',{document:documentLease,review:reviewLease});
  const save=()=>{try{this.save();}catch(error){this.#failed(error);}};let documentRevision=nativeCore.view.call(core).revision,reviewRevision=nativeCore.reviewSnapshot.call(core).reviewRevision;
  const changed=(document:string,review?:string)=>{if(document!==documentRevision||review!==undefined&&review!==reviewRevision){this.#sourceStamp=Object.freeze({});documentRevision=document;if(review!==undefined)reviewRevision=review;}save();};
  this.#off=[nativeCore.subscribe.call(core,event=>changed(event.view.revision)),nativeCore.subscribeReview.call(core,event=>changed(event.documentRevision,event.reviewRevision))];
  db.onversionchange=()=>{this.#storageChanged=true;try{companion?.retire();}finally{retireOwnedCore(core);db.close();this.#failed(new SharedEditorError('independent_history_versionchange','Storage changed; export exact readable histories before explicitly discarding'));}};
 }
 static{const inspect=(owner:SharedIndependentHistoryPersistentSession,stopped=true):StoppedActorBinding=>{if(!owner||typeof owner!=='object'||!(#ownedCore in owner))throw new SharedEditorError('actor_source_unavailable','Use the actual native persistence owner');if(owner.#closed||owner.#running||owner.#closing)throw new SharedEditorError('actor_source_in_use','Settle actual native persistence and cleanup before moving actor custody');if(Object.getOwnPropertyDescriptor(owner,'core')?.value!==owner.#ownedCore)throw new SharedEditorError('actor_source_unavailable','The original native core binding was replaced');if(stopped)requireStoppedActorCore(owner.#ownedCore);else requireLiveActorCore(owner.#ownedCore);const binding=Object.freeze({room:owner.#identity.native.room,writer:owner.#identity.native.writer,actor:owner.#identity.review.actor});checkSharedWriterLeaseForEscrow(owner.#documentLease,binding.room,binding.writer);if(binding.actor!==null)checkReviewWriterLeaseForEscrow(owner.#reviewLease!,binding.room,binding.actor);return binding;};readyActorCustody=owner=>inspect(owner,false);checkActorCustody=owner=>inspect(owner,true);takeActorCustody=owner=>{const binding=inspect(owner);return binding.actor===null?createSharedWriterLeaseEscrow(owner.#documentLease,binding.room,binding.writer):createStoppedActorEscrow(owner.#documentLease,owner.#reviewLease!,binding.room,binding.writer,binding.actor);};}
 static async open<Q extends SharedSelectionPolicy>(options:SharedIndependentHistorySessionOptions<Q>):Promise<SharedIndependentHistoryPersistentSession<Q>>{return this.#open(options);}
 /** Insert-only native replay into an absent destination after separate host writer reacquisition. */
 static async restoreRecovery<Q extends SharedSelectionPolicy>(options:SharedIndependentHistorySessionOptions<Q>,recovery:SharedIndependentHistoryRecovery,writerRecovery:'host-reacquired'):Promise<SharedIndependentHistoryPersistentSession<Q>>{
  requireBackupRecovery(writerRecovery);if(!recovery||Object.keys(recovery).sort().join(',')!=='documentCheckpoint,format,formatVersion,identity,reviewCheckpoint,versions'||recovery.format!=='breditor/shared-independent-history-recovery'||recovery.formatVersion!==1)throw new SharedEditorError('independent_history_recovery','Unknown paired native recovery family');
  const selected={...recovery,identity:canonicalIndependentHistoryIdentity(recovery.identity),versions:[...recovery.versions]};await makeIndependentHistoryCut(selected.documentCheckpoint,selected.reviewCheckpoint,selected.identity,selected.versions);return this.#open(options,selected);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedIndependentHistorySessionOptions<Q>,recovery?:SharedIndependentHistoryRecovery):Promise<SharedIndependentHistoryPersistentSession<Q>>{
  const actorInput=input,localCapture=independentLocalHistoryCapturePolicy(input),localDriver=selectedLocalOperationDriver(input),companion=independentDeliveryCompanion(input);if(localCapture&&companion||localDriver&&(localCapture||companion))throw new SharedEditorError('independent_local_operation_policy','Select one actual local origin, local journal or delivery storage profile');const lifetime=localDriver?.nativeCaptureGuard??localCapture,temporaryCheck=independentBootstrapPolicy(input),bootstrapCheck=lifetime?()=>{temporaryCheck?.();lifetime.check();}:temporaryCheck,bootstrapSignal=independentBootstrapSignal(input),bootstrapDestination=independentBootstrapDestination(input);bootstrapCheck?.();const identity=independentOptionsIdentity(input),storage=localDriver??companion;
  if(typeof input.readOnly!=='boolean'||typeof input.create!=='function'||!['read_only','comment','moderate'].includes(input.review.access)||input.documentHistory.kind==='original'&&typeof input.documentHistory.restoreOriginal!=='function'||input.documentHistory.kind==='segmented-v1'&&typeof input.documentHistory.restoreSegmented!=='function'||input.editor&&['selectionEditing','reviewedHistory','searchHistory','segmentedHistory'].some(key=>key in input.editor!))throw new SharedEditorError('independent_history_policy','Choose explicit current host policy and exact native recovery factories');
  if(recovery&&JSON.stringify(recovery.identity)!==JSON.stringify(identity))throw new SharedEditorError('independent_history_recovery','Recovery family, room, writer and account must match exactly');
  const options={...input,review:{...input.review},documentHistory:input.documentHistory.kind==='segmented-v1'?{...input.documentHistory,initialGenerations:{...input.documentHistory.initialGenerations}}:{...input.documentHistory},reviewHistory:input.reviewHistory.kind==='segmented-v1'?{...input.reviewHistory,initialGenerations:{...input.reviewHistory.initialGenerations}}:{...input.reviewHistory},...(input.editor?{editor:{...input.editor}}:{})};
  const documentLease=await(takeActorDocumentLease(actorInput,'independent',options.database,identity.native.room,identity.native.writer,identity.review.actor)??SharedWriterLease.acquire(identity.native.room,identity.native.writer));let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<Q>|undefined,raw:SharedRustOwner|undefined;
  try{
   bootstrapCheck?.();reviewLease=await(takeActorReviewLease(actorInput,'independent',options.database,identity.native.room,identity.native.writer,identity.review.actor)??ReviewWriterLease.acquire(identity.native.room,identity.review.actor));bootstrapCheck?.();db=await openIndependentHistoryDatabase(options.database,storage,bootstrapCheck);bootstrapCheck?.();const opening=fenceOpeningDatabase(db,'session_open_versionchange'),key=[identity.native.room,identity.native.writer] as const;
   const actualSaved=await readIndependentHistoryCut(db,key,storage);bootstrapCheck?.();
   if(bootstrapDestination){
    const check=()=>{bootstrapCheck?.();opening.assertCurrent();};
    const status=await readExactHistoryDestination(db,independentHistoryStores(storage),key,bootstrapDestination,check);
    if(recovery?status!=='empty'||actualSaved!==null:status!=='exact'||actualSaved?.head!==bootstrapDestination.cut.head)
     throw bootstrapDestination.fail();
   }
   if(actualSaved&&recovery)throw new SharedEditorError('independent_history_destination_exists','Recovery never overwrites a committed paired destination');if(actualSaved&&JSON.stringify(actualSaved.record.identity)!==JSON.stringify(identity))throw new SharedEditorError('independent_history_identity','Stored native families differ from the explicitly selected session');
   const saved=localDriver?await localDriver.persistence.select(actualSaved):companion?.persistence?await companion.persistence.select(actualSaved):actualSaved;bootstrapCheck?.();opening.assertCurrent();
   if(actualSaved&&!saved||saved&&JSON.stringify(saved.record.identity)!==JSON.stringify(identity))throw new SharedEditorError('independent_history_identity','The selected pending native pair must retain the actual source identity');
   if(saved)companion?.load(saved.head);
   const documentCheckpoint=saved?.documentCheckpoint??recovery?.documentCheckpoint,reviewCheckpoint=saved?.reviewCheckpoint??recovery?.reviewCheckpoint;
   raw=opening.admit(await(documentCheckpoint===undefined?options.create():options.documentHistory.kind==='original'?options.documentHistory.restoreOriginal(documentCheckpoint):options.documentHistory.restoreSegmented(documentCheckpoint)));
   bootstrapCheck?.();
   if(documentCheckpoint!==undefined)try{initializeSharedReadOnly(raw,options.readOnly);}catch(error){freeUnclaimedSharedRustOwner(raw);throw error;}
   const editor={...options.editor,...(identity.native.searchHistory?{searchHistory:identity.native.searchHistory}:{}),...(identity.native.reviewedHistory?{reviewedHistory:identity.native.reviewedHistory}:{}),...(documentCheckpoint!==undefined&&identity.documentHistory==='segmented-v1'?{segmentedHistory:'segmented-v1' as const}:{})} as Omit<SharedEditorOptions<'document-v1'>,'selectionEditing'>;
   core=(identity.native.selectionEditing==='document-v1'?createSharedDocumentEditor(raw,editor):new SharedRichEditor<'original'>(raw,editor)) as unknown as SharedRichEditor<Q>;
   if(core.richLanguageVersion()!==identity.native.richLanguage)throw new SharedEditorError('independent_history_identity','Native grammar differs from the selected paired history');
   if(identity.native.history==='typing-v1'){if(core.view().historyGrouping!=='typing-v1')core.enableTypingHistory();}else if(core.view().historyGrouping!==undefined)throw new SharedEditorError('independent_history_identity','Cannot flatten retained natural history');
   if(identity.native.rangeEditing==='general-v1'&&core.view().rangeEditing!=='general-v1')core.enableGeneralRanges();
   if(documentCheckpoint===undefined&&identity.documentHistory==='segmented-v1'){const generations=(options.documentHistory as Extract<typeof options.documentHistory,{kind:'segmented-v1'}>).initialGenerations;core.enableSegmentedHistory(generations.root,generations.active);}
   if(reviewCheckpoint!==undefined&&identity.reviewHistory==='segmented-v1')core.enableSegmentedReview(options.review,reviewCheckpoint);else{
    core.enableReview(options.review,reviewCheckpoint);
    if(identity.reviewHistory==='segmented-v1'){const generations=(options.reviewHistory as Extract<typeof options.reviewHistory,{kind:'segmented-v1'}>).initialGenerations;if(options.review.access==='read_only')core.enableReadOnlyReviewHistoryGenerations(generations.root,generations.active);else core.enableReviewHistoryGenerations(generations.root,generations.active);}
   }
   if(documentCheckpoint===undefined&&options.readOnly)core.setReadOnly(true);
   core.sealIndependentHistoryPolicies(identity.documentHistory,identity.reviewHistory,identity.native.history,identity.native.rangeEditing);
   const actualReview=identity.reviewHistory==='original'?core.reviewCheckpoint():core.reviewSegmentedCheckpoint();if(documentCheckpoint!==undefined&&(core.checkpointJson()!==documentCheckpoint||actualReview!==reviewCheckpoint))throw new SharedEditorError('independent_history_native_replay','Cold native replay must preserve both exact histories');
   bootstrapCheck?.();opening.assertCurrent();const session=new SharedIndependentHistoryPersistentSession(constructionKey,db,documentLease,reviewLease,core,options,identity,actualSaved?.head??null,saved?.record.versions??recovery?.versions??[],documentCheckpoint!==undefined,companion,bootstrapCheck,bootstrapSignal,localCapture,localDriver,bootstrapDestination);try{session.save();await session.flush();bootstrapCheck?.();session.#bootstrapCheck=undefined;session.#bootstrapSignal=undefined;session.#bootstrapDestination=undefined;return session;}catch(error){await session.discardAndClose();throw error;}
  }catch(error){try{if(core)disposeOwnedCore(core);}finally{try{if(raw)freeUnclaimedSharedRustOwner(raw);}finally{db?.close();try{await reviewLease?.close();}finally{await documentLease.close();}}}throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError('independent_history_closed','The paired history session is closed');this.#documentLease.assertLive();this.#reviewLease.assertLive();}
 #bound():SharedRichEditor<P>{const binding=Object.getOwnPropertyDescriptor(this,'core');if(!binding||binding.value!==this.#ownedCore)throw new SharedEditorError('independent_history_source','The original privately owned editor binding is required');return this.#ownedCore;}
 #managed():SharedRichEditor<P>{this.#live();const core=this.#bound();if(this.#retiring||this.#storageChanged)throw new SharedEditorError('independent_history_retired','The readable native source no longer has writable storage custody');checkManagedCore(core);return core;}
 #checkPersistence=():void=>{if(this.#localDriver&&this.#storageChanged)throw new SharedEditorError('independent_local_operation_storage_changed','The actual local operation source storage changed');this.#bootstrapCheck?.();this.#captureGuard?.check();};
 /** Readable recovery remains available when persistence authority/origin is lost. */
 #capture(forPersistence=false):Capture{const core=this.#bound(),versions=[...this.#versions.values()];if(forPersistence){this.#bootstrapCheck?.();this.#captureGuard?.capture(core as unknown as SharedRichEditor<SharedSelectionPolicy>,versions);}this.#bound();const review=nativeCore.reviewSnapshot.call(core);return{documentCheckpoint:nativeCore.checkpointJson.call(core),reviewCheckpoint:this.#identity.reviewHistory==='original'?nativeCore.reviewCheckpoint.call(core):nativeCore.reviewSegmentedCheckpoint.call(core),versions,documentRevision:nativeCore.view.call(core).revision,reviewRevision:review.reviewRevision,companion:this.#companion?.capture()??null};}
 async #makeCut(capture:Capture):Promise<IndependentHistoryCut>{const cut=await makeIndependentHistoryCut(capture.documentCheckpoint,capture.reviewCheckpoint,this.#identity,capture.versions);return this.#localDriver?{head:this.#localDriver.wrap(cut.head),files:cut.files}:this.#companion?{head:this.#companion.wrap(JSON.parse(cut.head),capture.companion!),files:cut.files}:cut;}
 #report(error:unknown):void{try{this.#onError?.(error);}catch{/* A reporting callback cannot revoke a committed cut. */}}
 #notify():void{try{this.#onState?.(this.state());}catch(error){this.#report(error);}}
 #failed(error:unknown):void{this.#failure=error;this.#report(error);this.#notify();}
 state():SharedIndependentHistorySaveState{return{status:this.#closed?'closed':this.#failure?'failed':this.#running||this.#pending||this.#attempt?'pending':'saved',documentRevision:this.#closedRevisions?.documentRevision??this.#saved?.documentRevision??null,reviewRevision:this.#closedRevisions?.reviewRevision??this.#saved?.reviewRevision??null,error:this.#failure?String(this.#failure):null};}
 #recovery():SharedIndependentHistoryRecovery{const capture=this.#capture();return{format:'breditor/shared-independent-history-recovery',formatVersion:1,identity:structuredClone(this.#identity),documentCheckpoint:capture.documentCheckpoint,reviewCheckpoint:capture.reviewCheckpoint,versions:Object.freeze([...capture.versions])};}
 exportRecovery():SharedIndependentHistoryRecovery{this.#live();if(this.#companion)throw new SharedEditorError('independent_delivery_recovery_required','Export the whole delivery cut, not an incomplete local-only history');return this.#recovery();}
 save():void{this.#live();if(this.#storageChanged)throw new SharedEditorError('independent_history_versionchange','The paired database changed');const capture=this.#capture(true);if(same(this.#saved,capture)&&!this.#pending&&!this.#attempt&&!this.#running&&!this.#failure)return;this.#pending=capture;this.#failure=undefined;this.#notify();this.#start();}
 #start():void{if(this.#closed||this.#failure||this.#running||!this.#pending&&!this.#attempt)return;this.#running=this.#drain().catch(error=>this.#failed(error)).finally(()=>{this.#running=undefined;if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{
  const persistence=this.#localDriver?.persistence??this.#companion?.persistence;
  while(!this.#closed&&(this.#attempt||this.#pending)){
   this.#documentLease.assertLive();this.#reviewLease.assertLive();
   if(!this.#attempt){const capture=this.#pending!;this.#pending=undefined;if(same(this.#saved,capture))continue;this.#attempt={capture,cut:undefined};}
   const attempt=this.#attempt;attempt.cut??=await this.#makeCut(attempt.capture);this.#checkPersistence();
   if(persistence){await persistence.prepare(this.#savedHead,attempt.cut);this.#checkPersistence();}
   await writeIndependentHistoryCut(this.#db,[this.#identity.native.room,this.#identity.native.writer],this.#savedHead,attempt.cut,this.#localDriver??this.#companion,this.#checkPersistence,this.#bootstrapSignal,this.#persistenceSignal,this.#bootstrapDestination);
   if(this.#closed){this.#attempt=undefined;return;}this.#checkPersistence();
   if(persistence){await persistence.acknowledge(attempt.cut);this.#checkPersistence();}
   this.#savedHead=attempt.cut.head;this.#saved=attempt.capture;this.#attempt=undefined;
   if(attempt.capture.companion!==null)this.#companion?.acknowledged(attempt.capture.companion);this.#notify();
  }
 }
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 async sealDocumentGeneration(next:string):Promise<void>{const core=this.#managed();core.sealHistoryGeneration(next);await this.flush();this.#managed();}
 async sealReadOnlyDocumentGeneration(next:string):Promise<void>{const core=this.#managed();core.sealReadOnlyHistoryGeneration(next);await this.flush();this.#managed();}
 async sealReviewGeneration(next:string):Promise<void>{const core=this.#managed();core.sealReviewHistoryGeneration(next);await this.flush();this.#managed();}
 async sealReadOnlyReviewGeneration(next:string):Promise<void>{const core=this.#managed();core.sealReadOnlyReviewHistoryGeneration(next);await this.flush();this.#managed();}
 versions():readonly SharedDocumentVersionInfo[]{this.#live();const core=this.#bound();return[...this.#versions.values()].map(packet=>core.readVersion(packet));}
 versionPacket(id:string):string{this.#live();const packet=this.#versions.get(id);if(packet===undefined)throw new SharedEditorError('version_unknown','Unknown immutable native version');return packet;}
 /** Budget/admit the whole proposed pair before changing the version catalog; source may not move while awaiting hashes. */
 async retainVersion(packet:string):Promise<SharedDocumentVersionInfo>{const core=this.#managed(),info=nativeCore.readVersion.call(core,packet),known=this.#versions.get(info.id);if(known!==undefined){if(known!==packet)throw new SharedEditorError('version_catalog','Immutable version has different bytes');await this.flush();return info;}const captured=this.#capture(),versions=[...captured.versions,packet];await this.#makeCut({...captured,versions});this.#managed();if(!same(captured,this.#capture()))throw new SharedEditorError('independent_history_stale','Source changed while checking the version catalog');this.#versions.set(info.id,packet);this.#sourceStamp=Object.freeze({});this.save();await this.flush();return info;}
 close():Promise<void>{try{if(this.#closed)return this.#releaseOwners();if(this.#closing)return this.#closing;this.#retiring=true;this.#companion?.retire();retireOwnedCore(this.#ownedCore);return this.#closing=Promise.resolve().then(async()=>{if(this.#closed){await this.#releaseOwners();return;}this.save();if(this.#closed){await this.#releaseOwners();return;}await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});}catch(error){return Promise.reject(error);}}
 discardAndClose():Promise<void>{
  try{
   if(this.#closed)return this.#releaseOwners();
   this.#closedRevisions={documentRevision:this.#saved?.documentRevision??null,reviewRevision:this.#saved?.reviewRevision??null};
   this.#closed=true;this.#releasePendingWork();this.#companion?.retire();retireOwnedCore(this.#ownedCore);
   for(const off of this.#off)off();this.#off=[];disposeOwnedCore(this.#ownedCore);
   this.#pending=undefined;this.#saved=undefined;this.#versions.clear();this.#db.close();
   const released=this.#releaseOwners();this.#notify();return released;
  }catch(error){return Promise.reject(error);}
 }
 /** Keep the same actual lease owners after a failed release. A retry performs
  * cleanup only; it never recreates the disposed native core or starts a save. */
 #releaseOwners():Promise<void>{
   if(this.#released)return this.#released;
   const released=(this.#running??Promise.resolve()).then(async()=>{
    this.#attempt=undefined;this.#savedHead=null;
    try{try{await this.#reviewLease.close();}finally{await this.#documentLease.close();}}
    finally{if(this.#localDriver)await this.#localDriver.persistence.release();else if(this.#companion?.persistence)await this.#companion.persistence.release();}
   });
   this.#released=released;void released.catch(()=>{if(this.#released===released)this.#released=undefined;});return released;
 }
}

/** Capture the SDK-owned constructor before any host factory/authority can
 * replace its public static entry. No callback may split actual actor moves. */
const createStoppedActorEscrow=ActorLeaseEscrow.create;

/** SDK method identities captured before host callbacks may shadow a facade. */
const deliverySaveIntrinsic=SharedIndependentHistoryPersistentSession.prototype.save,deliveryFlushIntrinsic=SharedIndependentHistoryPersistentSession.prototype.flush;
