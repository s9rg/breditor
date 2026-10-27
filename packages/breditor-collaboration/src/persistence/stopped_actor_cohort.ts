/** Private synchronous actor-resource handoff for an already stopped cohort.
 * This does not select/admit recovery data, retire an editor, create a target,
 * acknowledge persistence, or grant remote/server authority. The full executor
 * must durably choose every namespace and independently admit its whole root.
 */
import {SharedEditorError} from '../core.js';
import {checkStoppedSharedSourceActors,takeStoppedSharedSourceActors} from './shared_session.js';
import {checkStoppedReviewSourceActors,takeStoppedReviewSourceActors} from './review_session.js';
import {checkStoppedSegmentedSourceActors,takeStoppedSegmentedSourceActors} from './segmented_session.js';
import {checkStoppedIndependentSourceActors,takeStoppedIndependentSourceActors} from '../independent_history/session.js';
import {checkStoppedSegmentedRelayActors,takeStoppedSegmentedRelayActors} from '../segmented_relay/session.js';
import {checkStoppedIndependentDeliveryActors,takeStoppedIndependentDeliveryActors} from '../independent_delivery/session.js';
import {ActorLeaseEscrow} from './actor_lease_escrow.js';
import {checkSharedWriterLeaseEscrow,commitSharedWriterLeaseEscrow,checkSharedWriterLeaseEscrowClose,closeSharedWriterLeaseEscrow,type SharedWriterLeaseEscrow} from './writer_lease.js';
import {DeferredActorLeaseInput,type ActorLeaseRouteTargets} from './deferred_actor_input.js';
import {bindActorLeaseInput,type ActorLeaseFactoryInput} from './actor_lease_input.js';
import type {StoppedActorBinding,StoppedActorCustody} from './stopped_actor_source.js';
import {MAX_NATIVE_ACTOR_COHORT_MEMBERS} from './stopped_actor_source.js';

export type StoppedActorFamily='shared'|'review'|'segmented'|'independent'|'segmented-relay'|'independent-delivery';
export interface StoppedActorMember{readonly id:string;readonly family:StoppedActorFamily;readonly source:object}
type FactoryFamily='shared'|'review'|'segmented'|'independent';
interface Adapter{check:(source:never)=>StoppedActorBinding;take:(source:never)=>StoppedActorCustody;factory:FactoryFamily}
const adapters:Readonly<Record<StoppedActorFamily,Adapter>>={
 shared:{check:checkStoppedSharedSourceActors,take:takeStoppedSharedSourceActors,factory:'shared'},
 review:{check:checkStoppedReviewSourceActors,take:takeStoppedReviewSourceActors,factory:'review'},
 segmented:{check:checkStoppedSegmentedSourceActors,take:takeStoppedSegmentedSourceActors,factory:'segmented'},
 independent:{check:checkStoppedIndependentSourceActors,take:takeStoppedIndependentSourceActors,factory:'independent'},
 'segmented-relay':{check:checkStoppedSegmentedRelayActors,take:takeStoppedSegmentedRelayActors,factory:'segmented'},
 'independent-delivery':{check:checkStoppedIndependentDeliveryActors,take:takeStoppedIndependentDeliveryActors,factory:'independent'},
};
interface HeldMember{readonly id:string;readonly factory:FactoryFamily;readonly binding:StoppedActorBinding;readonly custody:StoppedActorCustody}
const key=Object.freeze({});
const routeCreate=DeferredActorLeaseInput.create,routeClosed=DeferredActorLeaseInput.prototype.closed,routeFinal=DeferredActorLeaseInput.prototype.checkFinalCurrent,routePromoted=DeferredActorLeaseInput.prototype.markPromoted;
const pairCommit=ActorLeaseEscrow.prototype.commit,pairCheck=ActorLeaseEscrow.prototype.checkCommit,pairClose=ActorLeaseEscrow.prototype.close,pairCloseCheck=ActorLeaseEscrow.prototype.checkClose;
const fail=(suffix='policy')=>new SharedEditorError('actor_cohort_'+suffix,'Use the actual stopped native cohort and settle every selected target before moving whole-cohort author custody');

/** Snapshot all caller DATA before the first actual source inspection. Accessors
 * and extra fields are not policy, nor a reason to run application code mid-cut. */
function snapshot(input:readonly StoppedActorMember[]):readonly StoppedActorMember[]{
 if(!Array.isArray(input)||input.length<1||input.length>MAX_NATIVE_ACTOR_COHORT_MEMBERS)throw fail();
 const rows:StoppedActorMember[]=[];
 for(let i=0;i<input.length;i++){
  const descriptor=Object.getOwnPropertyDescriptor(input,String(i));
  if(!descriptor||!('value'in descriptor))throw fail();
  const row=descriptor.value as unknown;
  if(!row||typeof row!=='object')throw fail();
  const fields=Object.getOwnPropertyDescriptors(row),keys=Reflect.ownKeys(fields);
  if(keys.length!==3||!['id','family','source'].every(name=>Object.hasOwn(fields,name)&&'value'in fields[name]!))throw fail();
  const id=fields['id']!.value as unknown,family=fields['family']!.value as unknown,source=fields['source']!.value as unknown;
  if(typeof id!=='string'||!id||id.length>200||typeof family!=='string'||!Object.hasOwn(adapters,family)||!source||typeof source!=='object')throw fail();
  rows.push(Object.freeze({id,family:family as StoppedActorFamily,source}));
 }
 return rows;
}

