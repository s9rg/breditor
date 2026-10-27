/** Reachable ownership for a source opening, including an unreturned native
 * source whose admission or cleanup failed. Completion DATA cannot supply it. */
import type {SharedSelectionPolicy} from '../types.js';
import type {RestoredOperationInputOptions} from './input.js';
import {restoredOperationPolicy} from './policy.js';
import {RestoredOperationJournal,restoredOperationJournalBinding} from './journal.js';
import {SharedIndependentDeliverySession} from '../independent_delivery/session.js';
import type {SharedIndependentDeliveryOptions} from '../independent_delivery/contract.js';
import {withRestoredOperationJournal} from './source_binding.js';
import {inheritActorLeaseInput} from '../persistence/actor_lease_input.js';
import {operationJournalFailure as fail} from '../independent_operation/journal_failure.js';
const openJournal=RestoredOperationJournal.resume,beginJournal=RestoredOperationJournal.begin,closeJournal=RestoredOperationJournal.prototype.close,openSource=SharedIndependentDeliverySession.open,closeSource=SharedIndependentDeliverySession.prototype.close,discardSource=SharedIndependentDeliverySession.prototype.discardAndClose;
export class RestoredSourceOpening<P extends SharedSelectionPolicy=SharedSelectionPolicy>{
 #journal:RestoredOperationJournal|undefined;#source:SharedIndependentDeliverySession<P>|undefined;#ready=false;#taken=false;#closing=false;#closed=false;#running:Promise<void>|undefined;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 #live=()=>{if(this.#closing||this.#closed||this.#taken)throw fail('restored_operation_closed');};
 open(options:RestoredOperationInputOptions<P>,file:Blob|undefined,completeOnly:boolean):Promise<void>{
  try{this.#live();if(this.#running||this.#journal||this.#source||this.#ready)throw fail('restored_operation_busy');if(completeOnly&&file!==undefined)throw fail('restored_operation_not_ready');}catch(error){return Promise.reject(error);}
  const task=Promise.resolve().then(async()=>{this.#live();const selected=restoredOperationPolicy(options).options;this.#live();this.#journal=await(file===undefined?openJournal.call(RestoredOperationJournal,selected):beginJournal.call(RestoredOperationJournal,file,selected));this.#live();const binding=restoredOperationJournalBinding(this.#journal);
   const factory=inheritActorLeaseInput(selected.session,{...selected.session,database:binding.sourceDatabase,create:()=>{throw fail('restored_operation_not_ready');}}) as SharedIndependentDeliveryOptions<P>;
   if(completeOnly){const current=await binding.progress();this.#live();if(!current.ready||current.pending)throw fail('restored_operation_not_ready');}
   for(;;){this.#live();const reservation=binding.reserve();try{this.#source=await openSource.call(SharedIndependentDeliverySession,withRestoredOperationJournal(factory,this.#journal)) as SharedIndependentDeliverySession<P>;this.#live();reservation.claim(this.#source);}finally{reservation.abandon();}
    const current=await binding.progress();this.#live();if(current.ready){binding.consume(this.#source);this.#ready=true;return;}
    if(completeOnly)throw fail('restored_operation_not_ready');await closeSource.call(this.#source);this.#source=undefined;this.#live();
   }
  });this.#running=task;return task.finally(()=>{this.#running=undefined;});
 }
 /** No await, callback or destructor between clearing these owned references
  * and assigning their actual pair into the already-owned parent. */
 take():Readonly<{source:SharedIndependentDeliverySession<P>;journal:RestoredOperationJournal}>{this.#live();if(this.#running||!this.#ready||!this.#source||!this.#journal)throw fail('restored_operation_not_ready');const pair=Object.freeze({source:this.#source,journal:this.#journal});this.#source=undefined;this.#journal=undefined;this.#taken=true;return pair;}
 /** Failure retains the exact remaining handles. Cleanup needs no renewed read
  * authority and never deletes or acknowledges source data. */
 close():Promise<void>{if(this.#closed||this.#taken)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=Promise.resolve().then(async()=>{await this.#running?.catch(()=>{});if(this.#source){await discardSource.call(this.#source);this.#source=undefined;}if(this.#journal){await closeJournal.call(this.#journal);this.#journal=undefined;}this.#closed=true;}).finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
