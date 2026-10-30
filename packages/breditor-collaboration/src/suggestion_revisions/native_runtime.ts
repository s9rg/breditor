/** Tracked revision scheduling over original records and the same parent queue.
 * It owns no source, ordinary permission, account token, lease or new packet. */
import {SharedRichEditor} from '../core.js';
import {SharedRelayError} from '../relay/validation.js';
import {RelayWorkCustody} from '../relay/work_custody.js';
import {digest} from '../relay/validation.js';
import {synchronizeRevisions} from './synchronize.js';
import {loadRevision} from './load.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {NativeSuggestionChild} from '../suggestions/native_child.js';
import type {NativeRevisionStore} from './native_store.js';
import type {SharedSuggestionRevisionInfo} from '../suggestion_types.js';
import type {SharedSuggestionRevisionReceipt,SharedSuggestionRevisionRow,SharedSuggestionRevisionRequest} from './types.js';
export interface NativeRevisionDeliveryState{readonly status:'offline'|'syncing'|'pending'|'ready'|'failed'|'local-save-failed'|'closed';readonly pending:number;readonly retained:number;readonly discovered:number;readonly localSaved:boolean;readonly error:string|null}
export interface NativeRevisionDeliveryOptions{onState?:(state:NativeRevisionDeliveryState)=>void;onError?:(error:SharedRelayError)=>void}
const subscribeCore=SharedRichEditor.prototype.subscribe;
export class NativeRevisionRuntime<P extends SharedSelectionPolicy>{
 readonly #child:NativeSuggestionChild<P>;readonly #store:NativeRevisionStore<P>;readonly #options:NativeRevisionDeliveryOptions;readonly #work:RelayWorkCustody;
 #closed=false;#initialized=false;#wanted=false;#epoch=0;#intentEpoch=0;#error:string|null=null;#status:NativeRevisionDeliveryState['status']='offline';
 #off:(()=>void)[]=[];#listeners=new Set<()=>void>();#notifying=false;#serial=Promise.resolve();#queued:number|undefined;#dirty=false;#signature='';#working=0;
 #feed=new Map<string,SharedSuggestionRevisionReceipt>();#downloads=new Map<string,ReturnType<typeof loadRevision<P>>>();#syncRun:{epoch:number;promise:Promise<void>}|undefined;
 constructor(child:NativeSuggestionChild<P>,store:NativeRevisionStore<P>,options:NativeRevisionDeliveryOptions){
  this.#child=child;this.#store=store;this.#options=options;this.#work=new RelayWorkCustody(store.core,()=>this.#initialized&&!this.#wanted,()=>new SharedRelayError('native_revision_in_use'),child.port.admission);this.#work.registerOwner(this);
  try{child.check();this.#off.push(store.subscribe(()=>this.#changed()),child.queue.subscribe(()=>this.#changed()),child.transport.subscribe(()=>this.#changed()),subscribeCore.call(store.core,()=>this.#changed()));this.#initialized=true;this.#changed();}
  catch(error){this.stop();throw error;}
 }
 state():NativeRevisionDeliveryState{const local=this.#store.state(),record=this.#store.record(),failed=local.failed||this.#child.queue.state().failed;return {status:this.#closed?'closed':failed?'local-save-failed':this.#status,pending:record.retained.filter(row=>row.retry).length,retained:record.retained.length,discovered:this.#feed.size,localSaved:local.localSaved,error:failed?'local_save_failed':this.#error};}
 entries():readonly SharedSuggestionRevisionReceipt[]{return structuredClone([...this.#feed.values()]);}
 revisions():readonly SharedSuggestionRevisionInfo[]{return this.#store.infos();}
 status(id:string):SharedSuggestionRevisionRow&{localSaved:boolean}{return {...this.#store.row(id),localSaved:this.#store.state().localSaved};}
 packet(id:string):string{return this.#store.row(id).packet;}
 subscribe(listener:()=>void):()=>void{this.#checkLive();this.#listeners.add(listener);return()=>{this.#listeners.delete(listener);};}
 #checkLive():void{if(this.#closed)throw new SharedRelayError('native_revision_closed');this.#child.check();}
 #ready():boolean{return !!this.#child.transport.suggestionRevisionsReady?.();}
 #active(epoch:number):boolean{if(this.#closed||!this.#wanted||epoch!==this.#epoch)return false;try{this.#child.check();return this.#ready();}catch{return false;}}
 #check(epoch:number):void{this.#checkLive();if(!this.#wanted||epoch!==this.#epoch||!this.#ready())throw new SharedRelayError('suggestion_revision_offline');this.#child.transport.checkSuggestionRevisions!(this.#store.core,this.#store.identity,this.#store.binding);}
 #readCheck(epoch:number):void{this.#checkLive();if(epoch!==this.#epoch||!this.#ready())throw new SharedRelayError('suggestion_revision_offline');this.#child.transport.checkSuggestionRevisions!(this.#store.core,this.#store.identity,this.#store.binding);}
 #notify():void{if(this.#notifying)return;this.#notifying=true;queueMicrotask(()=>{this.#notifying=false;try{this.#options.onState?.(this.state());}catch{/* Reporting cannot settle a receipt. */}for(const listener of [...this.#listeners])try{listener();}catch{/* Data observers cannot grant custody. */}});}
 #failure(error:unknown):SharedRelayError{if(this.#store.state().failed||this.#child.queue.state().failed)return new SharedRelayError('local_save_failed');if(error instanceof SharedRelayError)return error;if(error&&typeof error==='object'&&'code' in error&&error.code==='participant_authority')return new SharedRelayError('participant_authority');return new SharedRelayError('suggestion_revision_sync_failed');}
 #fail(error:unknown,epoch:number):void{if(this.#closed||epoch!==this.#epoch)return;const failure=this.#failure(error);this.#error=failure.code;this.#status=failure.code==='local_save_failed'?'local-save-failed':this.#ready()?'failed':'offline';if(this.#ready()||this.#store.state().failed||this.#child.queue.state().failed){this.#wanted=false;this.#intentEpoch++;}this.#notify();try{this.#options.onError?.(failure);}catch{/* Reporting cannot discard pending intent. */}}
 #enqueue(start:()=>Promise<void>):Promise<void>{return this.#work.run(()=>{const task=this.#serial.then(start);this.#serial=task.catch(()=>{});return task;});}
 #changed():void{
  if(this.#closed)return;
  try{const relay=this.#child.transport,s=relay.suggestionState(),local=this.#store.state(),signature=JSON.stringify([this.#ready(),s.revision,s.documentRevision,this.#store.core.view().causalVersion,local.failed,this.#child.queue.state().failed,this.#child.queue.proposals().map(info=>{const row=this.#child.queue.status(info.id);return [info.id,row.publish,row.publication?.sequence,row.decision?.sequence];})]);
   if(signature!==this.#signature){this.#signature=signature;if(!this.#ready()){this.#epoch++;this.#queued=undefined;this.#status='offline';}else this.#schedule();}this.#notify();
  }catch(error){this.#fail(error,this.#epoch);}
 }
 #schedule():void{this.#dirty=true;if(this.#closed||!this.#wanted||!this.#ready()||this.#store.state().failed||this.#child.queue.state().failed||this.#queued===this.#epoch)return;const epoch=this.#epoch;this.#queued=epoch;
  void this.#enqueue(async()=>{if(!this.#active(epoch))return;this.#dirty=false;await this.#synchronize(epoch);}).catch(error=>this.#fail(error,epoch)).finally(()=>{if(this.#queued===epoch)this.#queued=undefined;if(this.#active(epoch)&&this.#dirty)this.#schedule();});
 }
 async #request(input:SharedSuggestionRevisionRequest,epoch:number):Promise<Record<string,unknown>>{this.#check(epoch);const response=await this.#child.transport.requestSuggestionRevision!(input);this.#check(epoch);return response;}
 async #synchronize(epoch:number):Promise<void>{this.#check(epoch);this.#working++;this.#status='syncing';this.#notify();const check=()=>this.#check(epoch),store=this.#store;
  try{await synchronizeRevisions({core:store.core,identity:store.identity,binding:store.binding,queue:this.#child.queue,transport:this.#child.transport,check,flush:()=>store.flush(),persistSource:()=>this.#child.port.persistLocal(),record:()=>store.record(),infos:()=>store.infos(),row:id=>store.row(id),replace:(id,change)=>{check();const old=store.row(id),next=change(structuredClone(old));if(next.previousPacket!==old.previousPacket||next.packet!==old.packet)throw new SharedRelayError('native_revision_packet_changed');store.settle(id,{retry:next.retry,receipt:next.receipt,conflict:next.conflict});},feed:()=>this.#feed,setFeed:feed=>{this.#feed=feed;},request:input=>this.#request(input,epoch)});check();this.#error=null;}
  finally{this.#working--;if(this.#active(epoch)&&!this.#working)this.#status=store.record().retained.some(row=>row.retry)?'pending':'ready';this.#notify();}
 }
 async connect():Promise<void>{this.#checkLive();return this.#work.run(async()=>{this.#wanted=true;this.#error=null;const intent=this.#intentEpoch;await this.#child.transport.connect();this.#checkLive();if(!this.#wanted||intent!==this.#intentEpoch||!this.#ready())throw new SharedRelayError('suggestion_revision_offline');await this.synchronize();});}
 async synchronize():Promise<void>{this.#checkLive();return this.#work.run(()=>{this.#wanted=true;this.#error=null;const epoch=this.#epoch;if(this.#syncRun?.epoch===epoch)return this.#syncRun.promise;const run={epoch,promise:Promise.resolve()};this.#syncRun=run;run.promise=this.#enqueue(()=>this.#synchronize(epoch)).catch(error=>{this.#fail(error,epoch);throw this.#failure(error);}).finally(()=>{if(this.#syncRun===run)this.#syncRun=undefined;});return run.promise;});}
 async flushLocal():Promise<void>{this.#checkLive();return this.#work.run(()=>this.#store.flush());}
 async retryLocal():Promise<void>{this.#checkLive();return this.#work.run(async()=>{await this.#child.queue.retry();this.#checkLive();await this.#store.retry();this.#checkLive();this.#error=null;this.#status='offline';if(this.#wanted)this.#schedule();this.#notify();});}
 async loadRevision(input:string):ReturnType<typeof loadRevision<P>>{this.#checkLive();return this.#work.run(()=>this.#loadRevision(input));}
 async #loadRevision(input:string):ReturnType<typeof loadRevision<P>>{const id=digest(input),existing=this.#downloads.get(id);if(existing)return structuredClone(await existing);if(this.#downloads.size>=2)throw new SharedRelayError('suggestion_request_budget');const receipt=this.#feed.get(id);if(!receipt)throw new SharedRelayError('suggestion_revision_unknown');const epoch=this.#epoch;this.#readCheck(epoch);const task=loadRevision(this.#store.core,this.#child.transport,receipt,()=>this.#readCheck(epoch));this.#downloads.set(id,task);try{return structuredClone(await task);}finally{if(this.#downloads.get(id)===task)this.#downloads.delete(id);}}
 disconnect():void{if(this.#closed)return;this.#wanted=false;this.#epoch++;this.#intentEpoch++;this.#queued=undefined;this.#status='offline';this.#error=null;this.#notify();}
 /** Stop is synchronous; close/drain never retries or discards the original store. */
 stop():void{if(this.#closed)return;this.disconnect();this.#closed=true;for(const off of this.#off)off();this.#off=[];this.#work.retire(()=>{});this.#notify();queueMicrotask(()=>this.#listeners.clear());}
 async drain():Promise<void>{if(!this.#closed)throw new SharedRelayError('native_revision_in_use');await this.#work.wait(()=>{});}
}
