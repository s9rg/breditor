import {SharedContinuedPairSession} from '../continued_pair/session.js';
import type {RecoveredContinuedRoomReconciliationOptions} from '../continued_room_reconciliation/contract.js';
import {fail} from '../room_native_activation_intent/policy.js';
import type {ContinuedRoomPublicationOptions,ContinuedRoomPublicationResult} from './contract.js';
import {publishWithContinuedRoomSessions} from './publish.js';

const {close:closeSession,discardAndClose:discardSession}=SharedContinuedPairSession.prototype;

/** Holds the whole recipient cohort before publishing and owns retryable cleanup. */
export class ContinuedRoomSessionHandoff {
 readonly #sessions=new Map<string,SharedContinuedPairSession>();
 #work:Promise<ContinuedRoomPublicationResult>|undefined;
 #closing:Promise<void>|undefined;
 #closed=false;
 #published=false;

 publish(input:RecoveredContinuedRoomReconciliationOptions,options:ContinuedRoomPublicationOptions):Promise<ContinuedRoomPublicationResult>{
  if(this.#closed)return Promise.reject(fail('activation_intent_closed'));
  if(this.#work||this.#published||this.#sessions.size)return Promise.reject(fail('activation_intent_busy'));
  const job=Promise.resolve().then(async()=>{
   if(this.#closed)throw fail('activation_intent_closed');
   try{
    const published=await publishWithContinuedRoomSessions(input,options,this.#sessions);
    if(this.#closed)throw fail('activation_intent_closed');
    this.#published=true;
    return published;
   }catch(error){
    await this.#release(true);
    throw error;
   }
  });
  this.#work=job;
  return job.finally(()=>{this.#work=undefined;});
 }

 /** A copy of the complete published cohort. The handoff retains close ownership. */
 sessions():ReadonlyMap<string,SharedContinuedPairSession>{
  if(this.#closed||!this.#published)throw fail('activation_intent_incomplete');
  return new Map(this.#sessions);
 }

 async #release(discard:boolean){
  const close=discard?discardSession:closeSession;
  const settled=await Promise.allSettled([...this.#sessions].map(async ([id,session])=>{
   await close.call(session);
   this.#sessions.delete(id);
  }));
  for(const result of settled)if(result.status==='rejected')throw result.reason;
 }

 close():Promise<void>{
  if(this.#closing)return this.#closing;
  this.#closed=true;
  this.#closing=Promise.resolve().then(async()=>{
   await this.#work?.catch(()=>{});
   await this.#release(!this.#published);
  }).finally(()=>{this.#closing=undefined;});
  return this.#closing;
 }
}
