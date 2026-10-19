/** Automatic catalog synchronization borrows one native owner and never submits document operations. */
import {RelayChannel} from "../relay/channel.js";
import {accountToken} from "../relay/registration.js";
import {SharedRelayError,object,frame,descriptor,checkDescriptor,checkClock,clock,string,timeout,transportVersion} from "../relay/validation.js";
import {versionDescriptor,catalogSnapshot} from "./validation.js";
import {VersionCatalogHttp} from "./http.js";
import type {VersionCatalogStore} from "./store.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedDocumentVersionsState,SharedDocumentVersionEntry} from "./types.js";
const transient=new Set(["connection_lost","connection_timeout","request_timeout","storage_unavailable","version_transfer_failed","version_request_budget"]);
interface Waiter {ids:readonly string[];resolve:()=>void;reject:(error:SharedRelayError)=>void;timer:ReturnType<typeof setTimeout>}
export class VersionCatalogSync<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #store:VersionCatalogStore<P>;readonly #http:VersionCatalogHttp;readonly #milliseconds:number;readonly #minimum:number;readonly #maximum:number;
 #channel:RelayChannel|undefined;#abort:AbortController|undefined;#epoch=0;#ready=false;#wanted=false;#closed=false;#connecting:Promise<void>|undefined;#serial=Promise.resolve();
 #status:SharedDocumentVersionsState["status"]="offline";#error:string|null=null;#canPublish:boolean|null=null;#waitingForDocument=false;
 #queuedEpoch:number|undefined;#dirty=false;#latestDocument:string|undefined;#retry:ReturnType<typeof setTimeout>|undefined;#attempts=0;#reported:string|null=null;#localSignature="";#working=0;
 #listeners=new Set<()=>void>();#notifying=false;#unsubscribe:(()=>void)[];#waiters=new Set<Waiter>();#publishing=new Set<string>();#downloads=new Map<string,Promise<string>>();
 #tasks=0;#recovering=false;
 constructor(store:VersionCatalogStore<P>){
  this.#store=store;const options=store.options,identity=options.identity,core=options.storage.core;
  if(transportVersion(identity.writerTransport)===2?!core.supportsWriterTransportV2():!core.supportsWriterTransport())throw new SharedRelayError("writer_transport_unavailable");
  this.#http=new VersionCatalogHttp({...identity,getToken:options.getToken,...(options.requestTimeoutMs===undefined?{}:{requestTimeoutMs:options.requestTimeoutMs})});this.#milliseconds=timeout(options.requestTimeoutMs);this.#minimum=options.reconnectMinimumMs??500;this.#maximum=options.reconnectMaximumMs??30000;
  if(!Number.isInteger(this.#minimum)||!Number.isInteger(this.#maximum)||this.#minimum<50||this.#minimum>this.#maximum||this.#maximum>30000)throw new SharedRelayError("reconnect_limits");
  this.#localSignature=store.queued().join(",");this.#unsubscribe=[core.subscribe(()=>this.#schedule()),store.subscribe(()=>this.#storeChanged())];this.#wanted=options.autoConnect!==false;if(this.#wanted)queueMicrotask(()=>{if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});});
 }
 state():SharedDocumentVersionsState{const local=this.#store.state();return {status:this.#closed?"closed":local.failed?"local-save-failed":this.#status,canPublish:this.#canPublish,queued:local.queued,catalogEntries:local.catalogEntries,cachedPackets:local.cachedPackets,localPending:local.pending||local.failed,waitingForDocument:this.#waitingForDocument,error:local.failed?"local_save_failed":this.#error};}
 subscribe(listener:()=>void):()=>void{this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 busy(id:string):boolean{return this.#publishing.has(id)||this.#downloads.has(id);}
 #active(epoch:number):boolean{return !this.#closed&&this.#epoch===epoch;}
 #enqueue(work:()=>Promise<void>):Promise<void>{this.#tasks++;const task=this.#serial.then(work).finally(()=>{this.#tasks--;});this.#serial=task.catch(()=>{});return task;}
 #networkAllowed():void{if(this.#recovering)throw new SharedRelayError("version_recovery_in_use");}
 /** Disconnected status alone does not prove old asynchronous work has settled. */
 reserveLocalRecovery():()=>void{
  if(this.#closed)throw new SharedRelayError("closed");
  if(this.#recovering||this.#wanted||this.#status!=="offline"||this.#tasks||this.#working||this.#channel||this.#connecting||this.#downloads.size||this.#publishing.size)throw new SharedRelayError("version_recovery_in_use");
  this.#recovering=true;let released=false;return()=>{if(!released){released=true;this.#recovering=false;}};
 }
 /** Wait only for already-disconnected work; starts no connection or storage mutation. */
 async waitForDisconnected():Promise<void>{
  if(this.#closed)throw new SharedRelayError("closed");if(this.#wanted||this.#recovering||this.#status!=="offline")throw new SharedRelayError("version_recovery_in_use");
  const epoch=this.#epoch;await Promise.allSettled([this.#serial,...this.#downloads.values()]);
  if(this.#epoch!==epoch)throw new SharedRelayError("version_recovery_in_use");const release=this.reserveLocalRecovery();release();
 }
 #notify():void{if(this.#notifying)return;this.#notifying=true;queueMicrotask(()=>{this.#notifying=false;try{this.#store.options.onState?.(this.state());}catch{/* Reporting cannot replace recovery. */}for(const listener of [...this.#listeners])try{listener();}catch{/* UI does not own this adapter. */}});}
 #report(error:SharedRelayError):void{if(this.#reported===error.code)return;this.#reported=error.code;queueMicrotask(()=>{try{this.#store.options.onError?.(error);}catch{/* Reporting is isolated. */}});}
 #reject(error:SharedRelayError):void{for(const waiter of this.#waiters){clearTimeout(waiter.timer);waiter.reject(error);}this.#waiters.clear();}
 #storeChanged():void{if(this.#closed)return;const local=this.#store.state();if(local.failed){if(this.#status!=="local-save-failed")this.#fail(new SharedRelayError("local_save_failed"),this.#epoch);return;}const signature=this.#store.queued().join(",");if(signature!==this.#localSignature){this.#localSignature=signature;this.#schedule();}this.#settle();}
 #settle():void{
  if(this.#closed)return;const local=this.#store.state();if(this.#ready&&!this.#working)this.#status=local.queued||local.pending?"pending":"ready";
  for(const waiter of this.#waiters){const states=waiter.ids.map(id=>this.#store.versionStatus(id));if(states.some(state=>!state.queued&&!state.accepted)){clearTimeout(waiter.timer);this.#waiters.delete(waiter);waiter.reject(new SharedRelayError("version_publication_stopped"));}else if(states.every(state=>!!state.accepted&&state.localSaved)){clearTimeout(waiter.timer);this.#waiters.delete(waiter);waiter.resolve();}}
  this.#notify();
 }
 #stop():void{this.#epoch++;this.#ready=false;this.#dirty=false;this.#queuedEpoch=undefined;this.#latestDocument=undefined;this.#connecting=undefined;this.#canPublish=null;this.#waitingForDocument=false;this.#abort?.abort();this.#abort=undefined;const channel=this.#channel;this.#channel=undefined;channel?.close();}
 #fail(error:SharedRelayError,epoch:number):void{
  if(!this.#active(epoch))return;const wanted=this.#wanted;this.#stop();this.#error=error.code;this.#reject(error);this.#report(error);
  const retry=wanted&&transient.has(error.code);this.#status=error.code==="local_save_failed"?"local-save-failed":retry?"offline":error.code==="permission_denied"||error.code==="token_unavailable"?"denied":"failed";
  this.#wanted=retry||error.code==="local_save_failed"&&wanted;this.#notify();
  if(retry){const delay=Math.min(this.#maximum,this.#minimum*2**Math.min(this.#attempts++,10));this.#retry=setTimeout(()=>{this.#retry=undefined;if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});},delay);}
 }
 #event(value:Record<string,unknown>,epoch:number):void{if(!this.#active(epoch))return;try{if(value["kind"]==="error"){this.#fail(new SharedRelayError(string(value["code"],64)),epoch);return;}if(value["kind"]==="catchup")this.#latestDocument=frame(value["frame"]);else if(value["kind"]!=="documentVersionsChanged")throw new SharedRelayError("version_protocol_error");this.#schedule();}catch{this.#fail(new SharedRelayError("version_protocol_error"),epoch);}}
 #schedule():void{
  if(this.#closed)return;this.#dirty=true;if(!this.#ready||this.#queuedEpoch===this.#epoch)return;const epoch=this.#epoch;this.#queuedEpoch=epoch;
  void this.#enqueue(async()=>{if(!this.#active(epoch)||!this.#ready)return;this.#dirty=false;await this.#synchronize(epoch);}).catch(error=>this.#fail(error instanceof SharedRelayError?error:new SharedRelayError("version_sync_failed"),epoch)).finally(()=>{if(this.#queuedEpoch===epoch)this.#queuedEpoch=undefined;if(this.#active(epoch)&&this.#dirty&&this.#ready)this.#schedule();});
 }
 async #save():Promise<void>{try{await this.#store.flush();}catch{throw new SharedRelayError("local_save_failed");}}
 async #document(channel:RelayChannel,input:string,epoch:number):Promise<void>{const options=this.#store.options,identity=options.identity,core=options.storage.core,response=await channel.request({kind:"clock",writer:identity.documentWriter});if(response["kind"]!=="clock")throw new SharedRelayError("version_protocol_error");checkClock(core,clock(response["clock"],identity.documentWriter),transportVersion(identity.writerTransport));if(!this.#active(epoch))throw new SharedRelayError("disconnected");await core.receiveFrame(input,{signal:this.#abort!.signal});}
 async #pull(epoch:number):Promise<void>{
  const entries:SharedDocumentVersionEntry[]=[];let cursor=null,more;
  do{if(!this.#active(epoch))throw new SharedRelayError("disconnected");const page=await this.#http.page(cursor,this.#abort!.signal);if(!this.#active(epoch))throw new SharedRelayError("disconnected");entries.push(...page.entries);if(entries.length>1024)throw new SharedRelayError("version_catalog_budget");cursor=page.cursor;more=page.more;}while(more);
  try{await this.#store.adoptCatalog(catalogSnapshot({through:cursor.through,entries}));}catch(error){throw this.#store.state().failed?new SharedRelayError("local_save_failed"):error;}
 }
 async connect():Promise<void>{
  this.#networkAllowed();
  if(this.#closed)throw new SharedRelayError("closed");if(this.#ready)return this.refresh();if(this.#connecting)return this.#connecting;clearTimeout(this.#retry);this.#retry=undefined;this.#wanted=true;this.#error=null;this.#status="connecting";this.#notify();
  const epoch=++this.#epoch,abort=new AbortController();this.#abort=abort;const work=this.#enqueue(async()=>{
   await this.#save();const options=this.#store.options,identity=options.identity,token=await accountToken(options.getToken,abort.signal,this.#milliseconds),channel=await RelayChannel.openVersions(identity.endpoint,this.#milliseconds,value=>this.#event(value,epoch),error=>this.#fail(error,epoch),abort.signal);
   if(!this.#active(epoch)){channel.close();throw new SharedRelayError("disconnected");}this.#channel=channel;const capabilities=[...(transportVersion(identity.writerTransport)===2?["writerTransportV2"]:[]),"documentVersionsV1"],auth=await channel.request({kind:"authenticate",principal:identity.principal,token,capabilities});
   if(auth["kind"]!=="authenticated"||JSON.stringify(auth["capabilities"])!==JSON.stringify(capabilities)||typeof auth["documentVersionsCanPublish"]!=="boolean")throw new SharedRelayError("version_protocol_error");checkDescriptor(options.storage.core,descriptor(auth["descriptor"]));versionDescriptor(auth["documentVersionsDescriptor"],identity);this.#canPublish=auth["documentVersionsCanPublish"];
   await this.#document(channel,frame(auth["frame"]),epoch);this.#ready=true;this.#attempts=0;this.#reported=null;await this.#synchronize(epoch);
  }).catch(error=>{const failure=error instanceof SharedRelayError?error:new SharedRelayError("version_sync_failed");this.#fail(failure,epoch);throw failure;});this.#connecting=work;try{await work;}finally{if(this.#connecting===work)this.#connecting=undefined;}
 }
 async #synchronize(epoch:number):Promise<void>{
  if(!this.#active(epoch)||!this.#ready||!this.#channel)return;this.#working++;try{const channel=this.#channel;this.#status="syncing";this.#waitingForDocument=false;this.#notify();await this.#save();
  const info=await this.#http.describe(this.#abort!.signal);if(!this.#active(epoch))throw new SharedRelayError("disconnected");this.#canPublish=info.canPublish;
  const response=await channel.request({kind:"sync"});if(response["kind"]!=="catchup")throw new SharedRelayError("version_protocol_error");const latest=this.#latestDocument;this.#latestDocument=undefined;await this.#document(channel,frame(response["frame"]),epoch);if(latest!==undefined)await this.#document(channel,latest,epoch);await this.#pull(epoch);
  const targets=this.#store.queued();let published=false;
  if(this.#canPublish&&targets.length){
   try{await this.#store.options.flushDocument?.();}catch{this.#waitingForDocument=true;this.#settle();return;}
   for(const id of targets){if(!this.#active(epoch))throw new SharedRelayError("disconnected");if(!this.#store.versionStatus(id).queued)continue;await this.#save();this.#publishing.add(id);
    try{const admission=await this.#http.publish(this.#store.packet(id),this.#abort!.signal);if(!this.#active(epoch))throw new SharedRelayError("disconnected");if(admission.kind==="pending"){this.#waitingForDocument=true;break;}await this.#store.accept(id,admission.entry);published=true;}
    catch(error){if(error instanceof SharedRelayError&&error.code==="permission_denied"){const role=await this.#http.describe(this.#abort!.signal);this.#canPublish=role.canPublish;if(!role.canPublish)break;}throw this.#store.state().failed?new SharedRelayError("local_save_failed"):error;}
    finally{this.#publishing.delete(id);}
   }
  }
  if(published)await this.#pull(epoch);
  }finally{this.#working--;if(this.#active(epoch))this.#settle();}
 }
 async refresh():Promise<void>{this.#networkAllowed();if(this.#closed)throw new SharedRelayError("closed");if(!this.#ready)return this.connect();const epoch=this.#epoch;return this.#enqueue(()=>this.#synchronize(epoch)).catch(error=>{const failure=error instanceof SharedRelayError?error:new SharedRelayError("version_sync_failed");this.#fail(failure,epoch);throw failure;});}
 async loadVersion(id:string):Promise<string>{
  this.#networkAllowed();
  try{const packet=this.#store.packet(id);this.#store.options.storage.core.verifyVersionSource(packet);await this.#save();return packet;}catch(error){if(!(error instanceof SharedRelayError)||error.code!=="version_not_cached")throw error;}
  const pending=this.#downloads.get(id);if(pending)return pending;if(this.#downloads.size>=4)throw new SharedRelayError("version_request_budget");if(!this.#wanted)throw new SharedRelayError("version_offline_not_cached");
  const work=(async()=>{if(!this.#ready)await this.connect();const epoch=this.#epoch,entry=this.#store.entry(id);if(!entry)throw new SharedRelayError("version_unknown");const packet=await this.#http.packet(entry,this.#abort!.signal);if(!this.#active(epoch))throw new SharedRelayError("disconnected");try{return await this.#store.cachePacket(packet,entry);}catch(error){throw this.#store.state().failed?new SharedRelayError("local_save_failed"):error;}})();
  this.#downloads.set(id,work);try{return await work;}finally{if(this.#downloads.get(id)===work)this.#downloads.delete(id);}
 }
 /** Captured queued IDs only; no later snapshots or merely local saves can satisfy this barrier. */
 async flushShared():Promise<void>{this.#networkAllowed();const ids=this.#store.queued();await this.#save();if(!ids.length||ids.every(id=>{const state=this.#store.versionStatus(id);return !!state.accepted&&state.localSaved;}))return;if(!this.#wanted)throw new SharedRelayError(this.#error??"offline");if(this.#canPublish===false)throw new SharedRelayError("permission_denied");if(this.#waiters.size>=16)throw new SharedRelayError("version_flush_budget");return new Promise((resolve,reject)=>{const waiter:Waiter={ids,resolve,reject,timer:setTimeout(()=>{this.#waiters.delete(waiter);reject(new SharedRelayError("version_sync_timeout"));},30000)};this.#waiters.add(waiter);this.#settle();this.#schedule();});}
 /** Local retry is not a network barrier. A failed reconnect is reported through sync state. */
 recoverLocal():void{if(this.#error!=="local_save_failed")return;this.#error=null;this.#status="offline";if(this.#wanted)void this.connect().catch(()=>{});else this.#notify();}
 disconnect():void{if(this.#closed)return;this.#wanted=false;clearTimeout(this.#retry);this.#retry=undefined;this.#stop();this.#status="offline";this.#error=null;this.#reject(new SharedRelayError("disconnected"));this.#notify();}
 dispose():void{if(this.#closed)return;this.disconnect();this.#closed=true;this.#http.dispose();for(const off of this.#unsubscribe)off();this.#notify();this.#listeners.clear();}
}
