import {registerSessionDeliveryIO} from '../delivery_source/io.js';
import {isCompletedSourceOpen} from './completed_source_open.js';
import {requireLiveActorCore}from'./stopped_actor_source.js';
import {registerNativeActorSource}from'./native_actor_source.js';
import {checkSharedWriterLeaseForEscrow}from'./writer_lease.js';
import type {StoppedActorBinding}from'./stopped_actor_source.js';
import {ActorLeaseEscrow}from'./actor_lease_escrow.js';
import {createSharedWriterLeaseEscrow}from'./writer_lease.js';
import {requireStoppedActorCore,type StoppedActorCustody}from'./stopped_actor_source.js';
import {inheritActorLeaseInput,takeActorDocumentLease,takeActorReviewLease}from'./actor_lease_input.js';
import {retireOwnedCore,disposeOwnedCore} from '../owned_core_lifetime.js';
import {registerNativePendingWork} from '../native_pending_work.js';
import {freeUnclaimedSharedRustOwner} from '../raw_owner_lifetime.js';
import {SharedRichEditor,SharedEditorError,createSharedDocumentEditor} from "../core.js";
import type {SharedEditorOptions,SharedRustOwner,SharedHistoryPolicy,SharedRangePolicy,SharedSelectionPolicy} from "../types.js";
import {SharedWriterLease} from "./writer_lease.js";
import {checkCheckpoint,checkDocumentCheckpoint,openSessionDatabase,readSessionCheckpoint,readDocumentSessionCheckpoint,writeSessionCheckpoint,writeDocumentSessionCheckpoint} from "./session_database.js";
import {checkSearchCheckpoint} from "./search_checkpoint.js";
import {readSearchRecord,writeSearchRecord} from "./search_database.js";
import {encodeSharedSessionBackup,decodeSharedSessionBackup} from "../backups/session.js";
import {backupDestinationExists,insertSessionBackup} from "../backups/database.js";
import {requireBackupRecovery} from "../backups/identity.js";
import type {SharedBackupIdentity,SharedSessionBackup} from "../backups/types.js";
import type {SharedSessionBackupOptions,SharedDocumentBackupOptions,SharedSearchBackupOptions} from "../backups/session_options.js";
import {fenceOpeningDatabase} from "./opening_database.js";
import {recoveryOriginFor,inheritRecoveryOrigin} from "../participant_operation/admission.js";
import {existingSessionDatabase} from "../participant_operation/existing_session.js";
import {registerManagedSource,managedSourceUnavailable,checkManagedSource,managedCoreRetainedRevisions} from "../managed_custody.js";
import {sourceCoreMethods as nativeRead} from '../source_native_read.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {createOriginalRecordRead,type OriginalRecordRead,type OriginalNativeRecords} from './original_record_read.js';

export interface SharedSessionOptions {
 database:string;room:string;writer:string;
 /** Explicit journal language. Omitted/1 preserves the original model 11/journal 12 storage guard. */
 richLanguage?:1|2|3|4;
 /** Requested immutable history mode; an explicit opt-in may upgrade a legacy stored journal. */
 history?:SharedHistoryPolicy;
 /** Explicit replay family, independent from history grouping and native language. */
 rangeEditing?:SharedRangePolicy;
 /** Called only while this origin holds the exclusive causal writer lock. */
 create:()=>SharedRustOwner|Promise<SharedRustOwner>;
 /** Must invoke the matching Rust replay admission, never import a JSON AST in place of history. */
 restore:(checkpoint:string,history:SharedHistoryPolicy,rangeEditing?:SharedRangePolicy)=>SharedRustOwner|Promise<SharedRustOwner>;
 editor?:SharedEditorOptions;onState?:(state:SharedSaveState)=>void;onError?:(error:unknown)=>void;
}
export interface SharedSaveState {status:"saved"|"pending"|"failed"|"closed";revision:string|null;error:string|null}
/** Separate factory options: old/general replay is never redirected to document recovery. */
export interface SharedDocumentSessionOptions extends Omit<SharedSessionOptions,"rangeEditing"|"editor"> {
 /** Document scope includes general ranges. An explicit original range policy is incompatible. */
 rangeEditing?:"general-v1";
 editor?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing">;
 /** Called only for a stored document-family record after acquiring its exact writer lease. */
 restoreDocument:(checkpoint:string,history:SharedHistoryPolicy)=>SharedRustOwner|Promise<SharedRustOwner>;
}
/** New closed durable family; existing records are never implicitly migrated or overwritten. */
export interface SharedSearchSessionOptions<P extends SharedSelectionPolicy=SharedSelectionPolicy> extends Omit<SharedSessionOptions,"restore"|"editor"|"history"|"rangeEditing"|"richLanguage"> {
 history:SharedHistoryPolicy;rangeEditing:SharedRangePolicy;selectionEditing:P;richLanguage:1|2|3|4;
 restoreSearch:(checkpoint:string)=>SharedRustOwner|Promise<SharedRustOwner>;
 editor?:Omit<SharedEditorOptions<"document-v1">,"selectionEditing"|"searchHistory">;
}

