/** Genuine live operator checks, never a saved/returned verified flag or service activation. */
import {participantAuthority} from '../participant_backup/policy.js';
import {accountToken} from '../relay/registration.js';
import {physicalControlSelection,checkPhysicalControlReceipt} from './identity.js';
import {readPhysicalControlResponse} from './response.js';
import {controlEndpoint,controlFailure as fail,SharedPhysicalRecoveryControlError} from './policy.js';
import type {SharedPhysicalRecoveryHostOptions,SharedPhysicalRecoveryControlSelection} from './contract.js';
import {MAX_PHYSICAL_RECOVERY_CONTROL_BYTES} from './policy.js';
import {MAX_PHYSICAL_RECOVERY_ASSET_BYTES,type SharedPhysicalRecoveryAssetRequirements,type SharedPhysicalRecoveryAssetRead} from './asset_contract.js';
import {preparePhysicalAssetRequest,physicalAssetEndpoint} from './asset_requirements.js';
import {readPhysicalAssetReceipt} from './asset_response.js';
import {MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES,type SharedPhysicalRecoveryAcceptedRequest,type SharedPhysicalRecoveryAcceptedRead} from './accepted_contract.js';
import {physicalAcceptedChoices,preparePhysicalAcceptedRequest,physicalAcceptedEndpoint} from './accepted_request.js';
import {readPhysicalAcceptedNative} from './accepted_response.js';
import {MAX_ORIGINAL_REVIEW_RESPONSE_BYTES,type OriginalReviewQuery,type OriginalReviewRead} from '../original_review_authorizations/contract.js';
import {originalReviewChoices,prepareOriginalReviewRequest,originalReviewEndpoint} from '../original_review_authorizations/request.js';
import {readOriginalReviewResponse} from '../original_review_authorizations/response.js';
const key=Object.freeze({}),addListener=EventTarget.prototype.addEventListener,removeListener=EventTarget.prototype.removeEventListener,readAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
function aborted(signal:AbortSignal|undefined):boolean{return signal?readAborted.call(signal):false;}
interface State {readonly endpoint:string;readonly expected:SharedPhysicalRecoveryControlSelection;readonly principal:string;readonly getToken:SharedPhysicalRecoveryHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedPhysicalRoomRecoveryHost)=>Readonly<{selection:SharedPhysicalRecoveryControlSelection;check:(signal?:AbortSignal)=>Promise<void>;checkAssets:(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal)=>Promise<SharedPhysicalRecoveryAssetRead>;readAcceptedNative:(input:SharedPhysicalRecoveryAcceptedRequest,signal?:AbortSignal)=>Promise<SharedPhysicalRecoveryAcceptedRead>;readOriginalReview:(input:OriginalReviewQuery,signal?:AbortSignal)=>Promise<OriginalReviewRead>}>;
/** Internal brand-checked native-check port; public prototype overrides cannot manufacture it. */
export function physicalRecoveryHostPort(host:SharedPhysicalRoomRecoveryHost){return port(host);}
export class SharedPhysicalRoomRecoveryHost {
 readonly #state:State;
 private constructor(token:object,state:State){if(token!==key)throw fail('control_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('control_policy');return Object.freeze({selection:host.#state.expected,check:(signal?:AbortSignal)=>host.#run(signal),checkAssets:(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal)=>host.#assets(input,signal),readAcceptedNative:(input:SharedPhysicalRecoveryAcceptedRequest,signal?:AbortSignal)=>host.#accepted(input,signal),readOriginalReview:(input:OriginalReviewQuery,signal?:AbortSignal)=>host.#originalReview(input,signal)});};}
 /** Independently selected caller endpoint/pins and fresh operator auth; no archive-selected policy. */
 static async open(supplied:SharedPhysicalRecoveryHostOptions):Promise<SharedPhysicalRoomRecoveryHost>{
  let host:SharedPhysicalRoomRecoveryHost|undefined;
  try{
   const options={...supplied},expected=physicalControlSelection(options.expected),endpoint=controlEndpoint(options.endpoint),principal=options.principal,getToken=options.getToken,milliseconds=options.requestTimeoutMs??15000;
   if(typeof principal!=='string'||!principal||principal.length>128||!/^[\x20-\x7e]+$/.test(principal)||typeof getToken!=='function'||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>60000)throw fail('control_policy');
   const authority=participantAuthority(options.checkAuthority);
   host=new SharedPhysicalRoomRecoveryHost(key,{endpoint,expected,principal,getToken,authority,signal:options.signal,milliseconds,closed:false,active:undefined});
   await host.#run();return host;
  }catch(error){host?.close();if(error instanceof SharedPhysicalRecoveryControlError)throw error;throw fail('control_policy');}
 }
 /** Detached metadata survives close; it grants no current native/provider authority. */
 selection():SharedPhysicalRecoveryControlSelection{return this.#state.expected;}
 #local(signal?:AbortSignal):void {const s=this.#state;if(s.closed)throw fail('control_closed');if(aborted(s.signal)||aborted(signal)||aborted(s.active?.signal))throw fail('control_cancelled');}
 #guard(signal?:AbortSignal):void {this.#local(signal);try{this.#state.authority();}catch{throw fail('control_authority');}this.#local(signal);}
 /** Reauthenticate the separately configured operator and recheck actual native/provider owners.
  * This is a point-in-time server-scope check, not client/outbox closure or an activation grant. */
 check(signal?:AbortSignal):Promise<void>{return this.#run(signal);}
 /** Actual server/provider bytes for declared bindings and whole-upload IDs. Does not authenticate
  * caller metadata as a genuine client capture, settle its queue or authorize activation. */
 checkAssets(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal):Promise<SharedPhysicalRecoveryAssetRead>{return this.#assets(input,signal);}
 /** Transfer only accepted server-native payloads at the exact selected cut.
  * Does not apply them, acknowledge offline work, adopt comments or activate.
  * Returned reader roles must never replace a recipient's current permissions. */
 readAcceptedNative(input:SharedPhysicalRecoveryAcceptedRequest,signal?:AbortSignal):Promise<SharedPhysicalRecoveryAcceptedRead>{return this.#accepted(input,signal);}
 /** SDK-private original historical rights. No public prototype override can replace this read. */
 #originalReview(input:OriginalReviewQuery,signal?:AbortSignal):Promise<OriginalReviewRead>{
  let query!:OriginalReviewQuery;
  return this.#request(signal,async()=>{const request=await prepareOriginalReviewRequest(this.#state.expected,query);return{endpoint:originalReviewEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_ORIGINAL_REVIEW_RESPONSE_BYTES,admit:(text:string)=>readOriginalReviewResponse(text,this.#state.expected,request.sha256,query)};},()=>{query=originalReviewChoices(input);});
 }
 #accepted(input:SharedPhysicalRecoveryAcceptedRequest,signal?:AbortSignal):Promise<SharedPhysicalRecoveryAcceptedRead>{
  let choices!:SharedPhysicalRecoveryAcceptedRequest;
  return this.#request(signal,async()=>{const request=await preparePhysicalAcceptedRequest(this.#state.expected,choices);return{endpoint:physicalAcceptedEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_PHYSICAL_RECOVERY_ACCEPTED_BYTES,admit:(text:string)=>readPhysicalAcceptedNative(text,this.#state.expected,request.sha256,choices)};},()=>{choices=physicalAcceptedChoices(input);});
 }
 #assets(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal):Promise<SharedPhysicalRecoveryAssetRead>{return this.#request(signal,async()=>{
  const request=await preparePhysicalAssetRequest(this.#state.expected,input);return{endpoint:physicalAssetEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_PHYSICAL_RECOVERY_ASSET_BYTES,admit:(text:string)=>readPhysicalAssetReceipt(text,this.#state.expected,request.sha256,request.requirements)};
 });}
 #run(signal?:AbortSignal):Promise<void>{return this.#request(signal,async()=>({endpoint:this.#state.endpoint,body:JSON.stringify(this.#state.expected),maximum:MAX_PHYSICAL_RECOVERY_CONTROL_BYTES,admit:(text:string)=>checkPhysicalControlReceipt(text,this.#state.expected)}));}
 async #request<T>(signal:AbortSignal|undefined,prepare:()=>Promise<{endpoint:string;body:string;maximum:number;admit:(text:string)=>T}>,detach?:()=>void):Promise<T>{
  const s=this.#state;if(s.closed)throw fail('control_closed');if(s.active)throw fail('control_busy');
  const controller=new AbortController();s.active=controller;const abort=()=>controller.abort();
  // New accepted-transfer data snapshots run under the real request reservation,
  // but precede permission callbacks and signal hooks. Old requests keep timing.
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
   const text=await readPhysicalControlResponse(response,request.maximum);this.#guard(signal);const result=request.admit(text);this.#guard(signal);return result;
  }catch(error){if(error instanceof SharedPhysicalRecoveryControlError)throw error;try{this.#local(signal);}catch(local){if(local instanceof SharedPhysicalRecoveryControlError)throw local;}throw fail('control_transfer');}
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
