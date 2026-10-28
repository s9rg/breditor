/** The immutable execution database alone is held here. This is not source,
 * actor, destination or serving custody. Actual pending requests remain owned
 * until their late upgrade/success/error has finished and cleanup is complete. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {RoomExecutionReadScope} from '../native_room_execution/read_scope.js';
import {GenerationComponentReconstructionIntentStore} from './intent_store.js';
import {generationComponentReconstructionChoice} from './plan.js';
import {fail} from './policy.js';
import type {GenerationComponentReconstructionChoice,GenerationComponentReconstructionFile,GenerationComponentReconstructionReadOptions} from './contract.js';
const open=GenerationComponentReconstructionIntentStore.prototype.open,close=GenerationComponentReconstructionIntentStore.prototype.close;
export class GenerationComponentReconstructionResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;#scope:RoomExecutionReadScope|undefined;#opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#store:GenerationComponentReconstructionIntentStore|undefined;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(){Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('generation_component_reconstruction_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);this.#store?.checkCurrent();};
 async open(provided:GenerationComponentReconstructionChoice,options:GenerationComponentReconstructionReadOptions,initial?:Blob):Promise<GenerationComponentReconstructionFile>{this.check();if(this.#scope||this.#opening||this.#lease)throw fail('generation_component_reconstruction_busy');const choice=generationComponentReconstructionChoice(provided),scope=new RoomExecutionReadScope(options);this.#scope=scope;const check=()=>{this.check();scope.check();this.check();};this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[choice.plan.database],()=>this.#close(),{policy:()=>fail('generation_component_reconstruction_policy'),busy:()=>fail('generation_component_reconstruction_busy'),storage:()=>fail('generation_component_reconstruction_storage')});check();this.#lease=await RecoveryLease.acquire(JSON.stringify(choice.plan.database));check();const store=new GenerationComponentReconstructionIntentStore(this.#factory,choice,{wasm:scope.integrity.wasm,reads:scope.reads,checkAuthority:check,signal:scope.signal,...(scope.assets?{assets:scope.assets}:{})});this.#store=store;const result=await open.call(store,initial);this.check();return result;}
 close():Promise<void>{this.#closing=true;this.#scope?.close();return this.#opening?this.#opening.rollback():this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#scope?.close();this.#cleanup=(async()=>{if(this.#store)await close.call(this.#store);await this.#lease?.close();this.#store=undefined;this.#lease=undefined;this.#scope=undefined;this.#closed=true;})().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
