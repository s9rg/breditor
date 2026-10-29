/** One origin-local custody owner for BOTH unchanged namespaces. Partial
 * commits remain facts. Exact idempotent retry requires a new observed choice. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import {archiveBlob} from '../archive_integrity/policy.js';
import {preparationChoice} from '../selected_delivery_preparation/identity.js';
import {MAX_SELECTED_ROOM_CURRENT_BYTES} from '../selected_room_current/manifest.js';
import {localChoice,localSnapshot,localJson,equal,fail} from '../selected_local_review_delivery/policy.js';
import {LocalReviewRestoreDatabase} from './database.js';
import {restoreDestinations} from './identity.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import type {DeliveryPreparationFile} from '../selected_delivery_preparation/contract.js';
import type {LocalReviewDeliveryChoice,LocalReviewDeliverySnapshot} from '../selected_local_review_delivery/contract.js';
import type {LocalReviewRestoreDestinations} from './contract.js';
const methods={inspect:LocalReviewRestoreDatabase.prototype.inspect,create:LocalReviewRestoreDatabase.prototype.create,close:LocalReviewRestoreDatabase.prototype.close};
export class LocalReviewRestoreResources {
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #prepared;readonly #choice;readonly #text;readonly #options;
 #opening:RecoveryOpeningCustody|undefined;readonly #leases:RecoveryLease[]=[];#database:LocalReviewRestoreDatabase|undefined;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#ending:Promise<void>|undefined;#releasing:Promise<void>|undefined;
 constructor(prepared:DeliveryPreparationFile,choice:LocalReviewDeliveryChoice,snapshot:LocalReviewDeliverySnapshot,options:SharedArchiveIntegrityOptions){this.#prepared=Object.freeze({choice:preparationChoice(prepared.choice),file:archiveBlob(prepared.file,MAX_SELECTED_ROOM_CURRENT_BYTES)});this.#choice=localChoice(choice);this.#text=localJson(snapshot);this.#options={...options};if(this.#choice.database===this.#prepared.choice.database||!equal(this.#choice.before,this.#prepared.choice.before))throw fail('local_review_restore_policy');Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('local_review_restore_closed');checkRecoveryLeasesHeld(this.#leases);};
 #guard=()=>{this.check();if(this.#options.signal?.aborted)throw fail('local_review_restore_aborted');this.#options.checkAuthority();this.check();if(this.#options.signal?.aborted)throw fail('local_review_restore_aborted');};
 #run<T>(work:()=>Promise<T>):Promise<T>{this.check();if(this.#running)throw fail('local_review_restore_busy');const task=Promise.resolve().then(work);this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 reserve():Promise<void>{return this.#run(async()=>{this.#guard();if(this.#opening||this.#database)throw fail('local_review_restore_busy');const snapshot=await localSnapshot(JSON.parse(this.#text),this.#choice);if(localJson(snapshot)!==this.#text)throw fail();const integrity=prepareArchiveIntegrity({...this.#options,checkAuthority:this.#guard});if(this.#prepared.file.size!==this.#prepared.choice.before.bytes||await integrity.digest(this.#prepared.file)!==this.#prepared.choice.before.sha256)throw fail();const names=[this.#choice.database,this.#prepared.choice.database].sort();
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,names,()=>this.#close(),{policy:()=>fail('local_review_restore_policy'),busy:()=>fail('local_review_restore_busy'),storage:()=>fail('local_review_restore_storage')});this.#guard();for(const name of names){this.#leases.push(await RecoveryLease.acquire(JSON.stringify(name)));this.#guard();}
  this.#database=new LocalReviewRestoreDatabase(this.#factory,{prepared:this.#prepared,deliveryDatabase:this.#choice.database,before:localJson(snapshot.before),current:localJson(snapshot.current)},integrity,this.#guard);this.#guard();
 });}
 async #inspect():Promise<LocalReviewRestoreDestinations>{this.#guard();if(!this.#database)throw fail('local_review_restore_closed');const prepared=await methods.inspect.call(this.#database,'prepared'),delivery=await methods.inspect.call(this.#database,'delivery');this.#guard();return restoreDestinations({prepared,delivery});}
 inspect():Promise<LocalReviewRestoreDestinations>{return this.#run(()=>this.#inspect());}
 /** No cross-database atomicity is claimed. A failed second copy leaves the
  * exact first copy for a newly approved identical/absent retry. */
 restore(expected:LocalReviewRestoreDestinations):Promise<void>{const selected=restoreDestinations(expected);return this.#run(async()=>{if(!equal(await this.#inspect(),selected))throw fail('local_review_restore_stale');for(const name of ['prepared','delivery'] as const){if(selected[name]==='absent')await methods.create.call(this.#database!,name);this.#guard();}if(!equal(await this.#inspect(),{prepared:'identical',delivery:'identical'}))throw fail();});}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#releasing)return this.#releasing;this.#closing=true;if(this.#database)void methods.close.call(this.#database).catch(()=>{});const pending=this.#running;this.#releasing=(async()=>{await pending?.catch(()=>{});if(this.#opening)await this.#opening.rollback();else await this.#close();})().finally(()=>{this.#releasing=undefined;});return this.#releasing;}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;const closing=this.#database?methods.close.call(this.#database):undefined;this.#ending=(async()=>{const results=await Promise.allSettled([closing,this.#running]);if(results[0]?.status==='rejected')throw fail('local_review_restore_storage');for(const lease of [...this.#leases].reverse())await lease.close();this.#leases.length=0;this.#database=undefined;this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;}
}
