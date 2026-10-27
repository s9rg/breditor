/** Only the preparation namespace is held here, never source/target custody.
 * A failed unreturned opening retains its cleanup until the real request ends. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type{NativeRoomUnionReadOptions as Read}from'./contract.js';
import type {NativeRoomUnionChoice,NativeRoomUnionFile} from './contract.js';
import {NativeRoomUnionIntentStore} from './intent_store.js';
import {unionChoice} from './plan.js';
import {fail} from './policy.js';
const open=NativeRoomUnionIntentStore.prototype.open,close=NativeRoomUnionIntentStore.prototype.close;
export class NativeRoomUnionResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:NativeRoomUnionIntentStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_union_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(provided:NativeRoomUnionChoice,integrity:Read,initial?:Blob):Promise<NativeRoomUnionFile>{this.check();if(this.#opening||this.#lease)throw fail('room_union_busy');const choice=unionChoice(provided),check=()=>{this.check();integrity.checkAuthority();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.plan.database],()=>this.#close(),{policy:()=>fail('room_union_policy'),busy:()=>fail('room_union_busy'),storage:()=>fail('room_union_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.plan.database));check();const store=new NativeRoomUnionIntentStore(this.#factory,choice,{...integrity,checkAuthority:check});this.#store=store;const result=await open.call(store,initial);this.check();return result;}
 close():Promise<void>{this.#closing=true;return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
