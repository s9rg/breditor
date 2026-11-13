import {registerSessionDeliveryIO} from '../delivery_source/io.js';
import {requireLiveActorCore}from'./stopped_actor_source.js';
import {registerNativeActorSource}from'./native_actor_source.js';
import {checkSharedWriterLeaseForEscrow}from'./writer_lease.js';
import {checkReviewWriterLeaseForEscrow}from'./review_writer_lease.js';
import type {StoppedActorBinding}from'./stopped_actor_source.js';
import {ActorLeaseEscrow}from'./actor_lease_escrow.js';
import {createSharedWriterLeaseEscrow}from'./writer_lease.js';
import {requireStoppedActorCore,type StoppedActorCustody}from'./stopped_actor_source.js';
import {inheritActorLeaseInput,takeActorDocumentLease,takeActorReviewLease}from'./actor_lease_input.js';
/** Generation-aware native sessions. No old database, checkpoint or writer identity is migrated. */
import {retireOwnedCore,disposeOwnedCore} from '../owned_core_lifetime.js';
import {registerNativePendingWork} from '../native_pending_work.js';
import {SharedEditorError,SharedRichEditor,createSharedDocumentEditor} from "../core.js";
import {initializeSharedReadOnly} from "../initialize_read_only.js";
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import type {SharedRustOwner,SharedSelectionPolicy,SharedEditorOptions} from "../types.js";
import type {SharedReviewPolicy} from "../review_types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {ReviewWriterLease} from "./review_writer_lease.js";
import {fenceOpeningDatabase} from "./opening_database.js";
import {openSegmentedDatabase,readSegmentedCut,writeSegmentedCut} from "./segmented_database.js";
import {canonicalSegmentedIdentity,checkSegmentedCapture,makeGenerationCut,previewSegmentedHead,readContinuedHead,readSegmentedHead} from "./segmented_head.js";
import {openContinuedHistory, type SharedContinuedHistoryOptions, type SharedContinueHistoryOptions} from "./continue_document_history.js";
import {segmentedCompanion,withSegmentedCompanion,type SegmentedSessionCompanion} from "./segmented_driver.js";
import {checkSegmentedCheckpoint,object} from "./segmented_checkpoint.js";
import {requireBackupRecovery} from "../backups/identity.js";
import {admitPairedVersions} from "./review_record_admission.js";
import type {SegmentedSessionIdentity,SegmentedReview,SegmentedCut} from "./segmented_contract.js";
import {registerGenerationNative,registerGenerationSource,generationNative} from "../generation_source/admission.js";
import {generationRecords} from "../generation_source/records.js";
import {generationOperationOrigin} from "../generation_operation/admission.js";
import {existingGenerationOperationSource} from "../generation_operation/existing_source.js";
import {sourceCoreMethods as nativeRead} from '../source_native_read.js';
import {managedCoreRetainedRevisions,checkManagedCore} from '../managed_custody.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {createGenerationRecordRead,type GenerationRecordRead} from './generation_record_read.js';

export interface SharedSegmentedSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SegmentedSessionIdentity,"selectionEditing"> {
 database:string;selectionEditing:P;readOnly:boolean;
 /** Initial IDs apply only to an absent dedicated store. Existing native generations never reset. */
 initialGenerations:{root:string;active:string};
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 restoreSegmented:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
 /** Current authenticated policy, not a role restored from a stored journal. */
 review?:SharedReviewPolicy;initialReviewCheckpoint?:string;
 editor?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing"|"reviewedHistory"|"searchHistory"|"segmentedHistory">;
 onError?:(error:unknown)=>void;onState?:(state:SharedSegmentedSaveState)=>void;
}
export interface SharedSegmentedSaveState {status:"saved"|"pending"|"failed"|"closed";documentRevision:string|null;reviewRevision:string|null;error:string|null}
/** Exact native recovery inputs, not saved permissions, credentials, assets or provider receipts. */
export interface SharedSegmentedRecovery {readonly format:"breditor/shared-generation-recovery";readonly formatVersion:1;readonly checkpoint:string;readonly reviewCheckpoint:string|null;readonly versions:readonly string[]}
/** Export of an explicitly continued generation session. */
export type SharedContinuedHistoryRecovery=Omit<SharedSegmentedRecovery,"formatVersion">&{readonly formatVersion:2};
export type SharedSegmentedRecoveryOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy>=Omit<SharedSegmentedSessionOptions<P>,"create"|"initialGenerations"|"initialReviewCheckpoint">&{recovery:SharedSegmentedRecovery;writerRecovery:"host-reacquired"};
interface Capture {checkpoint:string;review:SegmentedReview|null;versions:string[];documentRevision:string;reviewRevision:string|null;companion:string|null}
interface Attempt {capture:Capture;cut:SegmentedCut|undefined}
const same=(a:Capture|undefined,b:Capture)=>!!a&&a.checkpoint===b.checkpoint&&a.review?.checkpoint===b.review?.checkpoint&&JSON.stringify(a.versions)===JSON.stringify(b.versions)&&a.companion===b.companion;

