import {selectedNativeRelayDelivery,checkSelectedLocalDocumentBinding,type NativeRelayDeliveryPort} from './native_delivery.js';
import {RelayWorkCustody} from './work_custody.js';
import {SharedRichEditor} from "../core.js";
import type {SharedWriterClock,SharedSelectionPolicy} from "../types.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {RelayChannel} from "./channel.js";
import {RelayPresence} from "./presence.js";
import {accountToken} from "./registration.js";
import {SharedRelayError,checkClock,checkDescriptor,clock,counter,decimal,descriptor,digest,frame,groupMetadata,identity,object,prefixAt,timeout,writer} from "./validation.js";
import type {SharedRelayIdentity,SharedRelayOptions,SharedRelayState,SharedRelayStatus,SharedDocumentRelayOptions} from "./types.js";
import {transportVersion,transportCapabilities} from "./validation.js";
import {relayPresenceSnapshot,type RelayPresencePeer} from "./presence_snapshot.js";
import type {SharedSuggestionRelayState,SharedSuggestionRelayRequest,SharedSuggestionPermissions} from "./suggestion_types.js";
import type {SharedSuggestionQueueIdentity} from "../suggestions/types.js";
import {suggestionBinding,suggestionDescriptor,suggestionPermissions,suggestionCursor} from "../suggestions/transport.js";
import {packetText} from "../suggestions/validation.js";
import {revisionsBinding,revisionsDescriptor,revisionRequest} from "../suggestion_revisions/transport.js";
import type {SharedSuggestionRevisionRequest} from "../suggestion_revisions/types.js";
import {selectedDocumentSource} from './durable_source_selection.js';
import type {DurableRelaySourcePort} from './durable_source_port.js';
import type {SharedSegmentedDocumentReceipt} from "../segmented_relay/contract.js";

interface Waiter {target:string;resolve:()=>void;reject:(error:SharedRelayError)=>void;timer:ReturnType<typeof setTimeout>}
interface Run {epoch:number;promise:Promise<void>}
const transient=new Set(["connection_lost","connection_timeout","request_timeout","storage_unavailable","entropy_unavailable"]);
const attached=new WeakSet<object>();

/** Single-writer server sync for an independently owned core. No second JS document or optimistic
 * server acknowledgement exists. Disposal/permission loss keeps the core and exact journal alive. */
export class SharedRelaySync<P extends SharedSelectionPolicy="original"> {
 readonly #work:RelayWorkCustody;readonly #nativeDelivery:NativeRelayDeliveryPort|undefined;
 #core:SharedRichEditor<P>;#identity:SharedRelayIdentity;#options:SharedRelayOptions<P>;#unsubscribe:()=>void=()=>{};
 #status:SharedRelayStatus="offline";#error:string|null=null;#local:string;#durable:string|null=null;
 #acked:SharedWriterClock|undefined;#sequence:string|null=null;#channel:RelayChannel|undefined;
 #epoch=0;#abort:AbortController|undefined;#ready=false;#wanted=false;#closed=false;
 #connecting:Promise<void>|undefined;#retry:ReturnType<typeof setTimeout>|undefined;#attempts=0;
 #latest:string|undefined;#drain:Run|undefined;#pump:Run|undefined;#pumpAgain=false;#scheduled=false;
 #notifyQueued=false;#reported:string|null=null;#localFailure=false;#waiters=new Set<Waiter>();
 #assetHintQueued=false;#assetHints=false;
 #presence:RelayPresence<P>|undefined;#presenceEnabled=false;
 #presenceNegotiated=false;#presenceStarted=false;#earlyPresence:RelayPresencePeer[]|undefined;
 #milliseconds:number;#minimum:number;#maximum:number;
 #missing:{writer:string;counter:string}[]=[];
 #transport:1|2;
 #suggestionPermissions:SharedSuggestionPermissions|null=null;#suggestionRevision=0;#suggestionsNegotiated=false;
 #suggestionDocumentRevision=0;
 #revisionsNegotiated=false;
 #listeners=new Set<()=>void>();#suggestionRequests=0;
 readonly #durableSource:DurableRelaySourcePort|undefined;#durableFloor:SharedWriterClock|null=null;

