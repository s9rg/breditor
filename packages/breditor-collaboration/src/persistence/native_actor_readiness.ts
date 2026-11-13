/** Genuine full native-source readiness, shared by immediate retirement and
 * durable-close retention. Contains descriptions only, never actor handles. */
import {SharedEditorError} from '../core.js';
import {nativeActorSource,type NativeActorSourceFamily} from './native_actor_source.js';
import {MAX_NATIVE_ACTOR_COHORT_MEMBERS,type StoppedActorBinding} from './stopped_actor_source.js';
import {checkReadySharedSourceActors} from './shared_session.js';
import {checkReadyReviewSourceActors} from './review_session.js';
import {checkReadySegmentedSourceActors} from './segmented_session.js';
import {checkReadyContinuedDeliveryActors} from '../continued_pair/session.js';
import {checkReadyIndependentSourceActors} from '../independent_history/session.js';
export interface NativeActorClient{readonly id:string;readonly core:object}
export interface NativeActorReadyClient extends NativeActorClient{readonly family:NativeActorSourceFamily;readonly binding:StoppedActorBinding}
const fail=()=>new SharedEditorError('native_actor_cohort','Select the complete actual native client set without callbacks or copied source owners');
export function snapshotNativeActorClients(input:readonly NativeActorClient[]):readonly NativeActorClient[]{
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
const readiness:Readonly<Record<NativeActorSourceFamily,(source:never)=>StoppedActorBinding>>={shared:checkReadySharedSourceActors,review:checkReadyReviewSourceActors,segmented:checkReadySegmentedSourceActors,independent:checkReadyIndependentSourceActors,
 'continued-delivery':source=>checkReadyContinuedDeliveryActors(source),
};
export function prepareNativeActorReadiness(input:readonly NativeActorClient[]):readonly NativeActorReadyClient[]{
 const selected=snapshotNativeActorClients(input),ids=new Set<string>(),cores=new Set<object>(),sources=new Set<object>(),writers=new Set<string>(),actors=new Set<string>();let room:string|undefined;
 return Object.freeze(selected.map(row=>{
  const source=nativeActorSource(row.core),binding=readiness[source.family](source.source as never);
  if(ids.has(row.id)||cores.has(row.core)||sources.has(source.source)||writers.has(binding.writer)||binding.actor!==null&&actors.has(binding.actor)||room!==undefined&&room!==binding.room)throw fail();
  ids.add(row.id);cores.add(row.core);sources.add(source.source);writers.add(binding.writer);if(binding.actor!==null)actors.add(binding.actor);room=binding.room;
  return Object.freeze({...row,family:source.family,binding});
 }));
}
