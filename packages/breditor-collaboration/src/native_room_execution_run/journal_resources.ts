/** Actual journal namespace/request custody survives rejected opens. Cleanup
 * does not require ongoing permission; late pending requests remain tracked. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {RoomRunJournalStore} from './journal_store.js';
import {fail} from '../native_room_execution/policy.js';
import type {RoomRunIdentity,RoomRunSnapshot,RoomRunStage} from './contract.js';
const api={open:RoomRunJournalStore.prototype.open,observe:RoomRunJournalStore.prototype.observe,read:RoomRunJournalStore.prototype.read,append:RoomRunJournalStore.prototype.append,close:RoomRunJournalStore.prototype.close};
export class RoomRunJournalResources {
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:RoomRunJournalStore|undefined;
 #closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_execution_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(identity:RoomRunIdentity,integrity:SharedArchiveIntegrityOptions,create:boolean):Promise<RoomRunSnapshot>{
  const store=await this.#hold(identity,integrity);
  return api.open.call(store,create);
 }
 async observe(identity:RoomRunIdentity,integrity:SharedArchiveIntegrityOptions):Promise<RoomRunSnapshot|null>{
  const store=await this.#hold(identity,integrity);
  return api.observe.call(store);
 }
 async #hold(identity:RoomRunIdentity,integrity:SharedArchiveIntegrityOptions):Promise<RoomRunJournalStore>{
  this.check();if(this.#opening||this.#lease)throw fail('room_execution_busy');const check=()=>{this.check();integrity.checkAuthority();this.check();};
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[identity.database],()=>this.#close(),{policy:()=>fail('room_execution_policy'),busy:()=>fail('room_execution_busy'),storage:()=>fail('room_execution_storage')});check();
  this.#lease=await RecoveryLease.acquire(JSON.stringify(identity.database));check();
  this.#store=new RoomRunJournalStore(this.#factory,identity,{wasm:integrity.wasm,checkAuthority:check,...(integrity.signal?{signal:integrity.signal}:{})});
  return this.#store;
 }
 read(){this.check();if(!this.#store)throw fail('room_execution_closed');return api.read.call(this.#store);}
 append(before:RoomRunSnapshot,stage:Exclude<RoomRunStage,'start'>){this.check();if(!this.#store)throw fail('room_execution_closed');return api.append.call(this.#store,before,stage);}
 close():Promise<void>{this.#closing=true;return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await api.close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
