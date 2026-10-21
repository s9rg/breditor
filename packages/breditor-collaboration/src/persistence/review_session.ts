import {SharedRichEditor,SharedEditorError,createSharedDocumentEditor} from "../core.js";
import type {SharedRustOwner,SharedSelectionPolicy,SharedRangePolicy,SharedHistoryPolicy,SharedEditorOptions} from "../types.js";
import type {SharedReviewPolicy} from "../review_types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {ReviewWriterLease} from "./review_writer_lease.js";
import {fenceOpeningDatabase} from "./opening_database.js";
import {encodeSharedPairedSessionBackup,decodeSharedPairedSessionBackup,readPairedBackupRecord,type SharedPairedSessionBackup} from "../backups/paired.js";
import {backupDestinationExists,insertBackupRecord} from "../backups/database.js";
import {requireBackupRecovery} from "../backups/identity.js";
import type {SharedBackupIdentity,SharedBackupRecovery} from "../backups/types.js";
import type {SharedReviewBackupOptions,SharedReviewedReviewBackupOptions,SharedSearchReviewBackupOptions} from "../backups/review_options.js";
import {openSessionDatabase} from "./session_database.js";
import {checkReviewRecord,readReviewRecord,writeReviewRecord,type ReviewCheckpointRecord} from "./review_database.js";
import {checkReviewRelayRecord,readReviewRelayRecord,writeReviewRelayRecord,type ReviewRelayCheckpointRecord} from "./review_relay_database.js";
import {checkReviewObserverRecord,readReviewObserverRecord,writeReviewObserverRecord,type ReviewObserverCheckpointRecord} from "./review_observer_database.js";
import {checkReviewedReviewRecord,readReviewedReviewRecord,writeReviewedReviewRecord,type ReviewedReviewCheckpointRecord} from "./reviewed_review_database.js";
import {checkSearchReviewRecord,readSearchReviewRecord,writeSearchReviewRecord,type SearchReviewCheckpointRecord} from "./search_review_database.js";
import {reviewedHistoryIdentity,sameReviewedHistory} from "../reviewed_history_validation.js";
import type {SharedReviewedHistoryIdentity} from "../reviewed_history_types.js";
import {reviewProgress,reviewStorageIdentity} from "../relay/review_validation.js";
import {recoveryOriginFor} from "../participant_operation/admission.js";
import {existingSessionDatabase} from "../participant_operation/existing_session.js";
import {registerManagedSource,managedSourceUnavailable} from "../managed_custody.js";
import type {SharedReviewRelayStorageIdentity,SharedReviewRelayProgress} from "../relay/review_types.js";
import {admitPairedVersions,checkPairedNativeProgress} from "./review_record_admission.js";
export type SharedPairedCheckpointRecord=ReviewCheckpointRecord|ReviewRelayCheckpointRecord|ReviewObserverCheckpointRecord|ReviewedReviewCheckpointRecord|SearchReviewCheckpointRecord;
type PairedRecord=SharedPairedCheckpointRecord;
export interface SharedReviewSessionPolicy<P extends SharedSelectionPolicy=SharedSelectionPolicy> {history:SharedHistoryPolicy;rangeEditing:SharedRangePolicy;selectionEditing:P;richLanguage:1|2|3}
/** Explicit paired recovery. Factories run only after both document and review writers are leased. */
export interface SharedReviewSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends SharedReviewSessionPolicy<P> {
 database:string;room:string;writer:string;review:SharedReviewPolicy;
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 restore:(documentCheckpoint:string,policy:Readonly<SharedReviewSessionPolicy<P>>)=>SharedRustOwner|Promise<SharedRustOwner>;
 onError?:(error:unknown)=>void;editor?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing"|"reviewedHistory"|"searchHistory">;
 /** Explicit new storage family; never infer/upgrade a local-only paired record. Contains no secrets. */
 relay?:SharedReviewRelayStorageIdentity;
}
/** Explicit new family: both document and independent comment histories remain atomically paired. */
export interface SharedReviewedReviewSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedReviewSessionOptions<P>,"restore"> {
 reviewedHistory:SharedReviewedHistoryIdentity;
 restoreReviewed:(checkpoint:string,policy:Readonly<SharedReviewSessionPolicy<P>>)=>SharedRustOwner|Promise<SharedRustOwner>;
}
/** Explicit search family, including optional reviewed ownership; no old paired-record migration. */
export interface SharedSearchReviewSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedReviewSessionOptions<P>,"restore"> {
 reviewedHistory?:SharedReviewedHistoryIdentity;
 restoreSearch:(checkpoint:string,policy:Readonly<SharedReviewSessionPolicy<P>>)=>SharedRustOwner|Promise<SharedRustOwner>;
}
type SessionOptions<P extends SharedSelectionPolicy>=Omit<SharedReviewSessionOptions<P>,"restore">&{reviewedHistory?:SharedReviewedHistoryIdentity;searchHistory?:"search-v1"};
export interface SharedReviewSaveState {status:"saved"|"pending"|"failed"|"closed";documentRevision:string|null;reviewRevision:string|null;error:string|null}
/** Native document/review owners plus a local immutable packet catalog, saved as one atomic record. */
const constructionKey=Object.freeze({});
export class SharedReviewPersistentSession<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly core:SharedRichEditor<P>;readonly recovered:boolean;
 readonly #ownedCore:SharedRichEditor<P>;
 readonly #db:IDBDatabase;readonly #documentLease:SharedWriterLease;readonly #reviewLease:ReviewWriterLease;readonly #options:SessionOptions<P>;
 #versions=new Map<string,string>();#unsubscribe:(()=>void)[]=[];#pending:PairedRecord|undefined;#running:Promise<void>|undefined;
 #relayProgress:SharedReviewRelayProgress={cursor:null,accepted:null,sequence:null};#durableRelayProgress:SharedReviewRelayProgress={cursor:null,accepted:null,sequence:null};
 #saved:string|undefined;#failure:unknown;#closed=false;#retiring=false;#storageChanged=false;#closedRevisions:{documentRevision:string;reviewRevision:string}|undefined;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 private constructor(key:object,db:IDBDatabase,documentLease:SharedWriterLease,reviewLease:ReviewWriterLease,core:SharedRichEditor<P>,options:SessionOptions<P>,recovered:boolean,versions:readonly string[],progress?:SharedReviewRelayProgress){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual paired session open or recovery factory');
  this.#db=db;this.#documentLease=documentLease;this.#reviewLease=reviewLease;this.#ownedCore=core;this.core=core;this.#options=options;this.recovered=recovered;
  if(progress){this.#relayProgress=structuredClone(progress);this.#durableRelayProgress=structuredClone(progress);this.#validateNativeProgress(progress);}
  this.#versions=admitPairedVersions(core,versions);
  const autosave=()=>{try{this.save();}catch(error){this.#failed(error);}};
  this.#unsubscribe=[core.subscribe(autosave),core.subscribeReview(autosave)];
  registerManagedSource(this,core,()=>{this.#live();this.#boundCore();if(this.#storageChanged||this.#retiring)throw managedSourceUnavailable();});
  db.onversionchange=()=>{this.#storageChanged=true;core.retire();db.close();this.#failed(new SharedEditorError("review_versionchange","Paired storage changed; export both readable histories before explicitly discarding this writer"));};
 }
 static async open<Q extends SharedSelectionPolicy>(input:SharedReviewSessionOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  if("reviewedHistory" in input&&input.reviewedHistory!==undefined)return Promise.reject(new SharedEditorError("reviewed_session_factory","Use the explicitly reviewed paired factory"));
  return this.#open(input,input.restore);
 }
 static async openReviewed<Q extends SharedSelectionPolicy>(input:SharedReviewedReviewSessionOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  const identity=reviewedHistoryIdentity(input.reviewedHistory);
  if(typeof input.restoreReviewed!=="function"||identity.principal!==input.review.principal)return Promise.reject(new SharedEditorError("reviewed_session_identity","Reviewed recovery/account must be explicitly paired"));
  return this.#open(input,input.restoreReviewed,identity);
 }
 static async openSearch<Q extends SharedSelectionPolicy>(input:SharedSearchReviewSessionOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  const identity=input.reviewedHistory===undefined?undefined:reviewedHistoryIdentity(input.reviewedHistory);
  if(typeof input.restoreSearch!=="function"||identity&&identity.principal!==input.review.principal)throw new SharedEditorError("search_review_identity","Search recovery and reviewed account must be explicitly paired");
  return this.#open(input,input.restoreSearch,identity,true);
 }
 /** Import the explicitly selected paired family only into an absent durable key. */
 static async restoreBackup<Q extends SharedSelectionPolicy>(input:SharedReviewBackupOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  if("reviewedHistory" in input&&input.reviewedHistory!==undefined)throw new SharedEditorError("reviewed_session_factory","Use the explicitly reviewed paired backup factory");return this.#fromBackup(input,input.restore);
 }
 static async restoreReviewedBackup<Q extends SharedSelectionPolicy>(input:SharedReviewedReviewBackupOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  const identity=reviewedHistoryIdentity(input.reviewedHistory);if(typeof input.restoreReviewed!=="function"||identity.principal!==input.review.principal)throw new SharedEditorError("reviewed_session_identity","Reviewed backup recovery/account must be explicitly paired");return this.#fromBackup(input,input.restoreReviewed,identity);
 }
 static async restoreSearchBackup<Q extends SharedSelectionPolicy>(input:SharedSearchReviewBackupOptions<Q>):Promise<SharedReviewPersistentSession<Q>>{
  const identity=input.reviewedHistory===undefined?undefined:reviewedHistoryIdentity(input.reviewedHistory);if(typeof input.restoreSearch!=="function"||identity&&identity.principal!==input.review.principal)throw new SharedEditorError("search_review_identity","Search backup recovery/account must be explicitly paired");return this.#fromBackup(input,input.restoreSearch,identity,true);
 }
 static async #fromBackup<Q extends SharedSelectionPolicy>(input:Omit<SharedReviewSessionOptions<Q>,"create"|"restore">&SharedBackupRecovery,restore:SharedReviewSessionOptions<Q>["restore"],reviewed?:SharedReviewedHistoryIdentity,search=false):Promise<SharedReviewPersistentSession<Q>>{
  const {backupJson,writerRecovery,...rest}={...input};requireBackupRecovery(writerRecovery);const options={...rest,review:{...rest.review},...(rest.relay?{relay:{...rest.relay}}:{}),...(rest.editor?{editor:{...rest.editor}}:{})};
  const identity:SharedBackupIdentity={room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,searchHistory:search?"search-v1":null},backup=await decodeSharedPairedSessionBackup(backupJson,identity),restoreSaved:SharedReviewSessionOptions<Q>["restore"]=async(checkpoint,policy)=>{try{return await restore.call(options,checkpoint,policy);}catch{throw new SharedEditorError("backup_native_replay","Matching native paired document replay rejected the backup");}};
  return this.#open({...options,create:()=>{throw new SharedEditorError("backup_native_replay","Paired backup import cannot fall back to a new document");}},restoreSaved,reviewed,search,backup);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:Omit<SharedReviewSessionOptions<Q>,"restore">,restoreSaved:SharedReviewSessionOptions<Q>["restore"],reviewed?:SharedReviewedHistoryIdentity,search=false,backup?:SharedPairedSessionBackup):Promise<SharedReviewPersistentSession<Q>>{
  const recoveryOrigin=recoveryOriginFor(input);
  if(input.editor&&"segmentedHistory" in input.editor&&input.editor.segmentedHistory!==undefined)throw new SharedEditorError("segmented_session_factory","Use the explicitly generation-aware paired family");
  if("searchHistory" in input&&input.searchHistory!==undefined)throw new SharedEditorError("search_session_factory","Select search history through the explicit paired search factory");
  if(input.editor&&"searchHistory" in input.editor&&input.editor.searchHistory!==undefined)throw new SharedEditorError("search_session_factory","Select search history through the explicit paired search factory");
  if(input.editor&&"reviewedHistory" in input.editor&&input.editor.reviewedHistory!==undefined)throw new SharedEditorError("reviewed_session_factory","Select reviewed history through the paired factory, not nested editor options");
  if(input.relay!==undefined&&(!input.relay||typeof input.relay!=="object"||Array.isArray(input.relay)))throw new SharedEditorError("review_relay_identity","Expected an explicit nonsecret relay storage identity");
  const options:SessionOptions<Q>={...input,review:{...input.review},...(input.relay?{relay:reviewStorageIdentity(input.relay)}:{}),...(reviewed?{reviewedHistory:reviewed}:{}),...(search?{searchHistory:"search-v1"}:{})};
  if(options.relay?.reviewEditing==="read_only"&&options.review.access!=="read_only")throw new SharedEditorError("review_observer_policy","A fixed metadata observer must start with read-only native policy");
  if(![1,2,3].includes(options.richLanguage)||(options.history!=="explicit"&&options.history!=="typing-v1")||(options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")||(options.selectionEditing!=="original"&&options.selectionEditing!=="document-v1")||(options.selectionEditing==="document-v1"&&options.rangeEditing!=="general-v1"))throw new SharedEditorError("review_session_policy","Explicit compatible review session policies are required");
  const documentLease=await SharedWriterLease.acquire(options.room,options.writer);let reviewLease:ReviewWriterLease|undefined,db:IDBDatabase|undefined,core:SharedRichEditor<Q>|undefined,nativeBackupAdmission=false;
  try{
   reviewLease=await ReviewWriterLease.acquire(options.room,options.review.actor);const retained=recoveryOrigin?await existingSessionDatabase(options.database,[options.room,options.writer],"review_open_versionchange"):undefined;db=retained?.db??await openSessionDatabase(options.database);
   const opening=retained?.opening??fenceOpeningDatabase(db,"review_open_versionchange");
   if(backup&&await backupDestinationExists(db,[options.room,options.writer]))throw new SharedEditorError("backup_destination_exists","Paired backup destination already contains a record");
   const saved=backup?readPairedBackupRecord(backup.recordJson,backup.identity):await(search?readSearchReviewRecord(db,[options.room,options.writer]):reviewed?readReviewedReviewRecord(db,[options.room,options.writer]):options.relay?.reviewEditing==="read_only"?readReviewObserverRecord(db,[options.room,options.writer]):options.relay?readReviewRelayRecord(db,[options.room,options.writer]):readReviewRecord(db,[options.room,options.writer]));
   if(recoveryOrigin&&!saved)throw new SharedEditorError("recovery_origin_missing","The operational paired journal is absent");
   if(backup&&saved?.format!==(search?"breditor/shared-search-review-checkpoint-record":reviewed?"breditor/shared-reviewed-review-checkpoint-record":options.relay?.reviewEditing==="read_only"?"breditor/shared-review-observer-checkpoint-record":options.relay?"breditor/shared-review-relay-checkpoint-record":"breditor/shared-review-checkpoint-record"))throw new SharedEditorError("backup_paired_identity","The explicitly selected paired recovery family differs from the backup");
   if(search&&saved&&(!("reviewedHistory" in saved)||!!saved.reviewedHistory!==!!reviewed||!!saved.relay!==!!options.relay))throw new SharedEditorError("search_review_identity","Stored search paired family differs from the explicitly selected source");
   if(reviewed&&saved&&(!("reviewedHistory" in saved)||!saved.reviewedHistory||!sameReviewedHistory(reviewed,saved.reviewedHistory)||!!saved.relay!==!!options.relay))throw new SharedEditorError("reviewed_session_identity","Stored reviewed identity/family differs from the selected source");
   if(options.relay&&(options.relay.room!==options.room||options.relay.documentWriter!==options.writer||options.relay.actor!==options.review.actor||options.relay.principal!==options.review.principal||saved&&("relay" in saved&&saved.relay?JSON.stringify(reviewStorageIdentity(saved.relay))!==JSON.stringify(options.relay):true)))throw new SharedEditorError("review_relay_identity","Stored relay binding does not match this explicitly paired session");
   if(saved&&(saved.reviewActor!==options.review.actor||saved.principal!==options.review.principal||saved.history!==options.history||saved.rangeEditing!==options.rangeEditing||saved.selectionEditing!==options.selectionEditing||saved.richLanguage!==options.richLanguage))throw new SharedEditorError("review_session_identity","Stored review identity/policies do not match the explicitly leased session");
   const selected:SharedReviewSessionPolicy<Q>={history:options.history,rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,richLanguage:options.richLanguage};
   nativeBackupAdmission=!!backup;
   const raw=opening.admit(await(saved?restoreSaved.call(options,saved.documentCheckpointJson,Object.freeze(selected)):options.create()));
   const editor={...options.editor,...(reviewed?{reviewedHistory:reviewed}:{}),...(search?{searchHistory:"search-v1" as const}:{}),...(options.onError&&!options.editor?.onError?{onError:options.onError}:{})};
   // The immutable constructor branch and stored policy check above establish the generic family.
   core=(options.selectionEditing==="document-v1"?createSharedDocumentEditor(raw,editor):new SharedRichEditor<"original">(raw,editor)) as unknown as SharedRichEditor<Q>;
   if(core.richLanguageVersion()!==options.richLanguage)throw new SharedEditorError("review_session_identity","Native language differs from the declared paired session");
   if(options.history==="typing-v1")core.enableTypingHistory();else if(core.view().historyGrouping!==undefined)throw new SharedEditorError("review_session_policy","Cannot flatten a natural-history review owner");
   if(options.rangeEditing==="general-v1")core.enableGeneralRanges();
   core.enableReview(options.review,saved?.reviewCheckpointJson);core.sealReviewPolicies(options.history,options.rangeEditing);
   if(options.relay&&!core.supportsReviewTransport())throw new SharedEditorError("review_transport_unavailable","Paired relay storage needs matching native lineage proofs");
   if(recoveryOrigin&&(core.checkpointJson()!==saved?.documentCheckpointJson||core.reviewCheckpoint()!==saved?.reviewCheckpointJson))throw new SharedEditorError("recovery_origin_native","Operational native replay must retain both exact stored journals");
   recoveryOrigin?.verify(core as unknown as SharedRichEditor<SharedSelectionPolicy>);
   opening.assertCurrent();const session=new SharedReviewPersistentSession(constructionKey,db,documentLease,reviewLease,core,options,saved!==null,saved?.versions??[],saved&&"progress" in saved?saved.progress??undefined:undefined);nativeBackupAdmission=false;
   if(backup){try{const record=session.#record();session.#checkRecord(record);if(JSON.stringify(record)!==backup.recordJson)throw new SharedEditorError("backup_native_replay","Native paired replay did not preserve the exact canonical histories/catalog");await insertBackupRecord(db,[options.room,options.writer],record);if(session.#failure)throw session.#failure;session.#saved=backup.recordJson;return session;}catch(error){await session.discardAndClose();throw error;}}
   session.save();try{await session.flush();}catch(error){await session.discardAndClose();throw error;}return session;
  }catch(error){core?.dispose();db?.close();try{await reviewLease?.close();}finally{await documentLease.close();}if(nativeBackupAdmission&&!(error instanceof SharedEditorError&&error.code==="review_open_versionchange"))throw new SharedEditorError("backup_native_replay","Matching native paired replay rejected the backup");throw error;}
 }
 #live():void{if(this.#closed)throw new SharedEditorError("review_session_closed","The paired review session is closed");this.#documentLease.assertLive();this.#reviewLease.assertLive();}
 /** A readable public replacement cannot become the owner of this atomic native pair. */
 #boundCore():SharedRichEditor<P>{const binding=Object.getOwnPropertyDescriptor(this,"core");if(!binding||binding.value!==this.#ownedCore)throw managedSourceUnavailable();return this.#ownedCore;}
 #failed(error:unknown):void{this.#failure=error;try{this.#options.onError?.(error);}catch{/* Reporting cannot replace either native history. */}}
 #record(versions=this.#versions):PairedRecord{
  const core=this.#boundCore(),base={formatVersion:1 as const,history:this.#options.history,rangeEditing:this.#options.rangeEditing,selectionEditing:this.#options.selectionEditing,richLanguage:this.#options.richLanguage,reviewActor:this.#options.review.actor,principal:this.#options.review.principal,documentCheckpointJson:core.checkpointJson(),reviewCheckpointJson:core.reviewCheckpoint(),versions:[...versions.values()]};
  if(this.#options.searchHistory)return {format:"breditor/shared-search-review-checkpoint-record",...base,reviewedHistory:this.#options.reviewedHistory?{...this.#options.reviewedHistory}:null,relay:this.#options.relay?{...this.#options.relay}:null,progress:this.#options.relay?structuredClone(this.#relayProgress):null};
  if(this.#options.reviewedHistory)return {format:"breditor/shared-reviewed-review-checkpoint-record",...base,reviewedHistory:{...this.#options.reviewedHistory},relay:this.#options.relay?{...this.#options.relay}:null,progress:this.#options.relay?structuredClone(this.#relayProgress):null};
  if(!this.#options.relay)return {format:"breditor/shared-review-checkpoint-record",...base};
  const relay={...this.#options.relay},progress=structuredClone(this.#relayProgress);
  return relay.reviewEditing==="read_only"?{format:"breditor/shared-review-observer-checkpoint-record",...base,relay:{...relay,reviewEditing:"read_only"},progress}:{format:"breditor/shared-review-relay-checkpoint-record",...base,relay,progress};
 }
 #checkRecord(record:PairedRecord):void{if(record.format==="breditor/shared-search-review-checkpoint-record")checkSearchReviewRecord(record,[this.#options.room,this.#options.writer]);else if(record.format==="breditor/shared-reviewed-review-checkpoint-record")checkReviewedReviewRecord(record,[this.#options.room,this.#options.writer]);else if(record.format==="breditor/shared-review-observer-checkpoint-record")checkReviewObserverRecord(record,[this.#options.room,this.#options.writer]);else if(record.format==="breditor/shared-review-relay-checkpoint-record")checkReviewRelayRecord(record,[this.#options.room,this.#options.writer]);else checkReviewRecord(record,[this.#options.room,this.#options.writer]);}
 #validateNativeProgress(progress:SharedReviewRelayProgress):void{checkPairedNativeProgress(this.#boundCore(),this.#options.relay,this.#options.review.principal,progress);}
 /** Exact readable paired export, including after a failed save/close; it grants no live permissions. */
 exportRecovery():PairedRecord{this.#live();return this.#record();}
 /** Exact bounded paired history/catalog capture, not assets, credentials or other durable outboxes. */
 async exportBackup():Promise<string>{this.#live();const record=this.#record(),identity:SharedBackupIdentity={room:this.#options.room,writer:this.#options.writer,richLanguage:this.#options.richLanguage,history:this.#options.history,rangeEditing:this.#options.rangeEditing,selectionEditing:this.#options.selectionEditing,searchHistory:this.#options.searchHistory??null};return encodeSharedPairedSessionBackup(identity,record);}
 /** Nonsecret fixed binding; a local-only session cannot silently become relay-aware. */
 reviewRelayIdentity():SharedReviewRelayStorageIdentity|null{this.#live();return this.#options.relay?{...this.#options.relay}:null;}
 /** Only successfully committed progress, never an attempted/aborted IndexedDB cursor. */
 reviewRelayProgress():SharedReviewRelayProgress{this.#live();return structuredClone(this.#durableRelayProgress);}
 /** Capture both native journals and progress in one transaction; failed saves retain all inputs. */
 async persistReviewRelayProgress(input:SharedReviewRelayProgress):Promise<void>{
  this.#live();const identity=this.#options.relay;if(!identity)throw new SharedEditorError("review_relay_storage","Explicit paired relay storage is required");
  const next=reviewProgress(input,identity),previous=this.#relayProgress;
  if(previous.cursor&&(!next.cursor||BigInt(next.cursor.after)<BigInt(previous.cursor.after))||previous.accepted&&(!next.accepted||BigInt(next.accepted.through)<BigInt(previous.accepted.through)||next.accepted.through===previous.accepted.through&&next.accepted.prefixDigest!==previous.accepted.prefixDigest))throw new SharedEditorError("review_relay_rollback","Paired relay progress cannot move backwards");
  this.#validateNativeProgress(next);this.#relayProgress=next;this.save();await this.flush();
 }
 state():SharedReviewSaveState{const snapshot=this.#closedRevisions??this.#ownedCore.reviewSnapshot();return {status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#running?"pending":"saved",documentRevision:snapshot.documentRevision,reviewRevision:snapshot.reviewRevision,error:this.#failure?String(this.#failure):null};}
 /** Synchronously capture both exact native lanes; coalesce only complete superseded pairs. */
 save():void{this.#live();if(this.#options.relay?.reviewEditing==="read_only")this.#validateNativeProgress(this.#relayProgress);const record=this.#record();this.#checkRecord(record);const encoded=JSON.stringify(record);if(encoded===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;this.#pending=record;this.#failure=undefined;this.#start();}
 #start():void{if(this.#running||this.#closed||!this.#pending)return;this.#running=this.#drain().catch(error=>this.#failed(error)).finally(()=>{this.#running=undefined;if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){this.#documentLease.assertLive();this.#reviewLease.assertLive();const next=this.#pending;this.#pending=undefined;try{if(next.format==="breditor/shared-search-review-checkpoint-record")await writeSearchReviewRecord(this.#db,[this.#options.room,this.#options.writer],next);else if(next.format==="breditor/shared-reviewed-review-checkpoint-record")await writeReviewedReviewRecord(this.#db,[this.#options.room,this.#options.writer],next);else if(next.format==="breditor/shared-review-observer-checkpoint-record")await writeReviewObserverRecord(this.#db,[this.#options.room,this.#options.writer],next);else if(next.format==="breditor/shared-review-relay-checkpoint-record")await writeReviewRelayRecord(this.#db,[this.#options.room,this.#options.writer],next);else await writeReviewRecord(this.#db,[this.#options.room,this.#options.writer],next);}catch(error){this.#pending??=next;throw error;}this.#saved=JSON.stringify(next);if("progress" in next&&next.progress)this.#durableRelayProgress=structuredClone(next.progress);}}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Capture and retain one immutable named snapshot; publication and packet persistence are host-local. */
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo{this.#live();const packet=this.#boundCore().captureVersion(name,this.#options.review.principal,createdAtMs);return this.retainVersion(packet);}
 /** The host must authenticate imported provenance separately; native digest/binding/content still admit. */
 retainVersion(packet:string):SharedDocumentVersionInfo{this.#live();if(this.#retiring)throw new SharedEditorError("review_session_closing","Cannot retain versions after retirement");const info=this.#boundCore().readVersion(packet),candidate=new Map(this.#versions),known=candidate.get(info.id);if(known!==undefined){if(known!==packet)throw new SharedEditorError("version_catalog","Different packet bytes under a retained immutable version");return info;}candidate.set(info.id,packet);this.#checkRecord(this.#record(candidate));this.#versions=candidate;this.save();return info;}
 versions():readonly SharedDocumentVersionInfo[]{this.#live();const core=this.#boundCore();return [...this.#versions.values()].map(packet=>core.readVersion(packet));}
 versionPacket(id:string):string{this.#live();const packet=this.#versions.get(id);if(packet===undefined)throw new SharedEditorError("version_unknown","Unknown retained version");return packet;}
 /** Retire synchronously; a failed final write retains both readable histories and both leases for retry. */
 close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#ownedCore.retire();this.#closing=Promise.resolve().then(async()=>{if(this.#closed){await this.#released;return;}this.save();await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 /** Explicitly abandon unsaved in-memory pairs; the previous committed record is not deleted. */
 discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();const snapshot=this.#ownedCore.reviewSnapshot();this.#closedRevisions={documentRevision:snapshot.documentRevision,reviewRevision:snapshot.reviewRevision};this.#closed=true;this.#ownedCore.retire();for(const off of this.#unsubscribe)off();this.#unsubscribe=[];this.#ownedCore.dispose();this.#pending=undefined;this.#db.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{try{await this.#reviewLease.close();}finally{await this.#documentLease.close();}});return this.#released;}
}