 constructor(core:SharedRichEditor<P>,options:SharedRelayOptions<P>&(P extends "document-v1"?SharedDocumentRelayOptions:unknown)){
  const sourceOptions=options;
  this.#nativeDelivery=selectedNativeRelayDelivery(options,core);
  if(this.#nativeDelivery){if(options.presence)throw new SharedRelayError('native_delivery_presence');options={...options,autoConnect:false,persistLocal:()=>this.#nativeDelivery!.persistLocal()};}
  const policy=options.selectionEditing??"original";
  if(policy!=="original"&&policy!=="document-v1"||policy!==(core.selectionPolicy?.()??"original"))throw new SharedRelayError("relay_selection_policy");
  if(attached.has(core))throw new SharedRelayError("relay_already_attached");
  this.#core=core;this.#identity=identity(options.identity);this.#options={...options,identity:this.#identity};
  this.#durableSource=selectedDocumentSource(sourceOptions);
  this.#transport=transportVersion(this.#identity.writerTransport);
  const reviewed=core.reviewedHistoryIdentity?.()??null;
  if(reviewed&&(reviewed.principal!==this.#identity.principal||this.#transport!==2||typeof options.persistLocal!=="function"))throw new SharedRelayError("reviewed_transport_required");
  if(options.suggestions){
   const binding=suggestionBinding(options.suggestions);
   if(reviewed&&(reviewed.binding!==binding.binding||reviewed.effectWriter!==binding.effectWriter))throw new SharedRelayError("reviewed_transport_identity");
   if(this.#transport!==2||!core.supportsDocumentSuggestions()||typeof options.persistLocal!=="function"||binding.effectWriter===this.#identity.writer)throw new SharedRelayError("suggestion_transport_required");
   this.#options={...this.#options,suggestions:binding};
  }
  if(policy==="document-v1"&&this.#transport!==2)throw new SharedRelayError("document_writer_transport_required");
  if(options.suggestionRevisions){if(!options.suggestions||!core.supportsSuggestionRevisions())throw new SharedRelayError("suggestion_revisions_unavailable");this.#options={...this.#options,suggestionRevisions:revisionsBinding(options.suggestionRevisions)};}
  this.#milliseconds=timeout(options.requestTimeoutMs);this.#minimum=options.reconnectMinimumMs??500;this.#maximum=options.reconnectMaximumMs??30_000;
  if(!Number.isInteger(this.#minimum)||!Number.isInteger(this.#maximum)||this.#minimum<50||this.#minimum>this.#maximum||this.#maximum>30_000)throw new SharedRelayError("reconnect_limits");
  if(this.#transport===2?!core.supportsWriterTransportV2():!core.supportsWriterTransport())throw new SharedRelayError("writer_transport_unavailable");
  // The owner declares its local recovery family; transport/model bindings stay unchanged.
  if(this.#durableSource){this.#durableSource.check();const {credential:_credential,...binding}=this.#identity;if(core as object!==this.#durableSource.core as object||JSON.stringify(binding)!==JSON.stringify(this.#durableSource.binding.document))throw new SharedRelayError("segmented_relay_source");this.#durableFloor=this.#durableSource.durable().document.accepted;}
  else if(!checkSelectedLocalDocumentBinding(this.#nativeDelivery,this.#identity))checkSourceCheckpoint(core,this.#identity.room,this.#identity.writer);
  this.#local=this.#clock().through;
  if(options.presence)this.#presence=new RelayPresence(core,options.presence,this.#identity.writer,e=>this.#report(e));
  this.#work=new RelayWorkCustody(core,()=>!this.#wanted&&(!this.#closed?this.#status==='offline':true),()=>new SharedRelayError('relay_recovery_in_use'),this.#nativeDelivery?.admission);
  try{const listener=()=>{try{const previous=this.#local;this.#refresh();if(previous!==this.#local)this.#schedulePump();}catch{this.#fail(new SharedRelayError("owner_unavailable"),this.#epoch);}};
   this.#unsubscribe=this.#nativeDelivery?nativeSubscribeIntrinsic.call(core,listener):core.subscribe(listener);attached.add(core);
   this.#nativeDelivery?.track(()=>nativeDisposeIntrinsic.call(this),()=>nativeDrainIntrinsic.call(this));
  }catch(error){this.#unsubscribe();this.#presence?.dispose();this.#work.retire(()=>attached.delete(core));throw error;}
  this.#wanted=options.autoConnect!==false;
  if(this.#wanted)queueMicrotask(()=>{if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});});
 }
 state():SharedRelayState{return{status:this.#status,writer:this.#identity.writer,localThrough:this.#local,locallyDurableThrough:this.#durable,serverThrough:this.#acked?.through??null,serverPrefixDigest:this.#acked?.prefixDigest??null,serverReceiptSequence:this.#sequence,waitingFor:this.#missing.map(d=>({...d})),pending:this.#local!==(this.#acked?.through??"0"),error:this.#error};}
 /** Notifications share this adapter's lifetime; subscribers do not own its core or socket. */
 subscribe(listener:()=>void):()=>void{if(this.#closed)throw new SharedRelayError("closed");this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 suggestionState():SharedSuggestionRelayState{return {ready:this.#ready&&this.#suggestionsNegotiated,revision:this.#suggestionRevision,documentRevision:this.#suggestionDocumentRevision,permissions:this.#suggestionPermissions?{...this.#suggestionPermissions}:null};}
 suggestionRevisionsReady():boolean{return this.#ready&&this.#revisionsNegotiated;}
 checkSuggestionRevisions(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity,binding:string):void{this.checkSuggestionQueue(core,identity);if(!this.#options.suggestionRevisions||this.#options.suggestionRevisions.binding!==binding)throw new SharedRelayError("suggestion_revision_lane_mismatch");}
 /** Nonsecret exact binding check for a borrowed durable queue; never transfers the author lease. */
 checkSuggestionQueue(core:SharedRichEditor<P>,identity:SharedSuggestionQueueIdentity):void{
  const binding=this.#options.suggestions;
  if(this.#closed||core!==this.#core||!binding||identity.endpoint!==this.#identity.endpoint||identity.principal!==this.#identity.principal||identity.room!==this.#identity.room||identity.documentWriter!==this.#identity.writer||identity.writerTransport!=="atomic-v2"||identity.binding!==binding.binding||identity.effectWriter!==binding.effectWriter)throw new SharedRelayError("suggestion_transport_identity");
 }
 #active(epoch:number):boolean{return !this.#closed&&epoch===this.#epoch;}
 #notify():void{if(this.#notifyQueued)return;this.#notifyQueued=true;queueMicrotask(()=>{this.#notifyQueued=false;try{this.#options.onState?.(this.state());}catch{/* Host callbacks do not rewind accepted content. */}for(const listener of [...this.#listeners])try{listener();}catch{/* Borrowed observers cannot rewind publication. */}});}
 #report(error:SharedRelayError):void{if(this.#reported===error.code)return;this.#reported=error.code;queueMicrotask(()=>{try{this.#options.onError?.(error);}catch{/* Reporting is not publication. */}});}
 #clock():SharedWriterClock{return this.#transport===2?this.#core.writerClockV2(this.#identity.writer):this.#core.writerClock(this.#identity.writer);}
 #groups(after:string):readonly string[]{return(this.#transport===2?this.#core.writerGroupsV2(after):this.#core.writerGroups(after)).groups;}
 #refresh():void{this.#local=this.#clock().through;this.#settle();}
 #settle():void{
  if(this.#ready){this.#status=this.#localFailure?"local-save-failed":this.#drain||this.#latest!==undefined||this.#pump?"syncing":this.#local===this.#acked?.through?"ready":"pending";}
  this.#notify();
  if(this.#acked)for(const waiter of this.#waiters){if(BigInt(this.#acked.through)>=BigInt(waiter.target)){this.#waiters.delete(waiter);clearTimeout(waiter.timer);waiter.resolve();}}
 }
 #rejectWaiters(error:SharedRelayError):void{for(const w of this.#waiters){clearTimeout(w.timer);w.reject(error);}this.#waiters.clear();}
 #stop():void{
  this.#epoch++;this.#ready=false;this.#latest=undefined;this.#drain=undefined;this.#pump=undefined;this.#pumpAgain=false;this.#missing=[];this.#connecting=undefined;
  this.#abort?.abort();this.#abort=undefined;const channel=this.#channel;this.#channel=undefined;channel?.close();
  this.#presence?.stop();this.#presenceEnabled=false;
  this.#presenceNegotiated=false;this.#presenceStarted=false;this.#earlyPresence=undefined;
  this.#suggestionsNegotiated=false;this.#suggestionPermissions=null;
  this.#revisionsNegotiated=false;
 }
 #fail(error:SharedRelayError,epoch:number):void{
  if(!this.#active(epoch))return;this.#stop();this.#error=error.code;
  const retry=transient.has(error.code)&&this.#wanted;
  this.#status=retry?"offline":error.code==="local_save_failed"?"local-save-failed":error.code==="lease_rejected"?"fenced":error.code==="permission_denied"||error.code==="token_unavailable"?"denied":"failed";
  this.#rejectWaiters(error);this.#report(error);this.#notify();
  if(retry){const delay=Math.min(this.#maximum,this.#minimum*2**Math.min(this.#attempts++,10));this.#retry=setTimeout(()=>{this.#retry=undefined;if(this.#wanted&&!this.#closed)void this.connect().catch(()=>{});},delay);}else this.#wanted=false;
 }
 #event(event:Record<string,unknown>,epoch:number):void{
  if(!this.#active(epoch))return;
  try{if(event["kind"]==="error"){this.#fail(new SharedRelayError(String(event["code"])),epoch);return;}
   if(event["kind"]==="assetsChanged"){if(!this.#assetHints)throw new SharedRelayError("protocol_error");this.#assetsChanged(epoch);return;}
   if(event["kind"]==="documentSuggestionsChanged"){
    if(!this.#options.suggestions||Object.keys(event).sort().join(",")!=="kind,permissions")throw new SharedRelayError("protocol_error");
    this.#suggestionPermissions=suggestionPermissions(event["permissions"]);this.#suggestionRevision++;this.#notify();return;
   }
   if(event["kind"]===(this.#core.selectionPolicy()==="document-v1"?"documentPresence":"presence")){
    if(!this.#presence||this.#presenceNegotiated&&!this.#presenceEnabled)throw new SharedRelayError("protocol_error");
    if(this.#presenceStarted)this.#presence.receive(event["peers"]);
    else this.#earlyPresence=relayPresenceSnapshot(event["peers"]);
    return;
   }
   if(event["kind"]!=="catchup")throw new SharedRelayError("protocol_error");this.#latest=frame(event["frame"]);
   // A peer source can become server-durable even when this owner already retained it offline.
   // Wake pending suggestion publication without depending on a changed native projection.
   if(this.#options.suggestions)this.#suggestionDocumentRevision++;
   if(this.#ready)void this.#drainFrames(epoch).catch(()=>{});}
  catch{this.#fail(new SharedRelayError("protocol_error"),epoch);}
 }
 #assetsChanged(epoch:number):void{
  if(this.#assetHintQueued)return;this.#assetHintQueued=true;
  queueMicrotask(()=>{this.#assetHintQueued=false;if(this.#active(epoch))try{this.#options.onAssetsChanged?.();}catch{/* Availability observers cannot create or rewind edits. */}});
 }

 /** Explicit connect/retry. A fenced/denied session never automatically steals its writer back. */
 async connect():Promise<void>{
  if(this.#closed)throw new SharedRelayError("closed");this.#work.checkAllowed();this.#nativeDelivery?.check();this.#wanted=true;clearTimeout(this.#retry);this.#retry=undefined;
  if(this.#connecting)return this.#connecting;
  if(this.#ready&&this.#channel){this.#localFailure=false;this.#error=null;this.#schedulePump();return;}
  this.#stop();const epoch=this.#epoch,abort=new AbortController();this.#abort=abort;this.#status="connecting";this.#error=null;this.#notify();
  const work=this.#work.run(()=>this.#establish(epoch,abort)).catch(error=>{const failure=error instanceof SharedRelayError?error:new SharedRelayError(this.#active(epoch)?"protocol_error":"disconnected");if(this.#active(epoch))this.#fail(failure,epoch);throw failure;});
  this.#connecting=work;try{await work;}finally{if(this.#connecting===work)this.#connecting=undefined;}
 }
 async #establish(epoch:number,abort:AbortController):Promise<void>{
  if(this.#durableSource){this.#durableSource.check();try{await this.#durableSource.flush();}catch{throw new SharedRelayError("local_save_failed");}if(!this.#active(epoch))throw new SharedRelayError("disconnected");this.#durableFloor=this.#durableSource.durable().document.accepted;}
  this.#nativeDelivery?.check();const token=await accountToken(this.#options.getToken,abort.signal,this.#milliseconds);if(!this.#active(epoch))throw new SharedRelayError("disconnected");
  const open=this.#core.selectionPolicy()==="document-v1"?RelayChannel.openDocument:RelayChannel.open;
  const channel=await(this.#options.suggestions?RelayChannel.openSuggestions(this.#identity.endpoint,this.#milliseconds,e=>this.#event(e,epoch),e=>this.#fail(e,epoch),this.#core.selectionPolicy(),abort.signal):open(this.#identity.endpoint,this.#milliseconds,e=>this.#event(e,epoch),e=>this.#fail(e,epoch),abort.signal));
  if(!this.#active(epoch)){channel.close();throw new SharedRelayError("disconnected");}this.#channel=channel;
  const presenceCapability=this.#core.selectionPolicy()==="document-v1"?"documentPresenceV1":"presence";
  const wanted=[...(this.#options.onAssetsChanged?["assets"]:[]),...(this.#presence?[presenceCapability]:[]),...(this.#transport===2?["writerTransportV2"]:[]),...(this.#options.suggestions?["documentSuggestionsV1"]:[]),...(this.#options.suggestionRevisions?["documentSuggestionRevisionsV1"]:[])];
  this.#nativeDelivery?.check();const authenticated=await channel.request({kind:"authenticate",principal:this.#identity.principal,token,...(wanted.length?{capabilities:wanted}:{})});
  if(authenticated["kind"]!=="authenticated")throw new SharedRelayError("protocol_error");checkDescriptor(this.#core,descriptor(authenticated["descriptor"]));
  let confirmed=authenticated["capabilities"];
  if(this.#options.suggestions){
   if(!Array.isArray(confirmed)||confirmed.filter(c=>c==="documentSuggestionsV1").length!==1)throw new SharedRelayError("suggestion_protocol_unavailable");
   confirmed=confirmed.filter(c=>c!=="documentSuggestionsV1");
   suggestionDescriptor(authenticated["documentSuggestionsDescriptor"],{...this.#options.suggestions,room:this.#identity.room});
   this.#suggestionPermissions=suggestionPermissions(authenticated["documentSuggestionsPermissions"]);this.#suggestionsNegotiated=true;this.#suggestionRevision++;
  }
  if(this.#options.suggestionRevisions){
   if(!Array.isArray(confirmed)||confirmed.filter(c=>c==="documentSuggestionRevisionsV1").length!==1)throw new SharedRelayError("suggestion_revision_protocol_unavailable");
   confirmed=confirmed.filter(c=>c!=="documentSuggestionRevisionsV1");revisionsDescriptor(authenticated["documentSuggestionRevisionsDescriptor"],this.#options.suggestionRevisions.binding,{room:this.#identity.room,binding:this.#options.suggestions!.binding});this.#revisionsNegotiated=true;
  }
  const capabilities=transportCapabilities(confirmed,this.#transport,this.#core.selectionPolicy());
  this.#assetHints=!!this.#options.onAssetsChanged&&capabilities.includes("assets");
  this.#presenceEnabled=!!this.#presence&&capabilities.includes(presenceCapability);
  this.#presenceNegotiated=true;
  if(this.#presence&&this.#core.selectionPolicy()==="document-v1"&&!this.#presenceEnabled)throw new SharedRelayError("presence_protocol_unavailable");
  if(this.#earlyPresence&&!this.#presenceEnabled)throw new SharedRelayError("protocol_error");
  const initialFrame=frame(authenticated["frame"]);this.#latest??=initialFrame;
  // Never import a server's own-author future and then pretend it belongs to this local journal.
  await this.#readClock(channel);this.#nativeDelivery?.check();const resumed=await channel.request({kind:"resume",writer:this.#identity.writer,credential:this.#identity.credential});
  if(resumed["kind"]!=="resumed"||object(resumed["lease"])["writer"]!==this.#identity.writer)throw new SharedRelayError("writer_mismatch");
  const current=await this.#readClock(channel);if(!this.#active(epoch))throw new SharedRelayError("disconnected");
  if(this.#acked&&BigInt(current.through)<BigInt(this.#acked.through))throw new SharedRelayError("server_rollback");
  if(current.through!==this.#acked?.through)this.#sequence=null;
  if(this.#durableSource){await this.#saveDurableSourceProgress(current);if(!this.#active(epoch))throw new SharedRelayError("disconnected");}
  if(this.#durableSource){const receipt=this.#durableSource.durable().document.receipt;this.#sequence=receipt?.receipt.through===current.through?receipt.sequence:null;}
  this.#acked=current;this.#ready=true;this.#localFailure=false;this.#error=null;this.#reported=null;this.#attempts=0;this.#status="syncing";this.#notify();
  await this.#drainFrames(epoch);if(this.#active(epoch)){this.#refresh();this.#schedulePump();if(this.#assetHints)this.#assetsChanged(epoch);if(this.#presenceEnabled){this.#presence!.start(channel);this.#presenceStarted=true;if(this.#earlyPresence)this.#presence!.receive(this.#earlyPresence);this.#earlyPresence=undefined;}}
 }
 async #readClock(channel:RelayChannel):Promise<SharedWriterClock>{const result=await channel.request({kind:"clock",writer:this.#identity.writer});if(result["kind"]!=="clock")throw new SharedRelayError("protocol_error");const current=clock(result["clock"],this.#identity.writer);checkClock(this.#core,current,this.#transport);if(this.#durableSource){this.#durableSource.check();if(this.#durableFloor&&BigInt(current.through)<BigInt(this.#durableFloor.through)||this.#acked&&BigInt(current.through)<BigInt(this.#acked.through))throw new SharedRelayError("server_rollback");}return current;}
 async #saveDurableSourceProgress(accepted:SharedWriterClock,receipt?:SharedSegmentedDocumentReceipt):Promise<void>{
  if(!this.#durableSource)return;this.#nativeDelivery?.check();this.#durableSource.check();
  try{await this.#durableSource.persistDocument({accepted,receipt:receipt??this.#durableSource.durable().document.receipt});this.#durableFloor=this.#durableSource.durable().document.accepted;}catch{throw new SharedRelayError("local_save_failed");}
  // A genuine committed receipt remains source DATA if authority was revoked
  // during its storage callback. It must not settle an old execution's flush.
  this.#nativeDelivery?.check();
 }
 /** Bounded suggestion requests use this existing authenticated author connection. Binding and
  * principal/writer authority cannot be supplied by a caller payload. A metadata permission error
  * does not shut down ordinary document sync; an invalid author lease still fences it. */
 async requestSuggestion(request:SharedSuggestionRelayRequest):Promise<Record<string,unknown>>{return this.#work.run(()=>this.#requestSuggestion(request));}
 async #requestSuggestion(request:SharedSuggestionRelayRequest):Promise<Record<string,unknown>>{
  const binding=this.#options.suggestions,channel=this.#channel,epoch=this.#epoch;
  if(!binding||!channel||!this.#ready||!this.#suggestionsNegotiated)throw new SharedRelayError("suggestion_offline");
  if(this.#suggestionRequests>=2)throw new SharedRelayError("suggestion_request_budget");
  let payload:Record<string,unknown>;
  switch(request.kind){
   case "suggestionPublish":payload={kind:request.kind,binding:binding.binding,packet:packetText(request.packet)};break;
   case "suggestionDecide":
    if(request.decision!=="accept"&&request.decision!=="reject")throw new SharedRelayError("suggestion_decision");
    payload={kind:request.kind,decision:{binding:binding.binding,suggestionId:digest(request.suggestionId),decision:request.decision}};break;
   case "suggestionRead":case "suggestionPacket":payload={kind:request.kind,binding:binding.binding,suggestionId:digest(request.suggestionId)};break;
   case "suggestionSync":payload={kind:request.kind,binding:binding.binding,cursor:request.cursor===null?null:suggestionCursor(request.cursor,binding.binding)};break;
   default:throw new SharedRelayError("invalid_request");
  }
  this.#suggestionRequests++;
  try{this.#nativeDelivery?.check();const result=await channel.request(payload);if(!this.#active(epoch)||this.#channel!==channel)throw new SharedRelayError("disconnected");return result;}
  catch(error){if(error instanceof SharedRelayError&&(error.code==="lease_rejected"||transient.has(error.code)))this.#fail(error,epoch);throw error;}
  finally{this.#suggestionRequests--;}
 }
 /** Same authenticated socket and combined two-request budget; never an implicit child publish. */
 async requestSuggestionRevision(request:SharedSuggestionRevisionRequest):Promise<Record<string,unknown>>{return this.#work.run(()=>this.#requestSuggestionRevision(request));}
 async #requestSuggestionRevision(request:SharedSuggestionRevisionRequest):Promise<Record<string,unknown>>{
  const binding=this.#options.suggestionRevisions,channel=this.#channel,epoch=this.#epoch;
  if(!binding||!channel||!this.suggestionRevisionsReady())throw new SharedRelayError("suggestion_revision_offline");
  if(this.#suggestionRequests>=2)throw new SharedRelayError("suggestion_request_budget");const payload=revisionRequest(request,binding.binding);this.#suggestionRequests++;
  try{this.#nativeDelivery?.check();const result=await channel.request(payload);if(!this.#active(epoch)||this.#channel!==channel)throw new SharedRelayError("disconnected");return result;}
  catch(error){if(error instanceof SharedRelayError&&(error.code==="lease_rejected"||transient.has(error.code)))this.#fail(error,epoch);throw error;}
  finally{this.#suggestionRequests--;}
 }
 /** Merge host catchup through the same serialized native owner queue. This is not a local or
  * server-save acknowledgement; the dependent suggestion queue must save its source afterward. */
 async refreshDocument():Promise<void>{return this.#work.run(()=>this.#refreshDocument());}
 async #refreshDocument():Promise<void>{
  const epoch=this.#epoch,channel=this.#channel;if(!this.#ready||!channel)throw new SharedRelayError("suggestion_offline");
  try{
  await this.#readClock(channel);const result=await channel.request({kind:"sync"});
  if(!this.#active(epoch)||this.#channel!==channel)throw new SharedRelayError("disconnected");
  if(result["kind"]!=="catchup")throw new SharedRelayError("protocol_error");const received=frame(result["frame"]);
  // Retain both a queued earlier hint and the explicit response. A newer hint is cumulative,
  // but an earlier queued frame must not cause the explicit effect-bearing response to be lost.
  await this.#drainFrames(epoch);if(!this.#active(epoch))throw new SharedRelayError("disconnected");
  this.#latest??=received;await this.#drainFrames(epoch);
  if(!this.#active(epoch))throw new SharedRelayError("disconnected");
  }catch(error){if(error instanceof SharedRelayError&&(error.code==="lease_rejected"||transient.has(error.code)||["history_fork","server_ahead","protocol_error"].includes(error.code)))this.#fail(error,epoch);throw error;}
 }
 #drainFrames(epoch:number):Promise<void>{
  if(this.#drain?.epoch===epoch)return this.#drain.promise;
  const run:Run={epoch,promise:Promise.resolve()};this.#drain=run;
  run.promise=this.#work.run(async()=>{try{while(this.#active(epoch)&&this.#ready&&this.#latest!==undefined){const next=this.#latest;this.#latest=undefined;const signal=this.#abort!.signal;if(this.#nativeDelivery)this.#nativeDelivery.receiveDocument(next);else await this.#core.receiveFrame(next,{signal});if(this.#active(epoch)){this.#refresh();this.#schedulePump();}}}
   catch(error){if(this.#active(epoch))this.#fail(error instanceof SharedRelayError?error:new SharedRelayError("remote_rejected"),epoch);throw error;}
   finally{if(this.#drain===run){this.#drain=undefined;this.#settle();}}});return run.promise;
 }
 #schedulePump():void{
  if(this.#closed||!this.#ready||this.#localFailure)return;if(this.#pump){this.#pumpAgain=true;return;}if(this.#scheduled)return;this.#scheduled=true;
  queueMicrotask(()=>{this.#scheduled=false;if(this.#ready&&!this.#closed&&!this.#pump&&!this.#localFailure)this.#startPump();});
 }
 #startPump():void{
  const epoch=this.#epoch,run:Run={epoch,promise:Promise.resolve()};this.#pump=run;this.#pumpAgain=false;this.#settle();
  run.promise=this.#work.run(()=>this.#sendGroups(epoch)).catch(error=>{if(this.#active(epoch))this.#fail(error instanceof SharedRelayError?error:new SharedRelayError("group_export_failed"),epoch);}).finally(()=>{if(this.#pump===run){this.#pump=undefined;const again=this.#pumpAgain;this.#pumpAgain=false;this.#settle();if(again)this.#schedulePump();}});
 }
 async #sendGroups(epoch:number):Promise<void>{
  if(!this.#acked||!this.#channel)return;const channel=this.#channel,target=this.#clock().through;
  if(BigInt(target)<=BigInt(this.#acked.through))return;
  if(this.#options.persistLocal){try{await this.#options.persistLocal();}catch{if(this.#active(epoch)){this.#localFailure=true;this.#error="local_save_failed";const error=new SharedRelayError("local_save_failed");this.#rejectWaiters(error);this.#report(error);}return;}if(!this.#active(epoch))return;this.#durable=target;this.#reported=null;this.#error=null;this.#notify();}
  while(this.#active(epoch)&&this.#ready&&BigInt(this.#acked.through)<BigInt(target)){
   const groups=this.#groups(this.#acked.through);if(!groups.length)throw new SharedRelayError("group_export_failed");
   for(const raw of groups){const g=groupMetadata(raw,this.#transport);if(BigInt(g.through)>BigInt(target))return;
    if(g.writer!==this.#identity.writer||g.from!==this.#acked.through||g.previousDigest!==this.#acked.prefixDigest)throw new SharedRelayError("history_fork");
    this.#nativeDelivery?.check();this.#missing=[];const result=await channel.request({kind:"submit",group:raw});if(!this.#active(epoch))return;
    if(result["kind"]==="pending"){
     const dependencies=result["missing"];if(result["writer"]!==this.#identity.writer||!Array.isArray(dependencies)||!dependencies.length||dependencies.length>1024)throw new SharedRelayError("protocol_error");
     this.#missing=dependencies.map(value=>{const d=object(value),n=counter(d["counter"]);if(n==="0")throw new SharedRelayError("protocol_error");return{writer:writer(d["writer"]),counter:n};});return;
    }if(result["kind"]!=="durable")throw new SharedRelayError("protocol_error");
    const receipt=object(result["receipt"]),through=counter(receipt["through"]),prefix=digest(receipt["prefixDigest"]);
    if(receipt["writer"]!==g.writer||receipt["from"]!==g.from||through!==g.through||receipt["groupDigest"]!==g.groupDigest||prefix!==prefixAt(this.#core,g.writer,through,this.#transport)||typeof result["duplicate"]!=="boolean")throw new SharedRelayError("receipt_mismatch");
    const sequence=decimal(result["sequence"]),accepted={writer:g.writer,through,prefixDigest:prefix};
    if(this.#durableSource){await this.#saveDurableSourceProgress(accepted,{sequence,receipt:{writer:g.writer,from:g.from,through,groupDigest:g.groupDigest,prefixDigest:prefix}});if(!this.#active(epoch))return;}
    this.#sequence=sequence;this.#acked=accepted;this.#settle();
   }
  }
 }
 /** Wait for THIS call's authored end to become server durable, not for future typing or every
  * collaborator. Offline/denied/failed work remains in the caller-owned journal. */
 flush():Promise<void>{
  if(this.#closed)return Promise.reject(new SharedRelayError("closed"));
  // Cached durability is still DATA, not authority for a held execution.
  try{this.#nativeDelivery?.check();}catch(error){return Promise.reject(error);}
  this.#refresh();const target=this.#local;
  if(this.#acked&&BigInt(this.#acked.through)>=BigInt(target))return Promise.resolve();
  if(!this.#wanted||this.#localFailure)return Promise.reject(new SharedRelayError(this.#error??"offline"));
  if(this.#waiters.size>=16)return Promise.reject(new SharedRelayError("flush_budget"));
  return new Promise((resolve,reject)=>{const waiter:Waiter={target,resolve,reject,timer:setTimeout(()=>{this.#waiters.delete(waiter);reject(new SharedRelayError("sync_timeout"));},30_000)};this.#waiters.add(waiter);this.#schedulePump();});
 }
 /** Await actual old work after disconnect or dispose. No connection, save
  * retry, server ACK, queue settlement or ownership transfer is implied. */
 async waitForDisconnected():Promise<void>{
  const epoch=this.#epoch,check=()=>{if(this.#wanted||epoch!==this.#epoch||!this.#closed&&this.#status!=='offline')throw new SharedRelayError('relay_recovery_in_use');};
  await this.#work.wait(check);
 }
 /** Deliberate offline mode cancels queued (not yet admitted) remote frames. */
 disconnect():void{if(this.#closed)return;this.#wanted=false;clearTimeout(this.#retry);this.#retry=undefined;this.#stop();this.#status="offline";this.#error=null;this.#rejectWaiters(new SharedRelayError("disconnected"));this.#notify();}
 /** Stops networking only. Close the persistent session separately after its final local save. */
 dispose():void{if(this.#closed)return;this.disconnect();this.#closed=true;this.#status="closed";this.#unsubscribe();this.#presence?.dispose();this.#work.retire(()=>attached.delete(this.#core));this.#notify();queueMicrotask(()=>this.#listeners.clear());}
}
/** Named immutable document-family adapter; never reuses the original checkpoint validator. */
export function createSharedDocumentRelaySync(core:SharedRichEditor<"document-v1">,options:SharedDocumentRelayOptions):SharedRelaySync<"document-v1">{return new SharedRelaySync(core,options);}

const nativeSubscribeIntrinsic=SharedRichEditor.prototype.subscribe,nativeDisposeIntrinsic=SharedRelaySync.prototype.dispose,nativeDrainIntrinsic=SharedRelaySync.prototype.waitForDisconnected;
