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
const key=Object.freeze({});
interface State {readonly endpoint:string;readonly expected:SharedPhysicalRecoveryControlSelection;readonly principal:string;readonly getToken:SharedPhysicalRecoveryHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedPhysicalRoomRecoveryHost)=>Readonly<{selection:SharedPhysicalRecoveryControlSelection;check:(signal?:AbortSignal)=>Promise<void>;checkAssets:(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal)=>Promise<SharedPhysicalRecoveryAssetRead>}>;
/** Internal brand-checked native-check port; public prototype overrides cannot manufacture it. */
export function physicalRecoveryHostPort(host:SharedPhysicalRoomRecoveryHost){return port(host);}
export class SharedPhysicalRoomRecoveryHost {
 readonly #state:State;
 private constructor(token:object,state:State){if(token!==key)throw fail('control_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('control_policy');return Object.freeze({selection:host.#state.expected,check:(signal?:AbortSignal)=>host.#run(signal),checkAssets:(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal)=>host.#assets(input,signal)});};}
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
 #local(signal?:AbortSignal):void {const s=this.#state;if(s.closed)throw fail('control_closed');if(s.signal?.aborted||signal?.aborted||s.active?.signal.aborted)throw fail('control_cancelled');}
 #guard(signal?:AbortSignal):void {this.#local(signal);try{this.#state.authority();}catch{throw fail('control_authority');}this.#local(signal);}
 /** Reauthenticate the separately configured operator and recheck actual native/provider owners.
  * This is a point-in-time server-scope check, not client/outbox closure or an activation grant. */
 check(signal?:AbortSignal):Promise<void>{return this.#run(signal);}
 /** Actual server/provider bytes for declared bindings and whole-upload IDs. Does not authenticate
  * caller metadata as a genuine client capture, settle its queue or authorize activation. */
 checkAssets(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal):Promise<SharedPhysicalRecoveryAssetRead>{return this.#assets(input,signal);}
 #assets(input:SharedPhysicalRecoveryAssetRequirements,signal?:AbortSignal):Promise<SharedPhysicalRecoveryAssetRead>{return this.#request(signal,async()=>{
  const request=await preparePhysicalAssetRequest(this.#state.expected,input);return{endpoint:physicalAssetEndpoint(this.#state.endpoint),body:request.body,maximum:MAX_PHYSICAL_RECOVERY_ASSET_BYTES,admit:(text:string)=>readPhysicalAssetReceipt(text,this.#state.expected,request.sha256,request.requirements)};
 });}
 #run(signal?:AbortSignal):Promise<void>{return this.#request(signal,async()=>({endpoint:this.#state.endpoint,body:JSON.stringify(this.#state.expected),maximum:MAX_PHYSICAL_RECOVERY_CONTROL_BYTES,admit:(text:string)=>checkPhysicalControlReceipt(text,this.#state.expected)}));}
 async #request<T>(signal:AbortSignal|undefined,prepare:()=>Promise<{endpoint:string;body:string;maximum:number;admit:(text:string)=>T}>):Promise<T>{
  const s=this.#state;if(s.closed)throw fail('control_closed');if(s.active)throw fail('control_busy');
  const controller=new AbortController();s.active=controller;const abort=()=>controller.abort();
  s.signal?.addEventListener('abort',abort,{once:true});signal?.addEventListener('abort',abort,{once:true});if(s.signal?.aborted||signal?.aborted)abort();const timer=setTimeout(abort,s.milliseconds);
  let response:Response|undefined;
  try{
   this.#guard(signal);const request=await prepare();this.#guard(signal);const token=await accountToken(s.getToken,controller.signal,s.milliseconds);this.#guard(signal);
   response=await fetch(request.endpoint,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'X-Breditor-Principal':s.principal,'Content-Type':'application/json'},body:request.body,signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});this.#guard(signal);
   if(response.status!==200){await response.body?.cancel().catch(()=>{});throw fail(response.status===403?'control_permission':[429,503].includes(response.status)?'control_unavailable':'control_protocol');}
   const text=await readPhysicalControlResponse(response,request.maximum);this.#guard(signal);const result=request.admit(text);this.#guard(signal);return result;
  }catch(error){if(error instanceof SharedPhysicalRecoveryControlError)throw error;this.#local(signal);throw fail('control_transfer');}
  finally{clearTimeout(timer);s.signal?.removeEventListener('abort',abort);signal?.removeEventListener('abort',abort);controller.abort();if(response?.body&&!response.bodyUsed)await response.body.cancel().catch(()=>{});s.active=undefined;}
 }
 /** Stop only this checker and abort its request. Does not stop the native host or close clients. */
 close():void{this.#state.closed=true;this.#state.active?.abort();}
}
