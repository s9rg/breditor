/** Finite execution-journal namespace custody. Failed raw openings and real
 * cleanup closures stay in opening custody; source/native ownership is separate. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {NativeExecutionJournalStore} from './journal_store.js';
import {fail} from './policy.js';
import type {NativeExecutionIdentity,NativeExecutionInitial,NativeExecutionSnapshot} from './contract.js';
import type {SelectedRoomCurrentFile} from '../selected_room_current/contract.js';
const methods={open:NativeExecutionJournalStore.prototype.open,read:NativeExecutionJournalStore.prototype.readFresh,append:NativeExecutionJournalStore.prototype.append,close:NativeExecutionJournalStore.prototype.close};
export class NativeExecutionResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:NativeExecutionJournalStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('native_execution_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(identity:NativeExecutionIdentity,integrity:SharedArchiveIntegrityOptions,initial?:NativeExecutionInitial):Promise<NativeExecutionSnapshot>{this.check();if(this.#opening||this.#lease)throw fail('native_execution_busy');const check=()=>{this.check();integrity.checkAuthority();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[identity.database],()=>this.#close(),{policy:()=>fail('native_execution_policy'),busy:()=>fail('native_execution_busy'),storage:()=>fail('native_execution_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(identity.database));check();const store=new NativeExecutionJournalStore(this.#factory,identity,{wasm:integrity.wasm,checkAuthority:check,...(integrity.signal?{signal:integrity.signal}:{})});this.#store=store;const result=await methods.open.call(store,initial);this.check();return result;}
 async read():Promise<NativeExecutionSnapshot>{this.check();if(!this.#store)throw fail('native_execution_closed');const result=await methods.read.call(this.#store);this.check();return result;}
 async append(before:NativeExecutionSnapshot,stage:'resume'|'client'|'read',participant:string|null,cut:SelectedRoomCurrentFile,evidence?:Blob):Promise<NativeExecutionSnapshot>{this.check();if(!this.#store)throw fail('native_execution_closed');const result=await methods.append.call(this.#store,before,stage,participant,cut,evidence);this.check();return result;}
 close():Promise<void>{this.#closing=true;return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{if(this.#store)await methods.close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
