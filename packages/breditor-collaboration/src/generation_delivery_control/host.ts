import {controlCancellationReason,expireGenerationControl} from '../generation_recovery_control/cancellation.js';
import {recoveryRasterAsset} from '../generation_recovery_control/raster_request.js';
import type {OriginalMetadataQuery,SelectedServerMetadataRead} from '../server_metadata_read/contract.js';
import type {OriginalMetadataPacketQuery,SelectedServerMetadataPacketRead} from '../server_metadata_read/packet_contract.js';
import {metadataPacketQuery} from '../server_metadata_read/packet_query.js';
import {metadataQuery} from '../server_metadata_read/policy.js';
import type {SharedServerLogGenerationRecoveryControlSelection} from '../generation_recovery_control/contract.js';
/** Genuine exact previous/current operator reads. No metadata-based owner/grant or activation. */
import {participantAuthority} from '../participant_backup/policy.js';
import {accountToken} from '../relay/registration.js';
import {generationRecoveryHostPort} from '../generation_recovery_control/host.js';
import {SharedServerLogGenerationRecoveryControlError} from '../generation_recovery_control/policy.js';
import {readGenerationControlResponse} from '../generation_recovery_control/response.js';
import {generationAssetRequirements} from '../generation_recovery_control/asset_requirements.js';
import {generationAcceptedChoices} from '../generation_recovery_control/accepted_request.js';
import {generationOriginalReviewChoices} from '../generation_recovery_control/original_review_request.js';
import type {SharedServerLogGenerationRecoveryAssetRequirements} from '../generation_recovery_control/asset_contract.js';
import type {SharedServerLogGenerationRecoveryAcceptedRequest} from '../generation_recovery_control/accepted_contract.js';
import type {GenerationOriginalReviewQuery} from '../generation_recovery_control/original_review_contract.js';
import {deliveryControlSelection,checkDeliveryControlReceipt} from './identity.js';
import {deliveryControlEndpoint,deliveryControlFailure as fail,SharedServerLogGenerationDeliveryControlError,MAX_SERVER_GENERATION_DELIVERY_RECOVERY_CONTROL_BYTES as maximum} from './policy.js';
import type {SharedServerLogGenerationDeliveryRecoveryHostOptions,SharedServerLogGenerationDeliveryRecoveryControlSelection} from './contract.js';
const key=Object.freeze({}),add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener,readAborted=Object.getOwnPropertyDescriptor(AbortSignal.prototype,'aborted')!.get!;
const aborted=(signal:AbortSignal|undefined)=>signal?readAborted.call(signal):false;
interface State{readonly endpoint:string;readonly expected:SharedServerLogGenerationDeliveryRecoveryControlSelection;readonly current:ReturnType<typeof generationRecoveryHostPort>;readonly principal:string;readonly getToken:SharedServerLogGenerationDeliveryRecoveryHostOptions['getToken'];readonly authority:()=>void;readonly signal:AbortSignal|undefined;readonly milliseconds:number;closed:boolean;active:AbortController|undefined}
let port:(host:SharedServerLogGenerationDeliveryRecoveryHost)=>Readonly<{signals:readonly AbortSignal[];guard:(signal?:AbortSignal)=>void;selection:SharedServerLogGenerationDeliveryRecoveryControlSelection;check:SharedServerLogGenerationDeliveryRecoveryHost['check'];checkAssets:SharedServerLogGenerationDeliveryRecoveryHost['checkAssets'];readRaster:SharedServerLogGenerationDeliveryRecoveryHost['readRaster'];readAcceptedNative:SharedServerLogGenerationDeliveryRecoveryHost['readAcceptedNative'];readMetadata:(input:OriginalMetadataQuery,signal?:AbortSignal)=>Promise<SelectedServerMetadataRead<SharedServerLogGenerationRecoveryControlSelection>>;readMetadataPacket:(input:OriginalMetadataPacketQuery,signal?:AbortSignal)=>Promise<SelectedServerMetadataPacketRead<SharedServerLogGenerationRecoveryControlSelection>>;readNativeDependencies:(signal?:AbortSignal)=>ReturnType<ReturnType<typeof generationRecoveryHostPort>['readNativeDependencies']>;readOriginalReview:(input:GenerationOriginalReviewQuery,signal?:AbortSignal)=>ReturnType<ReturnType<typeof generationRecoveryHostPort>['readOriginalReview']>}>;
/** SDK-private brand-checked port. Public prototype overrides cannot replace any operation. */
export function generationDeliveryRecoveryHostPort(host:SharedServerLogGenerationDeliveryRecoveryHost){return port(host);}
export class SharedServerLogGenerationDeliveryRecoveryHost{
 readonly #state:State;readonly #ended=new AbortController();
 private constructor(token:object,state:State){if(token!==key)throw fail('delivery_control_policy');this.#state=state;Object.freeze(this);}
 static{port=host=>{if(!host||typeof host!=='object'||!(#state in host))throw fail('delivery_control_policy');return Object.freeze({signals:Object.freeze([host.#ended.signal,...(host.#state.signal?[host.#state.signal]:[]),...host.#state.current.signals,]),guard:(signal?:AbortSignal)=>{host.#guard(signal);host.#state.current.guard(signal);host.#guard(signal);},selection:host.#state.expected,check:(signal?:AbortSignal)=>host.#check(signal),checkAssets:(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal)=>host.#assets(input,signal),readRaster:(asset:string,signal?:AbortSignal)=>host.#raster(asset,signal),readAcceptedNative:(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal)=>host.#accepted(input,signal),readMetadata:(input:OriginalMetadataQuery,signal?:AbortSignal)=>host.#metadata(input,signal),readMetadataPacket:(input:OriginalMetadataPacketQuery,signal?:AbortSignal)=>host.#metadataPacket(input,signal),readNativeDependencies:(signal?:AbortSignal)=>host.#nativeDependencies(signal),readOriginalReview:(input:GenerationOriginalReviewQuery,signal?:AbortSignal)=>host.#originalReview(input,signal)});};}
 /** Explicit trusted endpoint/pins and genuine current checker; no saved verified flag. */
 static async open(supplied:SharedServerLogGenerationDeliveryRecoveryHostOptions):Promise<SharedServerLogGenerationDeliveryRecoveryHost>{let host:SharedServerLogGenerationDeliveryRecoveryHost|undefined;try{const options={...supplied},expected=deliveryControlSelection(options.expected),endpoint=deliveryControlEndpoint(options.endpoint),current=generationRecoveryHostPort(options.current),principal=options.principal,getToken=options.getToken,milliseconds=options.requestTimeoutMs??15000;if(JSON.stringify(current.selection)!==JSON.stringify(expected.current)||typeof principal!=='string'||!principal||principal.length>128||!/^[\x20-\x7e]+$/.test(principal)||typeof getToken!=='function'||!Number.isSafeInteger(milliseconds)||milliseconds<1||milliseconds>60000)throw fail('delivery_control_policy');host=new SharedServerLogGenerationDeliveryRecoveryHost(key,{endpoint,expected,current,principal,getToken,authority:participantAuthority(options.checkAuthority),signal:options.signal,milliseconds,closed:false,active:undefined});await host.#check();return host;}catch(error){host?.close();if(error instanceof SharedServerLogGenerationDeliveryControlError)throw error;throw fail('delivery_control_policy');}}
 /** Detached previous/current pins survive close; they grant no ownership or receipt. */
 selection():SharedServerLogGenerationDeliveryRecoveryControlSelection{return this.#state.expected;}
 #local(signal?:AbortSignal){const s=this.#state;if(s.closed)throw fail('delivery_control_closed');const reason=controlCancellationReason(s.active?.signal)??controlCancellationReason(s.signal)??controlCancellationReason(signal);if(reason)throw fail('delivery_control_cancelled',reason);}
 #guard(signal?:AbortSignal){this.#local(signal);try{this.#state.authority();}catch{throw fail('delivery_control_authority');}this.#local(signal);}
 async #wire(signal:AbortSignal){this.#guard(signal);const s=this.#state,token=await accountToken(s.getToken,signal,s.milliseconds);this.#guard(signal);let response:Response|undefined;try{const body=JSON.stringify(s.expected);if(new TextEncoder().encode(body).length>maximum)throw fail('delivery_control_policy');response=await fetch(s.endpoint,{method:'POST',headers:{Authorization:'Bearer '+token,'X-Breditor-Principal':s.principal,'Content-Type':'application/json'},body,signal,credentials:'omit',redirect:'error',cache:'no-store'});this.#guard(signal);if(response.status!==200){await response.body?.cancel().catch(()=>{});throw fail(response.status===403?'delivery_control_permission':[429,503].includes(response.status)?'delivery_control_unavailable':'delivery_control_protocol');}const text=await readGenerationControlResponse(response,maximum);this.#guard(signal);checkDeliveryControlReceipt(text,s.expected);}finally{if(response?.body&&!response.bodyUsed)await response.body.cancel().catch(()=>{});}}
 async #run<T>(signal:AbortSignal|undefined,delegate:(signal:AbortSignal)=>Promise<T>,detach?:()=>void):Promise<T>{const s=this.#state;if(s.closed)throw fail('delivery_control_closed');if(s.active)throw fail('delivery_control_busy');const controller=new AbortController();s.active=controller;const cancel=()=>controller.abort(),watched:AbortSignal[]=[];let timer:ReturnType<typeof setTimeout>|undefined;
  try{detach?.();for(const selected of [s.signal,signal])if(selected){watched.push(selected);add.call(selected,'abort',cancel,{once:true});}if(aborted(s.signal)||aborted(signal))cancel();timer=setTimeout(()=>expireGenerationControl(controller),s.milliseconds);this.#guard(signal);await this.#wire(controller.signal);this.#guard(signal);const result=await delegate(controller.signal);this.#guard(signal);await this.#wire(controller.signal);this.#guard(signal);return result;}
  catch(error){if(error instanceof SharedServerLogGenerationDeliveryControlError)throw error;try{this.#local(signal);}catch(local){if(local instanceof SharedServerLogGenerationDeliveryControlError)throw local;}if(error instanceof SharedServerLogGenerationRecoveryControlError)throw fail(('delivery_'+error.code) as SharedServerLogGenerationDeliveryControlError['code'],error.cancellationReason);throw fail('delivery_control_transfer');}
  finally{let failed=false;try{if(timer!==undefined)clearTimeout(timer);for(const selected of watched)try{remove.call(selected,'abort',cancel);}catch{failed=true;}try{controller.abort();}catch{failed=true;}}finally{s.active=undefined;}if(failed)throw fail('delivery_control_transfer');}
 }
 #check(signal?:AbortSignal):Promise<void>{return this.#run(signal,current=>this.#state.current.check(current));}
 /** Reauthenticate both exact native/provider and complete previous-cut controls. No activation. */
 check(signal?:AbortSignal):Promise<void>{return this.#check(signal);}
 #raster(asset:string,signal?:AbortSignal){let chosen!:string;return this.#run(signal,current=>this.#state.current.readRaster(chosen,current),()=>{try{chosen=recoveryRasterAsset(asset);}catch{throw fail('delivery_control_policy');}});}
 /** Immutable current-host bytes bracketed by genuine continuation checks.
  * No local cache, queue acknowledgement or activation is changed. */
 readRaster(asset:string,signal?:AbortSignal){return this.#raster(asset,signal);}
 #assets(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal){let chosen!:SharedServerLogGenerationRecoveryAssetRequirements;return this.#run(signal,current=>this.#state.current.checkAssets(chosen,current),()=>{chosen=generationAssetRequirements(input);});}
 /** Actual current provider bytes, bracketed by complete native continuation checks. */
 checkAssets(input:SharedServerLogGenerationRecoveryAssetRequirements,signal?:AbortSignal){return this.#assets(input,signal);}
 #accepted(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal){let chosen!:SharedServerLogGenerationRecoveryAcceptedRequest;return this.#run(signal,current=>this.#state.current.readAcceptedNative(chosen,current),()=>{chosen=generationAcceptedChoices(input);});}
 /** Accepted current payloads, not permission to import, bind local comments or ACK a suffix. */
 readAcceptedNative(input:SharedServerLogGenerationRecoveryAcceptedRequest,signal?:AbortSignal){return this.#accepted(input,signal);}
 #originalReview(input:GenerationOriginalReviewQuery,signal?:AbortSignal){let chosen!:GenerationOriginalReviewQuery;return this.#run(signal,current=>this.#state.current.readOriginalReview(chosen,current),()=>{chosen=generationOriginalReviewChoices(input);});}
 #nativeDependencies(signal?:AbortSignal){return this.#run(signal,current=>this.#state.current.readNativeDependencies(current));}
 /** Complete server Native source knowledge under both actual continuation checks. */
 readNativeDependencies(signal?:AbortSignal){return this.#nativeDependencies(signal);}
 #metadata(input:OriginalMetadataQuery,signal?:AbortSignal){let chosen!:OriginalMetadataQuery;return this.#run(signal,current=>this.#state.current.readMetadata(chosen,current),()=>{try{chosen=metadataQuery(input);}catch{throw fail('delivery_control_policy');}});}
 /** Original current-server catalogs, bracketed by the real continuation control.
  * Reader permissions remain data and this never settles client metadata. */
 readMetadata(input:OriginalMetadataQuery,signal?:AbortSignal){return this.#metadata(input,signal);}
 #metadataPacket(input:OriginalMetadataPacketQuery,signal?:AbortSignal){let chosen!:OriginalMetadataPacketQuery;return this.#run(signal,current=>this.#state.current.readMetadataPacket(chosen,current),()=>{try{chosen=metadataPacketQuery(input);}catch{throw fail('delivery_control_policy');}});}
 /** Literal current-server first packet body under both real continuation checks.
  * The original byte expectation is retained; no local receipt is installed. */
 readMetadataPacket(input:OriginalMetadataPacketQuery,signal?:AbortSignal){return this.#metadataPacket(input,signal);}
 /** Stop this wrapper only; the supplied current checker and native editing service remain owned by their callers. */
 close():void{this.#state.closed=true;this.#ended.abort();this.#state.active?.abort();}
}
