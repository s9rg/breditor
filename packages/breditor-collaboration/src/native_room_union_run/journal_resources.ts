/** Actual journal namespace/request custody survives rejected opens. Cleanup
 * does not require ongoing permission; late pending requests remain tracked. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {NativeRoomUnionRunJournalStore} from './journal_store.js';
import {fail} from './policy.js';
import type {NativeRoomUnionRunIdentity,NativeRoomUnionRunSnapshot,NativeRoomUnionRunStage,NativeRoomUnionRunHandoff} from './contract.js';
const api={open:NativeRoomUnionRunJournalStore.prototype.open,read:NativeRoomUnionRunJournalStore.prototype.read,append:NativeRoomUnionRunJournalStore.prototype.append,close:NativeRoomUnionRunJournalStore.prototype.close};
export class NativeRoomUnionRunJournalResources {
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:NativeRoomUnionRunJournalStore|undefined;
 #closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_union_run_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(identity:NativeRoomUnionRunIdentity,integrity:SharedArchiveIntegrityOptions,create:boolean):Promise<NativeRoomUnionRunSnapshot>{
  this.check();if(this.#opening||this.#lease)throw fail('room_union_run_busy');const check=()=>{this.check();integrity.checkAuthority();this.check();};
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[identity.database],()=>this.#close(),{policy:()=>fail('room_union_run_policy'),busy:()=>fail('room_union_run_busy'),storage:()=>fail('room_union_run_storage')});check();
  this.#lease=await RecoveryLease.acquire(JSON.stringify(identity.database));check();
  this.#store=new NativeRoomUnionRunJournalStore(this.#factory,identity,{wasm:integrity.wasm,checkAuthority:check,...(integrity.signal?{signal:integrity.signal}:{})});
  return api.open.call(this.#store,create);
 }
 read(){this.check();if(!this.#store)throw fail('room_union_run_closed');return api.read.call(this.#store);}
 append(before:NativeRoomUnionRunSnapshot,stage:Exclude<NativeRoomUnionRunStage,'start'>,handoff:NativeRoomUnionRunHandoff|null=null){this.check();if(!this.#store)throw fail('room_union_run_closed');return api.append.call(this.#store,before,stage,handoff);}
 close():Promise<void>{this.#closing=true;return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await api.close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
