import {controlCancellationReason,expireGenerationControl} from '../generation_recovery_control/cancellation.js';
/** Genuine whole ordered native path reads. Saved path JSON never grants editing or activation. */
import {participantAuthority} from '../participant_backup/policy.js';
import {accountToken} from '../relay/registration.js';
import {generationDeliveryRecoveryHostPort} from '../generation_delivery_control/host.js';
import {SharedServerLogGenerationDeliveryControlError} from '../generation_delivery_control/policy.js';
import {SharedServerLogGenerationRecoveryControlError} from '../generation_recovery_control/policy.js';
import {readGenerationControlResponse} from '../generation_recovery_control/response.js';
import {generationAssetRequirements} from '../generation_recovery_control/asset_requirements.js';
import {generationAcceptedChoices} from '../generation_recovery_control/accepted_request.js';
import {generationOriginalReviewChoices} from '../generation_recovery_control/original_review_request.js';
import type {SharedServerLogGenerationRecoveryAssetRequirements} from '../generation_recovery_control/asset_contract.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest} from '../generation_recovery_control/accepted_contract.js';
import type {GenerationOriginalReviewQuery} from '../generation_recovery_control/original_review_contract.js';
import {deliveryPathControlSelection,checkDeliveryPathControlReceipt} from './identity.js';
import {deliveryPathControlEndpoint,deliveryPathControlFailure as fail,SharedServerLogGenerationDeliveryPathControlError,MAX_SERVER_GENERATION_DELIVERY_PATH_CONTROL_BYTES as maximum} from './policy.js';
import type {SharedServerLogGenerationDeliveryPathRecoveryHostOptions,SharedServerLogGenerationDeliveryPathRecoveryControlSelection} from './contract.js';
import {checkHandoverDeliveryPathReceipt,handoverDeliveryPathSelection} from './handover.js';
import type {SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection,SharedServerLogGenerationHandoverDeliveryPathRecoveryHostOptions} from './handover.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,readAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const aborted=(signal:AbortSignal|undefined)=>signal?readAborted.call(signal):false;
interface State{readonly endpoint:string;readonly expected:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;readonly handover:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection|undefined;readonly current:ReturnType<typeof generationDeliveryRecoveryHostPort>;readonly principal:string;readonly getToken:SharedServerLogGenerationDeliveryPathRecoveryHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedServerLogGenerationDeliveryPathRecoveryHost)=>Readonly<{signals:readonly AbortSignal[];guard:(signal?:AbortSignal)=>void;selection:SharedServerLogGenerationDeliveryPathRecoveryControlSelection;handover:SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection|undefined;check:SharedServerLogGenerationDeliveryPathRecoveryHost['check'];checkAssets:SharedServerLogGenerationDeliveryPathRecoveryHost['checkAssets'];readAcceptedNative:SharedServerLogGenerationDeliveryPathRecoveryHost['readAcceptedNative'];readOriginalReview:(input:GenerationOriginalReviewQuery,signal?:AbortSignal)=>ReturnType<ReturnType<typeof generationDeliveryRecoveryHostPort>['readOriginalReview']>}>;
/** SDK-private brand-checked port. Public prototype overrides cannot replace any operation. */
export function generationDeliveryPathRecoveryHostPort(host:SharedServerLogGenerationDeliveryPathRecoveryHost){return port(host);}
export class SharedServerLogGenerationDeliveryPathRecoveryHost{
 readonly #state:State;readonly #ended=new AbortController();
 private constructor(token:object,state:State){if(token!==key)throw fail('path_control_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('path_control_policy');return Object.freeze({signals:Object.freeze([host.#ended.signal,...(host.#state.signal?[host.#state.signal]:[]),...host.#state.current.signals,]),guard:(signal?:AbortSignal)=>{host.#guard(signal);host.#state.current.guard(signal);host.#guard(signal);},selection:host.#state.expected,handover:host.#state.handover,check:(signal?:AbortSignal)=>host.#check(signal),checkAssets:(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal)=>host.#assets(input,signal),readAcceptedNative:(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal)=>host.#accepted(input,signal),readOriginalReview:(input:GenerationOriginalReviewQuery,signal?:AbortSignal)=>host.#originalReview(input,signal)});};}
 /** Explicit trusted endpoint/pins and genuine current checker; no saved verified flag. */
 static open(supplied:SharedServerLogGenerationDeliveryPathRecoveryHostOptions):Promise<SharedServerLogGenerationDeliveryPathRecoveryHost>{
  return SharedServerLogGenerationDeliveryPathRecoveryHost.#open(supplied,false);
 }
 /** Authenticate a separately selected path that crosses a sealed native handover. */
 static openHandover(supplied:SharedServerLogGenerationHandoverDeliveryPathRecoveryHostOptions):Promise<SharedServerLogGenerationDeliveryPathRecoveryHost>{
  return SharedServerLogGenerationDeliveryPathRecoveryHost.#open(supplied,true);
 }
 static async #open(
  supplied:SharedServerLogGenerationDeliveryPathRecoveryHostOptions|SharedServerLogGenerationHandoverDeliveryPathRecoveryHostOptions,
  acrossHandover:boolean,
 ):Promise<SharedServerLogGenerationDeliveryPathRecoveryHost>{
  let host:SharedServerLogGenerationDeliveryPathRecoveryHost|undefined;
  try{
   const options={...supplied};
   const handover=acrossHandover?handoverDeliveryPathSelection(options.expected):undefined;
   const expected=handover?.current??deliveryPathControlSelection(options.expected);
   const endpoint=deliveryPathControlEndpoint(options.endpoint,acrossHandover);
   const current=generationDeliveryRecoveryHostPort(options.current),principal=options.principal,getToken=options.getToken;
   const milliseconds=options.requestTimeoutMs??15000;
   if(JSON.stringify(current.selection)!==JSON.stringify(expected.current)||typeof principal!=='string'||!principal||
    principal.length>128||!/^[\x20-\x7e]+$/.test(principal)||typeof getToken!=='function'||
    !Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>60000)throw fail('path_control_policy');
   host=new SharedServerLogGenerationDeliveryPathRecoveryHost(key,{
    endpoint,expected,handover,current,principal,getToken,authority:participantAuthority(options.checkAuthority),
    signal:options.signal,milliseconds,closed:false,active:undefined,
   });
   await host.#check();
   return host;
  }catch(error){
   host?.close();
   if(error instanceof SharedServerLogGenerationDeliveryPathControlError)throw error;
   throw fail('path_control_policy');
  }
 }
 /** Detached whole-path/current pins survive close; they grant no ownership or receipt. */
 selection():SharedServerLogGenerationDeliveryPathRecoveryControlSelection{return this.#state.expected;}
 /** Exact detached handover pins when this checker was opened across a handover. */
 handoverSelection():SharedServerLogGenerationHandoverDeliveryPathRecoveryControlSelection|undefined{return this.#state.handover;}
 #local(signal?:AbortSignal){const s=this.#state;if(s.closed)throw fail('path_control_closed');const reason=controlCancellationReason(s.active?.signal)??controlCancellationReason(s.signal)??controlCancellationReason(signal);if(reason)throw fail('path_control_cancelled',reason);}
 #guard(signal?:AbortSignal){this.#local(signal);try{this.#state.authority();}catch{throw fail('path_control_authority');}this.#local(signal);}
 async #wire(signal:AbortSignal){this.#guard(signal);const s=this.#state,token=await accountToken(s.getToken,signal,s.milliseconds);this.#guard(signal);let response:Response|undefined;try{const body=JSON.stringify(s.handover??s.expected);if(new TextEncoder().encode(body).length>maximum)throw fail('path_control_policy');response=await fetch(s.endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Breditor-Principal':s.principal,'Content-Type':'application/json'},body,signal,credentials:'omit',redirect:'error',cache:'no-store'});this.#guard(signal);if(response.status!==200){await response.body?.cancel().catch(()=>{});throw fail(response.status===403?'path_control_permission':[429,503].includes(response.status)?'path_control_unavailable':'path_control_protocol');}const text=await readGenerationControlResponse(response,maximum);this.#guard(signal);if(s.handover)checkHandoverDeliveryPathReceipt(text,s.handover);else checkDeliveryPathControlReceipt(text,s.expected);}finally{if(response?.body&&!response.bodyUsed)await response.body.cancel().catch(()=>{});}}
 async #run<T>(signal:AbortSignal|undefined,delegate:(signal:AbortSignal)=>Promise<T>,detach?:()=>void):Promise<T>{const s=this.#state;if(s.closed)throw fail('path_control_closed');if(s.active)throw fail('path_control_busy');const controller=new AbortController();s.active=controller;const cancel=()=>controller.abort(),watched:AbortSignal[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
  try{detach?.();for(const selected of [s.signal,signal])if(selected){watched.push(selected);add.call(selected,'abort',cancel,{once:true});}if(aborted(s.signal)||aborted(signal))cancel();timer=setTimeout(()=>expireGenerationControl(controller),s.milliseconds);this.#guard(signal);await this.#wire(controller.signal);this.#guard(signal);const result=await delegate(controller.signal);this.#guard(signal);await this.#wire(controller.signal);this.#guard(signal);return result;}
  catch(error){if(error instanceof SharedServerLogGenerationDeliveryPathControlError)throw error;try{this.#local(signal);}catch(local){if(local instanceof SharedServerLogGenerationDeliveryPathControlError)throw local;}if(error instanceof SharedServerLogGenerationRecoveryControlError)throw fail(('path_'+error.code) as SharedServerLogGenerationDeliveryPathControlError['code'],error.cancellationReason);if(error instanceof SharedServerLogGenerationDeliveryControlError)throw fail(('path_'+error.code.slice('delivery_'.length)) as SharedServerLogGenerationDeliveryPathControlError['code'],error.cancellationReason);throw fail('path_control_transfer');}
  finally{let failed=false;try{if(timer!==undefined)clearTimeout(timer);for(const selected of watched)try{remove.call(selected,'abort',cancel);}catch{failed=true;}try{controller.abort();}catch{failed=true;}}finally{s.active=undefined;}if(failed)throw fail('path_control_transfer');}
 }
 #check(signal?:AbortSignal):Promise<void>{return this.#run(signal,current=>this.#state.current.check(current));}
 /** Reauthenticate both exact native/provider and complete ordered path controls. No activation. */
 check(signal?:AbortSignal):Promise<void>{return this.#check(signal);}
 #assets(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal){let chosen!:SharedServerLogGenerationRecoveryAssetRequirements;return this.#run(signal,current=>this.#state.current.checkAssets(chosen,current),()=>{chosen=generationAssetRequirements(input);});}
 /** Actual current provider bytes, bracketed by complete native path checks. */
 checkAssets(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal){return this.#assets(input,signal);}
 #accepted(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal){let chosen!:SharedServerLogGenerationRecoveryAcceptedRequest;return this.#run(signal,current=>this.#state.current.readAcceptedNative(chosen,current),()=>{chosen=generationAcceptedChoices(input);});}
 /** Accepted current payloads, not permission to import, bind local comments or ACK a suffix. */
 readAcceptedNative(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal){return this.#accepted(input,signal);}
 #originalReview(input:GenerationOriginalReviewQuery,signal?:AbortSignal){let chosen!:GenerationOriginalReviewQuery;return this.#run(signal,current=>this.#state.current.readOriginalReview(chosen,current),()=>{chosen=generationOriginalReviewChoices(input);});}
 /** Stop this wrapper only; the supplied current checker and native editing service remain owned by their callers. */
 close():void{this.#state.closed=true;this.#ended.abort();this.#state.active?.abort();}
}
