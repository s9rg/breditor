/** Durable immutable catalog/packet cache. Borrowed source journals are saved first, never replaced. */
import {SharedRelayError} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {segmentedRetainedPort,type SegmentedRetainedPort} from "../segmented_relay/retained_port.js";
import {SharedEditorError} from "../core.js";
import {registerManagedSource,managedSourceUnavailable} from "../managed_custody.js";
import {isOperationalComponent} from "../participant_operation/component_admission.js";
import {existingOperationalComponent} from "../participant_operation/existing_component.js";
import {operationFailure} from "../participant_operation/errors.js";
import {encodeRetainedStoreBackup,decodeRetainedStoreBackup,checkRetainedStoreRecovery,checkRetainedStoreSignal,retainedStoreNativeAdmission} from "../backups/retained_store.js";
import {retainedStoreDestinationExists,insertRetainedStoreRecord} from "../backups/retained_store_database.js";
import type {SharedDocumentVersionsBackupOptions,SharedRetainedStoreBackupOptions} from "../backups/retained_store_types.js";
import {VersionCatalogLease} from "./lease.js";
import {checkCatalogRecord,openCatalogDatabase,readCatalogRecord,writeCatalogRecord,cacheKey} from "./database.js";
import {catalogSnapshot,packetText,sameEntry,sameInfo,versionEntry,versionIdentity} from "./validation.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedDocumentVersionInfo} from "../version_types.js";
import type {SharedDocumentVersionsOptions,SharedDocumentVersionEntry,SharedVersionCatalogRecord,RetainedVersionPacket,SharedDocumentVersionStatus,VersionCatalogSnapshot} from "./types.js";
import {admitVersionRecord,type AdmittedVersionRecord as Retained} from "./record_admission.js";
import {replayVersionRecord} from "../participant_replay/version_record.js";
import type {SharedParticipantReplay} from "../participant_replay/read.js";
import {reconcileRetainedVersionRecord} from "./reconcile_retained.js";
import type {SharedRetainedVersionRecoveryResult} from "./reconcile_types.js";
const constructionKey=Object.freeze({});
export class VersionCatalogStore<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly options:SharedDocumentVersionsOptions<P>;readonly #db:IDBDatabase|undefined;readonly #lease:VersionCatalogLease;
 readonly #segmented:SegmentedRetainedPort<"versions">|undefined;
 readonly #assertSource:()=>void;
 #record:SharedVersionCatalogRecord;#retained=new Map<string,Retained>();#durable=new Map<string,RetainedVersionPacket>();#saved="";
 #pending:SharedVersionCatalogRecord|undefined;#running:Promise<void>|undefined;#failure:unknown;#retiring=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 #listeners=new Set<()=>void>();#notifying=false;#storageChanged=false;
 #restoreInsert=false;#restoreSignal:AbortSignal|undefined;
 private constructor(key:object,options:SharedDocumentVersionsOptions<P>,db:IDBDatabase|undefined,lease:VersionCatalogLease,record:SharedVersionCatalogRecord,assertSource:()=>void,segmented?:SegmentedRetainedPort<"versions">){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual version store open or recovery factory');
  this.#segmented=segmented;
  this.options=options;this.#db=db;this.#lease=lease;this.#assertSource=()=>{assertSource();if(this.options!==options)throw new SharedRelayError("version_source_replaced");};this.#record=record;this.#retained=this.#admit(record);
  registerManagedSource(this,options.storage.core,()=>{this.#live();if(this.#retiring||this.#storageChanged)throw managedSourceUnavailable();});
  if(db)db.onversionchange=()=>{this.#storageChanged=true;db.close();this.#failure=new SharedRelayError("version_cache_versionchange");this.#notify();};
 }
 static async open<Q extends SharedSelectionPolicy>(input:SharedDocumentVersionsOptions<Q>):Promise<VersionCatalogStore<Q>>{
  return VersionCatalogStore.#open(input);
 }
 static async restoreBackup<Q extends SharedSelectionPolicy>(input:SharedDocumentVersionsBackupOptions<Q>):Promise<VersionCatalogStore<Q>>{
  checkRetainedStoreRecovery(input);if(input.autoConnect!==undefined&&input.autoConnect!==false)throw new SharedEditorError("backup_policy","Restoration must not automatically connect a version catalog");
  const {backupJson,writerRecovery:_authority,signal,...options}={...input},source=options.storage,core=source.core,identity=versionIdentity(options.identity),recovered=await decodeRetainedStoreBackup("version-catalog",backupJson,value=>checkCatalogRecord(value,identity),signal);
  if(source.core!==core)throw new SharedRelayError("version_source_replaced");return VersionCatalogStore.#open({...options,identity,autoConnect:false},recovered,signal);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedDocumentVersionsOptions<Q>,recovered?:SharedVersionCatalogRecord,signal?:AbortSignal):Promise<VersionCatalogStore<Q>>{
  const source=input.storage,core=source.core,segmented=segmentedRetainedPort(input,"versions");
  const storage=Object.freeze({core,save():void{assertSource();source.save();assertSource();},async flush():Promise<void>{assertSource();await source.flush();assertSource();}});
  const options=Object.freeze({...input,identity:Object.freeze(versionIdentity(input.identity)),storage}),identity=options.identity;
  const assertSource=():void=>{if(source.core!==core||options.storage!==storage||storage.core!==core)throw new SharedRelayError("version_source_replaced");segmented?.check();};
  assertSource();
  if(!core.supportsVersionSourceProofs())throw new SharedRelayError("version_source_unavailable");
  if(segmented)segmented.check();else checkSourceCheckpoint(core,identity.room,identity.documentWriter);
  checkRetainedStoreSignal(signal);const lease=await VersionCatalogLease.acquire(identity);let db:IDBDatabase|undefined,store:VersionCatalogStore<Q>|undefined;
  try{assertSource();checkRetainedStoreSignal(signal);const retained=isOperationalComponent(input)?await existingOperationalComponent(options.database,"catalogs",cacheKey(identity)):undefined;if(!segmented)db=retained?.db??await openCatalogDatabase(options.database);assertSource();let saved:SharedVersionCatalogRecord|null;
   if(recovered){if(await retainedStoreDestinationExists(db!,"catalogs",cacheKey(identity),signal))throw new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");saved=recovered;}else saved=segmented?checkCatalogRecord(segmented.read(),identity):await readCatalogRecord(db!,identity);
   if(retained&&(!saved||JSON.stringify(saved)!==JSON.stringify(retained.record)))throw operationFailure("operation_diverged");
   assertSource();const record=saved??{format:"breditor/shared-version-catalog-cache" as const,formatVersion:1 as const,identity,catalog:null,packets:[]},create=()=>new VersionCatalogStore(constructionKey,options,db,lease,record,assertSource,segmented);store=recovered?retainedStoreNativeAdmission(create):create();retained?.assertCurrent();store.#restoreInsert=recovered!==undefined;store.#restoreSignal=signal;store.#pending=record;store.#start();await store.flush();assertSource();checkRetainedStoreSignal(signal);return store;}
  catch(error){if(store)await store.discardAndClose();else{db?.close();await lease.close();}throw error;}
 }
 #live(checkSource=true):void{if(this.#closed)throw new SharedRelayError("version_cache_closed");this.#lease.assertLive();if(checkSource)this.#assertSource();}
 #writable():void{this.#live();this.#segmented?.writable();if(this.#retiring)throw new SharedRelayError("version_cache_closing");}
 #admit(record:SharedVersionCatalogRecord):Map<string,Retained>{
  return admitVersionRecord(this.options.storage.core,record);
 }
 #mark(record:SharedVersionCatalogRecord):void{
  const checked=checkCatalogRecord(record,this.options.identity),encoded=JSON.stringify(checked);
  if(encoded!==JSON.stringify(this.#record)){const retained=this.#admit(checked);this.#segmented?.stage(checked);this.#record=checked;this.#retained=retained;}
  if(encoded===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;
  this.#pending=structuredClone(checked);this.#notify();this.#start();
 }
 #start():void{if(this.#running||this.#closed||!this.#pending||this.#failure)return;this.#running=this.#drain().catch(error=>{this.#failure=error??new SharedRelayError("local_save_failed");this.#notify();}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;
  try{this.#assertSource();checkRetainedStoreSignal(this.#restoreSignal);if(this.#segmented)await this.#segmented.write(next);else{this.options.storage.save();await this.options.storage.flush();this.#assertSource();
   if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,"catalogs",cacheKey(this.options.identity),next,this.#restoreSignal);this.#restoreInsert=false;checkRetainedStoreSignal(this.#restoreSignal);this.#restoreSignal=undefined;}else await writeCatalogRecord(this.#db!,this.options.identity,next);}
   this.#assertSource();}catch(error){this.#pending??=next;throw error;}
  this.#saved=JSON.stringify(next);this.#durable=new Map(next.packets.map(value=>[this.options.storage.core.readVersion(value.packet).id,structuredClone(value)]));this.#notify();
 }}
 #notify():void{if(this.#notifying)return;this.#notifying=true;queueMicrotask(()=>{this.#notifying=false;for(const listener of [...this.#listeners]){try{listener();}catch{/* A borrowed observer cannot replace retained data. */}}});}
 subscribe(listener:()=>void):()=>void{this.#live();this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
 state():{pending:boolean;failed:boolean;closed:boolean;queued:number;catalogEntries:number;cachedPackets:number}{return {pending:!!this.#pending||!!this.#running,failed:this.#failure!==undefined,closed:this.#closed,queued:[...this.#retained.values()].filter(row=>row.value.publish).length,catalogEntries:this.#record.catalog?.entries.length??0,cachedPackets:this.#retained.size};}
 /** Exact previously retained bytes remain recoverable after a borrowed-source continuity failure. */
 exportRecovery():SharedVersionCatalogRecord{this.#live(false);return structuredClone(this.#record);}
 async exportBackup(options:SharedRetainedStoreBackupOptions={}):Promise<string>{return encodeRetainedStoreBackup("version-catalog",this.exportRecovery(),value=>checkCatalogRecord(value,this.options.identity),options);}
 /** Borrowed dependency captures require this store's unchanged native source, not matching IDs alone. */
 checkSource(core:SharedRichEditor<P>):void{this.#live();if(this.options.storage.core!==core)throw new SharedRelayError("version_source_replaced");}
 /** Internal local retention. The adapter first reserves delivery/mutation quiescence.
  * Save failure retains the complete merged export for retry, without eviction or rollback. */
 async recoverRetainedVersions(replay:SharedParticipantReplay):Promise<SharedRetainedVersionRecoveryResult>{
  this.#writable();const source=replayVersionRecord(replay,this.options.storage.core,this.options.identity);this.#writable();
  const plan=reconcileRetainedVersionRecord(this.options.storage.core,this.#record,source);this.#mark(plan.record);await this.flush();return plan.result;
 }
 catalog():VersionCatalogSnapshot|null{this.#live();return this.#record.catalog?structuredClone(this.#record.catalog):null;}
 queued():readonly string[]{this.#live();return [...this.#retained].filter(([,row])=>row.value.publish).map(([id])=>id);}
 versions():readonly SharedDocumentVersionInfo[]{this.#live();const result=new Map(this.#record.catalog?.entries.map(entry=>[entry.version.id,{...entry.version}])??[]);for(const [id,row]of this.#retained)if(!result.has(id))result.set(id,{...row.info});return [...result.values()];}
 entry(id:string):SharedDocumentVersionEntry|null{this.#live();const value=this.#retained.get(id)?.value.accepted??this.#record.catalog?.entries.find(entry=>entry.version.id===id)??null;return value?structuredClone(value):null;}
 packet(id:string):string{this.#live();const row=this.#retained.get(id);if(!row)throw new SharedRelayError(this.entry(id)?"version_not_cached":"version_unknown");return row.value.packet;}
 versionStatus(id:string):SharedDocumentVersionStatus{this.#live();const row=this.#retained.get(id),durable=this.#durable.get(id);return {cached:!!row,localSaved:!!row&&!!durable&&row.value.packet===durable.packet&&row.value.publish===durable.publish&&(row.value.accepted===null?durable.accepted===null:!!durable.accepted&&sameEntry(row.value.accepted,durable.accepted)),queued:!!row&&row.value.publish,accepted:this.entry(id)};}
 saveVersion(name:string,createdAtMs:string):SharedDocumentVersionInfo{this.#writable();return this.queuePacket(this.options.storage.core.captureVersion(name,this.options.identity.principal,createdAtMs));}
 queuePacket(input:string):SharedDocumentVersionInfo{
  this.#writable();const packet=packetText(input),core=this.options.storage.core,info=core.readVersion(packet);if(info.author!==this.options.identity.principal||core.verifyVersionSource(packet).kind!=="verified")throw new SharedRelayError("version_local_source_missing");
  const known=this.#retained.get(info.id);if(known){if(!known.value.accepted&&!known.value.publish)this.#mark({...this.#record,packets:this.#record.packets.map(value=>value===known.value?{...value,publish:true}:value)});return {...known.info};}const accepted=this.entry(info.id);if(accepted&&!sameInfo(accepted.version,info))throw new SharedRelayError("version_receipt_mismatch");
  const value:RetainedVersionPacket={packet,origin:"local",publish:accepted===null,accepted};this.#mark({...this.#record,packets:[...this.#record.packets,value]});return {...info};
 }
 async adoptCatalog(input:VersionCatalogSnapshot):Promise<void>{
  this.#writable();const next=catalogSnapshot(input),before=this.#record.catalog;
  if(before&&(BigInt(next.through)<BigInt(before.through)||before.entries.length>next.entries.length||before.entries.some((entry,i)=>!sameEntry(entry,next.entries[i]!))))throw new SharedRelayError("version_server_rollback");
  const packets=this.#record.packets.map(value=>{const info=this.options.storage.core.readVersion(value.packet),listed=next.entries.find(entry=>entry.version.id===info.id);
   if(value.accepted&&(BigInt(next.through)<BigInt(value.accepted.sequence)||!listed||!sameEntry(value.accepted,listed)))throw new SharedRelayError("version_server_rollback");
   if(listed&&!sameInfo(info,listed.version))throw new SharedRelayError("version_receipt_mismatch");return {...value,publish:listed?false:value.publish,accepted:listed??value.accepted};
  });this.#mark({...this.#record,catalog:next,packets});await this.flush();
 }
 async accept(id:string,input:SharedDocumentVersionEntry):Promise<void>{
  this.#writable();const entry=versionEntry(input),row=this.#retained.get(id);if(!row||!sameInfo(row.info,entry.version)||row.value.accepted&&!sameEntry(row.value.accepted,entry))throw new SharedRelayError("version_receipt_mismatch");
  this.#mark({...this.#record,packets:this.#record.packets.map(value=>value===row.value?{...value,publish:false,accepted:entry}:value)});await this.flush();
 }
 async cachePacket(input:string,expected:SharedDocumentVersionEntry):Promise<string>{
  this.#writable();const packet=packetText(input),info=this.options.storage.core.readVersion(packet),entry=this.entry(expected.version.id);this.options.storage.core.verifyVersionSource(packet);
  if(!entry||!sameEntry(entry,expected)||!sameInfo(info,expected.version))throw new SharedRelayError("version_receipt_mismatch");
  const known=this.#retained.get(info.id);if(known){await this.flush();return known.value.packet;}
  this.#mark({...this.#record,packets:[...this.#record.packets,{packet,origin:"remote",publish:false,accepted:entry}]});await this.flush();return packet;
 }
 /** Explicit local packet eviction only. A queued publication is never silently discarded. */
 forgetCachedPacket(id:string):void{this.#writable();const row=this.#retained.get(id);if(!row)return;if(row.value.publish)throw new SharedRelayError("version_still_queued");if(row.value.accepted&&!this.#record.catalog?.entries.some(entry=>entry.version.id===id))throw new SharedRelayError("version_catalog_refresh_required");this.#mark({...this.#record,packets:this.#record.packets.filter(value=>value!==row.value)});}
 /** Stops retries, not a server transaction already received. Any later discovered acceptance wins. */
 stopRetrying(id:string):void{this.#writable();const row=this.#retained.get(id);if(!row||!row.value.publish)return;this.#mark({...this.#record,packets:this.#record.packets.map(value=>value===row.value?{...value,publish:false}:value)});}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{this.#live();if(this.#running)await this.#running;this.#failure=undefined;this.#pending=structuredClone(this.#record);this.#start();await this.flush();}
 close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#closing=Promise.resolve().then(async()=>{await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();this.#closed=true;this.#retiring=true;this.#pending=undefined;this.#db?.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{this.#listeners.clear();await this.#lease.close();});return this.#released;}
}
