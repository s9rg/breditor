/** Durable client intent, not a second document, current authority or optimistic accepted content. */
import {SharedRelayError} from "../relay/validation.js";
import {SharedEditorError} from "../core.js";
import {registerManagedSource,checkManagedCore,managedSourceUnavailable,managedSourceCore,checkManagedSource,checkManagedSourceBindings} from "../managed_custody.js";
import {participantAuthority} from '../participant_backup/policy.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import type {PersistentSuggestionRead,PersistentSuggestionRecords} from './persistent_read_contract.js';
import {createPersistentSuggestionRead} from './persistent_read.js';
import {encodeRetainedStoreBackup,decodeRetainedStoreBackup,checkRetainedStoreRecovery,checkRetainedStoreSignal,retainedStoreNativeAdmission} from "../backups/retained_store.js";
import {retainedStoreDestinationExists,insertRetainedStoreRecord} from "../backups/retained_store_database.js";
import type {SharedSuggestionQueueBackupOptions,SharedRetainedStoreBackupOptions} from "../backups/retained_store_types.js";
import type {SharedOwnedSuggestionAcceptance} from "../reviewed_history_types.js";
import {checkQueueRecord,openQueueDatabase,readQueueRecord,writeQueueRecord,queueKey} from "./database.js";
import {SuggestionQueueLease} from "./lease.js";
import {isOperationalComponent,isCompletedOperationalComponent} from "../participant_operation/component_admission.js";
import {existingOperationalComponent} from "../participant_operation/existing_component.js";
import {operationFailure} from "../participant_operation/errors.js";
import {queueIdentity,packetText,publication,decision,intent,same} from "./validation.js";
import {checkSuggestionRecordSource,checkSuggestionSourcePolicy,admitSuggestionRecord,ownedSuggestionAcceptance} from "./record_admission.js";
import {selectedRetainedStorePort,type RetainedStorePort} from "../delivery_ports/retained.js";
import {checkSuggestionRecoveryIdle,registerSuggestionRecoveryParticipant,reserveSuggestionRecovery} from "./recovery_gate.js";
import {reconcileRetainedSuggestions} from "./reconcile_retained.js";
import {replaySuggestionRecord} from "../participant_replay/suggestion_record.js";
import type {SharedParticipantReplay} from "../participant_replay/read.js";
import type {SharedRetainedSuggestionsRecoveryResult} from "./reconcile_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedDocumentSuggestionDraft,SharedDocumentSuggestionInfo} from "../suggestion_types.js";
import type {SharedDocumentSuggestionPreview} from "../suggestion_preview.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueOptions,SharedSuggestionQueueRecord,SharedRetainedSuggestion,SharedSuggestionQueueStatus,SharedSuggestionPublication,SharedSuggestionDecision} from "./types.js";
const constructionKey=Object.freeze({}),attached=new WeakSet<object>();
let readPersistent:(owner:SharedSuggestionQueue,authority:()=>void,signal?:AbortSignal)=>Promise<PersistentSuggestionRead>;
export class SharedSuggestionQueue<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #options:SharedSuggestionQueueOptions<P>;readonly #db:IDBDatabase|undefined;readonly #lease:SuggestionQueueLease;
 readonly #atomic:RetainedStorePort<"suggestions">|undefined;
 readonly #assertSource:()=>void;
 readonly #recordSource:object|undefined;
 #record:SharedSuggestionQueueRecord;#rows=new Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>();#durable=new Map<string,string>();
 #pending:SharedSuggestionQueueRecord|undefined;#running:Promise<void>|undefined;#failure:unknown;#retiring=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 #listeners=new Set<()=>void>();#notifying=false;#storageChanged=false;
 #restoreInsert=false;#restoreSignal:AbortSignal|undefined;
 private constructor(key:object,options:SharedSuggestionQueueOptions<P>,db:IDBDatabase|undefined,lease:SuggestionQueueLease,record:SharedSuggestionQueueRecord,assertSource:()=>void,atomic?:RetainedStorePort<"suggestions">,recordSource?:object){if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual suggestion queue open or recovery factory');this.#recordSource=recordSource;this.#atomic=atomic;this.#options=options;this.#db=db;this.#lease=lease;this.#assertSource=assertSource;this.#record=record;this.#rows=this.#admit(record);registerManagedSource(this,options.storage.core,()=>{this.#live();this.#assertSource();if(this.#retiring||this.#storageChanged)throw managedSourceUnavailable();});registerSuggestionRecoveryParticipant(this,()=>{this.#live();this.#assertSource();if(this.#retiring||this.#running)throw new SharedRelayError("suggestion_recovery_in_use");});if(db)db.onversionchange=()=>{this.#storageChanged=true;db.close();this.#failure=new SharedRelayError("suggestion_database_versionchange");this.#notify();};}
 static{readPersistent=async(owner,provided,signal)=>{
  const fail=(suffix:string)=>new SharedRelayError('suggestion_persistent_read_'+suffix);
  if(!owner||typeof owner!=='object'||!(#record in owner))throw fail('source');
  if(owner.#atomic||!owner.#db||!owner.#recordSource)throw fail('family');
  const authority=participantAuthority(provided),releaseGate=reserveSuggestionRecovery(owner),record=owner.#record,pending=owner.#pending,durable=owner.#durable,core=owner.#options.storage.core,source=owner.#recordSource;
  let released=false,complete=false,finish!:()=>void,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined,result:PersistentSuggestionRead|undefined;
  const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;observation?.release();releaseGate();finish();}};
  const current=()=>{if(released)throw fail('closed');owner.#live();if(owner.#retiring||owner.#storageChanged||owner.#running||owner.#record!==record||owner.#pending!==pending||owner.#durable!==durable)throw fail('changed');checkManagedSourceBindings(owner);checkManagedSource(source,core);if(observation?.aborted())throw fail('aborted');};
  const check=()=>{current();authority();current();};
  try{observation=observeIndependentRecoveryAbort(signal,held);check();const committed=await readQueueRecord(owner.#db,owner.#options.identity,owner.#options.ownedHistory);check();if(!committed)throw fail('missing');const json=JSON.stringify(committed),metadata:PersistentSuggestionRecords={format:'breditor/persistent-suggestion-record-read',formatVersion:1,scope:'original-store-committed-pending-live',committed,pending:pending??null,live:record};
   result=createPersistentSuggestionRead(metadata,{check,current,verify:async()=>{check();const actual=await readQueueRecord(owner.#db!,owner.#options.identity,owner.#options.ownedHistory);check();if(JSON.stringify(actual)!==json)throw fail('changed');},release});
   result.check();complete=true;return result;
  }finally{if(!complete){result?.dispose();release();}}
 };}
 static async open<Q extends SharedSelectionPolicy>(input:SharedSuggestionQueueOptions<Q>):Promise<SharedSuggestionQueue<Q>>{
  return SharedSuggestionQueue.#open(input);
 }
 /** Restore exact dependent intent only after the host restores/fences its matching native source. */
 static async restoreBackup<Q extends SharedSelectionPolicy>(input:SharedSuggestionQueueBackupOptions<Q>):Promise<SharedSuggestionQueue<Q>>{
  checkRetainedStoreRecovery(input);const {backupJson,writerRecovery:_authority,signal,...options}={...input},source=options.storage,core=source.core,identity=queueIdentity(options.identity),history=options.ownedHistory;
  const recovered=await decodeRetainedStoreBackup("suggestions",backupJson,value=>checkQueueRecord(value,identity,history),signal);
  if(source.core!==core)throw new SharedRelayError("suggestion_source_replaced");return SharedSuggestionQueue.#open({...options,identity},recovered,signal);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedSuggestionQueueOptions<Q>,recovered?:SharedSuggestionQueueRecord,signal?:AbortSignal):Promise<SharedSuggestionQueue<Q>>{
  const source=input.storage,core=source.core,atomic=selectedRetainedStorePort(input,"suggestions"),assertSource=()=>{if(source.core!==core)throw new SharedRelayError("suggestion_source_replaced");atomic?.check();};
  checkManagedCore(core);
  const options={...input,identity:queueIdentity(input.identity),storage:{core,save:()=>{assertSource();source.save();},flush:async()=>{assertSource();await source.flush();assertSource();}}};
  if(options.ownedHistory!==undefined&&options.ownedHistory!=="reviewed-v1")throw new SharedRelayError("suggestion_history_policy");
  if(attached.has(core))throw new SharedRelayError("suggestion_queue_already_attached");
  if(atomic){atomic.check();checkSuggestionSourcePolicy(core,options.identity,options.ownedHistory);}else checkSuggestionRecordSource(core,options.identity,options.ownedHistory);
  checkManagedCore(core);attached.add(core);let lease:SuggestionQueueLease|undefined,db:IDBDatabase|undefined,queue:SharedSuggestionQueue<Q>|undefined;
  try{checkRetainedStoreSignal(signal);lease=await SuggestionQueueLease.acquire(options.identity);assertSource();checkManagedCore(core);checkRetainedStoreSignal(signal);const retained=isOperationalComponent(input)?await existingOperationalComponent(options.database,"suggestions",queueKey(options.identity)):undefined;if(!atomic)db=retained?.db??await openQueueDatabase(options.database);let saved:SharedSuggestionQueueRecord|null;
   if(recovered){if(await retainedStoreDestinationExists(db!,"suggestions",queueKey(options.identity),signal))throw new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");saved=recovered;}else saved=atomic?checkQueueRecord(atomic.read(),options.identity,options.ownedHistory):await readQueueRecord(db!,options.identity,options.ownedHistory);
   if(retained&&(!saved||JSON.stringify(saved)!==JSON.stringify(retained.record)))throw operationFailure("operation_diverged");
   let recordSource:object|undefined;try{if(managedSourceCore(source)===core)recordSource=source;}catch{/* Existing custom storage stays editable, but cannot issue this new managed read. */}
   assertSource();checkManagedCore(core);const create=()=>new SharedSuggestionQueue(constructionKey,options,db,lease!,saved??{format:options.ownedHistory?"breditor/shared-owned-suggestion-queue":"breditor/shared-suggestion-queue",formatVersion:1,identity:options.identity,retained:[]},assertSource,atomic,recordSource);queue=recovered?retainedStoreNativeAdmission(create):create();checkManagedCore(core);retained?.assertCurrent();queue.#restoreInsert=recovered!==undefined;queue.#restoreSignal=signal;if(isCompletedOperationalComponent(input)){if(!retained||!saved||recovered||atomic)throw operationFailure('operation_diverged');queue.#durable=new Map(queue.#record.retained.map(row=>[core.readSuggestion(row.packet).id,JSON.stringify(row)]));}else{queue.#pending=queue.#record;queue.#start();await queue.flush();}assertSource();checkManagedCore(core);checkRetainedStoreSignal(signal);return queue;}
  catch(error){if(queue)await queue.discardAndClose();else{db?.close();await lease?.close();attached.delete(core);}throw error;}
 }
 #live():void{if(this.#closed)throw new SharedRelayError("suggestion_queue_closed");this.#lease.assertLive();}
 /** Borrowed source only; closing this queue never disposes it. A changed source owner refuses. */
 get core():SharedRichEditor<P>{this.#live();this.#assertSource();return this.#options.storage.core;}
 /** Detached nonsecret binding for an explicitly matching transport. */
 identity():SharedSuggestionQueueIdentity{this.#live();return {...this.#record.identity};}
 #writable():void{checkSuggestionRecoveryIdle(this);this.#live();this.#assertSource();checkManagedCore(this.#options.storage.core);this.#atomic?.writable();if(this.#retiring)throw new SharedRelayError("suggestion_queue_closing");}
 #admit(record:SharedSuggestionQueueRecord):Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>{
  return admitSuggestionRecord(this.#options.storage.core,record,this.#options.ownedHistory);
 }
 #ownedAcceptance(received:SharedSuggestionDecision|null):SharedOwnedSuggestionAcceptance|null{
  return ownedSuggestionAcceptance(this.#options.identity,this.#options.ownedHistory,received);
 }
 #mark(record:SharedSuggestionQueueRecord):void{const checked=checkQueueRecord(record,this.#options.identity,this.#options.ownedHistory),rows=this.#admit(checked);checkManagedCore(this.#options.storage.core);if(same(checked,this.#record)&&!this.#failure)return;this.#atomic?.stage(checked);this.#record=checked;this.#rows=rows;this.#pending=structuredClone(checked);this.#notify();this.#start();}
 #replace(id:string,change:(row:SharedRetainedSuggestion)=>SharedRetainedSuggestion):void{const found=this.#rows.get(id);if(!found)throw new SharedRelayError("suggestion_unknown");this.#mark({...this.#record,retained:this.#record.retained.map(row=>row===found.row?change(row):row)});}
 #start():void{if(this.#running||!this.#pending||this.#failure||this.#closed)return;this.#running=this.#drain().catch(error=>{this.#failure=error??new SharedRelayError("local_save_failed");this.#notify();}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;try{this.#assertSource();checkRetainedStoreSignal(this.#restoreSignal);if(this.#atomic)await this.#atomic.write(next);else{this.#options.storage.save();await this.#options.storage.flush();this.#assertSource();
  if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,"suggestions",queueKey(this.#options.identity),next,this.#restoreSignal);this.#restoreInsert=false;checkRetainedStoreSignal(this.#restoreSignal);this.#restoreSignal=undefined;}else await writeQueueRecord(this.#db!,this.#options.identity,next,this.#options.ownedHistory);}
  this.#assertSource();}catch(error){this.#pending??=next;throw error;}this.#durable=new Map(next.retained.map(row=>[this.#options.storage.core.readSuggestion(row.packet).id,JSON.stringify(row)]));this.#notify();}}
 #notify():void{if(this.#notifying)return;this.#notifying=true;queueMicrotask(()=>{this.#notifying=false;for(const listener of [...this.#listeners])try{listener();}catch{/* Reporting cannot replace native or durable state. */}});}
 subscribe(listener:()=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 state():{pending:boolean;failed:boolean;closed:boolean;retiring:boolean;retained:number;publications:number;decisions:number}{return {pending:!!this.#pending||!!this.#running,failed:this.#failure!==undefined,closed:this.#closed,retiring:this.#retiring,retained:this.#rows.size,publications:[...this.#rows.values()].filter(({row})=>row.publish).length,decisions:[...this.#rows.values()].filter(({row})=>row.intent?.retry).length};}
 exportRecovery():SharedSuggestionQueueRecord{this.#live();return structuredClone(this.#record);}
 /** Offline local retention from a genuine original replay. Disconnect and settle every
  * attached sync/revision adapter first. Exact conflicting choices refuse; no native
  * edit or delivery starts. Save failure keeps the complete merged export for retry. */
 async recoverRetainedSuggestions(replay:SharedParticipantReplay):Promise<SharedRetainedSuggestionsRecoveryResult>{
  this.#writable();const release=reserveSuggestionRecovery(this);
  try{const source=replaySuggestionRecord(replay,this.#options.storage.core,this.#options.identity,this.#options.ownedHistory);this.#live();this.#assertSource();const plan=reconcileRetainedSuggestions(this.#options.storage.core,this.#record,source,this.#options.ownedHistory);this.#mark(plan.record);await this.flush();return plan.result;}finally{release();}
 }
 /** Exact detached snapshot, including stopped retries and final receipts; no source save or network. */
 async exportBackup(options:SharedRetainedStoreBackupOptions={}):Promise<string>{return encodeRetainedStoreBackup("suggestions",this.exportRecovery(),value=>checkQueueRecord(value,this.#options.identity,this.#options.ownedHistory),options);}
 proposals():readonly SharedDocumentSuggestionInfo[]{this.#live();return [...this.#rows.values()].map(({info})=>({...info}));}
 packet(id:string):string{this.#live();const found=this.#rows.get(id);if(!found)throw new SharedRelayError("suggestion_unknown");return found.row.packet;}
 status(id:string):SharedSuggestionQueueStatus{this.#live();const found=this.#rows.get(id);if(!found)throw new SharedRelayError("suggestion_unknown");const row=found.row;return {localSaved:this.#durable.get(id)===JSON.stringify(row),publish:row.publish,intent:row.intent?{...row.intent}:null,publication:row.publication?structuredClone(row.publication):null,decision:row.decision?structuredClone(row.decision):null};}
 propose(title:string,createdAtMs:string,draft:SharedDocumentSuggestionDraft):SharedDocumentSuggestionInfo{this.#writable();return this.queuePacket(this.#options.storage.core.captureSuggestion(title,this.#options.identity.principal,createdAtMs,draft));}
 queuePacket(input:string):SharedDocumentSuggestionInfo{this.#writable();const packet=packetText(input),core=this.#options.storage.core,info=core.readSuggestion(packet);if(info.author!==this.#options.identity.principal||core.verifySuggestionSource(packet).kind!=="verified")throw new SharedRelayError("suggestion_local_source_missing");const known=this.#rows.get(info.id);if(known){if(!known.row.publication&&!known.row.publish)this.#replace(info.id,row=>({...row,publish:true}));return {...known.info};}this.#mark({...this.#record,retained:[...this.#record.retained,{packet,origin:"local",publish:true,publication:null,intent:null,decision:null}]});return {...info};}
 /** Accept needs an exact native preview NOW; later source changes remain the server's Conflict. */
 queueDecision(id:string,requested:"accept"|"reject",queuedAtMs:string,preview?:SharedDocumentSuggestionPreview):boolean{
  this.#writable();const found=this.#rows.get(id);if(!found)throw new SharedRelayError("suggestion_unknown");const desired=intent({requested,queuedAtMs,retry:true});if(found.row.decision)return false;
  if(found.row.intent?.retry){if(found.row.intent.requested!==requested)throw new SharedRelayError("suggestion_decision_already_queued");return false;}
  if(requested==="accept"){if(!preview)throw new SharedRelayError("suggestion_preview_required");this.#options.storage.core.checkSuggestionPreview(preview,id);}
  this.#replace(id,row=>({...row,intent:desired}));return true;
 }
 stopRetryingPublication(id:string):void{this.#writable();this.#replace(id,row=>({...row,publish:false}));}
 stopRetryingDecision(id:string):void{this.#writable();this.#replace(id,row=>({...row,intent:row.intent?{...row.intent,retry:false}:null}));}
 /** Host-verified authenticated publication metadata; never infer authority from an arbitrary payload. */
 async receiveVerifiedPublication(id:string,input:SharedSuggestionPublication):Promise<void>{this.#writable();const received=publication(input),known=this.#rows.get(id);if(!known||received.suggestion.id!==id||!same(received.suggestion,known.info)||known.row.publication&&!same(known.row.publication,received))throw new SharedRelayError("suggestion_receipt_mismatch");this.#replace(id,row=>({...row,publish:false,publication:received}));await this.flush();}
 /** Cache a host-authenticated remote proposal without granting it local publication rights. */
 async cacheVerifiedProposal(input:string,metadata:SharedSuggestionPublication):Promise<SharedDocumentSuggestionInfo>{this.#writable();const packet=packetText(input),core=this.#options.storage.core,info=core.readSuggestion(packet),received=publication(metadata);core.verifySuggestionSource(packet);if(!same(received.suggestion,info))throw new SharedRelayError("suggestion_receipt_mismatch");const known=this.#rows.get(info.id);if(known){await this.receiveVerifiedPublication(info.id,received);return {...known.info};}this.#mark({...this.#record,retained:[...this.#record.retained,{packet,origin:"remote",publish:false,publication:received,intent:null,decision:null}]});await this.flush();return info;}
 /** Final receipt is never saved ahead of its actual native effect. Retry after document catchup;
  * duplicate or opposing decisions still retain the original server winner and original intent. */
 async receiveVerifiedDecision(id:string,input:SharedSuggestionDecision):Promise<"waitingForDocument"|"retained">{
  this.#writable();const received=decision(input,this.#options.identity),known=this.#rows.get(id);if(!known?.row.publication||received.suggestionId!==id||BigInt(received.sequence)<=BigInt(known.row.publication.sequence)||known.row.decision&&!same(known.row.decision,received))throw new SharedRelayError("suggestion_receipt_mismatch");
  if(received.effect&&this.#options.storage.core.retainedWriterReceiptV2(received.effect.writerGroup).kind!=="verified")return "waitingForDocument";
  if(received.effect&&this.#options.ownedHistory==="reviewed-v1"){
   const core=this.#options.storage.core,proof=core.verifySuggestionEffect(known.row.packet,{suggestionId:id,writerGroup:received.effect.writerGroup,semanticFrom:received.effect.semanticFrom});
   if(proof.kind==="pending")return "waitingForDocument";
   try{const owned=this.#ownedAcceptance(received);if(owned)core.adoptSuggestionHistory(proof.proof,known.row.packet,owned);}finally{proof.proof.dispose();}
  }
  this.#replace(id,row=>({...row,decision:received,intent:row.intent?{...row.intent,retry:false}:null}));await this.flush();return "retained";
 }
 forget(id:string):void{this.#writable();const row=this.#rows.get(id)?.row;if(!row)return;if(row.publish||row.intent?.retry)throw new SharedRelayError("suggestion_still_queued");this.#mark({...this.#record,retained:this.#record.retained.filter(value=>value!==row)});}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{checkSuggestionRecoveryIdle(this);this.#live();if(this.#running)await this.#running;checkSuggestionRecoveryIdle(this);this.#failure=undefined;this.#pending=structuredClone(this.#record);this.#start();await this.flush();}
 close():Promise<void>{try{checkSuggestionRecoveryIdle(this);}catch(error){return Promise.reject(error);}if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#closing=Promise.resolve().then(async()=>{await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 discardAndClose():Promise<void>{try{checkSuggestionRecoveryIdle(this);}catch(error){return Promise.reject(error);}if(this.#closed)return this.#released??Promise.resolve();this.#closed=true;this.#retiring=true;this.#pending=undefined;this.#db?.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{this.#listeners.clear();await this.#lease.close();attached.delete(this.#options.storage.core);});return this.#released;}
}
/** Private original-store discovery; compound/atomic sources require their own
 * complete driver reader. This is never inferred from a persisted format tag. */
export function borrowPersistentSuggestionRecords<P extends SharedSelectionPolicy>(owner:SharedSuggestionQueue<P>,checkAuthority:()=>void,signal?:AbortSignal):Promise<PersistentSuggestionRead>{return readPersistent(owner as unknown as SharedSuggestionQueue,checkAuthority,signal);}
