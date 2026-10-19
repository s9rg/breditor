/** Durable client intent, not a second document, current authority or optimistic accepted content. */
import {SharedRelayError} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {sameReviewedHistory} from "../reviewed_history_validation.js";
import {SharedEditorError} from "../core.js";
import {encodeRetainedStoreBackup,decodeRetainedStoreBackup,checkRetainedStoreRecovery,checkRetainedStoreSignal,retainedStoreNativeAdmission} from "../backups/retained_store.js";
import {retainedStoreDestinationExists,insertRetainedStoreRecord} from "../backups/retained_store_database.js";
import type {SharedSuggestionQueueBackupOptions,SharedRetainedStoreBackupOptions} from "../backups/retained_store_types.js";
import type {SharedOwnedSuggestionAcceptance} from "../reviewed_history_types.js";
import {checkQueueRecord,openQueueDatabase,readQueueRecord,writeQueueRecord,queueKey} from "./database.js";
import {SuggestionQueueLease} from "./lease.js";
import {isOperationalComponent} from "../participant_operation/component_admission.js";
import {existingOperationalComponent} from "../participant_operation/existing_component.js";
import {operationFailure} from "../participant_operation/errors.js";
import {queueIdentity,packetText,publication,decision,intent,same} from "./validation.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedDocumentSuggestionDraft,SharedDocumentSuggestionInfo} from "../suggestion_types.js";
import type {SharedDocumentSuggestionPreview} from "../suggestion_preview.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionQueueOptions,SharedSuggestionQueueRecord,SharedRetainedSuggestion,SharedSuggestionQueueStatus,SharedSuggestionPublication,SharedSuggestionDecision} from "./types.js";
const attached=new WeakSet<object>();
export class SharedSuggestionQueue<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #options:SharedSuggestionQueueOptions<P>;readonly #db:IDBDatabase;readonly #lease:SuggestionQueueLease;
 readonly #assertSource:()=>void;
 #record:SharedSuggestionQueueRecord;#rows=new Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>();#durable=new Map<string,string>();
 #pending:SharedSuggestionQueueRecord|undefined;#running:Promise<void>|undefined;#failure:unknown;#retiring=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 #listeners=new Set<()=>void>();#notifying=false;
 #restoreInsert=false;#restoreSignal:AbortSignal|undefined;
 private constructor(options:SharedSuggestionQueueOptions<P>,db:IDBDatabase,lease:SuggestionQueueLease,record:SharedSuggestionQueueRecord,assertSource:()=>void){this.#options=options;this.#db=db;this.#lease=lease;this.#assertSource=assertSource;this.#record=record;this.#rows=this.#admit(record);db.onversionchange=()=>{db.close();this.#failure=new SharedRelayError("suggestion_database_versionchange");this.#notify();};}
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
  const source=input.storage,core=source.core,assertSource=()=>{if(source.core!==core)throw new SharedRelayError("suggestion_source_replaced");};
  const options={...input,identity:queueIdentity(input.identity),storage:{core,save:()=>{assertSource();source.save();},flush:async()=>{assertSource();await source.flush();assertSource();}}};
  if(options.ownedHistory!==undefined&&options.ownedHistory!=="reviewed-v1")throw new SharedRelayError("suggestion_history_policy");
  if(attached.has(core))throw new SharedRelayError("suggestion_queue_already_attached");
  if(!core.supportsDocumentSuggestions())throw new SharedRelayError("suggestions_unavailable");
  const owned=core.reviewedHistoryIdentity?.()??null;
  if(options.ownedHistory==="reviewed-v1"?(!core.supportsReviewedHistory()||!owned||!sameReviewedHistory(owned,{binding:options.identity.binding,principal:options.identity.principal,effectWriter:options.identity.effectWriter})):owned!==null)throw new SharedRelayError("suggestion_history_source");
  checkSourceCheckpoint(core,options.identity.room,options.identity.documentWriter);
  attached.add(core);let lease:SuggestionQueueLease|undefined,db:IDBDatabase|undefined,queue:SharedSuggestionQueue<Q>|undefined;
  try{checkRetainedStoreSignal(signal);lease=await SuggestionQueueLease.acquire(options.identity);assertSource();checkRetainedStoreSignal(signal);const retained=isOperationalComponent(input)?await existingOperationalComponent(options.database,"suggestions",queueKey(options.identity)):undefined;db=retained?.db??await openQueueDatabase(options.database);let saved:SharedSuggestionQueueRecord|null;
   if(recovered){if(await retainedStoreDestinationExists(db,"suggestions",queueKey(options.identity),signal))throw new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");saved=recovered;}else saved=await readQueueRecord(db,options.identity,options.ownedHistory);
   if(retained&&(!saved||JSON.stringify(saved)!==JSON.stringify(retained.record)))throw operationFailure("operation_diverged");
   assertSource();const create=()=>new SharedSuggestionQueue(options,db!,lease!,saved??{format:options.ownedHistory?"breditor/shared-owned-suggestion-queue":"breditor/shared-suggestion-queue",formatVersion:1,identity:options.identity,retained:[]},assertSource);queue=recovered?retainedStoreNativeAdmission(create):create();retained?.assertCurrent();queue.#restoreInsert=recovered!==undefined;queue.#restoreSignal=signal;queue.#pending=queue.#record;queue.#start();await queue.flush();assertSource();checkRetainedStoreSignal(signal);return queue;}
  catch(error){if(queue)await queue.discardAndClose();else{db?.close();await lease?.close();attached.delete(core);}throw error;}
 }
 #live():void{if(this.#closed)throw new SharedRelayError("suggestion_queue_closed");this.#lease.assertLive();}
 /** Borrowed source only; closing this queue never disposes it. A changed source owner refuses. */
 get core():SharedRichEditor<P>{this.#live();this.#assertSource();return this.#options.storage.core;}
 /** Detached nonsecret binding for an explicitly matching transport. */
 identity():SharedSuggestionQueueIdentity{this.#live();return {...this.#record.identity};}
 #writable():void{this.#live();this.#assertSource();if(this.#retiring)throw new SharedRelayError("suggestion_queue_closing");}
 #admit(record:SharedSuggestionQueueRecord):Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>{
  const result=new Map<string,{info:SharedDocumentSuggestionInfo;row:SharedRetainedSuggestion}>(),core=this.#options.storage.core;
  for(const row of record.retained){const info=core.readSuggestion(row.packet);if(result.has(info.id))throw new SharedRelayError("suggestion_queue_duplicate");const source=core.verifySuggestionSource(row.packet);
   if(row.origin==="local"&&(info.author!==record.identity.principal||source.kind!=="verified"))throw new SharedRelayError("suggestion_local_source_missing");
   if(row.publication&&!same(row.publication.suggestion,info)||row.decision&&row.decision.suggestionId!==info.id)throw new SharedRelayError("suggestion_receipt_mismatch");
   if(row.decision?.effect&&core.retainedWriterReceiptV2(row.decision.effect.writerGroup).kind!=="verified")throw new SharedRelayError("suggestion_effect_not_retained");
   const owned=this.#ownedAcceptance(row.decision);
   if(owned&&!same(core.adoptedSuggestion(info.id),owned))throw new SharedRelayError("suggestion_owned_history_missing");
   result.set(info.id,{info,row});
  }return result;
 }
 #ownedAcceptance(received:SharedSuggestionDecision|null):SharedOwnedSuggestionAcceptance|null{
  const identity=this.#options.identity;
  if(this.#options.ownedHistory!=="reviewed-v1"||received?.decision!=="accept"||!received.effect||received.principal!==identity.principal||received.acceptingWriter!==identity.documentWriter)return null;
  return {binding:identity.binding,sequence:received.sequence,principal:received.principal,acceptingWriter:received.acceptingWriter,effect:{suggestionId:received.suggestionId,writerGroup:received.effect.writerGroup,semanticFrom:received.effect.semanticFrom}};
 }
 #mark(record:SharedSuggestionQueueRecord):void{const checked=checkQueueRecord(record,this.#options.identity,this.#options.ownedHistory),rows=this.#admit(checked);if(same(checked,this.#record)&&!this.#failure)return;this.#record=checked;this.#rows=rows;this.#pending=structuredClone(checked);this.#notify();this.#start();}
 #replace(id:string,change:(row:SharedRetainedSuggestion)=>SharedRetainedSuggestion):void{const found=this.#rows.get(id);if(!found)throw new SharedRelayError("suggestion_unknown");this.#mark({...this.#record,retained:this.#record.retained.map(row=>row===found.row?change(row):row)});}
 #start():void{if(this.#running||!this.#pending||this.#failure||this.#closed)return;this.#running=this.#drain().catch(error=>{this.#failure=error??new SharedRelayError("local_save_failed");this.#notify();}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;try{this.#assertSource();checkRetainedStoreSignal(this.#restoreSignal);this.#options.storage.save();await this.#options.storage.flush();this.#assertSource();
  if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db,"suggestions",queueKey(this.#options.identity),next,this.#restoreSignal);this.#restoreInsert=false;checkRetainedStoreSignal(this.#restoreSignal);this.#restoreSignal=undefined;}else await writeQueueRecord(this.#db,this.#options.identity,next,this.#options.ownedHistory);
  this.#assertSource();}catch(error){this.#pending??=next;throw error;}this.#durable=new Map(next.retained.map(row=>[this.#options.storage.core.readSuggestion(row.packet).id,JSON.stringify(row)]));this.#notify();}}
 #notify():void{if(this.#notifying)return;this.#notifying=true;queueMicrotask(()=>{this.#notifying=false;for(const listener of [...this.#listeners])try{listener();}catch{/* Reporting cannot replace native or durable state. */}});}
 subscribe(listener:()=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 state():{pending:boolean;failed:boolean;closed:boolean;retiring:boolean;retained:number;publications:number;decisions:number}{return {pending:!!this.#pending||!!this.#running,failed:this.#failure!==undefined,closed:this.#closed,retiring:this.#retiring,retained:this.#rows.size,publications:[...this.#rows.values()].filter(({row})=>row.publish).length,decisions:[...this.#rows.values()].filter(({row})=>row.intent?.retry).length};}
 exportRecovery():SharedSuggestionQueueRecord{this.#live();return structuredClone(this.#record);}
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
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.#failure=undefined;this.#pending=structuredClone(this.#record);this.#start();await this.flush();}
 close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#closing=Promise.resolve().then(async()=>{await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();this.#closed=true;this.#retiring=true;this.#pending=undefined;this.#db.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{this.#listeners.clear();await this.#lease.close();attached.delete(this.#options.storage.core);});return this.#released;}
}
