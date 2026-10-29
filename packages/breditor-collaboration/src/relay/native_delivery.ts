/** SDK-private execution context for the SAME retained native/source owners.
 * This grants scheduling/guarded ingress only. Authentication, wire validation
 * and durable receipts remain the original adapters' responsibility. */
import type {SharedRichEditor} from '../core.js';
import type {SharedSelectionPolicy} from '../types.js';
import type {SharedReviewAccess,SharedReviewPolicy,SharedReviewImportOutcome} from '../review_types.js';
import type {NativeRecoveryReservation} from '../native_recovery/contract.js';
import {nativeRecoveryWorkAdmission,nativeRecoverySetReviewAccess} from '../native_recovery/work_admission.js';
import {sessionDeliveryIO} from '../delivery_source/io.js';
import {participantAuthority} from '../participant_backup/policy.js';
import type {RelayWorkAdmission} from './work_custody.js';
import type {SharedReviewRelayStorage,SharedReviewRelayProgress} from './review_types.js';
import {SharedRelayError} from './validation.js';
import type {SelectedNativeRecoveryScope} from '../selected_native_recovery/contract.js';
import type {RetainedDeliverySource} from '../operation_read/delivery_retention.js';

export interface NativeRelayDelivery {check():void;close():Promise<void>}
export interface NativeRelayDeliveryPort {
 readonly core:SharedRichEditor<SharedSelectionPolicy>;readonly admission:RelayWorkAdmission;
 check():void;receiveDocument(frame:string):boolean;receiveReview(frame:string,policy:SharedReviewPolicy):SharedReviewImportOutcome;
 setReviewAccess(access:SharedReviewAccess):boolean;persistLocal():Promise<void>;
 reviewStorage<P extends SharedSelectionPolicy>():SharedReviewRelayStorage<P>;
 track(stop:()=>void,wait:()=>Promise<void>):void;
}
const contexts=new WeakMap<NativeRelayDelivery,NativeRelayDeliveryPort>(),selections=new WeakMap<object,NativeRelayDeliveryPort>();
interface GuardedIngress {receiveDocument(frame:string):boolean;receiveReview(frame:string,policy:SharedReviewPolicy):SharedReviewImportOutcome;setReviewAccess(access:SharedReviewAccess):boolean}
interface NativeDeliveryInput<P extends SharedSelectionPolicy>{native:NativeRecoveryReservation;session:object;core:SharedRichEditor<P>;reviewCeiling:SharedReviewAccess;checkAuthority:()=>void;signal?:AbortSignal}
interface SelectedDeliveryScope {native:NativeRecoveryReservation;sources:()=>readonly {source:RetainedDeliverySource}[];check():void;setReviewAccess(core:SharedRichEditor<SharedSelectionPolicy>,access:SharedReviewAccess):boolean;track(owner:NativeRelayDelivery):void}
const scopes=new WeakMap<SelectedNativeRecoveryScope,SelectedDeliveryScope>();
const fail=()=>new SharedRelayError('native_delivery_closed');
const rank:Readonly<Record<SharedReviewAccess,number>>={read_only:0,comment:1,moderate:2};
/** Requires fresh host policy, not the historical role in a saved packet.
 * Closing drains all ACTUAL admitted adapters, but never releases native flags,
 * saves/retries a source, installs an ACK, or activates the room. */
