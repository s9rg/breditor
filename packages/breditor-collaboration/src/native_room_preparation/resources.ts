/** Only the preparation namespace is held here, never source/target custody.
 * A failed unreturned opening retains its cleanup until the real request ends. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {RoomPreparationChoice,RoomPreparationFile} from './contract.js';
import {RoomPreparationIntentStore} from './intent_store.js';
import {roomPreparationChoice} from './plan.js';
import {fail} from './policy.js';
const open=RoomPreparationIntentStore.prototype.open,close=RoomPreparationIntentStore.prototype.close;
export class RoomPreparationResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:RoomPreparationIntentStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_preparation_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(provided:RoomPreparationChoice,integrity:SharedArchiveIntegrityOptions,initial?:Blob):Promise<RoomPreparationFile>{this.check();if(this.#opening||this.#lease)throw fail('room_preparation_busy');const choice=roomPreparationChoice(provided),check=()=>{this.check();integrity.checkAuthority();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.plan.database],()=>this.#close(),{policy:()=>fail('room_preparation_policy'),busy:()=>fail('room_preparation_busy'),storage:()=>fail('room_preparation_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.plan.database));check();const store=new RoomPreparationIntentStore(this.#factory,choice,{wasm:integrity.wasm,checkAuthority:check,...(integrity.signal?{signal:integrity.signal}:{})});this.#store=store;const result=await open.call(store,initial);this.check();return result;}
 close():Promise<void>{this.#closing=true;return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
