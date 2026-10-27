/** Bridge from genuine retained-root client cores to actual stopped actor
 * sources. The caller must select its COMPLETE actual root before this call;
 * a subset of registered cores is not proof of whole-room data admission. */
import {SharedEditorError} from '../core.js';
import {nativeActorSource} from './native_actor_source.js';
import {StoppedActorCohort,type StoppedActorMember} from './stopped_actor_cohort.js';
import {MAX_NATIVE_ACTOR_COHORT_MEMBERS} from './stopped_actor_source.js';
import {checkReadySharedSourceActors} from './shared_session.js';
import {checkReadyReviewSourceActors} from './review_session.js';
import {checkReadySegmentedSourceActors} from './segmented_session.js';
import {checkReadyIndependentSourceActors} from '../independent_history/session.js';
import type {StoppedActorBinding} from './stopped_actor_source.js';
import type {NativeActorSourceFamily} from './native_actor_source.js';
export interface NativeActorClient{readonly id:string;readonly core:object}
const take=StoppedActorCohort.take;
const fail=()=>new SharedEditorError('native_actor_cohort','Select the complete actual native client set without callbacks or copied source owners');
function clients(input:readonly NativeActorClient[]):readonly NativeActorClient[]{
 if(!Array.isArray(input)||input.length<1||input.length>MAX_NATIVE_ACTOR_COHORT_MEMBERS)throw fail();
 const selected:NativeActorClient[]=[];
 for(let index=0;index<input.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(input,String(index));if(!descriptor||!('value'in descriptor))throw fail();
  const value=descriptor.value as unknown;if(!value||typeof value!=='object')throw fail();
  const fields=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(fields).length!==2||!['id','core'].every(name=>Object.hasOwn(fields,name)&&'value'in fields[name]!))throw fail();
  const id=fields['id']!.value as unknown,core=fields['core']!.value as unknown;
  if(typeof id!=='string'||!id||id.length>200||!core||typeof core!=='object')throw fail();selected.push({id,core});
 }
 return Object.freeze(selected.map(row=>Object.freeze(row)));
}
export function takeNativeActorCohort(input:readonly NativeActorClient[]):StoppedActorCohort{
 const rows:StoppedActorMember[]=clients(input).map(({id,core})=>({id,...nativeActorSource(core)}));
 return take.call(StoppedActorCohort,rows);
}

const readiness:Readonly<Record<NativeActorSourceFamily,(source:never)=>StoppedActorBinding>>={shared:checkReadySharedSourceActors,review:checkReadyReviewSourceActors,segmented:checkReadySegmentedSourceActors,independent:checkReadyIndependentSourceActors};
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
  if(this.#taken)throw retirementFailure();const ids=new Set<string>(),cores=new Set<object>(),sources=new Set<object>(),writers=new Set<string>(),actors=new Set<string>();let room:string|undefined;
  for(const row of this.#clients){
   const source=nativeActorSource(row.core),binding=readiness[source.family](source.source as never);
   if(ids.has(row.id)||cores.has(row.core)||sources.has(source.source)||writers.has(binding.writer)||binding.actor!==null&&actors.has(binding.actor)||room!==undefined&&room!==binding.room)throw retirementFailure();
   ids.add(row.id);cores.add(row.core);sources.add(source.source);writers.add(binding.writer);if(binding.actor!==null)actors.add(binding.actor);room=binding.room;
  }
 }
 checkBeforeRetirement():void{this.#checkBefore();}
 takeAfterRetirement():StoppedActorCohort{if(this.#taken)throw retirementFailure();const cohort=takeNativeActorCohort(this.#clients);this.#taken=true;return cohort;}
}
