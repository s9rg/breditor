/** Explicit authenticated commit transport. Configuration performs no IO or mutation. */
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {accountToken} from '../relay/registration.js';
import {readGenerationControlResponse} from '../generation_recovery_control/response.js';
import {nativeActivationSelection,nativeActivationReceipt} from './identity.js';
import {activationEndpoint,activationFailure as fail,SharedNativeActivationError,MAX_SHARED_NATIVE_ACTIVATION_CONTROL_BYTES} from './policy.js';
import type {SharedDurableNativeActivationSelection,SharedDurableNativeActivationReceipt,SharedDurableNativeActivationHostOptions} from './contract.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const isAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,abort=AbortController.prototype.abort;
interface State {readonly endpoint:string;readonly expected:SharedDurableNativeActivationSelection;readonly principal:string;readonly getToken:SharedDurableNativeActivationHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedDurableNativeActivationHost)=>Readonly<{selection:SharedDurableNativeActivationSelection;commit:(heldCheck?:()=>void,heldSignal?:AbortSignal)=>Promise<SharedDurableNativeActivationReceipt>;check:()=>void}>;
/** Private brand check for the later held-room coordinator. Copied values never supply this port. */
export function nativeActivationHostPort(host:SharedDurableNativeActivationHost){return port(host);}
export class SharedDurableNativeActivationHost {
 readonly #state:State;
 private constructor(token:object,state:State){if(token!==key)throw fail('activation_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('activation_policy');return Object.freeze({selection:host.#state.expected,commit:(heldCheck?:()=>void,heldSignal?:AbortSignal)=>host.#commit(heldCheck,heldSignal),check:()=>host.#guard()});};}
 /** Select a real endpoint and independent Native choice. Does not contact or activate it. */
 static configure(provided:SharedDurableNativeActivationHostOptions):SharedDurableNativeActivationHost {
  try{const r=fields(provided,['endpoint','expected','principal','getToken','checkAuthority'],['signal','requestTimeoutMs']),endpoint=activationEndpoint(r['endpoint']),expected=nativeActivationSelection(r['expected']),principal=r['principal'],getToken=r['getToken'],milliseconds=r['requestTimeoutMs']??15000;
   if(typeof principal!=='string'||!principal||principal.length>128||!/^[\x20-\x7e]+$/.test(principal)||typeof getToken!=='function'||typeof milliseconds!=='number'||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>60000)throw fail('activation_policy');
   const signal=r['signal'] as AbortSignal|undefined;if(signal!==undefined)isAborted.call(signal);
   return new SharedDurableNativeActivationHost(key,{endpoint,expected,principal,getToken:getToken as State['getToken'],authority:participantAuthority(r['checkAuthority'] as ()=>void),signal,milliseconds,closed:false,active:undefined});
  }catch{throw fail('activation_policy');}
 }
 selection():SharedDurableNativeActivationSelection{return this.#state.expected;}
 #guard(heldCheck?:()=>void):void {const s=this.#state;if(s.closed)throw fail('activation_closed');if(s.signal&&isAborted.call(s.signal)||s.active&&isAborted.call(s.active.signal))throw fail('activation_cancelled');try{s.authority();}catch{throw fail('activation_authority');}if(s.closed)throw fail('activation_closed');if(s.signal&&isAborted.call(s.signal)||s.active&&isAborted.call(s.active.signal))throw fail('activation_cancelled');if(heldCheck){try{heldCheck();}catch{throw fail('activation_authority');}if(s.closed)throw fail('activation_closed');if(s.signal&&isAborted.call(s.signal)||s.active&&isAborted.call(s.active.signal))throw fail('activation_cancelled');}}
 /** No automatic retry. Once fetch may have begun, every incomplete outcome is
  * explicitly uncertain. Keep the durable intent and all offline/source bytes. */
 commit():Promise<SharedDurableNativeActivationReceipt>{return this.#commit();}
 #commit(heldCheck?:()=>void,heldSignal?:AbortSignal):Promise<SharedDurableNativeActivationReceipt>{
  const s=this.#state;if(s.closed)return Promise.reject(fail('activation_closed'));if(s.active)return Promise.reject(fail('activation_busy'));
  const controller=new AbortController();s.active=controller;
  return Promise.resolve().then(()=>this.#request(controller,heldCheck,heldSignal)).finally(()=>{s.active=undefined;});
 }
 async #request(controller:AbortController,heldCheck:(()=>void)|undefined,heldSignal:AbortSignal|undefined):Promise<SharedDurableNativeActivationReceipt>{
  const s=this.#state;let begun=false,response:Response|undefined,timer:ReturnType<typeof setTimeout>|undefined,watched:AbortSignal[]=[];
  const cancel=()=>abort.call(controller);
  try{
   for(const signal of new Set([s.signal,heldSignal]))if(signal){watched.push(signal);add.call(signal,'abort',cancel,{once:true});if(isAborted.call(signal))cancel();}
   timer=setTimeout(cancel,s.milliseconds);this.#guard(heldCheck);
   const token=await accountToken(s.getToken,controller.signal,s.milliseconds);this.#guard(heldCheck);
   const body=JSON.stringify(s.expected);this.#guard(heldCheck);begun=true;
   response=await fetch(s.endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Breditor-Principal':s.principal,'Content-Type':'application/json'},body,signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
   this.#guard(heldCheck);if(response.status!==200)throw fail('activation_outcome_unknown');
   const text=await readGenerationControlResponse(response,MAX_SHARED_NATIVE_ACTIVATION_CONTROL_BYTES);this.#guard(heldCheck);const receipt=nativeActivationReceipt(text,s.expected);this.#guard(heldCheck);return receipt;
  }catch(error){if(begun)throw fail('activation_outcome_unknown');try{this.#guard(heldCheck);}catch(current){throw current;}if(error instanceof SharedNativeActivationError)throw error;throw fail('activation_transfer');}
  finally{
   let refused=false;
   if(timer!==undefined)clearTimeout(timer);
   for(const signal of watched)try{remove.call(signal,'abort',cancel);}catch{refused=true;}
   try{abort.call(controller);}catch{refused=true;}
   try{if(response?.body&&!response.bodyUsed)await response.body.cancel();}catch{refused=true;}
   if(refused)throw fail(begun?'activation_outcome_unknown':'activation_transfer');
  }
 }
 /** Stop this SDK requester. The actual server worker may still commit. */
 close():void{this.#state.closed=true;if(this.#state.active)abort.call(this.#state.active);}
}
