/** Permanent observation-only connection. Publishes proposals/Reject, imports accepted content,
 * and never acquires a document-author lease, submits groups or executes Accept. */
import type {SharedSelectionPolicy,SharedWriterClock} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedRelayState,SharedRelayStatus} from "../relay/types.js";
import type {SharedSuggestionRelayRequest,SharedSuggestionRelayState,SharedSuggestionPermissions} from "../relay/suggestion_types.js";
import {RelayChannel} from "../relay/channel.js";
import {accountToken} from "../relay/registration.js";
import {SharedRelayError,checkClock,checkDescriptor,clock,descriptor,digest,frame,object,timeout} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {observerIdentity,sharedSuggestionObserverQueueIdentity} from "./observer_identity.js";
import {packetText,queueIdentity} from "./validation.js";
import {suggestionCursor,suggestionDescriptor,suggestionPermissions} from "./transport.js";
import type {SharedSuggestionQueueIdentity} from "./types.js";
import type {SharedSuggestionObserverOptions,SharedSuggestionObserverIdentity} from "./observer_types.js";
import type {SharedSuggestionTransport} from "./transport_port.js";
import {revisionsBinding,revisionsDescriptor,revisionRequest} from "../suggestion_revisions/transport.js";
import type {SharedSuggestionRevisionRequest} from "../suggestion_revisions/types.js";
const attached=new WeakSet<object>(),transient=new Set(["connection_lost","connection_timeout","request_timeout","storage_unavailable","entropy_unavailable"]);
interface Run {epoch:number;promise:Promise<void>}
export class SharedSuggestionObserverRelay<P extends SharedSelectionPolicy=SharedSelectionPolicy> implements SharedSuggestionTransport<P> {
 readonly suggestionDecisionMode="observer" as const;
 readonly #core:SharedRichEditor<P>;readonly #identity:SharedSuggestionObserverIdentity;readonly #queueIdentity:SharedSuggestionQueueIdentity;readonly #options:SharedSuggestionObserverOptions<P>;
 readonly #milliseconds:number;readonly #minimum:number;readonly #maximum:number;readonly #off:()=>void;
 #channel:RelayChannel|undefined;#abort:AbortController|undefined;#epoch=0;#closed=false;#wanted=false;#ready=false;
 #status:SharedRelayStatus="offline";#error:string|null=null;#permissions:SharedSuggestionPermissions|null=null;#clock:SharedWriterClock|null=null;
 #revision=0;#documentRevision=0;#requests=0;#attempts=0;#retry:ReturnType<typeof setTimeout>|undefined;
 #connecting:Promise<void>|undefined;#refresh:Run|undefined;#drain:Run|undefined;#latest:string|undefined;
 #notifyQueued=false;#listeners=new Set<()=>void>();#reported:string|null=null;
 constructor(options:SharedSuggestionObserverOptions<P>){
  this.#identity=observerIdentity(options.identity);this.#queueIdentity=sharedSuggestionObserverQueueIdentity(this.#identity);this.#options={...options};this.#core=options.storage.core;
  if(attached.has(this.#core))throw new SharedRelayError("suggestion_observer_already_attached");
  if(!this.#core.supportsReadOnly()||!this.#core.supportsWriterTransportV2()||!this.#core.supportsDocumentSuggestions()||typeof options.storage.save!=="function"||typeof options.storage.flush!=="function")throw new SharedRelayError("suggestion_observer_unavailable");
  if(options.suggestionRevisions){if(!this.#core.supportsSuggestionRevisions())throw new SharedRelayError("suggestion_revisions_unavailable");this.#options={...this.#options,suggestionRevisions:revisionsBinding(options.suggestionRevisions)};}
  checkSourceCheckpoint(this.#core,this.#identity.room,this.#identity.documentWriter);this.#zeroPrefix();
  const reviewed=this.#core.reviewedHistoryIdentity();if(reviewed&&(reviewed.principal!==this.#identity.principal||reviewed.binding!==this.#identity.binding||reviewed.effectWriter!==this.#identity.effectWriter))throw new SharedRelayError("suggestion_transport_identity");
  this.#milliseconds=timeout(options.requestTimeoutMs);this.#minimum=options.reconnectMinimumMs??500;this.#maximum=options.reconnectMaximumMs??30000;
  if(!Number.isInteger(this.#minimum)||!Number.isInteger(this.#maximum)||this.#minimum<50||this.#minimum>this.#maximum||this.#maximum>30000)throw new SharedRelayError("reconnect_limits");
  this.#core.setReadOnly(true);this.#off=this.#core.subscribe(()=>{try{this.#guard();}catch(error){this.#fail(this.#failure(error),this.#epoch);}});attached.add(this.#core);
  this.#wanted=options.autoConnect!==false;if(this.#wanted)queueMicrotask(()=>{if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});});
 }
 #zeroPrefix():void{if(this.#core.writerClockV2(this.#identity.documentWriter).through!=="0")throw new SharedRelayError("suggestion_observer_authored");}
 #guard():void{if(this.#closed)throw new SharedRelayError("closed");if(this.#options.storage.core!==this.#core)throw new SharedRelayError("suggestion_source_replaced");if(this.#core.view().readOnly!==true)throw new SharedRelayError("suggestion_observer_writable");this.#zeroPrefix();}
 state():SharedRelayState{return {status:this.#status,writer:this.#identity.documentWriter,localThrough:"0",locallyDurableThrough:this.#clock?"0":null,serverThrough:this.#clock?.through??null,serverPrefixDigest:this.#clock?.prefixDigest??null,serverReceiptSequence:null,waitingFor:[],pending:false,error:this.#error};}
 suggestionState():SharedSuggestionRelayState{return {ready:this.#ready,revision:this.#revision,documentRevision:this.#documentRevision,permissions:this.#permissions?{...this.#permissions,canAccept:false}:null};}
 suggestionRevisionsReady():boolean{return this.#ready&&!!this.#options.suggestionRevisions;}
 checkSuggestionRevisions(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,binding:string):void{this.checkSuggestionQueue(core,identity);if(this.#options.suggestionRevisions?.binding!==binding)throw new SharedRelayError("suggestion_revision_lane_mismatch");}
 subscribe(listener:()=>void):()=>void{if(this.#closed)throw new SharedRelayError("closed");this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 checkSuggestionQueue(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity):void{this.#guard();if(core!==this.#core||JSON.stringify(queueIdentity(identity))!==JSON.stringify(this.#queueIdentity))throw new SharedRelayError("suggestion_transport_identity");}
 #active(epoch:number):boolean{return !this.#closed&&this.#epoch===epoch;}
 #check(epoch:number):void{if(!this.#active(epoch))throw new SharedRelayError("disconnected");this.#guard();}
 #notify():void{if(this.#notifyQueued)return;this.#notifyQueued=true;queueMicrotask(()=>{this.#notifyQueued=false;try{this.#options.onState?.(this.state());}catch{/* Reporting is not admission. */}for(const listener of [...this.#listeners])try{listener();}catch{/* Observers cannot acknowledge native storage. */}});}
 #failure(error:unknown):SharedRelayError{return error instanceof SharedRelayError?error:new SharedRelayError("suggestion_observer_failed");}
 #stop():void{this.#epoch++;this.#ready=false;this.#permissions=null;this.#latest=undefined;this.#refresh=undefined;this.#drain=undefined;this.#connecting=undefined;this.#abort?.abort();this.#abort=undefined;const channel=this.#channel;this.#channel=undefined;channel?.close();}
 #fail(error:SharedRelayError,epoch:number):void{
  if(!this.#active(epoch))return;this.#stop();this.#error=error.code;const retry=this.#wanted&&transient.has(error.code);
  this.#status=retry?"offline":error.code==="local_save_failed"?"local-save-failed":error.code==="lease_rejected"?"fenced":error.code==="permission_denied"||error.code==="token_unavailable"?"denied":"failed";
  this.#notify();if(this.#reported!==error.code){this.#reported=error.code;queueMicrotask(()=>{try{this.#options.onError?.(error);}catch{/* Reporting cannot drop the source or its lease. */}});}
  if(retry){const delay=Math.min(this.#maximum,this.#minimum*2**Math.min(this.#attempts++,10));clearTimeout(this.#retry);this.#retry=setTimeout(()=>{this.#retry=undefined;if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});},delay);}else this.#wanted=false;
 }
 #event(event:Record<string,unknown>,epoch:number):void{
  if(!this.#active(epoch))return;
  try{this.#guard();if(event["kind"]==="error"){this.#fail(new SharedRelayError(String(event["code"])),epoch);return;}
   if(event["kind"]==="documentSuggestionsChanged"){if(Object.keys(event).sort().join(",")!=="kind,permissions")throw new SharedRelayError("protocol_error");this.#permissions={...suggestionPermissions(event["permissions"]),canAccept:false};this.#revision++;this.#notify();return;}
   if(event["kind"]!=="catchup")throw new SharedRelayError("protocol_error");this.#latest=frame(event["frame"]);this.#documentRevision++;this.#notify();if(this.#ready)void this.#drainFrames(epoch).catch(()=>{});
  }catch(error){this.#fail(this.#failure(error),epoch);}
 }
 async #save(epoch:number):Promise<void>{this.#check(epoch);try{this.#options.storage.save();await this.#options.storage.flush();}catch{throw new SharedRelayError("local_save_failed");}this.#check(epoch);}
 async #readClock(channel:RelayChannel,epoch:number):Promise<SharedWriterClock>{const response=await channel.request({kind:"clock",writer:this.#identity.documentWriter});this.#check(epoch);if(response["kind"]!=="clock")throw new SharedRelayError("protocol_error");const current=clock(response["clock"],this.#identity.documentWriter);if(current.through!=="0")throw new SharedRelayError("suggestion_observer_authored");checkClock(this.#core,current,2);return current;}
 async connect():Promise<void>{
  if(this.#closed)throw new SharedRelayError("closed");this.#guard();this.#wanted=true;clearTimeout(this.#retry);this.#retry=undefined;if(this.#connecting)return this.#connecting;if(this.#ready){await this.flush();return;}
  this.#stop();const epoch=this.#epoch,abort=new AbortController();this.#abort=abort;this.#status="connecting";this.#error=null;this.#notify();
  const work=(async()=>{
   await this.#save(epoch);const token=await accountToken(this.#options.getToken,abort.signal,this.#milliseconds);this.#check(epoch);
   const channel=await RelayChannel.openSuggestions(this.#identity.endpoint,this.#milliseconds,e=>this.#event(e,epoch),e=>this.#fail(e,epoch),this.#core.selectionPolicy(),abort.signal);this.#check(epoch);this.#channel=channel;
   const capabilities=["writerTransportV2","documentSuggestionsV1",...(this.#options.suggestionRevisions?["documentSuggestionRevisionsV1"]:[])],auth=await channel.request({kind:"authenticate",principal:this.#identity.principal,token,capabilities});this.#check(epoch);
   if(auth["kind"]!=="authenticated"||JSON.stringify(auth["capabilities"])!==JSON.stringify(capabilities))throw new SharedRelayError("suggestion_protocol_unavailable");checkDescriptor(this.#core,descriptor(auth["descriptor"]));suggestionDescriptor(auth["documentSuggestionsDescriptor"],this.#identity);
   if(this.#options.suggestionRevisions)revisionsDescriptor(auth["documentSuggestionRevisionsDescriptor"],this.#options.suggestionRevisions.binding,this.#identity);
   this.#permissions={...suggestionPermissions(auth["documentSuggestionsPermissions"]),canAccept:false};this.#revision++;await this.#readClock(channel,epoch);
   const resumed=await channel.request({kind:"resumeObserver",writer:this.#identity.documentWriter,credential:this.#identity.observerCredential});this.#check(epoch);if(resumed["kind"]!=="observerResumed"||object(resumed["lease"])["writer"]!==this.#identity.documentWriter)throw new SharedRelayError("writer_mismatch");
   const current=await this.#readClock(channel,epoch);this.#latest??=frame(auth["frame"]);this.#ready=true;await this.#drainFrames(epoch);this.#check(epoch);this.#clock=current;this.#status="ready";this.#error=null;this.#reported=null;this.#attempts=0;this.#notify();
  })().catch(error=>{const failure=this.#failure(error);this.#fail(failure,epoch);throw failure;});this.#connecting=work;try{await work;}finally{if(this.#connecting===work)this.#connecting=undefined;}
 }
 #drainFrames(epoch:number):Promise<void>{
  if(this.#drain?.epoch===epoch)return this.#drain.promise;const run:Run={epoch,promise:Promise.resolve()};this.#drain=run;
  run.promise=(async()=>{try{while(this.#active(epoch)&&this.#ready&&this.#latest!==undefined){this.#check(epoch);const next=this.#latest;this.#latest=undefined;await this.#core.receiveFrame(next,{signal:this.#abort!.signal});await this.#save(epoch);}}
   catch(error){this.#fail(this.#failure(error),epoch);throw error;}finally{if(this.#drain===run){this.#drain=undefined;this.#notify();}}})();return run.promise;
 }
 async refreshDocument():Promise<void>{
  const epoch=this.#epoch,channel=this.#channel;if(!this.#ready||!channel)throw new SharedRelayError("suggestion_offline");this.#check(epoch);if(this.#refresh?.epoch===epoch)return this.#refresh.promise;
  const run:Run={epoch,promise:Promise.resolve()};this.#refresh=run;
  run.promise=(async()=>{try{await this.#readClock(channel,epoch);const response=await channel.request({kind:"sync"});this.#check(epoch);if(response["kind"]!=="catchup")throw new SharedRelayError("protocol_error");const received=frame(response["frame"]);await this.#drainFrames(epoch);this.#check(epoch);this.#latest??=received;await this.#drainFrames(epoch);this.#check(epoch);}
   catch(error){const failure=this.#failure(error);this.#fail(failure,epoch);throw failure;}finally{if(this.#refresh===run)this.#refresh=undefined;}})();return run.promise;
 }
 /** No authored group is submitted. Durable source plus the permanent zero prefix is sufficient. */
 async flush():Promise<void>{const epoch=this.#epoch;if(!this.#ready)throw new SharedRelayError("suggestion_offline");try{await this.refreshDocument();await this.#save(epoch);}catch(error){this.#fail(this.#failure(error),epoch);throw error;}}
 async requestSuggestion(request:SharedSuggestionRelayRequest):Promise<Record<string,unknown>>{
  const epoch=this.#epoch,channel=this.#channel;if(!this.#ready||!channel)throw new SharedRelayError("suggestion_offline");this.#check(epoch);if(this.#requests>=2)throw new SharedRelayError("suggestion_request_budget");
  let payload:Record<string,unknown>;
  switch(request.kind){
   case "suggestionPublish":payload={kind:request.kind,binding:this.#identity.binding,packet:packetText(request.packet)};break;
   case "suggestionDecide":if(request.decision!=="reject")throw new SharedRelayError("suggestion_observer_accept");payload={kind:request.kind,decision:{binding:this.#identity.binding,suggestionId:digest(request.suggestionId),decision:"reject"}};break;
   case "suggestionRead":case "suggestionPacket":payload={kind:request.kind,binding:this.#identity.binding,suggestionId:digest(request.suggestionId)};break;
   case "suggestionSync":payload={kind:request.kind,binding:this.#identity.binding,cursor:request.cursor===null?null:suggestionCursor(request.cursor,this.#identity.binding)};break;
   default:throw new SharedRelayError("invalid_request");
  }
  this.#requests++;try{const response=await channel.request(payload);this.#check(epoch);return response;}catch(error){if(error instanceof SharedRelayError&&(error.code==="lease_rejected"||transient.has(error.code)))this.#fail(error,epoch);throw error;}finally{this.#requests--;}
 }
 /** Metadata-only revision publication; permanent observers retain their zero authored prefix. */
 async requestSuggestionRevision(request:SharedSuggestionRevisionRequest):Promise<Record<string,unknown>>{
  const epoch=this.#epoch,channel=this.#channel,binding=this.#options.suggestionRevisions;if(!this.suggestionRevisionsReady()||!channel||!binding)throw new SharedRelayError("suggestion_revision_offline");this.#check(epoch);
  if(this.#requests>=2)throw new SharedRelayError("suggestion_request_budget");const payload=revisionRequest(request,binding.binding);this.#requests++;
  try{const response=await channel.request(payload);this.#check(epoch);return response;}catch(error){if(error instanceof SharedRelayError&&(error.code==="lease_rejected"||transient.has(error.code)))this.#fail(error,epoch);throw error;}finally{this.#requests--;}
 }
 /** Networking only. Keep the source read-only and readable for offline proposals/recovery. */
 disconnect():void{if(this.#closed)return;this.#wanted=false;clearTimeout(this.#retry);this.#retry=undefined;this.#stop();this.#status="offline";this.#error=null;this.#notify();}
 dispose():void{if(this.#closed)return;this.disconnect();this.#closed=true;this.#status="closed";this.#off();attached.delete(this.#core);this.#notify();queueMicrotask(()=>this.#listeners.clear());}
}
