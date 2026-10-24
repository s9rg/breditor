import {VersionCatalogStore,captureOriginalVersionStoreRecords} from "./store.js";
import {VersionCatalogSync} from "./sync.js";
import {SharedRelayError} from "../relay/validation.js";
import {registerManagedSource,checkManagedSource,checkManagedSourceBindings} from "../managed_custody.js";
import {participantAuthority} from '../participant_backup/policy.js';
import {createOriginalRecordRead,type OriginalRecordRead,type OriginalVersionRecords} from '../persistence/original_record_read.js';
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import type {SharedDocumentVersionsOptions,SharedDocumentVersionsState,SharedDocumentVersionStatus,SharedVersionCatalogRecord} from "./types.js";
import type {SharedDocumentVersionsBackupOptions,SharedRetainedStoreBackupOptions} from "../backups/retained_store_types.js";
import type {SharedParticipantReplay} from "../participant_replay/read.js";
import type {SharedRetainedVersionRecoveryResult} from "./reconcile_types.js";
const constructionKey=Object.freeze({}),attached=new WeakSet<object>();
let readOriginalCatalog:(owner:SharedDocumentVersions,authority:()=>void,signal?:AbortSignal)=>Promise<OriginalRecordRead<OriginalVersionRecords>>;
/** Opt-in shared immutable versions: independent cache/intent durability, one borrowed native owner. */
export class SharedDocumentVersions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #store:VersionCatalogStore<P>;readonly #sync:VersionCatalogSync<P>;#retiring=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 #recovering=false;
 private constructor(key:object,store:VersionCatalogStore<P>){if(key!==constructionKey)throw new SharedRelayError('managed_source_construction');this.#store=store;this.#sync=new VersionCatalogSync(store);const core=store.options.storage.core;registerManagedSource(this,core,()=>{this.#writable();checkManagedSource(store,core);},[store]);}
 static{readOriginalCatalog=async(owner,provided,signal)=>{
  if(!owner||typeof owner!=='object'||!(#store in owner))throw new SharedRelayError('version_record_read_source');const authority=participantAuthority(provided);owner.#writable();checkManagedSourceBindings(owner);const releaseSync=owner.#sync.reserveLocalRead();owner.#recovering=true;let inner:OriginalRecordRead<OriginalVersionRecords>|undefined,result:OriginalRecordRead<OriginalVersionRecords>|undefined,released=false;
  const release=()=>{if(!released){released=true;inner?.dispose();owner.#recovering=false;releaseSync();}},current=()=>{if(released||owner.#closed||owner.#retiring||!owner.#recovering)throw new SharedRelayError('version_record_read_closed');checkManagedSourceBindings(owner);inner!.checkCurrent();};
  try{inner=await captureOriginalVersionStoreRecords(owner.#store,authority,signal);current();const read=inner;result=createOriginalRecordRead(read.metadata(),{check(){current();read.check();current();},current,async verify(){current();await read.verify();current();},release});result.check();return result;}
  catch(error){result?.dispose();release();throw error;}
 };}
 static async open<Q extends SharedSelectionPolicy>(options:SharedDocumentVersionsOptions<Q>):Promise<SharedDocumentVersions<Q>>{
  const core=options.storage.core;if(attached.has(core))throw new SharedRelayError("version_catalog_already_attached");attached.add(core);let store:VersionCatalogStore<Q>|undefined;
  try{store=await VersionCatalogStore.open(options);return new SharedDocumentVersions(constructionKey,store);}catch(error){if(store)await store.discardAndClose();attached.delete(core);throw error;}
 }
 /** Empty-key recovery only. The host supplies current authority; no connection starts here. */
 static async restoreBackup<Q extends SharedSelectionPolicy>(options:SharedDocumentVersionsBackupOptions<Q>):Promise<SharedDocumentVersions<Q>>{
  const core=options.storage.core;if(attached.has(core))throw new SharedRelayError("version_catalog_already_attached");attached.add(core);let store:VersionCatalogStore<Q>|undefined;
  try{store=await VersionCatalogStore.restoreBackup(options);return new SharedDocumentVersions(constructionKey,store);}catch(error){if(store)await store.discardAndClose();attached.delete(core);throw error;}
 }
 #writable():void{if(this.#closed)throw new SharedRelayError("version_cache_closed");if(this.#retiring)throw new SharedRelayError("version_cache_closing");if(this.#recovering)throw new SharedRelayError("version_recovery_in_use");}
 state():SharedDocumentVersionsState{return this.#sync.state();}
 versionsState():SharedDocumentVersionsState{return this.state();}
 subscribeVersions(listener:()=>void):()=>void{return this.#sync.subscribe(listener);}
 versions():readonly SharedDocumentVersionInfo[]{return this.#store.versions();}
 versionStatus(id:string):SharedDocumentVersionStatus{return this.#store.versionStatus(id);}
 versionPacket(id:string):string{return this.#store.packet(id);}
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo{this.#writable();return this.#store.saveVersion(name,createdAtMs);}
 /** Explicitly queue an already captured, native source-proven packet. Never recaptures on retry. */
 queueVersion(packet:string):SharedDocumentVersionInfo{this.#writable();return this.#store.queuePacket(packet);}
 loadVersion(id:string):Promise<string>{this.#writable();return this.#sync.loadVersion(id);}
 connect():Promise<void>{this.#writable();return this.#sync.connect();}
 syncVersions():Promise<void>{this.#writable();return this.#sync.refresh();}
 disconnect():void{this.#sync.disconnect();}
 /** After disconnect(), await outstanding delivery work before explicit local reconciliation. */
 waitForDisconnected():Promise<void>{this.#writable();return this.#sync.waitForDisconnected();}
 /** Local durability only. Use flushShared for accepted-and-locally-confirmed publication. */
 flush():Promise<void>{return this.#store.flush();}
 flushShared():Promise<void>{this.#writable();return this.#sync.flushShared();}
 async retry():Promise<void>{if(this.#recovering)throw new SharedRelayError("version_recovery_in_use");await this.#store.retry();if(!this.#retiring)this.#sync.recoverLocal();}
 exportRecovery():SharedVersionCatalogRecord{return this.#store.exportRecovery();}
 exportBackup(options:SharedRetainedStoreBackupOptions={}):Promise<string>{return this.#store.exportBackup(options);}
 /** Read-only recovery captures must use this catalog's exact still-live borrowed source. */
 checkSource(core:SharedRichEditor<P>):void{this.#writable();this.#store.checkSource(core);}
 /** Explicit offline-only retention from a genuine original native replay. Incompatible
  * receipts, catalogs or retry choices refuse without a partial merge. No native edit or
  * account token/delivery starts. Keep the source live through admission; copied data then
  * survives source disposal. A save failure retains the complete merged export for retry. */
 async recoverRetainedVersions(replay:SharedParticipantReplay):Promise<SharedRetainedVersionRecoveryResult>{
  this.#writable();const release=this.#sync.reserveLocalRecovery();this.#recovering=true;
  try{return await this.#store.recoverRetainedVersions(replay);}finally{this.#recovering=false;release();}
 }
 async stopRetryingVersion(id:string):Promise<void>{this.#writable();this.#store.stopRetrying(id);await this.#store.flush();}
 async forgetCachedVersion(id:string):Promise<void>{this.#writable();if(this.#sync.busy(id))throw new SharedRelayError("version_in_flight");this.#store.forgetCachedPacket(id);await this.#store.flush();}
 /** Stops this adapter and releases its own cache lease only after a successful final save. */
 close():Promise<void>{if(this.#recovering)return Promise.reject(new SharedRelayError("version_recovery_in_use"));if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#sync.disconnect();this.#closing=Promise.resolve().then(async()=>{await this.#store.close();this.#sync.dispose();this.#closed=true;attached.delete(this.#store.options.storage.core);}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 /** Explicitly abandon unsaved cache state; the last committed record and native owners remain. */
 discardAndClose():Promise<void>{if(this.#recovering)return Promise.reject(new SharedRelayError("version_recovery_in_use"));if(this.#closed)return this.#released??Promise.resolve();this.#retiring=true;this.#closed=true;this.#sync.dispose();this.#released=this.#store.discardAndClose().finally(()=>attached.delete(this.#store.options.storage.core));return this.#released;}
}
/** Genuine offline adapter owns one synchronization reservation. Its read fence
 * deliberately does not call the writable guard while that reservation is held. */
export function captureOriginalVersionRecords<P extends SharedSelectionPolicy>(owner:SharedDocumentVersions<P>,checkAuthority:()=>void,signal?:AbortSignal){return readOriginalCatalog(owner as unknown as SharedDocumentVersions,checkAuthority,signal);}