/** Exact causal recovery with bounded coalesced writes and origin-wide writer exclusion. */
const constructionKey=Object.freeze({});
const versionChangeError=()=>new SharedEditorError("session_versionchange","Shared storage changed; export the retired journal before explicitly discarding this writer");
let readOriginalNative:(owner:SharedPersistentSession<SharedSelectionPolicy>,authority:()=>void,signal?:AbortSignal)=>Promise<OriginalRecordRead<OriginalNativeRecords>>;
let readyActorCustody:(owner:SharedPersistentSession)=>StoppedActorBinding;
export const checkReadySharedSourceActors=<P extends SharedSelectionPolicy>(owner:SharedPersistentSession<P>):StoppedActorBinding=>readyActorCustody(owner as unknown as SharedPersistentSession);
let checkActorCustody:(owner:SharedPersistentSession)=>StoppedActorBinding;
export const checkStoppedSharedSourceActors=<P extends SharedSelectionPolicy>(owner:SharedPersistentSession<P>):StoppedActorBinding=>checkActorCustody(owner as unknown as SharedPersistentSession);
let takeActorCustody:(owner:SharedPersistentSession)=>StoppedActorCustody;
/** Actual private source/lease fields only, never a copied stopped-state DTO. */
export const takeStoppedSharedSourceActors=<P extends SharedSelectionPolicy>(owner:SharedPersistentSession<P>):StoppedActorCustody=>takeActorCustody(owner as unknown as SharedPersistentSession);
export class SharedPersistentSession<P extends SharedSelectionPolicy="original"> {
 readonly core:SharedRichEditor<P>;readonly recovered:boolean;
 /** Immutable actor DATA: factory callbacks can retain their options object. */
 readonly #actorBinding:StoppedActorBinding;
 readonly #ownedCore:SharedRichEditor<P>;
 #db:IDBDatabase;#lease:SharedWriterLease;#options:SharedSessionOptions|SharedDocumentSessionOptions;#unsubscribe:()=>void;
 readonly #selectionPolicy:P;
 readonly #search:boolean;
 #pending:{json:string;revision:string}|undefined;#running:Promise<void>|undefined;#failure:unknown;
 #saved:string|undefined;#savedRevision:string|null=null;#closed=false;#storageChanged=false;
 #closeRequest:Promise<void>|undefined;#released:Promise<void>|undefined;
 readonly #releasePendingWork:()=>void;
 #recordReadEpoch:object=Object.freeze({});readonly #recordReaders=new Set<object>();
 private constructor(key:object,db:IDBDatabase,lease:SharedWriterLease,core:SharedRichEditor<P>,recovered:boolean,options:SharedSessionOptions|SharedDocumentSessionOptions,selectionPolicy:P,search=false){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual shared session open or recovery factory');
  this.#actorBinding=Object.freeze({room:options.room,writer:options.writer,actor:null});
  this.#db=db;this.#lease=lease;this.#ownedCore=core;this.core=core;this.recovered=recovered;this.#options=options;this.#selectionPolicy=selectionPolicy;this.#search=search;
  this.#releasePendingWork=registerNativePendingWork(core,()=>this.#running);
  this.#unsubscribe=core.subscribe(()=>{try{this.save();}catch(error){this.#failed(error);}});
  registerManagedSource(this,core,()=>{this.#live();this.#boundCore();if(this.#storageChanged||this.#closeRequest)throw managedSourceUnavailable();});
  registerSessionDeliveryIO(this,{core,check:()=>{this.#live();this.#boundCore();if(this.#storageChanged||this.#closeRequest)throw managedSourceUnavailable();},save:()=>deliverySaveIntrinsic.call(this),flush:()=>deliveryFlushIntrinsic.call(this)});
  registerNativeActorSource(this,'shared',{document:lease});
  db.onversionchange=()=>{
   // An upgrade must unblock its database, not silently destroy an unsaved native journal.
   this.#storageChanged=true;retireOwnedCore(core);db.close();
   this.#failed(versionChangeError());
  };
 }
 static{const inspect=(owner:SharedPersistentSession,stopped=true):StoppedActorBinding=>{if(!owner||typeof owner!=='object'||!(#ownedCore in owner))throw new SharedEditorError('actor_source_unavailable','Use the actual native persistence owner');if(owner.#closed||owner.#running||owner.#closeRequest)throw new SharedEditorError('actor_source_in_use','Settle actual native persistence and cleanup before moving actor custody');if(Object.getOwnPropertyDescriptor(owner,'core')?.value!==owner.#ownedCore)throw new SharedEditorError('actor_source_unavailable','The original native core binding was replaced');if(stopped)requireStoppedActorCore(owner.#ownedCore);else requireLiveActorCore(owner.#ownedCore);const binding=owner.#actorBinding;checkSharedWriterLeaseForEscrow(owner.#lease,binding.room,binding.writer);return binding;};readyActorCustody=owner=>inspect(owner,false);checkActorCustody=owner=>inspect(owner,true);takeActorCustody=owner=>{const binding=inspect(owner);return createSharedWriterLeaseEscrow(owner.#lease,binding.room,binding.writer);};}
 static{readOriginalNative=async(owner,provided,signal)=>{
  const fail=(suffix:string)=>new SharedEditorError('native_record_read_'+suffix,'Read the actual selected original native journal with independent current read permission');
  if(!owner||typeof owner!=='object'||!(#ownedCore in owner))throw fail('source');const authority=participantAuthority(provided);if(owner.#recordReaders.size>=8)throw fail('busy');
  const core=owner.#ownedCore,epoch=owner.#recordReadEpoch,pending=owner.#pending,saved=owner.#saved,revision=managedCoreRetainedRevisions(core),token=Object.freeze({}),o=owner.#options,identity:OriginalNativeRecords['identity']={room:o.room,writer:o.writer,richLanguage:o.richLanguage??1,history:o.history??'explicit',rangeEditing:o.rangeEditing??(owner.#selectionPolicy==='document-v1'?'general-v1':'original'),selectionEditing:owner.#selectionPolicy,searchHistory:owner.#search?'search-v1':null};owner.#recordReaders.add(token);
  let released=false,complete=false,finish!:()=>void,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined,result:OriginalRecordRead<OriginalNativeRecords>|undefined;const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;owner.#recordReaders.delete(token);observation?.release();finish();}};
  const current=()=>{if(released||!owner.#recordReaders.has(token))throw fail('closed');checkManagedSource(owner,core);if(owner.#running||owner.#recordReadEpoch!==epoch||owner.#pending!==pending||owner.#saved!==saved||managedCoreRetainedRevisions(core).documentRevision!==revision.documentRevision)throw fail('changed');if(observation?.aborted())throw fail('aborted');};
  const check=()=>{current();authority();current();},admit=(checkpoint:string)=>{if(owner.#search)checkSearchCheckpoint(checkpoint,identity.room,identity.writer,identity.richLanguage,identity.history,identity.rangeEditing,identity.selectionEditing);else if(identity.selectionEditing==='document-v1')checkDocumentCheckpoint(checkpoint,identity.room,identity.writer,identity.richLanguage,identity.history);else checkCheckpoint(checkpoint,identity.room,identity.writer,identity.richLanguage,identity.history,identity.rangeEditing);};
  const readStored=async():Promise<OriginalNativeRecords['committed']|null>=>{try{const key:[string,string]=[identity.room,identity.writer];if(owner.#search){const r=await readSearchRecord(owner.#db,key);if(!r)return null;if(r.history!==identity.history||r.rangeEditing!==identity.rangeEditing||r.selectionEditing!==identity.selectionEditing||r.richLanguage!==identity.richLanguage)throw fail('identity');admit(r.checkpointJson);return{checkpoint:r.checkpointJson,storageFamily:'search-v1'};}const r=await(identity.selectionEditing==='document-v1'?readDocumentSessionCheckpoint:readSessionCheckpoint)(owner.#db,key);if(!r)return null;const document='selectionEditing'in r&&r.selectionEditing==='document-v1';if(r.history!==identity.history||(r.rangeEditing??'original')!==identity.rangeEditing||document!==(identity.selectionEditing==='document-v1')||r.richLanguage!==undefined&&r.richLanguage!==identity.richLanguage)throw fail('identity');admit(r.json);return{checkpoint:r.json,storageFamily:document?'document-v1':r.rangeEditing==='general-v1'?'general-v1':r.history==='typing-v1'?'typing-v1':'original'};}catch(error){throw retainInternalFailureCause(fail('record'),error);}};
  try{observation=observeIndependentRecoveryAbort(signal,held);check();const live={checkpoint:nativeRead.checkpointJson.call(core),revision:revision.documentRevision};admit(live.checkpoint);check();const committed=await readStored();check();if(!committed)throw fail('missing');const json=JSON.stringify(committed);result=createOriginalRecordRead({format:'breditor/persistent-original-native-record-read',formatVersion:1,scope:'original-native-committed-pending-live',identity,committed,pending:pending?{checkpoint:pending.json,revision:pending.revision}:null,live},{check,current,verify:async()=>{check();const actual=await readStored();check();if(JSON.stringify(actual)!==json)throw fail('changed');},release});result.check();complete=true;return result;}
  finally{if(!complete){result?.dispose();release();}}
 };}
 static open(options:SharedSessionOptions):Promise<SharedPersistentSession>{return SharedPersistentSession.#open(options,"original");}
 /** Explicit document-scope lifecycle with separately declared durable records and recovery. */
 static openDocument(options:SharedDocumentSessionOptions):Promise<SharedPersistentSession<"document-v1">>{return SharedPersistentSession.#open(options,"document-v1");}
 /** Explicit exact import into an absent key, after host fencing and this origin's writer lease. */
 static async restoreBackup(input:SharedSessionBackupOptions):Promise<SharedPersistentSession>{
  const {backupJson,writerRecovery,...supplied}={...input};requireBackupRecovery(writerRecovery);const options={...supplied,...(supplied.editor?{editor:{...supplied.editor}}:{})};
  const identity:SharedBackupIdentity={room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,rangeEditing:options.rangeEditing,selectionEditing:"original",searchHistory:null},backup=await decodeSharedSessionBackup(backupJson,identity);
  const create=async()=>{try{return await options.restore(backup.checkpointJson,options.history,options.rangeEditing);}catch{throw new SharedEditorError("backup_native_replay","Matching native replay rejected the backup");}};
  return this.#open(inheritActorLeaseInput(input,{...options,create}),"original",false,backup);
 }
 /** Separate document-family import; no old/general checkpoint migration is inferred. */
 static async restoreDocumentBackup(input:SharedDocumentBackupOptions):Promise<SharedPersistentSession<"document-v1">>{
  const {backupJson,writerRecovery,...supplied}={...input};requireBackupRecovery(writerRecovery);const options={...supplied,...(supplied.editor?{editor:{...supplied.editor}}:{})};
  const identity:SharedBackupIdentity={room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,rangeEditing:options.rangeEditing,selectionEditing:"document-v1",searchHistory:null},backup=await decodeSharedSessionBackup(backupJson,identity);
  const create=async()=>{try{return await options.restoreDocument(backup.checkpointJson,options.history);}catch{throw new SharedEditorError("backup_native_replay","Matching native document replay rejected the backup");}};
  return this.#open(inheritActorLeaseInput(input,{...options,create,restore:options.restoreDocument}),"document-v1",false,backup);
 }
 /** Search source and every native replay policy remain explicit, independent from file contents. */
 static async restoreSearchBackup<Q extends SharedSelectionPolicy>(input:SharedSearchBackupOptions<Q>):Promise<SharedPersistentSession<Q>>{
  const {backupJson,writerRecovery,...supplied}={...input};requireBackupRecovery(writerRecovery);const options={...supplied,...(supplied.editor?{editor:{...supplied.editor}}:{})};
  const identity:SharedBackupIdentity={room:options.room,writer:options.writer,richLanguage:options.richLanguage,history:options.history,rangeEditing:options.rangeEditing,selectionEditing:options.selectionEditing,searchHistory:"search-v1"},backup=await decodeSharedSessionBackup(backupJson,identity);
  const create=async()=>{try{return await options.restoreSearch(backup.checkpointJson);}catch{throw new SharedEditorError("backup_native_replay","Matching native search replay rejected the backup");}};
  return this.#open(inheritActorLeaseInput(input,{...options,create,restore:options.restoreSearch,restoreDocument:options.restoreSearch,editor:{...options.editor,searchHistory:"search-v1"}}),options.selectionEditing,true,backup);
 }
 /** Lease before reading/restoring. The host supplies the separately named native search factory. */
 static openSearch<Q extends SharedSelectionPolicy>(options:SharedSearchSessionOptions<Q>):Promise<SharedPersistentSession<Q>>{
  if(typeof options.restoreSearch!=="function"||![1,2,3,4].includes(options.richLanguage)||(options.history!=="explicit"&&options.history!=="typing-v1")||(options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")||(options.selectionEditing!=="original"&&options.selectionEditing!=="document-v1")||(options.selectionEditing==="document-v1"&&options.rangeEditing!=="general-v1"))return Promise.reject(new SharedEditorError("search_session_policy","Explicit compatible search session policies and recovery are required"));
  return SharedPersistentSession.#open(inheritActorLeaseInput(options,inheritRecoveryOrigin(options,{...options,restore:options.restoreSearch,restoreDocument:options.restoreSearch,editor:{...options.editor,searchHistory:"search-v1"}})),options.selectionEditing,true,undefined,isCompletedSourceOpen(options));
 }
 static async #open<Q extends SharedSelectionPolicy>(options:SharedSessionOptions|SharedDocumentSessionOptions,selectionPolicy:Q,search=false,backup?:SharedSessionBackup,completeOnly=isCompletedSourceOpen(options)):Promise<SharedPersistentSession<Q>>{
  const actorInput=options,recoveryOrigin=recoveryOriginFor(options);options={...options};
  if(options.editor?.segmentedHistory!==undefined)throw new SharedEditorError("segmented_session_factory","Use the explicitly generation-aware durable family");
  if(!search&&options.editor?.searchHistory!==undefined)throw new SharedEditorError("search_session_factory","Use the explicit search-aware durable factory");
  if(options.editor?.reviewedHistory!==undefined)throw new SharedEditorError("reviewed_session_factory","Document-only storage cannot retain reviewed ownership; use the explicit reviewed paired session");
  if(options.richLanguage!==undefined&&options.richLanguage!==1&&options.richLanguage!==2&&options.richLanguage!==3&&options.richLanguage!==4)throw new SharedEditorError("session_identity","Expected richLanguage 1, 2, 3 or 4");
  if(options.history!==undefined&&options.history!=="explicit"&&options.history!=="typing-v1")throw new SharedEditorError("session_history","Expected history explicit or typing-v1");
  if(options.rangeEditing!==undefined&&options.rangeEditing!=="original"&&options.rangeEditing!=="general-v1")throw new SharedEditorError("session_range","Expected rangeEditing original or general-v1");
  if(selectionPolicy==="document-v1"&&(options.rangeEditing==="original"||!("restoreDocument" in options)||typeof options.restoreDocument!=="function"))throw new SharedEditorError("session_selection","Document sessions require general ranges and an explicit document recovery factory");
  const editorSelection=(options.editor as {selectionEditing?:unknown}|undefined)?.selectionEditing;
  if(editorSelection!==undefined&&editorSelection!==selectionPolicy)throw new SharedEditorError("session_selection","Editor selection policy must match its explicitly selected durable session");
  // Acquire before reading/restoring: a same-writer clone never becomes live first.
  const lease=await(takeActorDocumentLease(actorInput,'shared',options.database,options.room,options.writer,null)??SharedWriterLease.acquire(options.room,options.writer));let db:IDBDatabase|undefined,core:SharedRichEditor<Q>|undefined,raw:SharedRustOwner|undefined,nativeBackupAdmission=false;
  try{
   const retained=recoveryOrigin||completeOnly?await existingSessionDatabase(options.database,[options.room,options.writer],"session_open_versionchange"):undefined;
   db=retained?.db??await openSessionDatabase(options.database);
   const opening=retained?.opening??fenceOpeningDatabase(db,"session_open_versionchange");
   if(backup&&await backupDestinationExists(db,[options.room,options.writer]))throw new SharedEditorError("backup_destination_exists","Backup destination already contains a record");
   const searchRecord=search&&!backup?await readSearchRecord(db,[options.room,options.writer]):null;
   if(searchRecord&&(searchRecord.history!==options.history||searchRecord.rangeEditing!==options.rangeEditing||searchRecord.selectionEditing!==selectionPolicy||searchRecord.richLanguage!==options.richLanguage))throw new SharedEditorError("search_session_identity","Stored search policy differs from the explicitly selected session");
   const checkpoint=backup?null:search?(searchRecord?{...searchRecord,json:searchRecord.checkpointJson}:null):await (selectionPolicy==="document-v1"?readDocumentSessionCheckpoint:readSessionCheckpoint)(db,[options.room,options.writer]),history=options.history??"explicit",ranges=options.rangeEditing??(selectionPolicy==="document-v1"?"general-v1":"original"),storedRanges=checkpoint?.rangeEditing??"original",storedDocument=checkpoint!==null&&"selectionEditing" in checkpoint&&checkpoint.selectionEditing==="document-v1";
   if(checkpoint!==null){
    if(recoveryOrigin&&(checkpoint.history!==history||storedRanges!==ranges||storedDocument!==(selectionPolicy==="document-v1")))throw new SharedEditorError("recovery_origin_policy","Operational recovery cannot upgrade a stored session family");
    if(storedRanges==="general-v1"&&(ranges!=="general-v1"||checkpoint.richLanguage!==(options.richLanguage??1)))throw new SharedEditorError("session_range","General recovery requires explicit matching rangeEditing and richLanguage");
    if(search)checkSearchCheckpoint(checkpoint.json,options.room,options.writer,options.richLanguage??1,history,ranges,selectionPolicy);
    else if(storedDocument)checkDocumentCheckpoint(checkpoint.json,options.room,options.writer,options.richLanguage,checkpoint.history);
    else checkCheckpoint(checkpoint.json,options.room,options.writer,options.richLanguage,checkpoint.history,storedRanges);
    if(checkpoint.history==="typing-v1"&&history!=="typing-v1")throw new SharedEditorError("session_history","Grouped recovery requires explicit typing-v1 history");
   }
   nativeBackupAdmission=!!backup;
   raw=opening.admit(await(checkpoint===null?options.create():storedDocument?(options as SharedDocumentSessionOptions).restoreDocument(checkpoint.json,checkpoint.history):storedRanges==="general-v1"?options.restore(checkpoint.json,checkpoint.history,storedRanges):options.restore(checkpoint.json,checkpoint.history)));
   core=(selectionPolicy==="document-v1"?createSharedDocumentEditor(raw,options.editor as SharedDocumentSessionOptions["editor"]):new SharedRichEditor(raw,options.editor as SharedSessionOptions["editor"])) as SharedRichEditor<Q>;
   if(core.richLanguageVersion()!==(options.richLanguage??1))throw new SharedEditorError("session_identity","Shared owner language does not match the explicitly selected session");
   if(history==="typing-v1")core.enableTypingHistory();
   else if(core.view().historyGrouping!==undefined)throw new SharedEditorError("session_history","Explicit history cannot flatten a grouped owner");
   core.sealHistoryPolicy(history);
   if(ranges==="general-v1")core.enableGeneralRanges();
   core.sealRangePolicy(ranges);
   if(search)checkSearchCheckpoint(core.checkpointJson(),options.room,options.writer,options.richLanguage??1,history,ranges,selectionPolicy);
   else if(selectionPolicy==="document-v1")checkDocumentCheckpoint(core.checkpointJson(),options.room,options.writer,options.richLanguage,history);
   else checkCheckpoint(core.checkpointJson(),options.room,options.writer,options.richLanguage,history,ranges);
   if(recoveryOrigin){if(checkpoint===null)throw new SharedEditorError("recovery_origin_missing","The operational journal is absent");if(core.checkpointJson()!==checkpoint.json)throw new SharedEditorError("recovery_origin_native","Operational native replay must retain the exact stored journal");recoveryOrigin.verify(core as unknown as SharedRichEditor<SharedSelectionPolicy>);}
   opening.assertCurrent();nativeBackupAdmission=false;
   if(backup){const session=new SharedPersistentSession(constructionKey,db,lease,core,true,options,selectionPolicy,search);try{const checkpointJson=core.checkpointJson();if(checkpointJson!==backup.checkpointJson)throw new SharedEditorError("backup_native_replay","Native replay did not preserve the exact canonical checkpoint");await insertSessionBackup(db,checkpointJson,backup.identity);if(session.#failure)throw session.#failure;session.#saved=checkpointJson;session.#savedRevision=core.view().revision;session.#notify();return session;}catch(error){await session.discardAndClose();throw error;}}
   const session=new SharedPersistentSession(constructionKey,db,lease,core,checkpoint!==null,options,selectionPolicy,search);if(completeOnly){try{const json=core.checkpointJson();if(backup||checkpoint===null||json!==checkpoint.json)throw new SharedEditorError('completed_source_required','Inspection requires the exact existing document checkpoint');session.#saved=json;session.#savedRevision=core.view().revision;return session;}catch(error){await session.discardAndClose();throw error;}}session.save();
   try{await session.flush();}catch(error){await session.discardAndClose();throw error;}return session;
  }catch(error){
   try{if(core)disposeOwnedCore(core);}finally{try{if(raw)freeUnclaimedSharedRustOwner(raw);}finally{db?.close();await lease.close();}}
   if(nativeBackupAdmission&&!(error instanceof SharedEditorError&&error.code==="session_open_versionchange"))throw new SharedEditorError("backup_native_replay","Matching native replay rejected the backup");throw error;
  }
 }
 #live():void{if(this.#closed)throw new SharedEditorError("session_closed","The persistent shared session is closed");this.#lease.assertLive();}
 /** Captures require the original data binding; replacement accessors are never invoked. */
 #boundCore():SharedRichEditor<P>{const binding=Object.getOwnPropertyDescriptor(this,"core");if(!binding||binding.value!==this.#ownedCore)throw managedSourceUnavailable();return this.#ownedCore;}
 #report(error:unknown):void{try{this.#options.onError?.(error);}catch{/* Host reporting cannot change a committed write. */}}
 #notify():void{try{this.#options.onState?.(this.state());}catch(error){this.#report(error);}}
 #failed(error:unknown):void{this.#failure=error;this.#report(error);this.#notify();}
 state():SharedSaveState{return{status:this.#closed?"closed":this.#failure?"failed":this.#pending||this.#running?"pending":"saved",revision:this.#savedRevision,error:this.#failure?String(this.#failure):null};}
 /** Capture accepted native history now, then encode integrity asynchronously. Does not flush or include assets/outboxes. */
 async exportBackup():Promise<string>{this.#live();const checkpoint=this.#boundCore().checkpointJson(),identity:SharedBackupIdentity={room:this.#options.room,writer:this.#options.writer,richLanguage:this.#options.richLanguage??1,history:this.#options.history??"explicit",rangeEditing:this.#options.rangeEditing??(this.#selectionPolicy==="document-v1"?"general-v1":"original"),selectionEditing:this.#selectionPolicy,searchHistory:this.#search?"search-v1":null};return encodeSharedSessionBackup(identity,checkpoint);}
 /** Capture a complete exact journal synchronously; coalesce only superseded complete checkpoints. */
 save():void{
  this.#live();if(this.#storageChanged)throw versionChangeError();
  this.#recordReadEpoch=Object.freeze({});const core=this.#boundCore(),json=core.checkpointJson(),revision=core.view().revision;
  if(this.#search)checkSearchCheckpoint(json,this.#options.room,this.#options.writer,this.#options.richLanguage??1,this.#options.history??"explicit",this.#options.rangeEditing??"original",this.#selectionPolicy);
  else if(this.#selectionPolicy==="document-v1")checkDocumentCheckpoint(json,this.#options.room,this.#options.writer,this.#options.richLanguage,this.#options.history);
  else checkCheckpoint(json,this.#options.room,this.#options.writer,this.#options.richLanguage,this.#options.history,this.#options.rangeEditing);
  if(json===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;
  this.#pending={json,revision};this.#failure=undefined;this.#notify();this.#start();
 }
 #start():void{
  if(this.#running||this.#closed||!this.#pending)return;
  this.#running=this.#drain().catch(error=>{if(!this.#storageChanged)this.#failed(error);}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});
 }
 async #drain():Promise<void>{
  while(this.#pending&&!this.#closed&&!this.#storageChanged){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;
   try{if(this.#search)await writeSearchRecord(this.#db,[this.#options.room,this.#options.writer],{format:"breditor/shared-search-checkpoint-record",formatVersion:1,history:this.#options.history??"explicit",rangeEditing:this.#options.rangeEditing??"original",selectionEditing:this.#selectionPolicy,richLanguage:this.#options.richLanguage??1,checkpointJson:next.json});else if(this.#selectionPolicy==="document-v1")await writeDocumentSessionCheckpoint(this.#db,[this.#options.room,this.#options.writer],next.json,this.#options.history??"explicit",this.#options.richLanguage??1);else if(this.#options.rangeEditing==="general-v1")await writeSessionCheckpoint(this.#db,[this.#options.room,this.#options.writer],next.json,this.#options.history??"explicit","general-v1",this.#options.richLanguage??1);else await writeSessionCheckpoint(this.#db,[this.#options.room,this.#options.writer],next.json,this.#options.history??"explicit");}
   catch(error){this.#pending??=next;throw error;}
   // A late commit can advance the closed revision without retaining its journal.
   if(!this.#closed)this.#saved=next.json;
   this.#savedRevision=next.revision;
  }
 }
 /** A completed IndexedDB transaction only: neither a relay receipt nor an asset upload. */
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 /** Retry captures the newest complete owner journal, including edits after a failed write. */
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.save();await this.flush();}
 /** Retire publications synchronously; failed saves retain the readable owner/lease for close retry. */
 close():Promise<void>{
  if(this.#closed)return this.#released??Promise.resolve();if(this.#closeRequest)return this.#closeRequest;
  retireOwnedCore(this.#ownedCore);
  this.#closeRequest=Promise.resolve().then(async()=>{if(this.#closed){await this.#released;return;}this.save();await this.flush();await this.discardAndClose();}).finally(()=>{this.#closeRequest=undefined;});
  return this.#closeRequest;
 }
 /** Explicitly abandon unsaved in-memory work without deleting the last durable journal. */
 discardAndClose():Promise<void>{
  if(this.#closed)return this.#released??Promise.resolve();this.#closed=true;this.#releasePendingWork();this.#unsubscribe();disposeOwnedCore(this.#ownedCore);this.#pending=undefined;this.#saved=undefined;this.#db.close();
  // A transaction already started may still commit after db.close(); do not release the writer early.
  this.#released=(this.#running??Promise.resolve()).then(()=>this.#lease.close()).catch(error=>this.#report(error));this.#notify();return this.#released;
 }
}
/** Private original-store discovery; neither a detached checkpoint nor a format
 * option can choose a different source. Reading never saves or restores authors. */
export function captureOriginalNativeRecords<P extends SharedSelectionPolicy>(owner:SharedPersistentSession<P>,checkAuthority:()=>void,signal?:AbortSignal){return readOriginalNative(owner as SharedPersistentSession<SharedSelectionPolicy>,checkAuthority,signal);}

/** SDK method identities captured before host callbacks may shadow a facade. */
const deliverySaveIntrinsic=SharedPersistentSession.prototype.save,deliveryFlushIntrinsic=SharedPersistentSession.prototype.flush;
