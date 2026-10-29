/** Automatic selected-queue sync borrowing an author or permanent observer connection and source.
 * This adapter owns neither. Live discovery is bounded metadata, not an implicitly persisted feed. */
import {RelayWorkCustody} from '../relay/work_custody.js';
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedSuggestionTransport} from "./transport_port.js";
import type {SharedSuggestionPermissions,SharedSuggestionRelayRequest} from "../relay/suggestion_types.js";
import type {SharedSuggestionConflictTarget} from "../suggestion_types.js";
import {SharedRelayError,object,digest} from "../relay/validation.js";
import {SharedSuggestionQueue} from "./queue.js";
import type {SharedSuggestionQueueIdentity,SharedSuggestionDecision} from "./types.js";
import {keys,publication,decision,packetText,same} from "./validation.js";
import {suggestionDescriptor,suggestionPermissions,suggestionEntry,suggestionDependencies,suggestionConflicts,type SuggestionEntry} from "./transport.js";
import {readSuggestionFeed,checkSuggestionFeed} from "./feed.js";
import {checkSuggestionRecoveryIdle,registerSuggestionRecoveryParticipant} from "./recovery_gate.js";

export interface SharedSuggestionSyncState {
 readonly status:"offline"|"syncing"|"ready"|"pending"|"denied"|"failed"|"local-save-failed"|"closed";
 readonly permissions:SharedSuggestionPermissions|null;readonly discovered:number;
 readonly publications:number;readonly decisions:number;readonly waitingForDocument:boolean;
 readonly conflicts:readonly {suggestionId:string;targets:readonly SharedSuggestionConflictTarget[]}[];
 readonly error:string|null;
}
export interface SharedSuggestionSyncOptions {
 autoStart?:boolean;
 onState?:(state:SharedSuggestionSyncState)=>void;
 onError?:(error:SharedRelayError)=>void;
}
interface Waiter {targets:readonly {id:string;publish:boolean;decide:boolean}[];resolve:()=>void;reject:(error:SharedRelayError)=>void;timer:ReturnType<typeof setTimeout>}
const attached=new WeakSet<object>();
let drainRetired:(owner:SharedSuggestionSync)=>Promise<void>;
export class SharedSuggestionSync<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #work!:RelayWorkCustody;readonly #queue:SharedSuggestionQueue<P>;readonly #relay:SharedSuggestionTransport<P>;readonly #identity:SharedSuggestionQueueIdentity;readonly #options:SharedSuggestionSyncOptions;
 #status:SharedSuggestionSyncState["status"]="offline";#permissions:SharedSuggestionPermissions|null=null;#error:string|null=null;
 #entries=new Map<string,SuggestionEntry>();#conflicts=new Map<string,readonly SharedSuggestionConflictTarget[]>();#waiting=false;
 #epoch=0;#wanted:boolean;#closed=false;#serial=Promise.resolve();#queued:number|undefined;#dirty=false;#working=0;
 #queueSignature="";#relaySignature="";#sourceSignature="";#notifying=false;
 #permissionRevision=-1;
 #listeners=new Set<()=>void>();#off:(()=>void)[]=[];#waiters=new Set<Waiter>();
 #refreshRun:{epoch:number;promise:Promise<void>}|undefined;#downloads=new Map<string,Promise<string>>();
 #initialized=false;#tasks=0;#connections=new Set<Promise<void>>();

 static{drainRetired=async owner=>{if(!owner||typeof owner!=="object"||!(#work in owner)||!owner.#closed)throw new SharedRelayError("suggestion_recovery_in_use");await owner.#work.wait(()=>{});};}
 constructor(queue:SharedSuggestionQueue<P>,relay:SharedSuggestionTransport<P>,options:SharedSuggestionSyncOptions={}){
  checkSuggestionRecoveryIdle(queue);
  if(attached.has(queue))throw new SharedRelayError("suggestion_sync_already_attached");
  const opening=registerSuggestionRecoveryParticipant(queue,()=>{throw new SharedRelayError("suggestion_recovery_in_use");});attached.add(queue);this.#queue=queue;this.#relay=relay;
  try{this.#work=new RelayWorkCustody(queue.core,()=>this.#initialized&&!this.#wanted,()=>new SharedRelayError('suggestion_recovery_in_use'));this.#work.registerOwner(this);this.#identity=queue.identity();this.#options={...options};relay.checkSuggestionQueue(queue.core,this.#identity);this.#wanted=this.#options.autoStart!==false;
   this.#queueSignature=this.#outgoing();this.#sourceSignature=queue.core.view().causalVersion;
   this.#off.push(registerSuggestionRecoveryParticipant(queue,()=>this.#recoveryIdle()));this.#off.push(queue.subscribe(()=>this.#queueChanged()));this.#off.push(relay.subscribe(()=>this.#relayChanged()));this.#off.push(queue.core.subscribe(()=>this.#sourceChanged()));this.#relayChanged();this.#initialized=true;opening();
  }catch(error){this.#closed=true;this.#wanted=false;this.#epoch++;for(const off of [...this.#off].reverse())try{off();}catch{/* Closed callbacks can no longer start delivery. */}this.#off=[];this.#work?.retire(()=>attached.delete(queue));if(!this.#work)attached.delete(queue);opening();throw error;}
 }
 state():SharedSuggestionSyncState {
  const local=this.#queue.state();
  return {status:this.#closed||local.closed?"closed":local.failed?"local-save-failed":this.#status,permissions:this.#permissions?{...this.#permissions}:null,discovered:this.#entries.size,publications:local.publications,decisions:local.decisions,waitingForDocument:this.#waiting,conflicts:[...this.#conflicts].map(([suggestionId,targets])=>({suggestionId,targets:structuredClone(targets)})),error:local.failed?"local_save_failed":this.#error};
 }
 subscribe(listener:()=>void):()=>void{if(this.#closed)throw new SharedRelayError("closed");this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 /** Detached live metadata only. Cached packet/intent recovery remains in the borrowed queue. */
 entries():readonly SuggestionEntry[]{return structuredClone([...this.#entries.values()]);}
 /** Exact borrowed queue/core pairing for UI adapters; never transfers either owner. */
 checkQueue(queue:SharedSuggestionQueue<P>):void{if(this.#closed||queue!==this.#queue)throw new SharedRelayError("suggestion_sync_queue_mismatch");this.#relay.checkSuggestionQueue(queue.core,this.#identity);}
 #effectivePermissions(input:SharedSuggestionPermissions):SharedSuggestionPermissions;
 #effectivePermissions(input:SharedSuggestionPermissions|null):SharedSuggestionPermissions|null;
 #effectivePermissions(input:SharedSuggestionPermissions|null):SharedSuggestionPermissions|null{return input&&this.#relay.suggestionDecisionMode==="observer"?{...input,canAccept:false}:input;}
 #notify():void{if(this.#notifying)return;this.#notifying=true;queueMicrotask(()=>{this.#notifying=false;try{this.#options.onState?.(this.state());}catch{/* Reporting cannot replace durable intent. */}for(const listener of [...this.#listeners])try{listener();}catch{/* Observers do not own this adapter. */}});}
 #active(epoch:number):boolean{return !this.#closed&&this.#wanted&&epoch===this.#epoch&&this.#relay.suggestionState().ready;}
 #check(epoch:number):void{if(!this.#active(epoch))throw new SharedRelayError("suggestion_offline");this.#relay.checkSuggestionQueue(this.#queue.core,this.#identity);}
 #enqueue(work:()=>Promise<void>):Promise<void>{return this.#work.run(()=>{this.#tasks++;const task=this.#serial.then(work).finally(()=>{this.#tasks--;});this.#serial=task.catch(()=>{});return task;});}
 #recoveryIdle():void{if(this.#work.hasPendingWork()||this.#closed||this.#wanted||this.#tasks||this.#working||this.#connections.size||this.#refreshRun||this.#downloads.size)throw new SharedRelayError("suggestion_recovery_in_use");}
 /** Wait for this disconnected adapter only; the borrowed document transport is untouched. */
 async waitForDisconnected():Promise<void>{checkSuggestionRecoveryIdle(this.#queue);if(this.#closed)throw new SharedRelayError("closed");if(this.#wanted)throw new SharedRelayError("suggestion_recovery_in_use");const epoch=this.#epoch;await Promise.allSettled([this.#serial,...this.#connections,...this.#downloads.values()]);if(epoch!==this.#epoch)throw new SharedRelayError("suggestion_recovery_in_use");this.#recoveryIdle();}
 #outgoing():string{return JSON.stringify(this.#queue.proposals().map(info=>{const row=this.#queue.status(info.id);return [info.id,row.publish,row.intent?.retry?row.intent:null];}));}
 #queueChanged():void{
  if(this.#closed)return;const state=this.#queue.state();
  if(state.closed||state.retiring){this.disconnect();return;}
  if(state.failed){this.#fail(new SharedRelayError("local_save_failed"),this.#epoch);return;}
  for(const id of this.#conflicts.keys()){let row;try{row=this.#queue.status(id);}catch{this.#conflicts.delete(id);continue;}if(!row.intent?.retry||row.intent.requested!=="accept"||row.decision)this.#conflicts.delete(id);}
  const signature=this.#outgoing();if(signature!==this.#queueSignature){this.#queueSignature=signature;this.#schedule();}this.#settle();
 }
 #sourceChanged():void{if(this.#closed)return;try{const signature=this.#queue.core.view().causalVersion;if(signature!==this.#sourceSignature){this.#sourceSignature=signature;this.#schedule();}}catch(error){this.#fail(this.#failure(error),this.#epoch);}}
 #relayChanged():void{
  if(this.#closed)return;const state=this.#relay.suggestionState(),document=this.#relay.state();
  const signature=JSON.stringify([state.ready,state.revision,state.documentRevision,document.localThrough,document.serverThrough]);
  if(!state.ready)this.#permissions=null;
  else if(this.#permissionRevision!==state.revision){this.#permissionRevision=state.revision;this.#permissions=this.#effectivePermissions(state.permissions);}
  if(!state.ready){if(this.#relaySignature!==signature){this.#epoch++;this.#queued=undefined;this.#reject(new SharedRelayError(document.error??"suggestion_offline"));}this.#status=document.status==="denied"?"denied":["fenced","failed"].includes(document.status)?"failed":"offline";this.#error=document.error;this.#notify();}
  else if(this.#relaySignature!==signature)this.#schedule();
  this.#relaySignature=signature;
 }
 #reject(error:SharedRelayError):void{for(const waiter of this.#waiters){clearTimeout(waiter.timer);waiter.reject(error);}this.#waiters.clear();}
 #failure(error:unknown):SharedRelayError{return this.#queue.state().failed?new SharedRelayError("local_save_failed"):error instanceof SharedRelayError?error:new SharedRelayError("suggestion_sync_failed");}
 #fail(error:SharedRelayError,epoch:number):void{
  if(this.#closed||epoch!==this.#epoch)return;
  this.#error=error.code;this.#status=error.code==="local_save_failed"?"local-save-failed":error.code==="permission_denied"?"denied":this.#relay.suggestionState().ready?"failed":"offline";
  // Networking/reconnect remains owned by the borrowed transport. A failed local cache requires
  // explicit retry; a lane protocol error must not silently resume after unrelated typing.
  if(this.#relay.suggestionState().ready)this.#wanted=false;
  this.#reject(error);this.#notify();try{this.#options.onError?.(error);}catch{/* Error reporting cannot acknowledge a save. */}
 }
 #schedule():void{
  this.#dirty=true;if(this.#closed||!this.#wanted||!this.#relay.suggestionState().ready||this.#queued===this.#epoch)return;
  const epoch=this.#epoch;this.#queued=epoch;
  void this.#enqueue(async()=>{if(!this.#active(epoch))return;this.#dirty=false;await this.#synchronize(epoch);}).catch(error=>this.#fail(this.#failure(error),epoch)).finally(()=>{if(this.#queued===epoch)this.#queued=undefined;if(this.#active(epoch)&&this.#dirty)this.#schedule();});
 }
 async #request(input:SharedSuggestionRelayRequest,epoch:number):Promise<Record<string,unknown>>{this.#check(epoch);const response=await this.#relay.requestSuggestion(input);this.#check(epoch);return response;}
 async #save(epoch:number):Promise<void>{this.#check(epoch);try{await this.#queue.flush();}catch{throw new SharedRelayError("local_save_failed");}this.#check(epoch);}
 async #pull(epoch:number):Promise<void>{
  const previous=[...this.#entries.values(),...this.#queue.proposals().flatMap(info=>{const row=this.#queue.status(info.id);return row.publication?[{publication:row.publication,decision:row.decision}]:[];})];
  const feed=await readSuggestionFeed(input=>this.#request(input,epoch),this.#identity);this.#check(epoch);checkSuggestionFeed(previous,feed);
  this.#entries=feed.entries;this.#permissions=this.#effectivePermissions(feed.permissions);
  for(const info of this.#queue.proposals()){
   const entry=this.#entries.get(info.id);if(!entry)continue;await this.#retain(entry,epoch);
  }
  this.#notify();
 }
 async #retain(entry:SuggestionEntry,epoch:number):Promise<void>{
  this.#check(epoch);const id=entry.publication.suggestion.id,row=this.#queue.status(id);
  if(!same(row.publication,entry.publication)||!row.localSaved)await this.#queue.receiveVerifiedPublication(id,entry.publication);
  this.#check(epoch);
  if(entry.decision){
   if(!same(row.decision,entry.decision)||!row.localSaved){
    let retained=await this.#queue.receiveVerifiedDecision(id,entry.decision);this.#check(epoch);
    if(retained==="waitingForDocument"){await this.#relay.refreshDocument();this.#check(epoch);retained=await this.#queue.receiveVerifiedDecision(id,entry.decision);}
    if(retained==="waitingForDocument")this.#waiting=true;
   }
   this.#conflicts.delete(id);
  }
 }
 async #current(id:string,epoch:number,required=true):Promise<SuggestionEntry>{
  const response=await this.#request({kind:"suggestionRead",suggestionId:id},epoch);keys(response,"entry,kind,permissions");
  if(response["kind"]!=="suggestionEntry")throw new SharedRelayError("suggestion_protocol_error");
  if(response["entry"]===null)throw new SharedRelayError(required||this.#entries.has(id)?"suggestion_server_rollback":"suggestion_unknown");
  this.#permissions=this.#effectivePermissions(suggestionPermissions(response["permissions"]));const entry=suggestionEntry(response["entry"],this.#identity);
  if(entry.publication.suggestion.id!==id)throw new SharedRelayError("suggestion_receipt_mismatch");
  checkSuggestionFeed(this.#entries.has(id)?[this.#entries.get(id)!]:[],{entries:new Map([[id,entry]]),through:entry.decision?.sequence??entry.publication.sequence,permissions:this.#permissions});
  this.#entries.set(id,entry);return entry;
 }
 async #synchronize(epoch:number):Promise<void>{
  this.#check(epoch);this.#working++;this.#status="syncing";this.#waiting=false;this.#notify();
  try{
   await this.#save(epoch);await this.#relay.refreshDocument();this.#check(epoch);await this.#pull(epoch);
   for(const info of this.#queue.proposals()){
    if(!this.#queue.status(info.id).publish||!this.#permissions?.canPropose)continue;
    await this.#relay.flush();await this.#save(epoch);if(!this.#queue.status(info.id).publish)continue;
    const response=await this.#request({kind:"suggestionPublish",packet:this.#queue.packet(info.id)},epoch);keys(response,"admission,kind");if(response["kind"]!=="suggestionAdmission")throw new SharedRelayError("suggestion_protocol_error");
    const admission=object(response["admission"]);
    if(admission["kind"]==="pending"){keys(admission,"kind,missing");suggestionDependencies(admission["missing"]);this.#conflicts.delete(info.id);this.#waiting=true;continue;}
    keys(admission,"descriptor,duplicate,kind,publication");if(admission["kind"]!=="durable"||typeof admission["duplicate"]!=="boolean")throw new SharedRelayError("suggestion_protocol_error");suggestionDescriptor(admission["descriptor"],this.#identity);
    const published=publication(admission["publication"]);await this.#queue.receiveVerifiedPublication(info.id,published);this.#check(epoch);
    this.#entries.set(info.id,{publication:published,decision:this.#entries.get(info.id)?.decision??null});
   }
   for(const info of this.#queue.proposals()){
    const row=this.#queue.status(info.id);if(!row.intent?.retry||!row.publication||row.decision)continue;
    const current=await this.#current(info.id,epoch);await this.#retain(current,epoch);if(current.decision)continue;
    const requested=this.#queue.status(info.id).intent;if(!requested?.retry)continue;
    if(requested.requested==="accept"?!this.#permissions?.canAccept:!this.#permissions?.canReject)continue;
    if(requested.requested==="accept")await this.#relay.flush();await this.#save(epoch);
    if(!same(this.#queue.status(info.id).intent,requested))continue;
    const response=await this.#request({kind:"suggestionDecide",suggestionId:info.id,decision:requested.requested},epoch);keys(response,"admission,kind");if(response["kind"]!=="suggestionDecisionAdmission")throw new SharedRelayError("suggestion_protocol_error");
    const admission=object(response["admission"]);
    if(admission["kind"]==="pending"){keys(admission,"kind,missing");suggestionDependencies(admission["missing"]);this.#conflicts.delete(info.id);this.#waiting=true;continue;}
    if(admission["kind"]==="conflict"){keys(admission,"kind,targets");this.#conflicts.set(info.id,suggestionConflicts(admission["targets"]));continue;}
    keys(admission,"decision,descriptor,duplicate,kind");if(admission["kind"]!=="durable"||typeof admission["duplicate"]!=="boolean")throw new SharedRelayError("suggestion_protocol_error");suggestionDescriptor(admission["descriptor"],this.#identity);
    const decided:SharedSuggestionDecision=decision(admission["decision"],this.#identity),entry=suggestionEntry({publication:current.publication,decision:decided},this.#identity);
    if(decided.suggestionId!==info.id)throw new SharedRelayError("suggestion_receipt_mismatch");this.#entries.set(info.id,entry);await this.#retain(entry,epoch);
   }
  }finally{this.#working--;if(this.#active(epoch))this.#settle();}
 }
 #settle():void{
  if(this.#closed)return;const local=this.#queue.state();
  if(this.#wanted&&this.#relay.suggestionState().ready&&!this.#working)this.#status=local.publications||local.decisions||local.pending?"pending":"ready";
  for(const waiter of this.#waiters){let complete=true,error:SharedRelayError|undefined;
   for(const target of waiter.targets){let row;try{row=this.#queue.status(target.id);}catch{error=new SharedRelayError("suggestion_stopped");break;}
    if(target.publish&&!row.publication&&!row.publish||target.decide&&!row.decision&&!row.intent?.retry){error=new SharedRelayError("suggestion_stopped");break;}
    if(!row.localSaved||target.publish&&!row.publication||target.decide&&!row.decision)complete=false;
   }
   if(error||complete){clearTimeout(waiter.timer);this.#waiters.delete(waiter);if(error)waiter.reject(error);else waiter.resolve();}
  }
  this.#notify();
 }
 /** Explicit resume; automatic reconnect is owned by the borrowed transport. */
 async connect():Promise<void>{if(this.#closed)throw new SharedRelayError("closed");return this.#work.run(()=>this.#connect());}
 async #connect():Promise<void>{checkSuggestionRecoveryIdle(this.#queue);if(this.#closed)throw new SharedRelayError("closed");this.#wanted=true;this.#error=null;const epoch=this.#epoch,work=(async()=>{if(!this.#relay.suggestionState().ready)await this.#relay.connect();if(this.#closed||!this.#wanted||epoch!==this.#epoch)throw new SharedRelayError("suggestion_offline");await this.refresh();})();this.#connections.add(work);try{await work;}finally{this.#connections.delete(work);}}
 async refresh():Promise<void>{if(this.#closed)throw new SharedRelayError("closed");return this.#work.run(()=>this.#refresh());}
 async #refresh():Promise<void>{
  checkSuggestionRecoveryIdle(this.#queue);if(this.#closed)throw new SharedRelayError("closed");this.#wanted=true;this.#error=null;const epoch=this.#epoch;if(this.#refreshRun?.epoch===epoch)return this.#refreshRun.promise;
  const run={epoch,promise:Promise.resolve()};this.#refreshRun=run;
  run.promise=this.#enqueue(()=>this.#synchronize(epoch)).catch(error=>{const failure=this.#failure(error);this.#fail(failure,epoch);throw failure;}).finally(()=>{if(this.#refreshRun===run)this.#refreshRun=undefined;});return run.promise;
 }
 /** Lazy authenticated packet retrieval. Existing cached packets remain available offline. */
 async loadSuggestion(input:string):Promise<string>{return this.#work.run(()=>this.#loadSuggestion(input));}
 async #loadSuggestion(input:string):Promise<string>{
  checkSuggestionRecoveryIdle(this.#queue);const id=digest(input);if(this.#closed)throw new SharedRelayError("closed");
  try{const packet=this.#queue.packet(id);await this.#queue.flush();return packet;}catch(error){if(!(error instanceof SharedRelayError)||error.code!=="suggestion_unknown")throw error;}
  const pending=this.#downloads.get(id);if(pending)return pending;if(this.#downloads.size>=4)throw new SharedRelayError("suggestion_request_budget");
  const epoch=this.#epoch,work=(async()=>{let result:string|undefined;
   await this.#enqueue(async()=>{this.#check(epoch);const entry=await this.#current(id,epoch,false),response=await this.#request({kind:"suggestionPacket",suggestionId:id},epoch);keys(response,"kind,packet");if(response["kind"]!=="suggestionPacket")throw new SharedRelayError("suggestion_protocol_error");const packet=packetText(response["packet"]);await this.#queue.cacheVerifiedProposal(packet,entry.publication);this.#check(epoch);await this.#retain(entry,epoch);result=packet;});return result!;
  })();this.#downloads.set(id,work);try{return await work;}finally{if(this.#downloads.get(id)===work)this.#downloads.delete(id);}
 }
 /** Captured queued choices/publications only. An opposite final server winner still satisfies
  * finalization, but its original outcome remains explicit in queue.status(id).decision. */
 async flushShared():Promise<void>{if(this.#closed)throw new SharedRelayError("closed");return this.#work.run(()=>this.#flushShared());}
 async #flushShared():Promise<void>{
  checkSuggestionRecoveryIdle(this.#queue);if(this.#closed)throw new SharedRelayError("closed");const targets=this.#queue.proposals().flatMap(info=>{const row=this.#queue.status(info.id);return row.publish||row.intent?.retry?[{id:info.id,publish:row.publish,decide:!!row.intent?.retry}]:[];});
  await this.#queue.flush();if(!targets.length)return;if(!this.#wanted||!this.#relay.suggestionState().ready)throw new SharedRelayError(this.#error??"suggestion_offline");
  if(targets.some(target=>target.publish&&!this.#permissions?.canPropose||target.decide&&(this.#queue.status(target.id).intent?.requested==="accept"?!this.#permissions?.canAccept:!this.#permissions?.canReject)))throw new SharedRelayError("permission_denied");
  if(this.#waiters.size>=16)throw new SharedRelayError("suggestion_flush_budget");
  return new Promise((resolve,reject)=>{const waiter:Waiter={targets,resolve,reject,timer:setTimeout(()=>{this.#waiters.delete(waiter);reject(new SharedRelayError("suggestion_sync_timeout"));},30000)};this.#waiters.add(waiter);this.#settle();this.#schedule();});
 }
 /** Retry local persistence separately from network finalization. */
 async retryLocal():Promise<void>{if(this.#closed)throw new SharedRelayError("closed");return this.#work.run(()=>this.#retryLocal());}
 async #retryLocal():Promise<void>{checkSuggestionRecoveryIdle(this.#queue);if(this.#closed)throw new SharedRelayError("closed");await this.#queue.retry();this.#error=null;this.#status="offline";if(this.#wanted)this.#schedule();this.#notify();}
 /** Stops this metadata adapter only; ordinary document networking remains owned by its caller. */
 disconnect():void{if(this.#closed)return;this.#wanted=false;this.#epoch++;this.#queued=undefined;this.#status="offline";this.#permissions=null;this.#error=null;this.#reject(new SharedRelayError("disconnected"));this.#notify();}
 dispose():void{checkSuggestionRecoveryIdle(this.#queue);if(this.#closed)return;this.disconnect();this.#closed=true;for(const off of this.#off)off();this.#off=[];this.#work.retire(()=>attached.delete(this.#queue));this.#notify();queueMicrotask(()=>this.#listeners.clear());}
}
/** Internal retirement barrier; a copied/disconnected facade does not qualify. */
export function waitForRetiredSuggestionSync<P extends SharedSelectionPolicy>(owner:SharedSuggestionSync<P>):Promise<void>{return drainRetired(owner as unknown as SharedSuggestionSync);}
