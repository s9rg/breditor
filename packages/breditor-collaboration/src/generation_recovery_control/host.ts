import {prepareNativeDependencyRequest,nativeDependencyEndpoint} from '../server_native_dependencies/request.js';
import {readNativeDependencyResponse} from '../server_native_dependencies/response.js';
import {MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES,type SelectedServerNativeDependencies} from '../server_native_dependencies/contract.js';
import {MAX_SERVER_METADATA_PACKET_RESPONSE_BYTES,type OriginalMetadataPacketQuery,type SelectedServerMetadataPacketRead} from '../server_metadata_read/packet_contract.js';
import {metadataPacketQuery} from '../server_metadata_read/packet_query.js';
import {prepareMetadataPacketRequest,metadataPacketEndpoint} from '../server_metadata_read/packet_request.js';
import {readMetadataPacketResponse,verifyMetadataPacketBytes} from '../server_metadata_read/packet_response.js';
import {MAX_SERVER_METADATA_PAGE_BYTES,type OriginalMetadataQuery,type SelectedServerMetadataRead} from '../server_metadata_read/contract.js';
import {metadataQuery} from '../server_metadata_read/policy.js';
import {prepareMetadataRequest,metadataEndpoint} from '../server_metadata_read/request.js';
import {readMetadataResponse} from '../server_metadata_read/response.js';
/** Genuine live operator checks, never a saved/returned verified flag or service activation. */
import {participantAuthority} from '../participant_backup/policy.js';
import {accountToken} from '../relay/registration.js';
import {generationControlSelection,checkGenerationControlReceipt} from './identity.js';
import {readGenerationControlResponse} from './response.js';
import {controlEndpoint,controlFailure as fail,SharedServerLogGenerationRecoveryControlError} from './policy.js';
import type {SharedServerLogGenerationRecoveryHostOptions,SharedServerLogGenerationRecoveryControlSelection} from './contract.js';
import {MAX_SERVER_GENERATION_RECOVERY_CONTROL_BYTES} from './policy.js';
import {MAX_SERVER_GENERATION_RECOVERY_ASSET_BYTES,type SharedServerLogGenerationRecoveryAssetRequirements,type SharedServerLogGenerationRecoveryAssetRead} from './asset_contract.js';
import {prepareGenerationAssetRequest,generationAssetEndpoint} from './asset_requirements.js';
import {readGenerationAssetReceipt} from './asset_response.js';
import {MAX_SERVER_GENERATION_RECOVERY_ACCEPTED_BYTES,type SharedServerLogGenerationRecoveryAcceptedRequest,type SharedServerLogGenerationRecoveryAcceptedRead} from './accepted_contract.js';
import {generationAcceptedChoices,prepareGenerationAcceptedRequest,generationAcceptedEndpoint} from './accepted_request.js';
import {readGenerationAcceptedNative} from './accepted_response.js';
import {MAX_GENERATION_ORIGINAL_REVIEW_RESPONSE_BYTES,type GenerationOriginalReviewQuery,type GenerationOriginalReviewRead} from './original_review_contract.js';
import {generationOriginalReviewChoices,prepareGenerationOriginalReviewRequest,generationOriginalReviewEndpoint} from './original_review_request.js';
import {readGenerationOriginalReviewResponse} from './original_review_response.js';
const key=Object.freeze({}),addListener=EventTarget.prototype.addEventListener,removeListener=EventTarget.prototype.removeEventListener,readAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
function aborted(signal:AbortSignal|undefined):boolean{return signal?readAborted.call(signal):false;}
interface State {readonly endpoint:string;readonly expected:SharedServerLogGenerationRecoveryControlSelection;readonly principal:string;readonly getToken:SharedServerLogGenerationRecoveryHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedServerLogGenerationRecoveryHost)=>Readonly<{selection:SharedServerLogGenerationRecoveryControlSelection;check:(signal?:AbortSignal)=>Promise<void>;checkAssets:(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal)=>Promise<SharedServerLogGenerationRecoveryAssetRead>;readAcceptedNative:(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal)=>Promise<SharedServerLogGenerationRecoveryAcceptedRead>;readMetadata:(input:OriginalMetadataQuery,signal?:AbortSignal)=>Promise<SelectedServerMetadataRead<SharedServerLogGenerationRecoveryControlSelection>>;readMetadataPacket:(input:OriginalMetadataPacketQuery,signal?:AbortSignal)=>Promise<SelectedServerMetadataPacketRead<SharedServerLogGenerationRecoveryControlSelection>>;readNativeDependencies:(signal?:AbortSignal)=>Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>;readOriginalReview:(input:GenerationOriginalReviewQuery,signal?:AbortSignal)=>Promise<GenerationOriginalReviewRead>}>;
/** Internal brand-checked native-check port; public prototype overrides cannot manufacture it. */
export function generationRecoveryHostPort(host:SharedServerLogGenerationRecoveryHost){return port(host);}
export class SharedServerLogGenerationRecoveryHost {
 readonly #state:State;
 private constructor(token:object,state:State){if(token!==key)throw fail('control_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('control_policy');return Object.freeze({selection:host.#state.expected,check:(signal?:AbortSignal)=>host.#run(signal),checkAssets:(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal)=>host.#assets(input,signal),readAcceptedNative:(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal)=>host.#accepted(input,signal),readMetadata:(input:OriginalMetadataQuery,signal?:AbortSignal)=>host.#metadata(input,signal),readMetadataPacket:(input:OriginalMetadataPacketQuery,signal?:AbortSignal)=>host.#metadataPacket(input,signal),readNativeDependencies:(signal?:AbortSignal)=>host.#nativeDependencies(signal),readOriginalReview:(input:GenerationOriginalReviewQuery,signal?:AbortSignal)=>host.#generationOriginalReview(input,signal)});};}
 /** Independently selected caller endpoint/pins and fresh operator auth; no archive-selected policy. */
 static async open(supplied:SharedServerLogGenerationRecoveryHostOptions):Promise<SharedServerLogGenerationRecoveryHost>{
  let host:SharedServerLogGenerationRecoveryHost|undefined;
  try{
   const options={...supplied},expected=generationControlSelection(options.expected),endpoint=controlEndpoint(options.endpoint),principal=options.principal,getToken=options.getToken,milliseconds=options.requestTimeoutMs??15000;
   if(typeof principal!=='string'||!principal||principal.length>128||!/^[\x20-\x7e]+$/.test(principal)||typeof getToken!=='function'||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>60000)throw fail('control_policy');
   const authority=participantAuthority(options.checkAuthority);
   host=new SharedServerLogGenerationRecoveryHost(key,{endpoint,expected,principal,getToken,authority,signal:options.signal,milliseconds,closed:false,active:undefined});
   await host.#run();return host;
  }catch(error){host?.close();if(error instanceof SharedServerLogGenerationRecoveryControlError)throw error;throw fail('control_policy');}
 }
 /** Detached metadata survives close; it grants no current native/provider authority. */
 selection():SharedServerLogGenerationRecoveryControlSelection{return this.#state.expected;}
 #local(signal?:AbortSignal):void {const s=this.#state;if(s.closed)throw fail('control_closed');if(aborted(s.signal)||aborted(signal)||aborted(s.active?.signal))throw fail('control_cancelled');}
 #guard(signal?:AbortSignal):void {this.#local(signal);try{this.#state.authority();}catch{throw fail('control_authority');}this.#local(signal);}
 /** Reauthenticate the separately configured operator and recheck actual native/provider owners.
  * This is a point-in-time server-scope check, not client/outbox closure or an activation grant. */
 check(signal?:AbortSignal):Promise<void>{return this.#run(signal);}
 /** Actual server/provider bytes for declared bindings and whole-upload IDs. Does not authenticate
  * caller metadata as a genuine client capture, settle its queue or authorize activation. */
 checkAssets(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal):Promise<SharedServerLogGenerationRecoveryAssetRead>{return this.#assets(input,signal);}
 /** Transfer only accepted server-native payloads at the exact selected cut.
  * Does not apply them, acknowledge offline work, adopt comments or activate.
  * Returned reader roles must never replace a recipient's current permissions. */
 readAcceptedNative(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal):Promise<SharedServerLogGenerationRecoveryAcceptedRead>{return this.#accepted(input,signal);}
 /** Read original metadata receipts and first-packet fingerprints at this exact
  * selected server cut. Reader permissions are descriptive server DATA only;
  * this never installs client receipts or acknowledges an offline queue. */
 readMetadata(input:OriginalMetadataQuery,signal?:AbortSignal):Promise<SelectedServerMetadataRead<SharedServerLogGenerationRecoveryControlSelection>>{return this.#metadata(input,signal);}
 /** Transfer the first accepted literal packet under this exact selected cut.
  * Byte verification does not acknowledge a local retry or replace recipient rights. */
 readMetadataPacket(input:OriginalMetadataPacketQuery,signal?:AbortSignal):Promise<SelectedServerMetadataPacketRead<SharedServerLogGenerationRecoveryControlSelection>>{return this.#metadataPacket(input,signal);}
 /** SDK-private original historical rights. No public prototype override can replace this read. */
 #generationOriginalReview(input:GenerationOriginalReviewQuery,signal?:AbortSignal):Promise<GenerationOriginalReviewRead>{
  let query!:GenerationOriginalReviewQuery;
  return this.#request(signal,async()=>{const request=await prepareGenerationOriginalReviewRequest(this.#state.expected,query);return{endpoint:generationOriginalReviewEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_GENERATION_ORIGINAL_REVIEW_RESPONSE_BYTES,admit:(text:string)=>readGenerationOriginalReviewResponse(text,this.#state.expected,request.sha256,query)};},()=>{query=generationOriginalReviewChoices(input);});
 }
 #accepted(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal):Promise<SharedServerLogGenerationRecoveryAcceptedRead>{
  let choices!:SharedServerLogGenerationRecoveryAcceptedRequest;
  return this.#request(signal,async()=>{const request=await prepareGenerationAcceptedRequest(this.#state.expected,choices);return{endpoint:generationAcceptedEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_SERVER_GENERATION_RECOVERY_ACCEPTED_BYTES,admit:(text:string)=>readGenerationAcceptedNative(text,this.#state.expected,request.sha256,choices)};},()=>{choices=generationAcceptedChoices(input);});
 }
 /** Complete server Native dependency DATA. Current client heads, queues,
  * account permissions and serving/activation rights remain separate. */
 readNativeDependencies(signal?:AbortSignal):Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>{return this.#nativeDependencies(signal);}
 #nativeDependencies(signal?:AbortSignal):Promise<SelectedServerNativeDependencies<SharedServerLogGenerationRecoveryControlSelection>>{
  return this.#request(signal,async()=>{let request:Awaited<ReturnType<typeof prepareNativeDependencyRequest>>;try{request=await prepareNativeDependencyRequest('server-log-generation-recovery',this.#state.expected);}catch{throw fail('control_policy');}
   return{endpoint:nativeDependencyEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_SERVER_NATIVE_DEPENDENCY_RESPONSE_BYTES,admit:(text:string)=>{try{return readNativeDependencyResponse(text,'server-log-generation-recovery',this.#state.expected,this.#state.expected.source.server.native,request.sha256,generationControlSelection);}catch{throw fail('control_protocol');}}};
  });
 }
 #metadata(input:OriginalMetadataQuery,signal?:AbortSignal):Promise<SelectedServerMetadataRead<SharedServerLogGenerationRecoveryControlSelection>>{
  let query!:OriginalMetadataQuery;
  return this.#request(signal,async()=>{
   let request:Awaited<ReturnType<typeof prepareMetadataRequest>>;
   try{request=await prepareMetadataRequest('server-log-generation-recovery',this.#state.expected,query);}catch{throw fail('control_policy');}
   return{endpoint:metadataEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_SERVER_METADATA_PAGE_BYTES,admit:(text:string)=>{try{return readMetadataResponse(text,'server-log-generation-recovery',this.#state.expected,request.sha256,query,this.#state.expected.source.server.native.source.document,generationControlSelection);}catch{throw fail('control_protocol');}}};
  },()=>{try{query=metadataQuery(input);}catch{throw fail('control_policy');}});
 }
 #metadataPacket(input:OriginalMetadataPacketQuery,signal?:AbortSignal):Promise<SelectedServerMetadataPacketRead<SharedServerLogGenerationRecoveryControlSelection>>{
  let query!:OriginalMetadataPacketQuery;
  return this.#request(signal,async()=>{
   let request:Awaited<ReturnType<typeof prepareMetadataPacketRequest>>;
   try{request=await prepareMetadataPacketRequest('server-log-generation-recovery',this.#state.expected,query);}catch{throw fail('control_policy');}
   return{endpoint:metadataPacketEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_SERVER_METADATA_PACKET_RESPONSE_BYTES,
    admit:(text:string)=>{try{return readMetadataPacketResponse(text,'server-log-generation-recovery',this.#state.expected,request.sha256,query,generationControlSelection);}catch{throw fail('control_protocol');}},
    verify:async(value:SelectedServerMetadataPacketRead<SharedServerLogGenerationRecoveryControlSelection>)=>{try{await verifyMetadataPacketBytes(value);}catch{throw fail('control_protocol');}}};
  },()=>{try{query=metadataPacketQuery(input);}catch{throw fail('control_policy');}});
 }
 #assets(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal):Promise<SharedServerLogGenerationRecoveryAssetRead>{return this.#request(signal,async()=>{
  const request=await prepareGenerationAssetRequest(this.#state.expected,input);return{endpoint:generationAssetEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_SERVER_GENERATION_RECOVERY_ASSET_BYTES,admit:(text:string)=>readGenerationAssetReceipt(text,this.#state.expected,request.sha256,request.requirements)};
 });}
 #run(signal?:AbortSignal):Promise<void>{return this.#request(signal,async()=>({endpoint:this.#state.endpoint,body:JSON.stringify(this.#state.expected),maximum:MAX_SERVER_GENERATION_RECOVERY_CONTROL_BYTES,admit:(text:string)=>checkGenerationControlReceipt(text,this.#state.expected)}));}
 async #request<T>(signal:AbortSignal|undefined,prepare:()=>Promise<{endpoint:string;body:string;maximum:number;admit:(text:string)=>T;verify?:(value:T)=>Promise<void>}>,detach?:()=>void):Promise<T>{
  const s=this.#state;if(s.closed)throw fail('control_closed');if(s.active)throw fail('control_busy');
  const controller=new AbortController();s.active=controller;const abort=()=>controller.abort();
  // New accepted-transfer data snapshots run under the real request reservation,
  // but precede permission callbacks and signal hooks.
  let response:Response|undefined,timer:ReturnType<typeof setTimeout>|undefined;const watched:AbortSignal[]=[];
  try{
   if(detach)detach();
   // Use genuine event methods, not mutable methods/getters on an application signal.
   // Setup itself is fallible and therefore belongs inside the reserved lifetime.
   for(const selected of [s.signal,signal])if(selected){watched.push(selected);addListener.call(selected,'abort',abort,{once:true});}
   if(aborted(s.signal)||aborted(signal))abort();timer=setTimeout(abort,s.milliseconds);
   this.#guard(signal);const request=await prepare();this.#guard(signal);const token=await accountToken(s.getToken,controller.signal,s.milliseconds);this.#guard(signal);
   response=await fetch(request.endpoint,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'X-Breditor-Principal':s.principal,'Content-Type':'application/json'},body:request.body,signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});this.#guard(signal);
   if(response.status!==200){await response.body?.cancel().catch(()=>{});throw fail(response.status===403?'control_permission':[429,503].includes(response.status)?'control_unavailable':'control_protocol');}
   const text=await readGenerationControlResponse(response,request.maximum);this.#guard(signal);const result=request.admit(text);if(request.verify)await request.verify(result);this.#guard(signal);return result;
  }catch(error){if(error instanceof SharedServerLogGenerationRecoveryControlError)throw error;try{this.#local(signal);}catch(local){if(local instanceof SharedServerLogGenerationRecoveryControlError)throw local;}throw fail('control_transfer');}
  finally{
   let cleanupFailed=false;
   try{
    if(timer!==undefined)clearTimeout(timer);
    for(const selected of watched)try{removeListener.call(selected,'abort',abort);}catch{cleanupFailed=true;}
    try{controller.abort();}catch{cleanupFailed=true;}
    try{if(response){const body=response.body;if(body&&!response.bodyUsed)await body.cancel().catch(()=>{});}}catch{cleanupFailed=true;}
   }finally{s.active=undefined;}
   // Cleanup uncertainty cannot publish success or leak a host exception, but
   // it must never strand the real busy reservation after the attempt finishes.
   if(cleanupFailed)throw fail('control_transfer');
  }
 }
 /** Stop only this checker and abort its request. Does not stop the native host or close clients. */
 close():void{this.#state.closed=true;this.#state.active?.abort();}
}
