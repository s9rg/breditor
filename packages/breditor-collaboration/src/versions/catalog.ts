import {VersionCatalogStore} from "./store.js";
import {VersionCatalogSync} from "./sync.js";
import {SharedRelayError} from "../relay/validation.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import type {SharedDocumentVersionsOptions,SharedDocumentVersionsState,SharedDocumentVersionStatus,SharedVersionCatalogRecord} from "./types.js";
const attached=new WeakSet<object>();
/** Opt-in shared immutable versions: independent cache/intent durability, one borrowed native owner. */
export class SharedDocumentVersions<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #store:VersionCatalogStore<P>;readonly #sync:VersionCatalogSync<P>;#retiring=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 private constructor(store:VersionCatalogStore<P>){this.#store=store;this.#sync=new VersionCatalogSync(store);}
 static async open<Q extends SharedSelectionPolicy>(options:SharedDocumentVersionsOptions<Q>):Promise<SharedDocumentVersions<Q>>{
  const core=options.storage.core;if(attached.has(core))throw new SharedRelayError("version_catalog_already_attached");attached.add(core);let store:VersionCatalogStore<Q>|undefined;
  try{store=await VersionCatalogStore.open(options);return new SharedDocumentVersions(store);}catch(error){if(store)await store.discardAndClose();attached.delete(core);throw error;}
 }
 #writable():void{if(this.#closed)throw new SharedRelayError("version_cache_closed");if(this.#retiring)throw new SharedRelayError("version_cache_closing");}
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
 /** Local durability only. Use flushShared for accepted-and-locally-confirmed publication. */
 flush():Promise<void>{return this.#store.flush();}
 flushShared():Promise<void>{this.#writable();return this.#sync.flushShared();}
 async retry():Promise<void>{await this.#store.retry();if(!this.#retiring)this.#sync.recoverLocal();}
 exportRecovery():SharedVersionCatalogRecord{return this.#store.exportRecovery();}
 async stopRetryingVersion(id:string):Promise<void>{this.#writable();this.#store.stopRetrying(id);await this.#store.flush();}
 async forgetCachedVersion(id:string):Promise<void>{this.#writable();if(this.#sync.busy(id))throw new SharedRelayError("version_in_flight");this.#store.forgetCachedPacket(id);await this.#store.flush();}
 /** Stops this adapter and releases its own cache lease only after a successful final save. */
 close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#sync.disconnect();this.#closing=Promise.resolve().then(async()=>{await this.#store.close();this.#sync.dispose();this.#closed=true;attached.delete(this.#store.options.storage.core);}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 /** Explicitly abandon unsaved cache state; the last committed record and native owners remain. */
 discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();this.#retiring=true;this.#closed=true;this.#sync.dispose();this.#released=this.#store.discardAndClose().finally(()=>attached.delete(this.#store.options.storage.core));return this.#released;}
}
