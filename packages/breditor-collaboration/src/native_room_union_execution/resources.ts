/** Only the preparation namespace is held here, never source/target custody.
 * A failed unreturned opening retains its cleanup until the real request ends. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type{NativeRoomUnionExecutionReadOptions as Read}from'./contract.js';
import type{AuthenticatedNativeRoomUnionReadOptions as AuthRead}from'../native_room_union_authentication/contract.js';
import type {NativeRoomUnionExecutionChoice,NativeRoomUnionExecutionFile} from './contract.js';
import {NativeRoomUnionExecutionIntentStore} from './intent_store.js';
import {unionExecutionChoice} from './plan.js';
import {fail} from './policy.js';
const open=NativeRoomUnionExecutionIntentStore.prototype.open,close=NativeRoomUnionExecutionIntentStore.prototype.close;
export class NativeRoomUnionExecutionResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:NativeRoomUnionExecutionIntentStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('room_union_execution_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(provided:NativeRoomUnionExecutionChoice,integrity:Read,initial?:Blob):Promise<NativeRoomUnionExecutionFile>{return this.#open(provided,integrity,false,initial);}
 async openAuthenticated(provided:NativeRoomUnionExecutionChoice,integrity:AuthRead,initial?:Blob):Promise<NativeRoomUnionExecutionFile>{return this.#open(provided,integrity,true,initial);}
 async #open(provided:NativeRoomUnionExecutionChoice,integrity:Read|AuthRead,authenticated:boolean,initial?:Blob):Promise<NativeRoomUnionExecutionFile>{this.check();if(this.#opening||this.#lease)throw fail('room_union_execution_busy');const choice=unionExecutionChoice(provided),check=()=>{this.check();integrity.checkAuthority();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.plan.layout.database],()=>this.#close(),{policy:()=>fail('room_union_execution_policy'),busy:()=>fail('room_union_execution_busy'),storage:()=>fail('room_union_execution_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.plan.layout.database));check();const store=new NativeRoomUnionExecutionIntentStore(this.#factory,choice,{...integrity,checkAuthority:check},authenticated);this.#store=store;const result=await open.call(store,initial);this.check();return result;}
 close():Promise<void>{this.#closing=true;return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
