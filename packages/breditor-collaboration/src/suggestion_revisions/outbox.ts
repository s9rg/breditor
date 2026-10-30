import {registerNativeRevisionStore,type NativeRevisionStore,type NativeRevisionSettlement} from './native_store.js';
import type {NativeSuggestionChild} from '../suggestions/native_child.js';
import type {NativeSuggestionJob} from '../suggestions/native_queue.js';
import {selectedHeldMetadataOpen,heldMetadataWork,type HeldMetadataOpen} from '../metadata/held_open.js';
/** Durable immutable revision outbox borrowing the accepted source, base queue and connection.
 * Children enter the unchanged proposal queue only after authenticated revision commitment. */
import {RelayWorkCustody} from '../relay/work_custody.js';
import {SharedRelayError} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {selectedRetainedStorePort,retainedStoreOwner,retainedStoreCommitted,type RetainedStorePort} from "../delivery_ports/retained.js";
import {same} from "../suggestions/validation.js";
import {SharedEditorError} from "../core.js";
import {registerManagedSource,checkManagedCore,checkManagedSource,managedSourceUnavailable,managedSourceCore,checkManagedSourceBindings} from "../managed_custody.js";
import {participantAuthority} from '../participant_backup/policy.js';
import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {borrowPersistentSuggestionRecords} from '../suggestions/queue.js';
import type {PersistentSuggestionRead} from '../suggestions/persistent_read_contract.js';
import {createOriginalRecordRead,type OriginalRecordRead,type OriginalRevisionRecords} from '../persistence/original_record_read.js';
import {isOperationalComponent,isCompletedOperationalComponent} from "../participant_operation/component_admission.js";
import {existingOperationalComponent} from "../participant_operation/existing_component.js";
import {operationFailure} from "../participant_operation/errors.js";
import {encodeRetainedStoreBackup,decodeRetainedStoreBackup,checkRetainedStoreRecovery,checkRetainedStoreSignal,retainedStoreNativeAdmission} from "../backups/retained_store.js";
import {retainedStoreDestinationExists,insertRetainedStoreRecord} from "../backups/retained_store_database.js";
import type {SharedSuggestionRevisionsBackupOptions,SharedRetainedStoreBackupOptions} from "../backups/retained_store_types.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionRevisionInfo} from "../suggestion_types.js";
import {checkRevisionRecord,openRevisionDatabase,readRevisionRecord,writeRevisionRecord,revisionKey} from "./database.js";
import {revisionsBinding,revisionPacket} from "./transport.js";
import {captureRevision} from "./capture.js";
import {captureFormatRevision} from "./rebase_format.js";
import {captureTextRevision} from "./rebase_text.js";
import {synchronizeRevisions} from './synchronize.js';
import {loadRevision} from "./load.js";
import {admitRevisionRecord} from "./record_admission.js";
import {checkSuggestionRecoveryIdle,registerSuggestionRecoveryParticipant,reserveSuggestionRecovery} from "../suggestions/recovery_gate.js";
import {reconcileRetainedRevisions} from "./reconcile_retained.js";
import {replayRevisionRecords} from "../participant_replay/revision_record.js";
import type {SharedParticipantReplay} from "../participant_replay/read.js";
import type {SharedRetainedRevisionsRecoveryResult} from "./reconcile_types.js";
import type {SharedSuggestionRevisionsOptions,SharedSuggestionRevisionsRecord,SharedSuggestionRevisionRow,SharedSuggestionRevisionReceipt,SharedSuggestionRevisionDraft,SharedSuggestionRevisionRequest,SharedSuggestionFormatRebaseDraft,SharedSuggestionFormatRebaseQueued,SharedSuggestionTextRebaseDraft,SharedSuggestionTextRebaseQueued} from "./types.js";
const constructionKey=Object.freeze({}),attached=new WeakSet<object>();
let readOriginalRevision:(owner:SharedSuggestionRevisions,authority:()=>void,signal?:AbortSignal)=>Promise<OriginalRecordRead<OriginalRevisionRecords>>;
export class SharedSuggestionRevisions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #work:RelayWorkCustody;readonly #options:SharedSuggestionRevisionsOptions<P>;readonly #core;readonly #db:IDBDatabase|undefined;
 readonly #atomic:RetainedStorePort<"revisions">|undefined;
 readonly #recordSource:object|undefined;#nativeLoan:object|undefined;
 #record:SharedSuggestionRevisionsRecord;#infos=new Map<string,SharedSuggestionRevisionInfo>();#feed=new Map<string,SharedSuggestionRevisionReceipt>();
 #pending:SharedSuggestionRevisionsRecord|undefined;#writing:Promise<void>|undefined;#failure:unknown;#durable="";
 #closed=false;#closing:Promise<void>|undefined;#listeners=new Set<()=>void>();#off:(()=>void)[]=[];#notifyQueued=false;
 #wanted:boolean;#epoch=0;#serial=Promise.resolve();#scheduled=false;#dirty=false;#signature="";#error:string|null=null;#working=false;
 #downloads=new Map<string,ReturnType<typeof loadRevision<P>>>();
 #restoreInsert=false;#restoreSignal:AbortSignal|undefined;
 #initialized=false;#tasks=0;#connections=new Set<Promise<void>>();#storageChanged=false;
 private constructor(key:object,options:SharedSuggestionRevisionsOptions<P>,db:IDBDatabase|undefined,record:SharedSuggestionRevisionsRecord,atomic?:RetainedStorePort<"revisions">,recordSource?:object,held?:HeldMetadataOpen){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual revision outbox open or recovery factory');
  this.#atomic=atomic;this.#recordSource=recordSource;
  this.#options=options;this.#core=options.queue.core;this.#db=db;this.#record=record;this.#wanted=options.autoStart!==false;this.#admit(record);this.#work=heldMetadataWork(this.#core,()=>this.#initialized&&!this.#wanted,()=>new SharedRelayError('suggestion_recovery_in_use'),held);this.#work.registerOwner(this);registerNativeRevisionStore(this,{core:this.#core,source:atomic?retainedStoreOwner(atomic,this.#core):recordSource,queue:options.queue,open:child=>this.#lendNative(child as unknown as NativeSuggestionChild<P>) as NativeRevisionStore});
  registerManagedSource(this,this.#core,()=>{this.#localCheck();if(this.#closing||this.#storageChanged)throw managedSourceUnavailable();checkManagedSource(options.queue,this.#core);});
  if(db)db.onversionchange=()=>{this.#storageChanged=true;db.close();this.#failure=new SharedRelayError("suggestion_database_versionchange");this.#report(this.#failure);};
  this.#off.push(registerSuggestionRecoveryParticipant(options.queue,()=>this.#recoveryIdle()));
  try{this.#off.push(options.queue.subscribe(()=>this.#changed()));this.#off.push(options.transport.subscribe(()=>this.#changed()));this.#off.push(this.#core.subscribe(()=>this.#changed()));this.#initialized=true;}catch(error){this.#closed=true;this.#wanted=false;this.#epoch++;for(const off of [...this.#off].reverse())try{off();}catch{/* Failed construction owns no live delivery path. */}this.#work.retire(()=>{});throw error;}
 }
 static{readOriginalRevision=async(owner,provided,signal)=>{
  const fail=(suffix:string)=>new SharedRelayError('revision_record_read_'+suffix);
  if(!owner||typeof owner!=='object'||!(#record in owner))throw fail('source');if(owner.#atomic||!owner.#db||!owner.#recordSource)throw fail('family');const authority=participantAuthority(provided),record=owner.#record,pending=owner.#pending,durable=owner.#durable,epoch=owner.#epoch,source=owner.#recordSource,core=owner.#core;
  let queue:PersistentSuggestionRead|undefined,result:OriginalRecordRead<OriginalRevisionRecords>|undefined,released=false,complete=false;
  const release=()=>{if(!released){released=true;queue?.dispose();}},current=()=>{if(released||!queue)throw fail('closed');checkManagedSourceBindings(owner);queue.checkCurrent();owner.#recoveryIdle();if(owner.#storageChanged||owner.#record!==record||owner.#pending!==pending||owner.#durable!==durable||owner.#epoch!==epoch)throw fail('changed');checkManagedSource(source,core);queue.checkCurrent();},check=()=>{current();queue!.check();current();},readStored=async()=>{try{return await readRevisionRecord(owner.#db!,record.identity,record.binding);}catch(error){throw retainInternalFailureCause(fail('record'),error);}};
  try{
   // This one queue borrow reserves all attached adapters, including this outbox.
   // A second reserveSuggestionRecovery call here would reject our own read.
   queue=await borrowPersistentSuggestionRecords(owner.#options.queue,authority,signal);check();const committed=await readStored();check();if(!committed)throw fail('missing');const json=JSON.stringify(committed);result=createOriginalRecordRead({format:'breditor/persistent-original-revision-record-read',formatVersion:1,scope:'original-revision-and-queue-committed-pending-live',committed,pending:pending??null,live:record,queue:queue.metadata()},{check,current,verify:async()=>{check();await queue!.verify();check();const actual=await readStored();check();if(JSON.stringify(actual)!==json)throw fail('changed');},release});result.check();complete=true;return result;
  }finally{if(!complete){result?.dispose();release();}}
 };}
 static async open<Q extends SharedSelectionPolicy>(input:SharedSuggestionRevisionsOptions<Q>):Promise<SharedSuggestionRevisions<Q>>{
  return SharedSuggestionRevisions.#open(input);
 }
 /** Exact retained revisions, conflicts and stopped retries. Never starts borrowed transport work. */
 static async restoreBackup<Q extends SharedSelectionPolicy>(input:SharedSuggestionRevisionsBackupOptions<Q>):Promise<SharedSuggestionRevisions<Q>>{
  checkSuggestionRecoveryIdle(input.queue);
  checkRetainedStoreRecovery(input);if(input.autoStart!==undefined&&input.autoStart!==false)throw new SharedEditorError("backup_policy","Restoration must not automatically start revision synchronization");
  const {backupJson,writerRecovery:_authority,signal,...options}={...input},queue=options.queue,core=queue.core,source=options.storage,binding=revisionsBinding({binding:options.binding}).binding,identity=queue.identity(),recovered=await decodeRetainedStoreBackup("suggestion-revisions",backupJson,value=>checkRevisionRecord(value,identity,binding),signal);
  if(source.core!==core||queue.core!==core)throw new SharedRelayError("suggestion_source_replaced");return SharedSuggestionRevisions.#open({...options,binding,autoStart:false},recovered,signal);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedSuggestionRevisionsOptions<Q>,recovered?:SharedSuggestionRevisionsRecord,signal?:AbortSignal):Promise<SharedSuggestionRevisions<Q>>{
  const queue=input.queue;checkSuggestionRecoveryIdle(queue);const core=queue.core,binding=revisionsBinding({binding:input.binding}).binding,options={...input,binding},atomic=selectedRetainedStorePort(input,"revisions"),held=selectedHeldMetadataOpen(input,core,atomic,()=>new SharedRelayError('suggestion_recovery_in_use'));
  checkManagedCore(core);
  if(attached.has(queue))throw new SharedRelayError("suggestion_revisions_already_attached");
  const opening=registerSuggestionRecoveryParticipant(queue,()=>{throw new SharedRelayError("suggestion_recovery_in_use");});attached.add(queue);let db:IDBDatabase|undefined,outbox:SharedSuggestionRevisions<Q>|undefined;
  try{if(input.storage.core!==core||!core.supportsSuggestionRevisions()||!input.transport.checkSuggestionRevisions||!input.transport.requestSuggestionRevision||!input.transport.suggestionRevisionsReady)throw new SharedRelayError("suggestion_revisions_unavailable");
   input.transport.checkSuggestionRevisions(core,queue.identity(),binding);if(atomic)atomic.check();else checkSourceCheckpoint(core,queue.identity().room,queue.identity().documentWriter);
   checkManagedCore(core);checkRetainedStoreSignal(signal);const retained=isOperationalComponent(input)?await existingOperationalComponent(input.database,"revisions",revisionKey(queue.identity(),binding)):undefined;if(!atomic)db=retained?.db??await openRevisionDatabase(input.database);let saved:SharedSuggestionRevisionsRecord|null;
   if(recovered){if(await retainedStoreDestinationExists(db!,"revisions",revisionKey(queue.identity(),binding),signal))throw new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");saved=recovered;}else saved=atomic?checkRevisionRecord(atomic.read(),queue.identity(),binding):await readRevisionRecord(db!,queue.identity(),binding);
   if(retained&&(!saved||JSON.stringify(saved)!==JSON.stringify(retained.record)))throw operationFailure("operation_diverged");
   let recordSource:object|undefined;try{if(managedSourceCore(input.storage)===core)recordSource=input.storage;}catch{/* Old custom sources remain editable, but issue no managed record-read custody. */}
   checkManagedCore(core);const create=()=>new SharedSuggestionRevisions(constructionKey,options,db,saved??{format:"breditor/shared-suggestion-revisions",formatVersion:1,identity:queue.identity(),binding,retained:[]},atomic,recordSource,held);outbox=recovered?retainedStoreNativeAdmission(create):create();checkManagedCore(core);retained?.assertCurrent();outbox.#restoreInsert=recovered!==undefined;outbox.#restoreSignal=signal;if(held){held.check();if(!saved||recovered||!atomic||options.autoStart!==false)throw new SharedRelayError('metadata_preparation_policy');outbox.#durable=JSON.stringify(outbox.#record);}else if(isCompletedOperationalComponent(input)){if(!retained||!saved||recovered||atomic)throw operationFailure('operation_diverged');outbox.#durable=JSON.stringify(outbox.#record);}else{outbox.#pending=structuredClone(outbox.#record);outbox.#startWrite();await outbox.flush();}held?.check();outbox.#check();checkManagedCore(core);checkRetainedStoreSignal(signal);outbox.#changed();opening();return outbox;}
  catch(error){opening();if(outbox)await outbox.discardAndClose();else{db?.close();attached.delete(queue);}throw error;}
 }
 #localCheck():void{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");const o=this.#options;if(o.storage.core!==this.#core||o.queue.core!==this.#core)throw new SharedRelayError("suggestion_source_replaced");const state=o.queue.state();if(state.closed||state.retiring)throw new SharedRelayError("suggestion_queue_closed");this.#atomic?.check();}
 #check():void{this.#localCheck();this.#options.transport.checkSuggestionRevisions!(this.#core,this.#record.identity,this.#options.binding);}
 #writable():void{this.#work.checkAllowed();checkSuggestionRecoveryIdle(this.#options.queue);this.#check();checkManagedCore(this.#core);this.#atomic?.writable();if(this.#closing)throw new SharedRelayError("suggestion_revisions_closed");}
 #recoveryIdle():void{if(this.#work.hasPendingWork()||this.#closed||this.#closing||this.#wanted||this.#tasks||this.#working||this.#scheduled||this.#writing||this.#connections.size||this.#downloads.size)throw new SharedRelayError("suggestion_recovery_in_use");}
 #enqueue(work:()=>Promise<void>):Promise<void>{return this.#work.run(()=>{this.#tasks++;const task=this.#serial.then(work).finally(()=>{this.#tasks--;});this.#serial=task.catch(()=>{});return task;});}
 /** Await already-disconnected local/delivery work without stopping the borrowed transport. */
 async waitForDisconnected():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);this.#check();if(this.#wanted)throw new SharedRelayError("suggestion_recovery_in_use");const epoch=this.#epoch;await Promise.allSettled([this.#serial,this.#writing,...this.#connections,...this.#downloads.values()]);if(epoch!==this.#epoch)throw new SharedRelayError("suggestion_recovery_in_use");this.#recoveryIdle();}
 #admit(record:SharedSuggestionRevisionsRecord):void{
  this.#infos=admitRevisionRecord(this.#core,record);
 }
 #mark(record:SharedSuggestionRevisionsRecord,job?:NativeSuggestionJob):void{const stage=()=>{const checked=checkRevisionRecord(record,this.#record.identity,this.#record.binding),infos=admitRevisionRecord(this.#core,checked);checkManagedCore(this.#core);if(same(checked,this.#record)&&!this.#failure)return;this.#atomic?.stage(checked);this.#infos=infos;this.#record=checked;this.#pending=structuredClone(checked);if(job)this.#startNativeWrite(job);else this.#startWrite();this.#notify();if(!job)this.#schedule();};if(job){job.check();this.#work.runSyncAdmitted(job.port.admission,stage);}else this.#work.runSync(stage);}

 #row(id:string):SharedSuggestionRevisionRow{const index=[...this.#infos.keys()].indexOf(id);if(index<0)throw new SharedRelayError("suggestion_revision_unknown");return this.#record.retained[index]!;}
 #replace(id:string,change:(row:SharedSuggestionRevisionRow)=>SharedSuggestionRevisionRow,job?:NativeSuggestionJob):void{const row=this.#row(id);this.#mark({...this.#record,retained:this.#record.retained.map(value=>value===row?change(value):value)},job);}
 /** Pure capture plus local durable intent, not supersession, rejection or accepted document edits. */
 revise(input:SharedSuggestionRevisionDraft):SharedSuggestionRevisionInfo{this.#writable();const captured=captureRevision(this.#options.queue,input);return this.queueRevision(captured.previousPacket,captured.packet);}
 /** Native formatting-only revision. Non-ready outcomes queue nothing; retry keeps exact bytes. */
 rebaseFormat(input:SharedSuggestionFormatRebaseDraft):SharedSuggestionFormatRebaseQueued{this.#writable();const captured=captureFormatRevision(this.#options.queue,input);if(captured.result.kind!=="captured")return captured.result;return {kind:"queued",revision:this.queueRevision(captured.previousPacket,captured.result.revisionPacketJson)};}
 /** Complete native text revision. Non-ready outcomes queue nothing; retries retain exact bytes. */
 rebaseText(input:SharedSuggestionTextRebaseDraft):SharedSuggestionTextRebaseQueued{this.#writable();const captured=captureTextRevision(this.#options.queue,input);if(captured.result.kind!=="captured")return captured.result;return {kind:"queued",revision:this.queueRevision(captured.previousPacket,captured.result.revisionPacketJson)};}
 /** Retry exactly these bytes; no recapture on network or quota failure. */
 queueRevision(previousPacket:string,input:string):SharedSuggestionRevisionInfo{this.#writable();const packet=revisionPacket(input),info=this.#core.readSuggestionRevision(previousPacket,packet),known=this.#infos.get(info.id);if(known){if(!this.#row(info.id).receipt&&!this.#row(info.id).conflict)this.#replace(info.id,row=>({...row,retry:true}));return structuredClone(known);}this.#mark({...this.#record,retained:[...this.#record.retained,{previousPacket,packet,retry:true,receipt:null,conflict:null}]});return structuredClone(info);}
 revisions():readonly SharedSuggestionRevisionInfo[]{this.#check();return structuredClone([...this.#infos.values()]);}
 /** Exact borrowed pairing for controls; no lease or source ownership transfers. */
 checkQueue(queue:SharedSuggestionRevisionsOptions<P>["queue"]):void{this.#check();if(queue!==this.#options.queue)throw new SharedRelayError("suggestion_revision_queue_mismatch");}
 /** Pure preview bytes only. This must not be used for independent child publication. */
 suggestionPacket(id:string):string{this.#check();const row=this.#row(id);return this.#core.revisionSuggestionPacket(row.previousPacket,row.packet);}
 entries():readonly SharedSuggestionRevisionReceipt[]{this.#check();return structuredClone([...this.#feed.values()]);}
 /** Deduplicated lazy proof download; remote packets are not silently persisted as local drafts. */
 async loadRevision(id:string):ReturnType<typeof loadRevision<P>>{return this.#work.run(()=>this.#loadRevision(id));}
 async #loadRevision(id:string):ReturnType<typeof loadRevision<P>>{
  checkSuggestionRecoveryIdle(this.#options.queue);this.#check();const known=this.#downloads.get(id);if(known)return structuredClone(await known);if(this.#downloads.size>=2)throw new SharedRelayError("suggestion_request_budget");const receipt=this.#feed.get(id);if(!receipt)throw new SharedRelayError("suggestion_revision_unknown");const epoch=this.#epoch,check=()=>{this.#check();checkManagedCore(this.#core);if(epoch!==this.#epoch||!this.#options.transport.suggestionRevisionsReady?.())throw new SharedRelayError("suggestion_revision_offline");};check();
  const work=loadRevision(this.#core,this.#options.transport,receipt,check);this.#downloads.set(id,work);try{return structuredClone(await work);}finally{if(this.#downloads.get(id)===work)this.#downloads.delete(id);}
 }
 status(id:string):SharedSuggestionRevisionRow&{localSaved:boolean}{this.#check();return {...structuredClone(this.#row(id)),localSaved:this.#durable===JSON.stringify(this.#record)};}
 packet(id:string):string{this.#check();return this.#row(id).packet;}
 stopRetrying(id:string):void{this.#writable();this.#replace(id,row=>({...row,retry:false}));}
 forget(id:string):void{this.#writable();const row=this.#row(id);if(row.retry)throw new SharedRelayError("suggestion_revision_still_queued");this.#mark({...this.#record,retained:this.#record.retained.filter(value=>value!==row)});}
 /** Exact retained bytes remain exportable after a borrowed source/transport failure. */
 exportRecovery():SharedSuggestionRevisionsRecord{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");return structuredClone(this.#record);}
 /** Offline exact retention after private original replay. Reserves the base queue and
  * all attached adapters through save. Native journals and original files stay intact;
  * no child publication, implicit decision, network request or history adoption occurs. */
 async recoverRetainedRevisions(replay:SharedParticipantReplay):Promise<SharedRetainedRevisionsRecoveryResult>{
  this.#writable();const release=reserveSuggestionRecovery(this.#options.queue);
  try{const queue=this.#options.queue.exportRecovery(),history=queue.format==="breditor/shared-owned-suggestion-queue"?"reviewed-v1":undefined,source=replayRevisionRecords(replay,this.#core,this.#record.identity,this.#record.binding,history);this.#check();const plan=reconcileRetainedRevisions(this.#core,this.#record,source.record,[queue,source.queue]);this.#mark(plan.record);await this.flush();return plan.result;}finally{release();}
 }
 async exportBackup(options:SharedRetainedStoreBackupOptions={}):Promise<string>{return encodeRetainedStoreBackup("suggestion-revisions",this.exportRecovery(),value=>checkRevisionRecord(value,this.#record.identity,this.#record.binding),options);}
 state():{status:"offline"|"syncing"|"pending"|"ready"|"failed"|"local-save-failed"|"closed";pending:number;retained:number;discovered:number;localSaved:boolean;error:string|null}{return {status:this.#closed?"closed":this.#failure?"local-save-failed":this.#error?"failed":!this.#options.transport.suggestionRevisionsReady?.()?"offline":this.#working?"syncing":this.#record.retained.some(row=>row.retry)?"pending":"ready",pending:this.#record.retained.filter(row=>row.retry).length,retained:this.#record.retained.length,discovered:this.#feed.size,localSaved:this.#durable===JSON.stringify(this.#record),error:this.#failure?"local_save_failed":this.#error};}
 subscribe(listener:()=>void):()=>void{this.#check();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 #notify():void{if(this.#notifyQueued)return;this.#notifyQueued=true;queueMicrotask(()=>{this.#notifyQueued=false;for(const listener of [...this.#listeners])try{listener();}catch{/* Borrowed observers cannot acknowledge persistence. */}});}
 #report(error:unknown):void{const failure=error instanceof SharedRelayError?error:new SharedRelayError("suggestion_revision_sync_failed");this.#error=failure.code;this.#wanted=false;this.#notify();try{this.#options.onError?.(failure);}catch{/* Reporting cannot discard the draft. */}}
 #startWrite():void{if(this.#writing||!this.#pending||this.#failure||this.#closed)return;this.#writing=this.#work.run(()=>this.#drain()).catch(error=>{this.#failure=error??new SharedRelayError("local_save_failed");this.#report(new SharedRelayError("local_save_failed"));}).finally(()=>{this.#writing=undefined;this.#notify();if(!this.#failure)this.#startWrite();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){const next=this.#pending;this.#pending=undefined;try{if(this.#atomic){this.#localCheck();await this.#options.queue.flush();this.#localCheck();await this.#atomic.write(next);this.#localCheck();}else{this.#check();checkRetainedStoreSignal(this.#restoreSignal);this.#options.storage.save();await this.#options.storage.flush();this.#check();await this.#options.queue.flush();this.#check();
  if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,"revisions",revisionKey(next.identity,next.binding),next,this.#restoreSignal);this.#restoreInsert=false;checkRetainedStoreSignal(this.#restoreSignal);this.#restoreSignal=undefined;}else await writeRevisionRecord(this.#db!,next);
  this.#check();}this.#durable=JSON.stringify(next);}catch(error){this.#pending??=next;throw error;}}}
 /** Actual committed bytes remain facts even when current authority disappears
  * in a transaction-complete callback. Original pending records survive retry. */
 async #drainNative(job:NativeSuggestionJob,queue:NativeSuggestionChild<P>['queue']):Promise<void>{while(this.#pending&&!this.#closed){
  job.check();const next=this.#pending,durable=JSON.stringify(next);this.#pending=undefined;
  try{this.#localCheck();checkRetainedStoreSignal(this.#restoreSignal);if(this.#atomic){await queue.flush();job.check();await this.#atomic.write(next);}else{await job.persistSource();job.check();await queue.flush();job.check();if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,'revisions',revisionKey(next.identity,next.binding),next,this.#restoreSignal);this.#restoreInsert=false;this.#restoreSignal=undefined;}else await writeRevisionRecord(this.#db!,next);}}
  catch(error){this.#pending??=next;if(this.#atomic&&same(retainedStoreCommitted(this.#atomic,this.#core),next)){this.#durable=durable;this.#notify();}throw error;}
  this.#durable=durable;this.#notify();job.check();
 }}
 #startNativeWrite(job:NativeSuggestionJob):void{const queue=this.#nativeQueue;if(!queue||this.#writing||!this.#pending||this.#failure||this.#closed)return;this.#writing=this.#work.runAdmitted(job.port.admission,()=>Promise.resolve().then(()=>this.#drainNative(job,queue))).catch(error=>{this.#failure=error??new SharedRelayError('local_save_failed');this.#notify();}).finally(()=>{this.#writing=undefined;this.#notify();if(!this.#failure&&this.#pending)this.#startNativeWrite(job);});}
 #nativeQueue:NativeSuggestionChild<P>['queue']|undefined;
 #lendNative(child:NativeSuggestionChild<P>):NativeRevisionStore<P>{
  this.#recoveryIdle();this.#localCheck();checkManagedSourceBindings(this);if(this.#nativeLoan)throw new SharedRelayError('native_revision_outbox_in_use');
  const key=Object.freeze({});this.#nativeLoan=key;this.#nativeQueue=child.queue;let closed=false,ending:Promise<void>|undefined;const calls=new Set<Promise<void>>();
  const check=()=>{child.check();if(closed||this.#nativeLoan!==key||this.#closed||this.#closing||this.#storageChanged)throw new SharedRelayError('native_revision_outbox_closed');this.#localCheck();checkManagedSourceBindings(this);child.check();};
  const job:NativeSuggestionJob=Object.freeze({port:child.port,check,persistSource:()=>child.port.persistLocal()});
  const close=()=>{closed=true;if(ending)return ending;const release=()=>{if(this.#nativeLoan===key){this.#nativeLoan=undefined;this.#nativeQueue=undefined;}};if(!this.#writing&&!calls.size){release();return Promise.resolve();}ending=(async()=>{while(this.#writing||calls.size)await Promise.all([...calls,...(this.#writing?[this.#writing]:[])]);release();})().finally(()=>{ending=undefined;});return ending;};
  const track=<T>(start:()=>Promise<T>):Promise<T>=>{if(closed||this.#nativeLoan!==key)return Promise.reject(new SharedRelayError('native_revision_outbox_closed'));let resolve!:()=>void;const done=new Promise<void>(finish=>{resolve=finish;});calls.add(done);const finish=()=>{calls.delete(done);resolve();};try{return this.#work.runAdmitted(child.port.admission,()=>Promise.resolve().then(()=>{check();return start();})).then(value=>{finish();return value;},error=>{finish();throw error;});}catch(error){finish();return Promise.reject(error);}};
  try{
   check();const flush=async()=>{check();if(this.#pending&&!this.#failure)this.#startNativeWrite(job);while(this.#writing)await this.#writing;if(this.#failure)throw this.#failure;check();};
   return Object.freeze({core:this.#core,identity:structuredClone(this.#record.identity),binding:this.#record.binding,record:()=>structuredClone(this.#record),infos:()=>structuredClone([...this.#infos.values()]),row:(id:string)=>structuredClone(this.#row(id)),state:()=>({pending:!!this.#writing||!!this.#pending,failed:this.#failure!==undefined,localSaved:this.#durable===JSON.stringify(this.#record)}),subscribe:(listener:()=>void)=>{check();this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};},settle:(id:string,value:NativeRevisionSettlement)=>{check();if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='conflict,receipt,retry')throw new SharedRelayError('native_revision_settlement');this.#replace(id,row=>({...row,...value}),job);},flush:()=>track(flush),retry:()=>track(async()=>{check();if(this.#writing)await this.#writing;check();this.#failure=undefined;this.#pending=structuredClone(this.#record);this.#startNativeWrite(job);await flush();}),close});
  }catch(error){void close();throw error;}
 }

 async flush():Promise<void>{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");while(this.#writing)await this.#writing;if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");return this.#work.run(()=>this.#retry());}
 async #retry():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);if(this.#atomic)this.#localCheck();else this.#check();if(this.#writing)await this.#writing;checkSuggestionRecoveryIdle(this.#options.queue);this.#failure=undefined;this.#error=null;this.#pending=structuredClone(this.#record);this.#startWrite();await this.flush();this.#schedule();}
 #changed():void{if(this.#closed)return;try{this.#work.checkAllowed();}catch{return;}try{this.#check();const t=this.#options.transport,s=t.suggestionState(),q=this.#options.queue;const signature=JSON.stringify([t.suggestionRevisionsReady!(),s.revision,s.documentRevision,this.#core.view().causalVersion,q.proposals().map(info=>{const r=q.status(info.id);return [info.id,r.publish,r.publication,r.decision];})]);if(signature!==this.#signature){this.#signature=signature;this.#schedule();}this.#notify();}catch(error){this.#epoch++;this.#report(error);}}
 #schedule():void{this.#dirty=true;if(this.#scheduled||this.#closed||!this.#wanted||!this.#options.transport.suggestionRevisionsReady?.()||this.#failure)return;this.#scheduled=true;const epoch=this.#epoch;
  const task=this.#enqueue(async()=>{if(!this.#active(epoch))return;this.#dirty=false;await this.#synchronize(epoch);});this.#serial=task.catch(error=>{if(this.#active(epoch))this.#report(error);}).finally(()=>{this.#scheduled=false;if(this.#dirty&&this.#active(epoch))this.#schedule();});
 }
 #active(epoch:number):boolean{if(this.#closed||!this.#wanted||epoch!==this.#epoch)return false;try{checkManagedCore(this.#core);return !!this.#options.transport.suggestionRevisionsReady?.();}catch{return false;}}
 #syncCheck(epoch:number):void{this.#check();checkManagedCore(this.#core);if(!this.#active(epoch))throw new SharedRelayError("suggestion_revision_offline");}
 async #request(input:SharedSuggestionRevisionRequest,epoch:number):Promise<Record<string,unknown>>{this.#syncCheck(epoch);const result=await this.#options.transport.requestSuggestionRevision!(input);this.#syncCheck(epoch);return result;}
 async #synchronize(epoch:number):Promise<void>{
  this.#syncCheck(epoch);this.#working=true;this.#notify();const check=()=>this.#syncCheck(epoch),o=this.#options;
  try{await synchronizeRevisions({core:this.#core,queue:o.queue,transport:o.transport,identity:this.#record.identity,binding:o.binding,check,flush:()=>this.flush(),persistSource:async()=>{o.storage.save();await o.storage.flush();},record:()=>this.#record,infos:()=>[...this.#infos.values()],row:id=>this.#row(id),replace:(id,change)=>this.#replace(id,change),feed:()=>this.#feed,setFeed:feed=>{this.#feed=feed;},request:input=>this.#request(input,epoch)});this.#error=null;
  }finally{this.#working=false;this.#notify();}
 }
 /** Single explicit discovery/submission pass. Pending/conflict is observable, never success. */
 async synchronize():Promise<void>{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");return this.#work.run(()=>this.#synchronizeRequested());}
 async #synchronizeRequested():Promise<void>{this.#writable();if(this.#failure)throw this.#failure;this.#wanted=true;const epoch=this.#epoch;const task=this.#enqueue(()=>this.#synchronize(epoch));try{await task;}catch(error){if(this.#active(epoch))this.#report(error);throw error;}}
 async connect():Promise<void>{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");return this.#work.run(()=>this.#connect());}
 async #connect():Promise<void>{this.#writable();this.#wanted=true;const epoch=this.#epoch,work=(async()=>{await this.#options.transport.connect();if(!this.#active(epoch))throw new SharedRelayError("suggestion_revision_offline");await this.synchronize();})();this.#connections.add(work);try{await work;}finally{this.#connections.delete(work);}}
 disconnect():void{if(this.#closed)return;this.#wanted=false;this.#epoch++;this.#notify();}
 async close():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);if(this.#closed)return;if(this.#closing)return this.#closing;this.disconnect();const work=this.flush().then(()=>this.discardAndClose());this.#closing=work;try{await work;}finally{this.#closing=undefined;}}
 async discardAndClose():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);if(this.#closed)return;this.disconnect();this.#closed=true;for(const off of this.#off)off();this.#work.retire(()=>attached.delete(this.#options.queue));await this.#work.wait(()=>{});this.#db?.close();this.#pending=undefined;this.#notify();queueMicrotask(()=>this.#listeners.clear());}
}
/** Actual original revision and base-queue rows under one shared reservation.
 * Uses local source custody, never a transport callback as read authorization. */
export function captureOriginalRevisionRecords<P extends SharedSelectionPolicy>(owner:SharedSuggestionRevisions<P>,checkAuthority:()=>void,signal?:AbortSignal){return readOriginalRevision(owner as unknown as SharedSuggestionRevisions,checkAuthority,signal);}
