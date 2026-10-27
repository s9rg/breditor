/** Actual stopped actors reach every native target through private input
 * routes. This is local resource composition, never a stored writer grant.
 * The caller retains the genuine cohort before begin/finish can reject. */
import {StoppedActorCohort} from '../persistence/stopped_actor_cohort.js';
import {DeferredActorLeaseInput} from '../persistence/deferred_actor_input.js';
import {checkCapturedNativeActorRoute} from '../native_history_read/registry.js';
import type {CompleteNativeRead} from '../complete_operation_cohort/native_read.js';
import type {PhysicalOperationV3PreparedTarget} from './preflight.js';
import {physicalOperationV3Failure as fail} from './policy.js';
const bindings=StoppedActorCohort.prototype.bindings,createRoute=StoppedActorCohort.prototype.route,select=DeferredActorLeaseInput.prototype.select,closeRoute=DeferredActorLeaseInput.prototype.close,key=Object.freeze({});
export function checkPhysicalRootActors(actors:StoppedActorCohort):void{try{bindings.call(actors);}catch{throw fail('physical_operation_v3_policy');}}
export class PhysicalRootActorRoutes{
 readonly #actors;readonly #routes=new Map<string,Readonly<{family:PhysicalOperationV3PreparedTarget['target']['family'];route:DeferredActorLeaseInput}>>();#closed=false;#cleanup:Promise<void>|undefined;
 private constructor(token:object,actors:StoppedActorCohort){if(token!==key)throw fail('physical_operation_v3_policy');this.#actors=actors;Object.freeze(this);}
 static async create(actors:StoppedActorCohort,targets:readonly PhysicalOperationV3PreparedTarget[]):Promise<PhysicalRootActorRoutes>{const owner=new PhysicalRootActorRoutes(key,actors);try{owner.#prepare(targets);return owner;}catch(error){await owner.close();throw error;}}
 #prepare(targets:readonly PhysicalOperationV3PreparedTarget[]):void{const members=bindings.call(this.#actors);if(members.length!==targets.length||new Set(targets.map(row=>row.target.id)).size!==targets.length)throw fail('physical_operation_v3_policy');
  const plans=targets.map(row=>{const member=members.find(value=>value.id===row.target.id),family=row.target.family,identity=row.identity,factory=family==='original'?(identity.actor===undefined?'shared':'review'):family==='generation'?'segmented':'independent',finalRole=family==='original'?'document':'source',finalDatabase=row.target.namespaces.find(value=>value.role===finalRole)?.database,databases=row.target.namespaces.filter(value=>value.role===finalRole||value.role==='recovery-source').map(value=>value.database);if(!member||member.factory!==factory||member.room!==identity.room||member.writer!==identity.writer||member.actor!==(identity.actor??null)||!finalDatabase)throw fail('physical_operation_v3_policy');return{row,finalDatabase,databases};});
  // All structural rows are checked before the first route selection. Partial
  // route creation has no borrowed actors and is canonically closed on failure.
  for(const{row,finalDatabase,databases}of plans){const route=createRoute.call(this.#actors,row.target.id,{databases,finalDatabase});this.#routes.set(row.target.id,{family:row.target.family,route});const input=row.input;if(input.family==='original'||input.family==='generation')select.call(route,input.recovery.session.options);else if(input.family==='independent-local'){select.call(route,input.options.recovery.session);select.call(route,input.options.session);}else if(input.family==='independent-delivery'){select.call(route,input.options.recovery.session);select.call(route,input.stagingSession);}else if(input.family==='restored-graph')select.call(route,input.options.session);else select.call(route,input.options.sourceFactory);}
 }
 checkFinal(participants:CompleteNativeRead['participants']):void{if(this.#closed||participants.length!==this.#routes.size||new Set(participants.map(row=>row.id)).size!==participants.length)throw fail('physical_operation_v3_closed');for(const member of participants){const row=this.#routes.get(member.id);if(!row||row.family!==member.family)throw fail('physical_operation_v3_diverged');checkCapturedNativeActorRoute(member.native,row.route);}}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#cleanup=(async()=>{const results=await Promise.allSettled([...this.#routes.values()].map(({route})=>closeRoute.call(route)));for(const result of results)if(result.status==='rejected')throw result.reason;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
