/** Durable immutable revision outbox borrowing the accepted source, base queue and connection.
 * Children enter the unchanged proposal queue only after authenticated revision commitment. */
import {SharedRelayError} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {segmentedRetainedPort,type SegmentedRetainedPort} from "../segmented_relay/retained_port.js";
import {same} from "../suggestions/validation.js";
import {SharedEditorError} from "../core.js";
import {isOperationalComponent} from "../participant_operation/component_admission.js";
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
import {readRevisionFeed,checkRevisionFeed} from "./feed.js";
import {submitRevision} from "./submit.js";
import {bridgeRevision} from "./bridge.js";
import {ensureRevisionPrevious} from "./ensure_previous.js";
import {loadRevision} from "./load.js";
import {admitRevisionRecord} from "./record_admission.js";
import {checkSuggestionRecoveryIdle,registerSuggestionRecoveryParticipant,reserveSuggestionRecovery} from "../suggestions/recovery_gate.js";
import {reconcileRetainedRevisions} from "./reconcile_retained.js";
import {replayRevisionRecords} from "../participant_replay/revision_record.js";
import type {SharedParticipantReplay} from "../participant_replay/read.js";
import type {SharedRetainedRevisionsRecoveryResult} from "./reconcile_types.js";
import type {SharedSuggestionRevisionsOptions,SharedSuggestionRevisionsRecord,SharedSuggestionRevisionRow,SharedSuggestionRevisionReceipt,SharedSuggestionRevisionDraft,SharedSuggestionRevisionRequest,SharedSuggestionFormatRebaseDraft,SharedSuggestionFormatRebaseQueued,SharedSuggestionTextRebaseDraft,SharedSuggestionTextRebaseQueued} from "./types.js";
const attached=new WeakSet<object>();
export class SharedSuggestionRevisions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #options:SharedSuggestionRevisionsOptions<P>;readonly #core;readonly #db:IDBDatabase|undefined;
 readonly #segmented:SegmentedRetainedPort<"revisions">|undefined;
 #record:SharedSuggestionRevisionsRecord;#infos=new Map<string,SharedSuggestionRevisionInfo>();#feed=new Map<string,SharedSuggestionRevisionReceipt>();
 #pending:SharedSuggestionRevisionsRecord|undefined;#writing:Promise<void>|undefined;#failure:unknown;#durable="";
 #closed=false;#closing:Promise<void>|undefined;#listeners=new Set<()=>void>();#off:(()=>void)[]=[];#notifyQueued=false;
 #wanted:boolean;#epoch=0;#serial=Promise.resolve();#scheduled=false;#dirty=false;#signature="";#error:string|null=null;#working=false;
 #downloads=new Map<string,ReturnType<typeof loadRevision<P>>>();
 #restoreInsert=false;#restoreSignal:AbortSignal|undefined;
 #tasks=0;#connections=new Set<Promise<void>>();
 private constructor(options:SharedSuggestionRevisionsOptions<P>,db:IDBDatabase|undefined,record:SharedSuggestionRevisionsRecord,segmented?:SegmentedRetainedPort<"revisions">){
  this.#segmented=segmented;
  this.#options=options;this.#core=options.queue.core;this.#db=db;this.#record=record;this.#wanted=options.autoStart!==false;this.#admit(record);
  if(db)db.onversionchange=()=>{db.close();this.#failure=new SharedRelayError("suggestion_database_versionchange");this.#report(this.#failure);};
  this.#off.push(registerSuggestionRecoveryParticipant(options.queue,()=>this.#recoveryIdle()));
  try{this.#off.push(options.queue.subscribe(()=>this.#changed()));this.#off.push(options.transport.subscribe(()=>this.#changed()));this.#off.push(this.#core.subscribe(()=>this.#changed()));}catch(error){this.#closed=true;this.#wanted=false;this.#epoch++;for(const off of [...this.#off].reverse())try{off();}catch{/* Failed construction owns no live delivery path. */}throw error;}
 }
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
  const queue=input.queue;checkSuggestionRecoveryIdle(queue);const core=queue.core,binding=revisionsBinding({binding:input.binding}).binding,options={...input,binding},segmented=segmentedRetainedPort(input,"revisions");
  if(attached.has(queue))throw new SharedRelayError("suggestion_revisions_already_attached");
  const opening=registerSuggestionRecoveryParticipant(queue,()=>{throw new SharedRelayError("suggestion_recovery_in_use");});attached.add(queue);let db:IDBDatabase|undefined,outbox:SharedSuggestionRevisions<Q>|undefined;
  try{if(input.storage.core!==core||!core.supportsSuggestionRevisions()||!input.transport.checkSuggestionRevisions||!input.transport.requestSuggestionRevision||!input.transport.suggestionRevisionsReady)throw new SharedRelayError("suggestion_revisions_unavailable");
   input.transport.checkSuggestionRevisions(core,queue.identity(),binding);if(segmented)segmented.check();else checkSourceCheckpoint(core,queue.identity().room,queue.identity().documentWriter);
   checkRetainedStoreSignal(signal);const retained=isOperationalComponent(input)?await existingOperationalComponent(input.database,"revisions",revisionKey(queue.identity(),binding)):undefined;if(!segmented)db=retained?.db??await openRevisionDatabase(input.database);let saved:SharedSuggestionRevisionsRecord|null;
   if(recovered){if(await retainedStoreDestinationExists(db!,"revisions",revisionKey(queue.identity(),binding),signal))throw new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");saved=recovered;}else saved=segmented?checkRevisionRecord(segmented.read(),queue.identity(),binding):await readRevisionRecord(db!,queue.identity(),binding);
   if(retained&&(!saved||JSON.stringify(saved)!==JSON.stringify(retained.record)))throw operationFailure("operation_diverged");
   const create=()=>new SharedSuggestionRevisions(options,db,saved??{format:"breditor/shared-suggestion-revisions",formatVersion:1,identity:queue.identity(),binding,retained:[]},segmented);outbox=recovered?retainedStoreNativeAdmission(create):create();retained?.assertCurrent();outbox.#restoreInsert=recovered!==undefined;outbox.#restoreSignal=signal;outbox.#pending=structuredClone(outbox.#record);outbox.#startWrite();await outbox.flush();outbox.#check();checkRetainedStoreSignal(signal);outbox.#changed();opening();return outbox;}
  catch(error){opening();if(outbox)await outbox.discardAndClose();else{db?.close();attached.delete(queue);}throw error;}
 }
 #localCheck():void{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");const o=this.#options;if(o.storage.core!==this.#core||o.queue.core!==this.#core)throw new SharedRelayError("suggestion_source_replaced");const state=o.queue.state();if(state.closed||state.retiring)throw new SharedRelayError("suggestion_queue_closed");this.#segmented?.check();}
 #check():void{this.#localCheck();this.#options.transport.checkSuggestionRevisions!(this.#core,this.#record.identity,this.#options.binding);}
 #writable():void{checkSuggestionRecoveryIdle(this.#options.queue);this.#check();this.#segmented?.writable();if(this.#closing)throw new SharedRelayError("suggestion_revisions_closed");}
 #recoveryIdle():void{if(this.#closed||this.#closing||this.#wanted||this.#tasks||this.#working||this.#scheduled||this.#writing||this.#connections.size||this.#downloads.size)throw new SharedRelayError("suggestion_recovery_in_use");}
 #enqueue(work:()=>Promise<void>):Promise<void>{this.#tasks++;const task=this.#serial.then(work).finally(()=>{this.#tasks--;});this.#serial=task.catch(()=>{});return task;}
 /** Await already-disconnected local/delivery work without stopping the borrowed transport. */
 async waitForDisconnected():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);this.#check();if(this.#wanted)throw new SharedRelayError("suggestion_recovery_in_use");const epoch=this.#epoch;await Promise.allSettled([this.#serial,this.#writing,...this.#connections,...this.#downloads.values()]);if(epoch!==this.#epoch)throw new SharedRelayError("suggestion_recovery_in_use");this.#recoveryIdle();}
 #admit(record:SharedSuggestionRevisionsRecord):void{
  this.#infos=admitRevisionRecord(this.#core,record);
 }
 #mark(record:SharedSuggestionRevisionsRecord):void{const checked=checkRevisionRecord(record,this.#record.identity,this.#record.binding);this.#admit(checked);if(same(checked,this.#record)&&!this.#failure)return;this.#segmented?.stage(checked);this.#record=checked;this.#pending=structuredClone(checked);this.#startWrite();this.#notify();this.#schedule();}
 #row(id:string):SharedSuggestionRevisionRow{const index=[...this.#infos.keys()].indexOf(id);if(index<0)throw new SharedRelayError("suggestion_revision_unknown");return this.#record.retained[index]!;}
 #replace(id:string,change:(row:SharedSuggestionRevisionRow)=>SharedSuggestionRevisionRow):void{const row=this.#row(id);this.#mark({...this.#record,retained:this.#record.retained.map(value=>value===row?change(value):value)});}
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
 async loadRevision(id:string):ReturnType<typeof loadRevision<P>>{
  checkSuggestionRecoveryIdle(this.#options.queue);this.#check();const known=this.#downloads.get(id);if(known)return structuredClone(await known);if(this.#downloads.size>=2)throw new SharedRelayError("suggestion_request_budget");const receipt=this.#feed.get(id);if(!receipt)throw new SharedRelayError("suggestion_revision_unknown");const epoch=this.#epoch,check=()=>{this.#check();if(epoch!==this.#epoch||!this.#options.transport.suggestionRevisionsReady?.())throw new SharedRelayError("suggestion_revision_offline");};check();
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
 #startWrite():void{if(this.#writing||!this.#pending||this.#failure||this.#closed)return;this.#writing=this.#drain().catch(error=>{this.#failure=error??new SharedRelayError("local_save_failed");this.#report(new SharedRelayError("local_save_failed"));}).finally(()=>{this.#writing=undefined;this.#notify();if(!this.#failure)this.#startWrite();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){const next=this.#pending;this.#pending=undefined;try{if(this.#segmented){this.#localCheck();await this.#options.queue.flush();this.#localCheck();await this.#segmented.write(next);this.#localCheck();}else{this.#check();checkRetainedStoreSignal(this.#restoreSignal);this.#options.storage.save();await this.#options.storage.flush();this.#check();await this.#options.queue.flush();this.#check();
  if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,"revisions",revisionKey(next.identity,next.binding),next,this.#restoreSignal);this.#restoreInsert=false;checkRetainedStoreSignal(this.#restoreSignal);this.#restoreSignal=undefined;}else await writeRevisionRecord(this.#db!,next);
  this.#check();}this.#durable=JSON.stringify(next);}catch(error){this.#pending??=next;throw error;}}}
 async flush():Promise<void>{if(this.#closed)throw new SharedRelayError("suggestion_revisions_closed");while(this.#writing)await this.#writing;if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);if(this.#segmented)this.#localCheck();else this.#check();if(this.#writing)await this.#writing;checkSuggestionRecoveryIdle(this.#options.queue);this.#failure=undefined;this.#error=null;this.#pending=structuredClone(this.#record);this.#startWrite();await this.flush();this.#schedule();}
 #changed():void{if(this.#closed)return;try{this.#check();const t=this.#options.transport,s=t.suggestionState(),q=this.#options.queue;const signature=JSON.stringify([t.suggestionRevisionsReady!(),s.revision,s.documentRevision,this.#core.view().causalVersion,q.proposals().map(info=>{const r=q.status(info.id);return [info.id,r.publish,r.publication,r.decision];})]);if(signature!==this.#signature){this.#signature=signature;this.#schedule();}this.#notify();}catch(error){this.#epoch++;this.#report(error);}}
 #schedule():void{this.#dirty=true;if(this.#scheduled||this.#closed||!this.#wanted||!this.#options.transport.suggestionRevisionsReady?.()||this.#failure)return;this.#scheduled=true;const epoch=this.#epoch;
  const task=this.#enqueue(async()=>{if(!this.#active(epoch))return;this.#dirty=false;await this.#synchronize(epoch);});this.#serial=task.catch(error=>{if(this.#active(epoch))this.#report(error);}).finally(()=>{this.#scheduled=false;if(this.#dirty&&this.#active(epoch))this.#schedule();});
 }
 #active(epoch:number):boolean{return !this.#closed&&this.#wanted&&epoch===this.#epoch&&!!this.#options.transport.suggestionRevisionsReady?.();}
 #syncCheck(epoch:number):void{this.#check();if(!this.#active(epoch))throw new SharedRelayError("suggestion_revision_offline");}
 async #request(input:SharedSuggestionRevisionRequest,epoch:number):Promise<Record<string,unknown>>{this.#syncCheck(epoch);const result=await this.#options.transport.requestSuggestionRevision!(input);this.#syncCheck(epoch);return result;}
 async #synchronize(epoch:number):Promise<void>{
  this.#syncCheck(epoch);this.#working=true;this.#notify();const check=()=>this.#syncCheck(epoch),o=this.#options;
  try{await this.flush();await o.transport.refreshDocument();check();const feed=await readRevisionFeed(input=>this.#request(input,epoch),this.#record.identity,o.binding);check();checkRevisionFeed([...this.#feed.values(),...this.#record.retained.flatMap(row=>row.receipt?[row.receipt]:[])],feed.revisions);this.#feed=feed.revisions;
   for(const info of [...this.#infos.values()]){let row=this.#row(info.id);const discovered=feed.revisions.get(info.id);if(discovered&&!row.receipt){if(!same(discovered.revision,info))throw new SharedRelayError("suggestion_revision_receipt_mismatch");this.#replace(info.id,value=>({...value,receipt:discovered,retry:false,conflict:null}));await this.flush();row=this.#row(info.id);}
    if(row.retry&&feed.permissions.canPropose){await o.transport.flush();check();o.storage.save();await o.storage.flush();await this.flush();check();if(!this.#row(info.id).retry)continue;
     if(!await ensureRevisionPrevious(o.queue,o.transport,row.previousPacket,check))continue;const result=await submitRevision(input=>this.#request(input,epoch),this.#record.identity,o.binding,row,info);check();if(result){
      const effect=result.conflict?.decision.effect;if(effect&&this.#core.retainedWriterReceiptV2(effect.writerGroup).kind!=="verified"){await o.transport.refreshDocument();check();if(this.#core.retainedWriterReceiptV2(effect.writerGroup).kind!=="verified")continue;}
      this.#replace(info.id,value=>({...value,...result,retry:false}));await this.flush();row=this.#row(info.id);if(row.receipt)this.#feed.set(info.id,row.receipt);}
    }
    if(row.receipt){await bridgeRevision(o.queue,o.transport,row.previousPacket,row.packet,row.receipt,check);}
   }this.#error=null;
  }finally{this.#working=false;this.#notify();}
 }
 /** Single explicit discovery/submission pass. Pending/conflict is observable, never success. */
 async synchronize():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);this.#check();if(this.#failure)throw this.#failure;this.#wanted=true;const epoch=this.#epoch;const task=this.#enqueue(()=>this.#synchronize(epoch));try{await task;}catch(error){if(this.#active(epoch))this.#report(error);throw error;}}
 async connect():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);this.#check();this.#wanted=true;const epoch=this.#epoch,work=(async()=>{await this.#options.transport.connect();if(!this.#active(epoch))throw new SharedRelayError("suggestion_revision_offline");await this.synchronize();})();this.#connections.add(work);try{await work;}finally{this.#connections.delete(work);}}
 disconnect():void{if(this.#closed)return;this.#wanted=false;this.#epoch++;this.#notify();}
 async close():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);if(this.#closed)return;if(this.#closing)return this.#closing;this.disconnect();const work=this.flush().then(()=>this.discardAndClose());this.#closing=work;try{await work;}finally{this.#closing=undefined;}}
 async discardAndClose():Promise<void>{checkSuggestionRecoveryIdle(this.#options.queue);if(this.#closed)return;this.disconnect();this.#closed=true;for(const off of this.#off)off();this.#db?.close();await this.#writing;this.#pending=undefined;attached.delete(this.#options.queue);this.#notify();queueMicrotask(()=>this.#listeners.clear());}
}
