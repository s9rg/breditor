/** Only the append-only factual journal namespace is held here. This is not source,
 * actor, destination or serving custody. Actual pending requests remain owned
 * until their late upgrade/success/error has finished and cleanup is complete. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {DeliveryPreparationReadScope} from '../selected_delivery_preparation/read_scope.js';
import {DeliveryJournalStore} from './store.js';
import {journalIdentity} from './identity.js';
import {fail} from './policy.js';
import type {DeliveryJournalIdentity,DeliveryJournalInput,DeliveryJournalSnapshot} from './contract.js';
import {detachJournalInput} from './admission.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
const open=DeliveryJournalStore.prototype.open,read=DeliveryJournalStore.prototype.readFresh,append=DeliveryJournalStore.prototype.append,close=DeliveryJournalStore.prototype.close;
export class DeliveryJournalResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#scope:DeliveryPreparationReadScope|undefined;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:DeliveryJournalStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('delivery_journal_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(provided:DeliveryJournalIdentity,options:SharedArchiveIntegrityOptions,initial?:DeliveryJournalInput):Promise<DeliveryJournalSnapshot>{this.check();if(this.#scope||this.#opening||this.#lease)throw fail('delivery_journal_busy');const chosen=initial===undefined?undefined:detachJournalInput(initial),choice=journalIdentity(provided),scope=new DeliveryPreparationReadScope(options);this.#scope=scope;const check=()=>{this.check();scope.check();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.database],()=>this.#close(),{policy:()=>fail('delivery_journal_policy'),busy:()=>fail('delivery_journal_busy'),storage:()=>fail('delivery_journal_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.database));check();const store=new DeliveryJournalStore(this.#factory,choice,{wasm:scope.integrity.wasm,checkAuthority:check,signal:scope.signal});this.#store=store;const result=await open.call(store,chosen);this.check();return result;}
 readFresh():Promise<DeliveryJournalSnapshot>{this.check();if(!this.#store)throw fail('delivery_journal_closed');return read.call(this.#store);}
 append(before:DeliveryJournalSnapshot,input:DeliveryJournalInput):Promise<DeliveryJournalSnapshot>{this.check();if(!this.#store)throw fail('delivery_journal_closed');return append.call(this.#store,before,input);}
 close():Promise<void>{this.#closing=true;this.#scope?.close();return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#scope?.close();this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#scope=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
