import {SharedRichEditor} from "../core.js";
import type {SharedWriterClock} from "../types.js";
import {checkCheckpoint} from "../persistence/session_database.js";
import {RelayChannel} from "./channel.js";
import {accountToken} from "./registration.js";
import {SharedRelayError,checkClock,checkDescriptor,clock,counter,decimal,descriptor,digest,frame,groupMetadata,identity,object,prefixAt,timeout,writer} from "./validation.js";
import type {SharedRelayIdentity,SharedRelayOptions,SharedRelayState,SharedRelayStatus} from "./types.js";

interface Waiter {target:string;resolve:()=>void;reject:(error:SharedRelayError)=>void;timer:ReturnType<typeof setTimeout>}
interface Run {epoch:number;promise:Promise<void>}
const transient=new Set(["connection_lost","connection_timeout","request_timeout","storage_unavailable","entropy_unavailable"]);
const attached=new WeakSet<SharedRichEditor>();

/** Single-writer server sync for an independently owned core. No second JS document or optimistic
 * server acknowledgement exists. Disposal/permission loss keeps the core and exact journal alive. */
export class SharedRelaySync {
 #core:SharedRichEditor;#identity:SharedRelayIdentity;#options:SharedRelayOptions;#unsubscribe:()=>void;
 #status:SharedRelayStatus="offline";#error:string|null=null;#local:string;#durable:string|null=null;
 #acked:SharedWriterClock|undefined;#sequence:string|null=null;#channel:RelayChannel|undefined;
 #epoch=0;#abort:AbortController|undefined;#ready=false;#wanted=false;#closed=false;
 #connecting:Promise<void>|undefined;#retry:ReturnType<typeof setTimeout>|undefined;#attempts=0;
 #latest:string|undefined;#drain:Run|undefined;#pump:Run|undefined;#pumpAgain=false;#scheduled=false;
 #notifyQueued=false;#reported:string|null=null;#localFailure=false;#waiters=new Set<Waiter>();
 #assetHintQueued=false;#assetHints=false;
 #milliseconds:number;#minimum:number;#maximum:number;
 #missing:{writer:string;counter:string}[]=[];