/** Both leases precede cold native replay. Only complete superseded captures are coalesced. */
const constructionKey=Object.freeze({});
let readGenerationRecords:(owner:SharedSegmentedPersistentSession,authority:()=>void,signal?:AbortSignal)=>Promise<GenerationRecordRead>;
let readyActorCustody:(owner:SharedSegmentedPersistentSession)=>StoppedActorBinding;
export const checkReadySegmentedSourceActors=<P extends SharedSelectionPolicy>(owner:SharedSegmentedPersistentSession<P>):StoppedActorBinding=>readyActorCustody(owner as unknown as SharedSegmentedPersistentSession);
let checkActorCustody:(owner:SharedSegmentedPersistentSession)=>StoppedActorBinding;
export const checkStoppedSegmentedSourceActors=<P extends SharedSelectionPolicy>(owner:SharedSegmentedPersistentSession<P>):StoppedActorBinding=>checkActorCustody(owner as unknown as SharedSegmentedPersistentSession);
let takeActorCustody:(owner:SharedSegmentedPersistentSession)=>StoppedActorCustody;
/** Actual private source/lease fields only, never a copied stopped-state DTO. */
export const takeStoppedSegmentedSourceActors=<P extends SharedSelectionPolicy>(owner:SharedSegmentedPersistentSession<P>):StoppedActorCustody=>takeActorCustody(owner as unknown as SharedSegmentedPersistentSession);
export class SharedSegmentedPersistentSession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;readonly recovered:boolean;
 /** Immutable actor DATA: factory callbacks can retain their options object. */
 readonly #actorBinding:StoppedActorBinding;
 readonly #ownedCore:SharedRichEditor<P>;
 readonly #db:IDBDatabase;readonly #documentLease:SharedWriterLease;readonly #reviewLease:ReviewWriterLease|undefined;
 readonly #identity:SegmentedSessionIdentity;readonly #options:Pick<SharedSegmentedSessionOptions<P>,"review"|"onError"|"onState">;
 readonly #companion:SegmentedSessionCompanion|undefined;
 readonly #formatVersion:1|2;
 readonly #continuedPredecessor:string|undefined;
 #versions=new Map<string,string>();#sourceStamp:object=Object.freeze({});#off:(()=>void)[]=[];#pending:Capture|undefined;#attempt:Attempt|undefined;#running:Promise<void>|undefined;
 #savedHead:string|null;#saved:Capture|undefined;#closedSaved:{documentRevision:string|null;reviewRevision:string|null}|undefined;#failure:unknown;#closed=false;#retiring=false;#storageChanged=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 #recordReadEpoch:object=Object.freeze({});readonly #recordReaders=new Set<object>();
 readonly #releasePendingWork:()=>void;
 private constructor(key:object,db:IDBDatabase,lease:SharedWriterLease,reviewLease:ReviewWriterLease|undefined,core:SharedRichEditor<P>,options:Pick<SharedSegmentedSessionOptions<P>,"review"|"onError"|"onState">,identity:SegmentedSessionIdentity,head:string|null,versions:readonly string[],recovered=head!==null,companion?:SegmentedSessionCompanion,continued?:{checkpoint:string;predecessor:string}){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual generation session open or recovery factory');
  this.#formatVersion=continued?2:1;
  this.#continuedPredecessor=continued?.predecessor;
  this.#companion=companion;companion?.admit(core as unknown as SharedRichEditor<SharedSelectionPolicy>);
  this.#actorBinding=Object.freeze({room:identity.room,writer:identity.writer,actor:options.review?.actor??null});
  this.#db=db;this.#documentLease=lease;this.#reviewLease=reviewLease;this.#ownedCore=core;this.core=core;this.#options={...(options.review?{review:options.review}:{}),...(options.onError?{onError:options.onError}:{}),...(options.onState?{onState:options.onState}:{})};this.#identity=identity;this.#savedHead=head;this.recovered=recovered;this.#versions=admitPairedVersions(core,versions);
  this.#releasePendingWork=registerNativePendingWork(core,()=>this.#running);
  const segmentedPolicy=SharedRichEditor.prototype.segmentedHistoryPolicy;
  // Final custody checks must not invoke an application-supplied getter or method.
  const check=()=>{this.#live();if(segmentedPolicy.call(this.#boundCore())!=="segmented-v1")throw new SharedEditorError("segmented_source_unavailable","The actual generation source was replaced");},read=()=>{check();return this.#recovery();},review=options.review?{actor:options.review.actor,principal:options.review.principal}:null,stamp=()=>{check();return this.#sourceStamp;};
  const checkManaged=()=>{check();checkManagedCore(this.#ownedCore);if(this.#retiring||this.#storageChanged)throw new SharedEditorError("segmented_source_unavailable","The readable native source no longer has live storage custody");};
  if(this.#formatVersion===1){
   registerGenerationNative(this,{core:core as unknown as SharedRichEditor<SharedSelectionPolicy>,identity:structuredClone(identity),review,companion:!!companion,check,checkManaged,stamp,read});
   registerNativeActorSource(this,'segmented',{document:lease,...(reviewLease?{review:reviewLease}:{})});
   if(!companion)registerGenerationSource(this,{core:core as unknown as SharedRichEditor<SharedSelectionPolicy>,identity:{kind:"local",native:structuredClone(identity),review,relay:null,retained:null},check,checkManaged,stamp:()=>[stamp()],read:()=>generationRecords(read())});
  }else{
   if(segmentedPolicy.call(core)!=="continued-v2")throw new SharedEditorError("continued_history_storage_required","Use the exact continued document owner");
   this.#saved={checkpoint:continued!.checkpoint,review:review?{...review,checkpoint:core.reviewCheckpoint()}:null,versions:[...versions],documentRevision:core.view().revision,reviewRevision:review?core.reviewSnapshot().reviewRevision:null,companion:null};
  }
  if(this.#formatVersion===1)registerSessionDeliveryIO(this,{core,check:checkManaged,save:()=>deliverySaveIntrinsic.call(this),flush:()=>deliveryFlushIntrinsic.call(this)});
  const save=()=>{try{this.save();}catch(error){this.#failed(error);}};
  let documentRevision=core.view().revision,reviewRevision=options.review?core.reviewSnapshot().reviewRevision:null;
  const changed=(document:string,review?:string)=>{if(document!==documentRevision||review!==undefined&&review!==reviewRevision){this.#sourceStamp=Object.freeze({});documentRevision=document;if(review!==undefined)reviewRevision=review;}save();};
  this.#off=[core.subscribe(e=>changed(e.view.revision)),...(options.review?[core.subscribeReview(e=>changed(e.documentRevision,e.reviewRevision))]:[])];
  db.onversionchange=()=>{this.#storageChanged=true;try{this.#companion?.retire?.();}finally{retireOwnedCore(core);db.close();this.#failed(new SharedEditorError("segmented_versionchange","Generation storage changed; export the readable native histories before explicitly discarding"));}};
 }
 static{const inspect=(owner:SharedSegmentedPersistentSession,stopped=true):StoppedActorBinding=>{if(!owner||typeof owner!=='object'||!(#ownedCore in owner))throw new SharedEditorError('actor_source_unavailable','Use the actual native persistence owner');if(owner.#closed||owner.#running||owner.#closing)throw new SharedEditorError('actor_source_in_use','Settle actual native persistence and cleanup before moving actor custody');if(Object.getOwnPropertyDescriptor(owner,'core')?.value!==owner.#ownedCore)throw new SharedEditorError('actor_source_unavailable','The original native core binding was replaced');if(stopped)requireStoppedActorCore(owner.#ownedCore);else requireLiveActorCore(owner.#ownedCore);const binding=owner.#actorBinding;checkSharedWriterLeaseForEscrow(owner.#documentLease,binding.room,binding.writer);if(binding.actor!==null)checkReviewWriterLeaseForEscrow(owner.#reviewLease!,binding.room,binding.actor);return binding;};readyActorCustody=owner=>inspect(owner,false);checkActorCustody=owner=>inspect(owner,true);takeActorCustody=owner=>{const binding=inspect(owner);return binding.actor===null?createSharedWriterLeaseEscrow(owner.#documentLease,binding.room,binding.writer):createStoppedActorEscrow(owner.#documentLease,owner.#reviewLease!,binding.room,binding.writer,binding.actor);};}
 static{readGenerationRecords=async(owner,provided,signal)=>{
  const fail=(suffix:string)=>new SharedEditorError('generation_record_read_'+suffix,'Read the actual complete selected generation cut with independent current read permission');
  if(!owner||typeof owner!=='object'||!(#ownedCore in owner))throw fail('source');const authority=participantAuthority(provided);if(owner.#recordReaders.size>=8)throw fail('busy');
  const core=owner.#ownedCore,epoch=owner.#recordReadEpoch,stamp=owner.#sourceStamp,attempt=owner.#attempt,pending=owner.#pending,saved=owner.#saved,savedHead=owner.#savedHead,revision=managedCoreRetainedRevisions(core),companion=owner.#companion?.capture()??null,token=Object.freeze({});owner.#recordReaders.add(token);
  let released=false,complete=false,finish!:()=>void,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined,result:GenerationRecordRead|undefined;const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;owner.#recordReaders.delete(token);observation?.release();finish();}};
  const current=()=>{if(released||!owner.#recordReaders.has(token))throw fail('closed');generationNative(owner).checkManaged();if(owner.#running||owner.#recordReadEpoch!==epoch||owner.#sourceStamp!==stamp||owner.#attempt!==attempt||owner.#pending!==pending||owner.#saved!==saved||owner.#savedHead!==savedHead||(owner.#companion?.capture()??null)!==companion)throw fail('changed');const now=managedCoreRetainedRevisions(core);if(now.documentRevision!==revision.documentRevision||now.reviewRevision!==revision.reviewRevision)throw fail('changed');if(observation?.aborted())throw fail('aborted');};
  const check=()=>{current();authority();current();},readStored=async()=>{try{return await readSegmentedCut(owner.#db,[owner.#identity.room,owner.#identity.writer],owner.#companion?.readHead);}catch(error){throw retainInternalFailureCause(fail('record'),error);}};
  try{observation=observeIndependentRecoveryAbort(signal,held);check();const review=owner.#options.review,live:Capture={checkpoint:nativeRead.checkpointJson.call(core),review:review?{actor:review.actor,principal:review.principal,checkpoint:nativeRead.reviewCheckpoint.call(core)}:null,versions:[...owner.#versions.values()],documentRevision:revision.documentRevision,reviewRevision:review?revision.reviewRevision:null,companion};owner.#checkCapture(live);check();const committed=await readStored();check();if(!committed)throw fail('missing');if(JSON.stringify(committed.record.identity)!==JSON.stringify(owner.#identity)||JSON.stringify(committed.record.review&&{actor:committed.record.review.actor,principal:committed.record.review.principal})!==JSON.stringify(review?{actor:review.actor,principal:review.principal}:null))throw fail('identity');const json=JSON.stringify(committed);result=createGenerationRecordRead({format:'breditor/persistent-generation-record-read',formatVersion:1,scope:'atomic-generation-committed-attempt-pending-live',committed,attempt:attempt?{capture:attempt.capture,cut:attempt.cut??null}:null,pending:pending??null,live},{check,current,verify:async()=>{check();const actual=await readStored();check();if(JSON.stringify(actual)!==json)throw fail('changed');},release});result.check();complete=true;return result;}
  finally{if(!complete){result?.dispose();release();}}
 };}
 static async open<Q extends SharedSelectionPolicy>(input:SharedSegmentedSessionOptions<Q>):Promise<SharedSegmentedPersistentSession<Q>>{return this.#open(input);}
 /** Open an existing continued head under fresh document and review leases. */
 static openContinued<Q extends SharedSelectionPolicy>(input:SharedContinuedHistoryOptions<Q>){
  return this.#continued(input);
 }
 /** Replace the selected V1 head atomically after the actual source owner has closed. */
 static continueHistory<Q extends SharedSelectionPolicy>(input:SharedContinueHistoryOptions<Q>){
  return this.#continued(input,input);
 }
 static #continued<Q extends SharedSelectionPolicy>(input:SharedContinuedHistoryOptions<Q>,migration?:SharedContinueHistoryOptions<Q>){
  return openContinuedHistory(input,migration,work=>new SharedSegmentedPersistentSession(constructionKey,work.db,work.lease,work.reviewLease,work.core,work.options,work.identity,work.head,work.versions,true,undefined,{checkpoint:work.checkpoint,predecessor:work.predecessor}));
 }
 /** Native admission into an absent dedicated destination, after host reacquisition/fencing. Never merge or overwrite. */
 static async restoreRecovery<Q extends SharedSelectionPolicy>(input:SharedSegmentedRecoveryOptions<Q>):Promise<SharedSegmentedPersistentSession<Q>>{
  requireBackupRecovery(input.writerRecovery);object(input.recovery,"checkpoint,format,formatVersion,reviewCheckpoint,versions");
  const r=input.recovery;if(r.format!=="breditor/shared-generation-recovery"||r.formatVersion!==1||typeof r.checkpoint!=="string"||r.reviewCheckpoint!==null&&typeof r.reviewCheckpoint!=="string"||!Array.isArray(r.versions)||r.versions.length>32||r.versions.some(v=>typeof v!=="string"))throw new SharedEditorError("segmented_recovery","Unknown native generation recovery input");
  const {recovery:_recovery,writerRecovery:_writerRecovery,...options}=input;
  const identity=canonicalSegmentedIdentity({room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,searchHistory:options.searchHistory,reviewedHistory:options.reviewedHistory}),a=checkSegmentedCheckpoint(r.checkpoint,identity);
  const selected={...r,versions:[...r.versions]};
  const opening={...options,initialGenerations:{root:a.rootGeneration,active:(JSON.parse(a.active) as {generation:string}).generation},create:()=>{throw new SharedEditorError("segmented_recovery","Recovery cannot fall back to a fresh document");}},companion=segmentedCompanion(input);
  return this.#open(inheritActorLeaseInput(input,companion?withSegmentedCompanion(opening,companion):opening),selected);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedSegmentedSessionOptions<Q>,recovery?:SharedSegmentedRecovery):Promise<SharedSegmentedPersistentSession<Q>>{
  const actorInput=input,companion=segmentedCompanion(input),operation=generationOperationOrigin(input);if(operation&&recovery)throw new SharedEditorError("segmented_session_policy","Operational adoption never restores over a selected destination");operation?.check();
  const identity=canonicalSegmentedIdentity({room:input.room,writer:input.writer,richLanguage:input.richLanguage,history:input.history,rangeEditing:input.rangeEditing,selectionEditing:input.selectionEditing,searchHistory:input.searchHistory,reviewedHistory:input.reviewedHistory});
  if(typeof input.readOnly!=="boolean"||typeof input.create!=="function"||typeof input.restoreSegmented!=="function"||!input.initialGenerations||typeof input.initialGenerations.root!=="string"||typeof input.initialGenerations.active!=="string")throw new SharedEditorError("segmented_session_policy","Explicit generation recovery, IDs and current editing policy are required");
  if(input.reviewedHistory&&(!input.review||input.review.principal!==input.reviewedHistory.principal)||!input.review&&input.initialReviewCheckpoint!==undefined)throw new SharedEditorError("segmented_review_policy","Reviewed ownership and initial comments require the matching explicitly paired account");
  const options={...input,initialGenerations:{...input.initialGenerations},...(input.review?{review:{...input.review}}:{}),...(input.editor?{editor:{...input.editor}}:{})};
  if(options.editor&&["selectionEditing","reviewedHistory","searchHistory","segmentedHistory"].some(k=>k in options.editor!))throw new SharedEditorError("segmented_session_policy","Pin generation policies through the dedicated session, not nested editor options");
  const lease=await(takeActorDocumentLease(actorInput,'segmented',options.database,identity.room,identity.writer,options.review?.actor??null)??SharedWriterLease.acquire(identity.room,identity.writer));let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<Q>|undefined,raw:SharedRustOwner|undefined;
  try{
   if(options.review)reviewLease=await(takeActorReviewLease(actorInput,'segmented',options.database,identity.room,identity.writer,options.review.actor)??ReviewWriterLease.acquire(identity.room,options.review.actor));
   const existing=operation?await existingGenerationOperationSource(options.database,[identity.room,identity.writer],companion?.readHead??readSegmentedHead):undefined;db=existing?.db;operation?.check();db??=await openSegmentedDatabase(options.database);const opening=existing?.opening??fenceOpeningDatabase(db,"session_open_versionchange"),saved=await readSegmentedCut(db,[identity.room,identity.writer],companion?.readHead);operation?.check();if(operation&&(!saved||saved.head!==existing!.head))throw new SharedEditorError("segmented_native_replay","Operational source changed or disappeared while opening");
   if(recovery&&saved)throw new SharedEditorError("segmented_destination_exists","Recovery cannot overwrite an existing generation head");
   if(saved)companion?.load(saved.head);
   if(saved&&(JSON.stringify(saved.record.identity)!==JSON.stringify(identity)||!!saved.record.review!==!!options.review||saved.record.review&&(saved.record.review.actor!==options.review?.actor||saved.record.review.principal!==options.review.principal)))throw new SharedEditorError("segmented_session_identity","Stored generation/account policy differs from the selected session");
   const source=saved?.checkpoint??recovery?.checkpoint,sourceReview=saved?.record.review?.checkpoint??recovery?.reviewCheckpoint??null;
   if(recovery){if((sourceReview!==null)!==!!options.review)throw new SharedEditorError("segmented_recovery","Recovery comment lane differs from the selected account");checkSegmentedCapture(recovery.checkpoint,identity,options.review?{actor:options.review.actor,principal:options.review.principal,checkpoint:sourceReview!}:null,recovery.versions);}
   raw=opening.admit(await(source!==undefined?options.restoreSegmented(source):options.create()));
   if(source!==undefined){
    // Factory cleanup may release a fresh result, never an object owned by another editor.
    try{initializeSharedReadOnly(raw,options.readOnly);}catch(error){freeUnclaimedSharedRustOwner(raw);throw error;}
   }
   const editor={...options.editor,...(identity.searchHistory?{searchHistory:identity.searchHistory}:{}),...(identity.reviewedHistory?{reviewedHistory:identity.reviewedHistory}:{}),...(source!==undefined?{segmentedHistory:"segmented-v1" as const}:{})};
   core=(identity.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):new SharedRichEditor<"original">(raw,editor)) as unknown as SharedRichEditor<Q>;
   if(core.richLanguageVersion()!==identity.richLanguage)throw new SharedEditorError("segmented_session_identity","Native grammar differs from the selected generation store");
   if(identity.history==="typing-v1"){if(core.view().historyGrouping!=="typing-v1")core.enableTypingHistory();}else if(core.view().historyGrouping!==undefined)throw new SharedEditorError("segmented_session_policy","Cannot flatten retained natural history");
   if(identity.rangeEditing==="general-v1"&&core.view().rangeEditing!=="general-v1")core.enableGeneralRanges();
   if(options.review)core.enableReview(options.review,sourceReview??options.initialReviewCheckpoint);
   if(source===undefined){core.enableSegmentedHistory(options.initialGenerations.root,options.initialGenerations.active);if(options.readOnly)core.setReadOnly(true);}
   core.sealSegmentedPolicies(identity.history,identity.rangeEditing);
   if(source!==undefined&&(core.checkpointJson()!==source||options.review&&core.reviewCheckpoint()!==sourceReview))throw new SharedEditorError("segmented_native_replay","Native replay must preserve the exact document and comment files");
   operation?.verifyCore(core as unknown as SharedRichEditor<SharedSelectionPolicy>,saved!.record.versions,companion);
   opening.assertCurrent();const session=new SharedSegmentedPersistentSession(constructionKey,db,lease,reviewLease,core,options,identity,saved?.head??null,saved?.record.versions??recovery?.versions??[],source!==undefined,companion);
   session.save();try{await session.flush();}catch(error){await session.discardAndClose();throw error;}return session;
  }catch(error){try{if(core)disposeOwnedCore(core);}finally{try{if(raw)freeUnclaimedSharedRustOwner(raw);}finally{db?.close();try{await reviewLease?.close();}finally{await lease.close();}}}throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError("segmented_session_closed","The generation session is closed");this.#documentLease.assertLive();this.#reviewLease?.assertLive();}
 /** A public facade property is not native custody. Never invoke a replacement accessor. */
 #boundCore():SharedRichEditor<P>{const binding=Object.getOwnPropertyDescriptor(this,"core");if(!binding||binding.value!==this.#ownedCore)throw new SharedEditorError("segmented_source_unavailable","The actual generation source was replaced");return this.#ownedCore;}
 /** Exact live borrowed owner check; a DTO or copied identity cannot manufacture source custody. */
 checkBorrowedSource(core:SharedRichEditor<P>):void{this.#live();if(core!==this.#boundCore()||this.#retiring||this.#storageChanged)throw new SharedEditorError("segmented_source_unavailable","The original generation source is no longer available for transport");}
 /** Private-family companions can distinguish acknowledged storage from an uncertain attempt. */
 savedCompanion():string|null{this.#live();return this.#saved?.companion??null;}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Host reporting cannot change a durable cut. */}}
 #notify():void{try{this.#options.onState?.(this.state());}catch(error){this.#report(error);}}
 #failed(error:unknown):void{this.#failure=error;this.#report(error);this.#notify();}
 #capture():Capture{const core=this.#boundCore(),review=this.#options.review,snapshot=review?core.reviewSnapshot():null,capture={checkpoint:core.checkpointJson(),review:review?{actor:review.actor,principal:review.principal,checkpoint:core.reviewCheckpoint()}:null,versions:[...this.#versions.values()],documentRevision:core.view().revision,reviewRevision:snapshot?.reviewRevision??null,companion:this.#companion?.capture()??null};this.#boundCore();return capture;}
 #checkCapture(capture:Capture):void{checkSegmentedCapture(capture.checkpoint,this.#identity,capture.review,capture.versions,this.#formatVersion);if(this.#companion)this.#companion.wrap(JSON.parse(previewSegmentedHead(capture.checkpoint,this.#identity,capture.review,capture.versions)),capture.companion!);}
 state():SharedSegmentedSaveState{return{status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#attempt||this.#running?"pending":"saved",documentRevision:this.#closedSaved?.documentRevision??this.#saved?.documentRevision??null,reviewRevision:this.#closedSaved?.reviewRevision??this.#saved?.reviewRevision??null,error:this.#failure?String(this.#failure):null};}
 /** Exact native files remain exportable after write/version-change failures; no role is exported. */
 #recovery():SharedSegmentedRecovery{this.#live();const c=this.#capture();return Object.freeze({format:"breditor/shared-generation-recovery",formatVersion:1,checkpoint:c.checkpoint,reviewCheckpoint:c.review?.checkpoint??null,versions:Object.freeze([...c.versions])});}
 exportRecovery():SharedSegmentedRecovery{if(this.#formatVersion!==1)throw new SharedEditorError("continued_history_storage_required","Export the continued recovery format");return this.#recovery();}
 exportContinuedRecovery():SharedContinuedHistoryRecovery{
  if(this.#formatVersion!==2)throw new SharedEditorError("continued_history_storage_required","Select continued document history");
  const capture=this.#capture();
  this.#checkCapture(capture);
  return Object.freeze({format:"breditor/shared-generation-recovery",formatVersion:2,checkpoint:capture.checkpoint,reviewCheckpoint:capture.review?.checkpoint??null,versions:Object.freeze(capture.versions)});
 }
 save():void{this.#live();this.#recordReadEpoch=Object.freeze({});if(this.#storageChanged)throw new SharedEditorError("segmented_versionchange","The generation database changed");const capture=this.#capture();this.#checkCapture(capture);if(same(this.#saved,capture)&&!this.#attempt&&!this.#pending&&!this.#running&&!this.#failure)return;this.#pending=capture;this.#failure=undefined;this.#notify();this.#start();}
 #start():void{if(this.#running||this.#closed||this.#failure||!this.#attempt&&!this.#pending)return;this.#running=this.#drain().catch(error=>this.#failed(error)).finally(()=>{this.#running=undefined;if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(!this.#closed&&(this.#attempt||this.#pending)){
  this.#documentLease.assertLive();this.#reviewLease?.assertLive();
  if(!this.#attempt){const capture=this.#pending!;this.#pending=undefined;if(same(this.#saved,capture))continue;this.#attempt={capture,cut:undefined};}
  const attempt=this.#attempt;if(!attempt.cut){const cut=await makeGenerationCut(attempt.capture.checkpoint,this.#identity,attempt.capture.review,attempt.capture.versions,this.#formatVersion);attempt.cut=this.#companion?{head:this.#companion.wrap(JSON.parse(cut.head),attempt.capture.companion!),files:cut.files}:cut;}
  await writeSegmentedCut(this.#db,[this.#identity.room,this.#identity.writer],this.#savedHead,attempt.cut,this.#formatVersion===2?readContinuedHead:this.#companion?.readHead,this.#continuedPredecessor===undefined?undefined:{predecessor:this.#continuedPredecessor});
  if(this.#closed){this.#attempt=undefined;return;}
  this.#savedHead=attempt.cut.head;this.#saved=attempt.capture;this.#attempt=undefined;if(attempt.capture.companion!==null)this.#companion?.acknowledged?.(attempt.capture.companion);this.#notify();
 }}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 /** Retry the exact uncertain attempt first. A newer pending capture cannot overwrite an unacknowledged cut. */
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Closes only the document generation. The paired comment journal and both Undo/Redo stacks remain. */
 async sealGeneration(next:string):Promise<void>{this.#live();this.#boundCore().sealHistoryGeneration(next);await this.flush();}
 /** Explicit observer archive operation; native read-only and zero-prefix checks remain live. */
 async sealObserverGeneration(next:string):Promise<void>{this.#live();this.#boundCore().sealObserverHistoryGeneration(next);await this.flush();}
 /** Archive current read-only former-author document history; paired comments and current grants remain unchanged. */
 async sealReadOnlyGeneration(next:string):Promise<void>{this.#live();const source=generationNative(this);source.checkManaged();source.core.sealReadOnlyHistoryGeneration(next);await this.flush();source.checkManaged();}
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo{this.#live();if(!this.#options.review)throw new SharedEditorError("segmented_review_policy","Named paired versions require an explicit review account");return this.retainVersion(this.#boundCore().captureVersion(name,this.#options.review.principal,createdAtMs));}
 retainVersion(packet:string):SharedDocumentVersionInfo{this.#live();checkManagedCore(this.#ownedCore);if(this.#retiring||this.#storageChanged)throw new SharedEditorError("segmented_session_closing","Cannot change the version catalog after retirement or a storage change");const info=this.#boundCore().readVersion(packet),known=this.#versions.get(info.id);checkManagedCore(this.#ownedCore);if(known!==undefined){if(known!==packet)throw new SharedEditorError("version_catalog","Immutable version has different bytes");return info;}if(this.#versions.size>=32||new TextEncoder().encode(packet).length>4*1024*1024)throw new SharedEditorError("version_catalog","The original named-version budget is full");const c=this.#capture();this.#checkCapture({...c,versions:[...c.versions,packet]});checkManagedCore(this.#ownedCore);this.#versions.set(info.id,packet);this.#sourceStamp=Object.freeze({});this.save();return info;}
 versions():readonly SharedDocumentVersionInfo[]{this.#live();const core=this.#boundCore();return [...this.#versions.values()].map(p=>core.readVersion(p));}
 versionPacket(id:string):string{this.#live();const packet=this.#versions.get(id);if(packet===undefined)throw new SharedEditorError("version_unknown","Unknown immutable version");return packet;}
 /** Retire first. Failed final persistence retains readable histories and both leases for retry. */
 close():Promise<void>{try{return this.#close();}catch(error){return Promise.reject(error);}}
 #close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;retireOwnedCore(this.#ownedCore);this.#closing=Promise.resolve().then(async()=>{if(this.#closed){await this.#released;return;}this.save();await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 /** Explicitly abandon unsaved memory; never delete an immutable file or committed head. */
 discardAndClose():Promise<void>{try{return this.#discardAndClose();}catch(error){return Promise.reject(error);}}
 #discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();this.#closedSaved={documentRevision:this.#saved?.documentRevision??null,reviewRevision:this.#saved?.reviewRevision??null};this.#closed=true;this.#releasePendingWork();retireOwnedCore(this.#ownedCore);for(const off of this.#off)off();this.#off=[];disposeOwnedCore(this.#ownedCore);this.#pending=undefined;this.#saved=undefined;this.#versions.clear();this.#db.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{this.#attempt=undefined;this.#savedHead=null;try{await this.#reviewLease?.close();}finally{await this.#documentLease.close();}});this.#notify();return this.#released;}
}
/** Private actual-source discovery. One transaction reads the complete committed
 * head and referenced files. Reading never flushes, acknowledges or edits. */
export function captureSegmentedPersistentRecords<P extends SharedSelectionPolicy>(owner:SharedSegmentedPersistentSession<P>,checkAuthority:()=>void,signal?:AbortSignal){return readGenerationRecords(owner as unknown as SharedSegmentedPersistentSession,checkAuthority,signal);}

/** Capture the SDK-owned constructor before any host factory/authority can
 * replace its public static entry. No callback may split actual actor moves. */
const createStoppedActorEscrow=ActorLeaseEscrow.create;

/** SDK method identities captured before host callbacks may shadow a facade. */
const deliverySaveIntrinsic=SharedSegmentedPersistentSession.prototype.save,deliveryFlushIntrinsic=SharedSegmentedPersistentSession.prototype.flush;