/** One branded resource owner. No public custody getter allows the coordinator
 * to accidentally promote just one member before a later member refuses. */
export class StoppedActorCohort{
 readonly #members:readonly HeldMember[];readonly #routes=new Map<string,DeferredActorLeaseInput>();
 #committed=false;#closing=false;#closed=false;#closeTask:Promise<void>|undefined;
 private constructor(token:object,members:readonly HeldMember[]){if(token!==key)throw fail();this.#members=members;Object.freeze(this);}
 static take(input:readonly StoppedActorMember[]):StoppedActorCohort{
  const selected=snapshot(input),ids=new Set<string>(),sources=new Set<object>(),documents=new Set<string>(),reviews=new Set<string>();
  let room:string|undefined;
  // Entire-cohort refusal precedes any actual ownership move. These adapters
  // inspect private fields only; the second loop has no await or host callback.
  const admitted=selected.map(row=>{
   if(ids.has(row.id)||sources.has(row.source))throw fail('duplicate');ids.add(row.id);sources.add(row.source);
   const adapter=adapters[row.family],binding=adapter.check(row.source as never);
   if(room!==undefined&&room!==binding.room)throw fail('room');room=binding.room;
   if(documents.has(binding.writer)||binding.actor!==null&&reviews.has(binding.actor))throw fail('duplicate');
   documents.add(binding.writer);if(binding.actor!==null)reviews.add(binding.actor);
   return{row,adapter,binding};
  });
  return new StoppedActorCohort(key,Object.freeze(admitted.map(({row,adapter,binding})=>Object.freeze({id:row.id,factory:adapter.factory,binding,custody:adapter.take(row.source as never)}))));
 }
 bind<T extends object>(id:string,input:T,database:string):ActorLeaseFactoryInput<T>{
  if(this.#committed||this.#closing||this.#closed)throw fail('closed');
  const member=this.#members.find(row=>row.id===id);if(!member)throw fail('member');const route=this.#routes.get(id);if(route&&!routeClosed.call(route))throw fail('route');
  const{room,writer,actor}=member.binding;
  return bindActorLeaseInput(input,member.factory,database,room,writer,actor,member.custody);
 }
 /** Pure descriptions are DATA, never the contained actor custody. */
 bindings():readonly Readonly<{id:string;factory:FactoryFamily;room:string;writer:string;actor:string|null}>[]{if(this.#committed||this.#closing||this.#closed)throw fail('closed');return Object.freeze(this.#members.map(row=>Object.freeze({id:row.id,factory:row.factory,...row.binding})));}
 /** One actual deferred route per member; returned closed routes may be
  * replaced during a real interrupted-target retry without releasing actors. */
 route(id:string,targets:ActorLeaseRouteTargets):DeferredActorLeaseInput{if(this.#committed||this.#closing||this.#closed)throw fail('closed');const member=this.#members.find(row=>row.id===id),old=this.#routes.get(id);if(!member)throw fail('member');if(old&&!routeClosed.call(old))throw fail('route');const{room,writer,actor}=member.binding,created=routeCreate.call(DeferredActorLeaseInput,member.factory,room,writer,actor,member.custody,targets);this.#routes.set(id,created);return created;}
 #checkCommit():void{
  if(this.#committed||this.#closing||this.#closed)throw fail('closed');
  for(const route of this.#routes.values())if(!routeClosed.call(route))routeFinal.call(route);
  for(const row of this.#members)if(row.binding.actor===null)checkSharedWriterLeaseEscrow(row.custody as SharedWriterLeaseEscrow,row.binding.room,row.binding.writer,'commit');else pairCheck.call(row.custody as ActorLeaseEscrow);
 }
 /** Admit the complete actual replacement root BEFORE calling. This pure
  * resource commit cannot replace that admission or authenticated activation. */
 commit():void{
  this.#checkCommit();
  for(const row of this.#members)if(row.binding.actor===null)commitSharedWriterLeaseEscrow(row.custody as SharedWriterLeaseEscrow,row.binding.room,row.binding.writer);else pairCommit.call(row.custody as ActorLeaseEscrow);
  for(const route of this.#routes.values())if(!routeClosed.call(route))routePromoted.call(route);
  this.#committed=true;
 }
 close():Promise<void>{
  if(this.#committed||this.#closed)return Promise.resolve();if(this.#closeTask)return this.#closeTask;
  try{
   // A later live borrower must not let earlier members release their locks.
   for(const row of this.#members)if(row.binding.actor===null)checkSharedWriterLeaseEscrowClose(row.custody as SharedWriterLeaseEscrow);else pairCloseCheck.call(row.custody as ActorLeaseEscrow);
  }catch(error){return Promise.reject(error);}
  this.#closing=true;
  this.#closeTask=Promise.resolve().then(async()=>{
   const results=await Promise.allSettled(this.#members.map(row=>row.binding.actor===null?closeSharedWriterLeaseEscrow(row.custody as SharedWriterLeaseEscrow):pairClose.call(row.custody as ActorLeaseEscrow)));
   for(const result of results)if(result.status==='rejected')throw result.reason;
   this.#closed=true;
  }).finally(()=>{this.#closeTask=undefined;});
  return this.#closeTask;
 }
}