 constructor(core:SharedRichEditor,options:SharedRelayOptions){
  if(attached.has(core))throw new SharedRelayError("relay_already_attached");
  this.#core=core;this.#identity=identity(options.identity);this.#options={...options,identity:this.#identity};
  this.#milliseconds=timeout(options.requestTimeoutMs);this.#minimum=options.reconnectMinimumMs??500;this.#maximum=options.reconnectMaximumMs??30_000;
  if(!Number.isInteger(this.#minimum)||!Number.isInteger(this.#maximum)||this.#minimum<50||this.#minimum>this.#maximum||this.#maximum>30_000)throw new SharedRelayError("reconnect_limits");
  if(!core.supportsWriterTransport())throw new SharedRelayError("writer_transport_unavailable");
  checkCheckpoint(core.checkpointJson(),this.#identity.room,this.#identity.writer);
  this.#local=core.writerClock(this.#identity.writer).through;
  this.#unsubscribe=core.subscribe(()=>{try{const previous=this.#local;this.#refresh();if(previous!==this.#local)this.#schedulePump();}catch{this.#fail(new SharedRelayError("owner_unavailable"),this.#epoch);}});
  attached.add(core);
  this.#wanted=options.autoConnect!==false;
  if(this.#wanted)queueMicrotask(()=>{if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});});
 }
 state():SharedRelayState{return{status:this.#status,writer:this.#identity.writer,localThrough:this.#local,locallyDurableThrough:this.#durable,serverThrough:this.#acked?.through??null,serverPrefixDigest:this.#acked?.prefixDigest??null,serverReceiptSequence:this.#sequence,waitingFor:this.#missing.map(d=>({...d})),pending:this.#local!==(this.#acked?.through??"0"),error:this.#error};}
 #active(epoch:number):boolean{return !this.#closed&&epoch===this.#epoch;}
 #notify():void{if(this.#notifyQueued)return;this.#notifyQueued=true;queueMicrotask(()=>{this.#notifyQueued=false;try{this.#options.onState?.(this.state());}catch{/* Host callbacks do not rewind accepted content. */}});}
 #report(error:SharedRelayError):void{if(this.#reported===error.code)return;this.#reported=error.code;queueMicrotask(()=>{try{this.#options.onError?.(error);}catch{/* Reporting is not publication. */}});}
 #refresh():void{this.#local=this.#core.writerClock(this.#identity.writer).through;this.#settle();}
 #settle():void{
  if(this.#ready){this.#status=this.#localFailure?"local-save-failed":this.#drain||this.#latest!==undefined||this.#pump?"syncing":this.#local===this.#acked?.through?"ready":"pending";}
  this.#notify();
  if(this.#acked)for(const waiter of this.#waiters){if(BigInt(this.#acked.through)>=BigInt(waiter.target)){this.#waiters.delete(waiter);clearTimeout(waiter.timer);waiter.resolve();}}
 }
 #rejectWaiters(error:SharedRelayError):void{for(const w of this.#waiters){clearTimeout(w.timer);w.reject(error);}this.#waiters.clear();}
 #stop():void{
  this.#epoch++;this.#ready=false;this.#latest=undefined;this.#drain=undefined;this.#pump=undefined;this.#pumpAgain=false;this.#missing=[];this.#connecting=undefined;
  this.#abort?.abort();this.#abort=undefined;const channel=this.#channel;this.#channel=undefined;channel?.close();
 }
 #fail(error:SharedRelayError,epoch:number):void{
  if(!this.#active(epoch))return;this.#stop();this.#error=error.code;
  const retry=transient.has(error.code)&&this.#wanted;
  this.#status=retry?"offline":error.code==="lease_rejected"?"fenced":error.code==="permission_denied"||error.code==="token_unavailable"?"denied":"failed";
  this.#rejectWaiters(error);this.#report(error);this.#notify();
  if(retry){const delay=Math.min(this.#maximum,this.#minimum*2**Math.min(this.#attempts++,10));this.#retry=setTimeout(()=>{this.#retry=undefined;if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});},delay);}else this.#wanted=false;
 }
 #event(event:Record<string,unknown>,epoch:number):void{
  if(!this.#active(epoch))return;
  try{if(event["kind"]==="error"){this.#fail(new SharedRelayError(String(event["code"])),epoch);return;}
   if(event["kind"]==="assetsChanged"){if(!this.#assetHints)throw new SharedRelayError("protocol_error");this.#assetsChanged(epoch);return;}
   if(event["kind"]!=="catchup")throw new SharedRelayError("protocol_error");this.#latest=frame(event["frame"]);if(this.#ready)void this.#drainFrames(epoch).catch(()=>{});}
  catch{this.#fail(new SharedRelayError("protocol_error"),epoch);}
 }
 #assetsChanged(epoch:number):void{
  if(this.#assetHintQueued)return;this.#assetHintQueued=true;
  queueMicrotask(()=>{this.#assetHintQueued=false;if(this.#active(epoch))try{this.#options.onAssetsChanged?.();}catch{/* Availability observers cannot create or rewind edits. */}});
 }

 /** Explicit connect/retry. A fenced/denied session never automatically steals its writer back. */
 async connect():Promise<void>{
  if(this.#closed)throw new SharedRelayError("closed");this.#wanted=true;clearTimeout(this.#retry);this.#retry=undefined;
  if(this.#connecting)return this.#connecting;
  if(this.#ready&&this.#channel){this.#localFailure=false;this.#error=null;this.#schedulePump();return;}
  this.#stop();const epoch=this.#epoch,abort=new AbortController();this.#abort=abort;this.#status="connecting";this.#error=null;this.#notify();
  const work=this.#establish(epoch,abort).catch(error=>{const failure=error instanceof SharedRelayError?error:new SharedRelayError(this.#active(epoch)?"protocol_error":"disconnected");if(this.#active(epoch))this.#fail(failure,epoch);throw failure;});
  this.#connecting=work;try{await work;}finally{if(this.#connecting===work)this.#connecting=undefined;}
 }
 async #establish(epoch:number,abort:AbortController):Promise<void>{
  const token=await accountToken(this.#options.getToken,abort.signal,this.#milliseconds);if(!this.#active(epoch))throw new SharedRelayError("disconnected");
  const channel=await RelayChannel.open(this.#identity.endpoint,this.#milliseconds,e=>this.#event(e,epoch),e=>this.#fail(e,epoch),abort.signal);
  if(!this.#active(epoch)){channel.close();throw new SharedRelayError("disconnected");}this.#channel=channel;
  const authenticated=await channel.request({kind:"authenticate",principal:this.#identity.principal,token,...(this.#options.onAssetsChanged?{capabilities:["assets"]}:{})});
  if(authenticated["kind"]!=="authenticated")throw new SharedRelayError("protocol_error");checkDescriptor(this.#core,descriptor(authenticated["descriptor"]));
  const capabilities=authenticated["capabilities"]??[];if(!Array.isArray(capabilities)||capabilities.some(c=>c!=="assets")||capabilities.length>1)throw new SharedRelayError("protocol_error");
  this.#assetHints=!!this.#options.onAssetsChanged&&capabilities.includes("assets");
  this.#latest=frame(authenticated["frame"]);
  // Never import a server's own-author future and then pretend it belongs to this local journal.
  await this.#readClock(channel);const resumed=await channel.request({kind:"resume",writer:this.#identity.writer,credential:this.#identity.credential});
  if(resumed["kind"]!=="resumed"||object(resumed["lease"])["writer"]!==this.#identity.writer)throw new SharedRelayError("writer_mismatch");
  const current=await this.#readClock(channel);if(!this.#active(epoch))throw new SharedRelayError("disconnected");
  if(this.#acked&&BigInt(current.through)<BigInt(this.#acked.through))throw new SharedRelayError("server_rollback");
  if(current.through!==this.#acked?.through)this.#sequence=null;this.#acked=current;this.#ready=true;this.#localFailure=false;this.#error=null;this.#reported=null;this.#attempts=0;this.#status="syncing";this.#notify();
  await this.#drainFrames(epoch);if(this.#active(epoch)){this.#refresh();this.#schedulePump();if(this.#assetHints)this.#assetsChanged(epoch);}
 }
 async #readClock(channel:RelayChannel):Promise<SharedWriterClock>{const result=await channel.request({kind:"clock",writer:this.#identity.writer});if(result["kind"]!=="clock")throw new SharedRelayError("protocol_error");const current=clock(result["clock"],this.#identity.writer);checkClock(this.#core,current);return current;}
 #drainFrames(epoch:number):Promise<void>{
  if(this.#drain?.epoch===epoch)return this.#drain.promise;
  const run:Run={epoch,promise:Promise.resolve()};this.#drain=run;
  run.promise=(async()=>{try{while(this.#active(epoch)&&this.#ready&&this.#latest!==undefined){const next=this.#latest;this.#latest=undefined;const signal=this.#abort!.signal;await this.#core.receiveFrame(next,{signal});if(this.#active(epoch)){this.#refresh();this.#schedulePump();}}}
   catch(error){if(this.#active(epoch))this.#fail(error instanceof SharedRelayError?error:new SharedRelayError("remote_rejected"),epoch);throw error;}
   finally{if(this.#drain===run){this.#drain=undefined;this.#settle();}}})();return run.promise;
 }
 #schedulePump():void{
  if(this.#closed||!this.#ready||this.#localFailure)return;if(this.#pump){this.#pumpAgain=true;return;}if(this.#scheduled)return;this.#scheduled=true;
  queueMicrotask(()=>{this.#scheduled=false;if(this.#ready&&!this.#closed&&!this.#pump&&!this.#localFailure)this.#startPump();});
 }
 #startPump():void{
  const epoch=this.#epoch,run:Run={epoch,promise:Promise.resolve()};this.#pump=run;this.#pumpAgain=false;this.#settle();
  run.promise=this.#sendGroups(epoch).catch(error=>{if(this.#active(epoch))this.#fail(error instanceof SharedRelayError?error:new SharedRelayError("group_export_failed"),epoch);}).finally(()=>{if(this.#pump===run){this.#pump=undefined;const again=this.#pumpAgain;this.#pumpAgain=false;this.#settle();if(again)this.#schedulePump();}});
 }
 async #sendGroups(epoch:number):Promise<void>{
  if(!this.#acked||!this.#channel)return;const channel=this.#channel,target=this.#core.writerClock(this.#identity.writer).through;
  if(BigInt(target)<=BigInt(this.#acked.through))return;
  if(this.#options.persistLocal){try{await this.#options.persistLocal();}catch{if(this.#active(epoch)){this.#localFailure=true;this.#error="local_save_failed";const error=new SharedRelayError("local_save_failed");this.#rejectWaiters(error);this.#report(error);}return;}if(!this.#active(epoch))return;this.#durable=target;this.#reported=null;this.#error=null;this.#notify();}
  while(this.#active(epoch)&&this.#ready&&BigInt(this.#acked.through)<BigInt(target)){
   const groups=this.#core.writerGroups(this.#acked.through).groups;if(!groups.length)throw new SharedRelayError("group_export_failed");
   for(const raw of groups){const g=groupMetadata(raw);if(BigInt(g.through)>BigInt(target))return;
    if(g.writer!==this.#identity.writer||g.from!==this.#acked.through||g.previousDigest!==this.#acked.prefixDigest)throw new SharedRelayError("history_fork");
    this.#missing=[];const result=await channel.request({kind:"submit",group:raw});if(!this.#active(epoch))return;
    if(result["kind"]==="pending"){
     const dependencies=result["missing"];if(result["writer"]!==this.#identity.writer||!Array.isArray(dependencies)||!dependencies.length||dependencies.length>1024)throw new SharedRelayError("protocol_error");
     this.#missing=dependencies.map(value=>{const d=object(value),n=counter(d["counter"]);if(n==="0")throw new SharedRelayError("protocol_error");return{writer:writer(d["writer"]),counter:n};});return;
    }if(result["kind"]!=="durable")throw new SharedRelayError("protocol_error");
    const receipt=object(result["receipt"]),through=counter(receipt["through"]),prefix=digest(receipt["prefixDigest"]);
    if(receipt["writer"]!==g.writer||receipt["from"]!==g.from||through!==g.through||receipt["groupDigest"]!==g.groupDigest||prefix!==prefixAt(this.#core,g.writer,through)||typeof result["duplicate"]!=="boolean")throw new SharedRelayError("receipt_mismatch");
    this.#sequence=decimal(result["sequence"]);this.#acked={writer:g.writer,through,prefixDigest:prefix};this.#settle();
   }
  }
 }
 /** Wait for THIS call's authored end to become server durable, not for future typing or every
  * collaborator. Offline/denied/failed work remains in the caller-owned journal. */
 flush():Promise<void>{
  if(this.#closed)return Promise.reject(new SharedRelayError("closed"));this.#refresh();const target=this.#local;
  if(this.#acked&&BigInt(this.#acked.through)>=BigInt(target))return Promise.resolve();
  if(!this.#wanted||this.#localFailure)return Promise.reject(new SharedRelayError(this.#error??"offline"));
  if(this.#waiters.size>=16)return Promise.reject(new SharedRelayError("flush_budget"));
  return new Promise((resolve,reject)=>{const waiter:Waiter={target,resolve,reject,timer:setTimeout(()=>{this.#waiters.delete(waiter);reject(new SharedRelayError("sync_timeout"));},30_000)};this.#waiters.add(waiter);this.#schedulePump();});
 }
 /** Deliberate offline mode cancels queued (not yet admitted) remote frames. */
 disconnect():void{if(this.#closed)return;this.#wanted=false;clearTimeout(this.#retry);this.#retry=undefined;this.#stop();this.#status="offline";this.#error=null;this.#rejectWaiters(new SharedRelayError("disconnected"));this.#notify();}
 /** Stops networking only. Close the persistent session separately after its final local save. */
 dispose():void{if(this.#closed)return;this.disconnect();this.#closed=true;this.#status="closed";this.#unsubscribe();attached.delete(this.#core);this.#notify();}
}
