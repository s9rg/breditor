/** Existing-only selected storage under actual namespace and whole-store
 * custody. Construction is SDK-private; an archive/choice cannot donate these
 * resources. Failed cleanup remains in real opening custody for retry. */
import {RichAssetStore,RichAssetStoreCustody} from '@breditor/experimental-rich-content';
import {RoomAssetAdoptionStore,type AdoptionFiles} from '../physical_room_asset_adoption/storage.js';
import type {RoomAssetAdoptionRecord} from '../physical_room_asset_adoption/contract.js';
import type {SelectedAssetResources} from '../physical_room_asset_successor/custody.js';
import type {RetainedRootPreparation} from '../physical_room_operation_v3/operation.js';
import {PhysicalOperationV3Cancellation} from '../physical_room_operation_v3/storage_cancellation.js';
import {RecoveryOpeningCustody} from '../participant_recovery/opening_custody.js';
import {RecoveryLease,checkRecoveryLeasesHeld} from '../participant_recovery/lease.js';
import {database,fail} from '../physical_room_asset_adoption/policy.js';
const open=RichAssetStore.openRetained,acquire=RichAssetStore.prototype.acquireRecoveryCustody,checkStore=RichAssetStore.prototype.checkOpen,closeStore=RichAssetStore.prototype.close,held=RichAssetStoreCustody.prototype.check,closeCustody=RichAssetStoreCustody.prototype.close;
const errors={policy:()=>fail('asset_adoption_policy'),busy:()=>fail('asset_adoption_busy'),storage:()=>fail()};
/** SDK-only storage lifetime supplied by a cold build holding genuine fresh
 * actors and current source/read grants. It is deliberately not a root-busy
 * witness: these actual upload stores outlive original native-root closure. */
export interface ColdSelectedStorageContext{readonly factory:IDBFactory;readonly locks:LockManager;readonly namespaces:readonly string[];checkCurrent():void}
export class ColdSelectedResources{
 readonly record:RoomAssetAdoptionRecord;readonly intentDatabase:string;
 readonly owned:SelectedAssetResources={targets:new Map(),targetLeases:new Map()};
 readonly #observation;readonly #unclaimed=new Map<string,RichAssetStore>();
 #context:ColdSelectedStorageContext|undefined;#opening:RecoveryOpeningCustody|undefined;#files:AdoptionFiles|undefined;#stageOpened=false;#moved=false;#closing=false;#closed=false;#cleanup:Promise<void>|undefined;
 constructor(record:RoomAssetAdoptionRecord,intentDatabase:string,signal?:AbortSignal){this.record=record;this.intentDatabase=database(intentDatabase);this.#observation=new PhysicalOperationV3Cancellation(signal);Object.freeze(this);}
 checkLocal=()=>{const context=this.#context;if(!context||this.#closing||this.#closed||globalThis.indexedDB!==context.factory||globalThis.navigator?.locks!==context.locks)throw fail('asset_adoption_closed');if(this.#stageOpened)this.owned.store!.checkReadCurrent();checkRecoveryLeasesHeld([...(this.owned.lease?[this.owned.lease]:[]),...this.owned.targetLeases.values(),...(this.owned.intentLease?[this.owned.intentLease]:[])]);for(const target of this.owned.targets.values())checkStore.call(target.store);};
 checkJob=()=>{this.checkLocal();this.#observation.check();this.#context!.checkCurrent();for(const target of this.owned.targets.values())held.call(target.custody);};
 get files():AdoptionFiles{if(!this.#files)throw fail('asset_adoption_missing');return this.#files;}
 /** Ordinary cold-selected recovery retains the genuine root-busy context. */
 async prepare(context:RetainedRootPreparation):Promise<void>{return this.#prepare(context);}
 /** Explicit fresh-actor cold-build composition only, never serialized input. */
 async preparePinned(context:ColdSelectedStorageContext):Promise<void>{return this.#prepare(context);}
 async #prepare(context:ColdSelectedStorageContext):Promise<void>{
  if(this.#context||this.#closed||this.#moved)throw fail('asset_adoption_busy');this.#context=context;const used=new Set(context.namespaces),names=[this.record.database,this.intentDatabase,...this.record.participants.map(row=>row.targetDatabase)];if(this.record.source.operationDatabase!==context.namespaces[0]||new Set(names).size!==names.length||names.some(name=>used.has(name)))throw fail('asset_adoption_policy');this.checkJob();
  this.#opening=await RecoveryOpeningCustody.reserve(context.factory,[this.record.database],()=>this.#close(),errors);this.checkJob();this.owned.lease=await RecoveryLease.acquire(JSON.stringify(this.record.database));this.checkJob();this.owned.intentLease=await RecoveryLease.acquire(JSON.stringify(this.intentDatabase));this.checkJob();
  // All target namespace choices are reserved before opening a raster store.
  for(const row of this.record.participants){this.owned.targetLeases.set(row.id,await RecoveryLease.acquire(JSON.stringify(row.targetDatabase)));this.checkJob();}
  this.owned.store=new RoomAssetAdoptionStore(context.factory,this.record.database,this.checkJob);await this.owned.store.open(undefined,this.checkJob);this.#stageOpened=true;const saved=await this.owned.store.read(this.checkJob);this.checkJob();if(JSON.stringify(saved.record)!==JSON.stringify(this.record))throw fail('asset_adoption_diverged');this.#files=saved.files;
  for(const row of this.record.participants){const store=await open.call(RichAssetStore,row.targetDatabase,{limits:row.limits});this.#unclaimed.set(row.id,store);this.checkJob();const custody=await acquire.call(store);this.owned.targets.set(row.id,{store,custody});this.#unclaimed.delete(row.id);this.checkJob();}
  this.checkJob();
 }
 /** Private state/ledger completion only, inside the common root barrier. */
 commit():void{this.#opening!.complete();this.#moved=true;this.#observation.close();}
 async abandon():Promise<void>{if(this.#moved)return;this.#closing=true;if(this.#opening)await this.#opening.rollback();else await this.#close();}
 #close():Promise<void>{if(this.#closed)return Promise.resolve();if(this.#cleanup)return this.#cleanup;this.#closing=true;this.#cleanup=(async()=>{
  const results=await Promise.allSettled([...this.owned.targets].reverse().map(async([id,target])=>{await closeCustody.call(target.custody);closeStore.call(target.store);this.owned.targets.delete(id);}));for(const[id,store]of this.#unclaimed){closeStore.call(store);this.#unclaimed.delete(id);}if(results.some(row=>row.status==='rejected'))throw fail();await this.owned.intent?.close();await this.owned.store?.close();for(const[id,lease]of [...this.owned.targetLeases].reverse()){await lease.close();this.owned.targetLeases.delete(id);}await this.owned.intentLease?.close();await this.owned.lease?.close();this.#observation.close();this.#closed=true;
 })().finally(()=>{this.#cleanup=undefined;});return this.#cleanup;}
}
