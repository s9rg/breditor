/** The immutable execution database alone is held here. This is not source,
 * actor, destination or serving custody. Actual pending requests remain owned
 * until their late upgrade/success/error has finished and cleanup is complete. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {DeliveryPreparationReadScope} from './read_scope.js';
import {DeliveryPreparationIntentStore} from './intent_store.js';
import {preparationChoice} from './identity.js';
import {fail} from './policy.js';
import type {DeliveryPreparationChoice,DeliveryPreparationFile} from './contract.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
const open=DeliveryPreparationIntentStore.prototype.open,close=DeliveryPreparationIntentStore.prototype.close;
export class DeliveryPreparationResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#scope:DeliveryPreparationReadScope|undefined;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:DeliveryPreparationIntentStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('delivery_preparation_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(provided:DeliveryPreparationChoice,options:SharedArchiveIntegrityOptions,initial?:Blob):Promise<DeliveryPreparationFile>{this.check();if(this.#scope||this.#opening||this.#lease)throw fail('delivery_preparation_busy');const choice=preparationChoice(provided),scope=new DeliveryPreparationReadScope(options);this.#scope=scope;const check=()=>{this.check();scope.check();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.database],()=>this.#close(),{policy:()=>fail('delivery_preparation_policy'),busy:()=>fail('delivery_preparation_busy'),storage:()=>fail('delivery_preparation_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.database));check();const store=new DeliveryPreparationIntentStore(this.#factory,choice,{wasm:scope.integrity.wasm,checkAuthority:check,signal:scope.signal});this.#store=store;const result=await open.call(store,initial);this.check();return result;}
 close():Promise<void>{this.#closing=true;this.#scope?.close();return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#scope?.close();this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#scope=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