export function createNativeRelayDelivery<P extends SharedSelectionPolicy>(input:NativeDeliveryInput<P>):NativeRelayDelivery{return composeDelivery(input);}
function composeDelivery<P extends SharedSelectionPolicy>(input:NativeDeliveryInput<P>,ingress?:GuardedIngress):NativeRelayDelivery{
 const {native,session,core,reviewCeiling,signal}=input,authority=participantAuthority(input.checkAuthority);
 if(!Object.hasOwn(rank,reviewCeiling))throw new SharedRelayError('native_delivery_policy');
 const io=sessionDeliveryIO(session,core),admission=nativeRecoveryWorkAdmission(native,core);
 let closing=false,closed=false,ending:Promise<void>|undefined;
 const adapters=new Set<Readonly<{stop:()=>void;wait:()=>Promise<void>}>>();
 const check=()=>{if(closing||closed||signal?.aborted)throw fail();authority();io.check();native.check();if(signal?.aborted||closing||closed)throw fail();};
 check();
 const persistLocal=async()=>{check();io.save();await io.flush();check();};
 const port:NativeRelayDeliveryPort=Object.freeze({core:core as unknown as SharedRichEditor<SharedSelectionPolicy>,admission,check,
  receiveDocument(frame:string){check();const changed=ingress?ingress.receiveDocument(frame):native.receiveDocument(core,frame);check();return changed;},
  receiveReview(frame:string,policy:SharedReviewPolicy){check();const changed=ingress?ingress.receiveReview(frame,policy):native.receiveReview(core,frame,policy);check();return changed;},
  setReviewAccess(access:SharedReviewAccess){check();if(!Object.hasOwn(rank,access))throw new SharedRelayError('native_delivery_policy');const clamped=rank[access]<=rank[reviewCeiling]?access:reviewCeiling;const changed=ingress?ingress.setReviewAccess(clamped):nativeRecoverySetReviewAccess(native,core,clamped);check();return changed;},persistLocal,
  reviewStorage<Q extends SharedSelectionPolicy>():SharedReviewRelayStorage<Q>{check();const review=io.review;if(!review)throw new SharedRelayError('native_delivery_review_unbound');return Object.freeze({core:core as unknown as SharedRichEditor<Q>,reviewRelayIdentity:()=>{check();return review.identity();},reviewRelayProgress:()=>{check();return review.progress();},persistReviewRelayProgress:async(progress:SharedReviewRelayProgress)=>{check();await review.persist(progress);check();},flush:persistLocal});},
  track(stop:()=>void,wait:()=>Promise<void>){check();adapters.add(Object.freeze({stop,wait}));},
 });
 const owner:NativeRelayDelivery=Object.freeze({check,close(){if(closed)return Promise.resolve();if(ending)return ending;closing=true;
  // Stop every socket before awaiting any one callback. Failed cleanup retains
  // the exact handles and exclusion for a later close retry.
  ending=(async()=>{const errors:unknown[]=[];for(const entry of adapters)try{entry.stop();}catch(error){errors.push(error);}await Promise.all([...adapters].map(async entry=>{try{await entry.wait();}catch(error){errors.push(error);}}));if(errors.length)throw new AggregateError(errors,'Native delivery cleanup did not finish');adapters.clear();closed=true;})().finally(()=>{ending=undefined;});return ending;
 }});contexts.set(owner,port);return owner;
}
/** Genuine selected-owner #recover constructor only. Actual ingress still uses
 * that owner's wrapped imports, so attempted mutations cannot bypass its
 * cancellation/quarantine rules. No raw native reservation is returned. */
export function registerSelectedNativeDeliveryScope(scope:SelectedNativeRecoveryScope,source:SelectedDeliveryScope):void{if(scopes.has(scope))throw fail();scopes.set(scope,source);}
/** Same actual retained source, not a matching backup or copied resource. The
 * selected owner also drains these contexts on EVERY visitor exit. */
/** SDK-private resource registration; copies of a selected scope cannot pin work. */
export function checkSelectedNativeDeliveryScope(scope:SelectedNativeRecoveryScope):void{const held=scopes.get(scope);if(!held)throw fail();held.check();}
export function retainSelectedNativeDeliveryResource(scope:SelectedNativeRecoveryScope,owner:NativeRelayDelivery):void{const held=scopes.get(scope);if(!held)throw fail();held.check();held.track(owner);}
export function createSelectedNativeRelayDelivery(scope:SelectedNativeRecoveryScope,source:RetainedDeliverySource,reviewCeiling:SharedReviewAccess,checkPreparation?:()=>void):NativeRelayDelivery{
 const held=scopes.get(scope);if(!held)throw fail();held.check();if(!held.sources().some(row=>row.source===source)||!scope.clients.some(client=>client.core===source.core))throw new SharedRelayError('native_delivery_source');source.check();
 const parent=source.parent,session=parent.kind==='generation'?parent.source.session:parent.session,core=source.core;
 const owner=composeDelivery({native:held.native,session,core,reviewCeiling,checkAuthority:()=>{held.check();checkPreparation?.();held.check();},signal:scope.signal},{receiveDocument:frame=>scope.native.receiveDocument(core,frame),receiveReview:(frame,policy)=>scope.native.receiveReview(core,frame,policy),setReviewAccess:access=>held.setReviewAccess(core,access)});held.track(owner);return owner;
}
/** No serializable selector or public boolean. Copies lose this selection. */
export function withNativeRelayDelivery<T extends object>(input:T,owner:NativeRelayDelivery):T&{autoConnect:false}{const port=contexts.get(owner);if(!port)throw fail();port.check();const result={...input,autoConnect:false as const};selections.set(result,port);return result;}
export function selectedNativeRelayDelivery(input:object,core:object):NativeRelayDeliveryPort|undefined{const port=selections.get(input);if(port){if(port.core!==core)throw new SharedRelayError('native_delivery_source');port.check();}return port;}
/** Trusted named adapter factories preserve this exact per-call selection while
 * applying their genuine generation-family source port. */
export function forwardNativeRelayDelivery(input:object,output:object):void{const port=selections.get(input);if(port){port.check();selections.set(output,port);}}
