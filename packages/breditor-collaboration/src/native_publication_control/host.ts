/** Authenticated Native publication transport. Construction performs no network IO. */
import {fields} from '../physical_room_record_cut/policy.js';
import {participantAuthority} from '../participant_backup/policy.js';
import {accountToken} from '../relay/registration.js';
import {readGenerationControlResponse} from '../generation_recovery_control/response.js';
import {nativePublicationSelection,nativePublicationRequest,nativePublicationReceipt} from './identity.js';
import {publicationEndpoint,publicationFailure as fail,SharedNativePublicationError,MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES} from './policy.js';
import type {SharedNativeRoomPublicationSelection,SharedNativeRoomPublicationRequest,SharedNativeRoomPublicationBinding,SharedNativeRoomPublicationReceipt,SharedNativeRoomPublicationHostOptions} from './contract.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
const isAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!,abort=AbortController.prototype.abort;
interface State {readonly endpoint:string;readonly expected:SharedNativeRoomPublicationSelection;readonly principal:string;readonly getToken:SharedNativeRoomPublicationHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedNativeRoomPublicationHost)=>Readonly<{selection:SharedNativeRoomPublicationSelection;publish:(joint:SharedNativeRoomPublicationBinding,heldCheck?:()=>void,heldSignal?:AbortSignal)=>Promise<SharedNativeRoomPublicationReceipt>;check:()=>void}>;
/** SDK-private actual requester port. Copied selections cannot supply this brand. */
export function nativePublicationHostPort(host:SharedNativeRoomPublicationHost){return port(host);}
export class SharedNativeRoomPublicationHost {
 readonly #state:State;
 private constructor(token:object,state:State){if(token!==key)throw fail('publication_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('publication_policy');return Object.freeze({selection:host.#state.expected,publish:(joint:SharedNativeRoomPublicationBinding,check?:()=>void,signal?:AbortSignal)=>host.#publish(joint,check,signal),check:()=>host.#guard()});};}
 static configure(provided:SharedNativeRoomPublicationHostOptions):SharedNativeRoomPublicationHost {
  try{const r=fields(provided,['endpoint','expected','principal','getToken','checkAuthority'],['signal','requestTimeoutMs']),endpoint=publicationEndpoint(r['endpoint']),expected=nativePublicationSelection(r['expected']),principal=r['principal'],getToken=r['getToken'],milliseconds=r['requestTimeoutMs']??15000;
   if(typeof principal!=='string'||!principal||principal.length>128||!/^[\x20-\x7e]+$/.test(principal)||typeof getToken!=='function'||typeof milliseconds!=='number'||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>60000)throw fail('publication_policy');
   const signal=r['signal'] as AbortSignal|undefined;if(signal!==undefined)isAborted.call(signal);
   return new SharedNativeRoomPublicationHost(key,{endpoint,expected,principal,getToken:getToken as State['getToken'],authority:participantAuthority(r['checkAuthority'] as ()=>void),signal,milliseconds,closed:false,active:undefined});
  }catch{throw fail('publication_policy');}
 }
 selection():SharedNativeRoomPublicationSelection{return this.#state.expected;}
 #guard(check?:(()=>void)):void {const s=this.#state;if(s.closed)throw fail('publication_closed');if(s.signal&&isAborted.call(s.signal)||s.active&&isAborted.call(s.active.signal))throw fail('publication_cancelled');try{s.authority();}catch{throw fail('publication_authority');}if(s.closed)throw fail('publication_closed');if(s.signal&&isAborted.call(s.signal)||s.active&&isAborted.call(s.active.signal))throw fail('publication_cancelled');if(check){try{check();}catch{throw fail('publication_authority');}if(s.closed)throw fail('publication_closed');if(s.signal&&isAborted.call(s.signal)||s.active&&isAborted.call(s.active.signal))throw fail('publication_cancelled');}}
 /** Retain a complete intent before calling. No automatic retry or local readiness grant. */
 publish(joint:SharedNativeRoomPublicationBinding):Promise<SharedNativeRoomPublicationReceipt>{return this.#publish(joint);}
 #publish(joint:SharedNativeRoomPublicationBinding,heldCheck?:()=>void,heldSignal?:AbortSignal):Promise<SharedNativeRoomPublicationReceipt>{
  const s=this.#state;if(s.closed)return Promise.reject(fail('publication_closed'));if(s.active)return Promise.reject(fail('publication_busy'));
  const controller=new AbortController();s.active=controller;
  return Promise.resolve().then(()=>this.#request(controller,joint,heldCheck,heldSignal)).finally(()=>{s.active=undefined;});
 }
 async #request(controller:AbortController,joint:SharedNativeRoomPublicationBinding,heldCheck:(()=>void)|undefined,heldSignal:AbortSignal|undefined):Promise<SharedNativeRoomPublicationReceipt>{
  const s=this.#state;let begun=false,response:Response|undefined,timer:ReturnType<typeof setTimeout>|undefined;const watched:AbortSignal[]=[],cancel=()=>abort.call(controller);
  try{
   for(const signal of new Set([s.signal,heldSignal]))if(signal){watched.push(signal);add.call(signal,'abort',cancel,{once:true});if(isAborted.call(signal))cancel();}
   timer=setTimeout(cancel,s.milliseconds);this.#guard(heldCheck);const request:SharedNativeRoomPublicationRequest=nativePublicationRequest(s.expected,joint);this.#guard(heldCheck);
   const token=await accountToken(s.getToken,controller.signal,s.milliseconds);this.#guard(heldCheck);const body=JSON.stringify(request);this.#guard(heldCheck);begun=true;
   response=await fetch(s.endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Breditor-Principal':s.principal,'Content-Type':'application/json'},body,signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
   this.#guard(heldCheck);if(response.status!==200)throw fail('publication_outcome_unknown');const text=await readGenerationControlResponse(response,MAX_SHARED_NATIVE_PUBLICATION_CONTROL_BYTES);this.#guard(heldCheck);const receipt=nativePublicationReceipt(text,request);this.#guard(heldCheck);return receipt;
  }catch(error){if(begun)throw fail('publication_outcome_unknown',error);try{this.#guard(heldCheck);}catch(current){throw current;}if(error instanceof SharedNativePublicationError)throw error;throw fail('publication_transfer');}
  finally{let refused=false;if(timer!==undefined)clearTimeout(timer);for(const signal of watched)try{remove.call(signal,'abort',cancel);}catch{refused=true;}try{abort.call(controller);}catch{refused=true;}try{if(response?.body&&!response.bodyUsed)await response.body.cancel();}catch{refused=true;}if(refused)throw fail(begun?'publication_outcome_unknown':'publication_transfer');}
 }
 /** Stops this requester. An already admitted Native worker may still publish. */
 close():void{this.#state.closed=true;if(this.#state.active)abort.call(this.#state.active);}
}
