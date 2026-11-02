/** Bridge from genuine retained-root client cores to actual stopped actor
 * sources. The caller must select its COMPLETE actual root before this call;
 * a subset of registered cores is not proof of whole-room data admission. */
import {SharedEditorError} from '../core.js';
import {nativeActorSource} from './native_actor_source.js';
import {StoppedActorCohort,type StoppedActorMember} from './stopped_actor_cohort.js';
import {snapshotNativeActorClients as clients,prepareNativeActorReadiness,type NativeActorClient} from './native_actor_readiness.js';
export type {NativeActorClient} from './native_actor_readiness.js';
const take=StoppedActorCohort.take;

export function takeNativeActorCohort(input:readonly NativeActorClient[]):StoppedActorCohort{
 const rows:StoppedActorMember[]=clients(input).map(({id,core})=>({id,...nativeActorSource(core)}));
 return take.call(StoppedActorCohort,rows);
}

const retirementKey=Object.freeze({});
const retirementFailure=()=>new SharedEditorError('native_actor_retirement','Use actual live-source readiness before retirement and one genuine stopped-source transfer afterward');
/** A private readiness selection, NOT held actor custody or durable authority.
 * The full executor must check its complete native/packet witness after the last
 * authority callback, recheck readiness, then retire and take synchronously under
 * its existing barriers. Retain the returned actual cohort before fallible work.
 */
export class NativeActorRetirement{
 readonly #clients:readonly NativeActorClient[];#taken=false;
 private constructor(token:object,selected:readonly NativeActorClient[]){if(token!==retirementKey)throw retirementFailure();this.#clients=selected;Object.freeze(this);}
 static prepare(input:readonly NativeActorClient[]):NativeActorRetirement{const owner=new NativeActorRetirement(retirementKey,clients(input));owner.#checkBefore();return owner;}
 #checkBefore():void{
  if(this.#taken)throw retirementFailure();try{prepareNativeActorReadiness(this.#clients);}catch(error){if(error instanceof SharedEditorError&&error.code==='native_actor_cohort')throw retirementFailure();throw error;}
 }
 checkBeforeRetirement():void{this.#checkBefore();}
 takeAfterRetirement():StoppedActorCohort{if(this.#taken)throw retirementFailure();const cohort=takeNativeActorCohort(this.#clients);this.#taken=true;return cohort;}
}
