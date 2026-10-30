/** Origin-local namespace custody for the unchanged two-string physical
 * schema. Native metadata semantics are checked before this class is created.
 * This reuses byte-copy IO only; old review protocol readers stay closed. */
import {RecoveryOpeningCustody,recoveryOpeningContext} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {prepareArchiveIntegrity} from '../archive_integrity/context.js';
import type {SharedArchiveIntegrityOptions} from '../archive_integrity/contract.js';
import {LocalReviewRestoreDatabase as PairCopy} from '../selected_local_review_restore/database.js';
import type {LocalMetadataDeliveryChoice,LocalMetadataDeliverySnapshot,LocalMetadataRoomBundle} from './contract.js';
import {metadataChoice,metadataSnapshot,metadataJson,equal} from './policy.js';
import {metadataRestorePresence} from './restore_policy.js';
import {fail} from './error.js';
import type {LocalMetadataRestorePresence} from './restore_contract.js';
const methods={inspect:PairCopy.prototype.inspect,create:PairCopy.prototype.create,close:PairCopy.prototype.close};
function translated(error:unknown):never{if(error&&typeof error==='object'&&'code'in error&&typeof error.code==='string'&&error.code.startsWith('local_review_restore_'))throw fail(error.code.replace('local_review_restore_','local_metadata_restore_'));throw error;}
export class LocalMetadataRestoreResources{
 readonly #factory=recoveryOpeningContext();readonly #locks=navigator.locks;readonly #bundle;readonly #choice;readonly #text;readonly #options;
 #opening:RecoveryOpeningCustody|undefined;#lease:RecoveryLease|undefined;#database:PairCopy|undefined;#closing=false;#closed=false;#running:Promise<unknown>|undefined;#ending:Promise<void>|undefined;#releasing:Promise<void>|undefined;
 constructor(choice:LocalMetadataDeliveryChoice,bundle:LocalMetadataRoomBundle,snapshot:LocalMetadataDeliverySnapshot,options:SharedArchiveIntegrityOptions){this.#choice=metadataChoice(choice);this.#bundle=bundle;this.#text=metadataJson(snapshot);this.#options={...options};if(choice.database===choice.parent.database||choice.database===bundle.parent.prepared.choice.database||!equal(choice.parent.before,bundle.parent.prepared.choice.before))throw fail('local_metadata_restore_policy');Object.freeze(this);}
 check=()=>{if(this.#closing||this.#closed||globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#locks)throw fail('local_metadata_restore_closed');if(this.#lease)checkRecoveryLeasesHeld([this.#lease]);};
 #guard=()=>{this.check();if(this.#options.signal?.aborted)throw fail('local_metadata_restore_aborted');this.#options.checkAuthority();this.check();if(this.#options.signal?.aborted)throw fail('local_metadata_restore_aborted');};
 #run<T>(work:()=>Promise<T>):Promise<T>{this.check();if(this.#running)throw fail('local_metadata_restore_busy');const task=Promise.resolve().then(work);this.#running=task;return task.finally(()=>{this.#running=undefined;});}
 reserve():Promise<void>{return this.#run(async()=>{this.#guard();if(this.#opening||this.#database)throw fail('local_metadata_restore_busy');const snapshot=await metadataSnapshot(JSON.parse(this.#text),this.#choice);if(metadataJson(snapshot)!==this.#text)throw fail();const integrity=prepareArchiveIntegrity({...this.#options,checkAuthority:this.#guard});
  this.#opening=await RecoveryOpeningCustody.reserve(this.#factory,[this.#choice.database],()=>this.#close(),{policy:()=>fail('local_metadata_restore_policy'),busy:()=>fail('local_metadata_restore_busy'),storage:()=>fail('local_metadata_restore_storage')});this.#guard();this.#lease=await RecoveryLease.acquire(JSON.stringify(this.#choice.database));this.#guard();
  this.#database=new PairCopy(this.#factory,{prepared:this.#bundle.parent.prepared,deliveryDatabase:this.#choice.database,before:metadataJson(snapshot.before),current:metadataJson(snapshot.current)},integrity,this.#guard);this.#guard();
 });}
 async #inspect():Promise<LocalMetadataRestorePresence>{this.#guard();if(!this.#database)throw fail('local_metadata_restore_closed');try{return metadataRestorePresence(await methods.inspect.call(this.#database,'delivery'));}catch(error){translated(error);}}
 inspect():Promise<LocalMetadataRestorePresence>{return this.#run(()=>this.#inspect());}
 restore(expected:LocalMetadataRestorePresence):Promise<void>{const selected=metadataRestorePresence(expected);return this.#run(async()=>{if(await this.#inspect()!==selected)throw fail('local_metadata_restore_stale');if(selected==='absent')try{await methods.create.call(this.#database!,'delivery');}catch(error){translated(error);}this.#guard();if(await this.#inspect()!=='identical')throw fail();});}
 close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#releasing)return this.#releasing;this.#closing=true;if(this.#database)void methods.close.call(this.#database).catch(()=>{});const pending=this.#running;this.#releasing=(async()=>{await pending?.catch(()=>{});if(this.#opening)await this.#opening.rollback();else await this.#close();})().finally(()=>{this.#releasing=undefined;});return this.#releasing;}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#ending)return this.#ending;this.#closing=true;const pending=this.#database?methods.close.call(this.#database):undefined;this.#ending=(async()=>{const results=await Promise.allSettled([pending,this.#running]);if(results[0]?.status==='rejected')throw fail('local_metadata_restore_storage');await this.#lease?.close();this.#lease=undefined;this.#database=undefined;this.#closed=true;})().finally(()=>{this.#ending=undefined;});return this.#ending;}
}
