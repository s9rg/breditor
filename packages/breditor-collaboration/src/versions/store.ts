import {selectedHeldMetadataOpen,heldMetadataWork,registerHeldMetadataOwner,type HeldMetadataOpen} from '../metadata/held_open.js';
import {registerVersionNativeStore,registerNativeVersionView,type NativeVersionStoreLoan,type NativeVersionJob,type NativeVersionDeliveryOptions} from './native_store.js';
import type {VersionSyncStore} from './sync_store.js';
import type {NativeRelayDeliveryPort} from '../relay/native_delivery.js';
import {RelayWorkCustody} from '../relay/work_custody.js';
/** Durable immutable catalog/packet cache. Borrowed source journals are saved first, never replaced. */
import {SharedRelayError} from "../relay/validation.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {selectedRetainedStorePort,retainedStoreOwner,type RetainedStorePort} from "../delivery_ports/retained.js";
import {SharedEditorError} from "../core.js";
import {registerManagedSource,checkManagedCore,managedSourceUnavailable,managedSourceCore,checkManagedSource,checkManagedSourceBindings} from "../managed_custody.js";
import {participantAuthority} from '../participant_backup/policy.js';
import {observeIndependentRecoveryAbort} from '../independent_recovery/signal.js';
import {retainInternalFailureCause} from '../internal_failure_cause.js';
import {createOriginalRecordRead,type OriginalRecordRead,type OriginalVersionRecords} from '../persistence/original_record_read.js';
import {isOperationalComponent,isCompletedOperationalComponent} from "../participant_operation/component_admission.js";
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
let readOriginalVersion:(owner:VersionCatalogStore,authority:()=>void,signal?:AbortSignal)=>Promise<OriginalRecordRead<OriginalVersionRecords>>;
export class VersionCatalogStore<P extends SharedSelectionPolicy=SharedSelectionPolicy> {
 readonly #work:RelayWorkCustody;readonly options:SharedDocumentVersionsOptions<P>;readonly #db:IDBDatabase|undefined;readonly #lease:VersionCatalogLease;
 readonly #atomic:RetainedStorePort<"versions">|undefined;
 readonly #assertSource:()=>void;
 readonly #recordSource:object|undefined;#nativeLoan:object|undefined;readonly #recordOptions:SharedDocumentVersionsOptions<P>;
 #record:SharedVersionCatalogRecord;#retained=new Map<string,Retained>();#durable=new Map<string,RetainedVersionPacket>();#saved="";
 #pending:SharedVersionCatalogRecord|undefined;#running:Promise<void>|undefined;#failure:unknown;#retiring=false;#closed=false;#closing:Promise<void>|undefined;#released:Promise<void>|undefined;
 #listeners=new Set<()=>void>();#notifying=false;#storageChanged=false;
 #restoreInsert=false;#restoreSignal:AbortSignal|undefined;
 #recordReadEpoch:object=Object.freeze({});readonly #recordReaders=new Set<object>();
 private constructor(key:object,options:SharedDocumentVersionsOptions<P>,db:IDBDatabase|undefined,lease:VersionCatalogLease,record:SharedVersionCatalogRecord,assertSource:()=>void,atomic?:RetainedStorePort<"versions">,recordSource?:object,held?:HeldMetadataOpen){
  if(key!==constructionKey)throw new SharedEditorError('managed_source_construction','Use the actual version store open or recovery factory');
  this.#atomic=atomic;this.#recordSource=recordSource;this.#recordOptions=options;
  this.options=options;this.#db=db;this.#lease=lease;this.#assertSource=()=>{assertSource();if(this.options!==options)throw new SharedRelayError("version_source_replaced");};this.#record=record;this.#retained=this.#admit(record);
  registerManagedSource(this,options.storage.core,()=>{this.#live();if(this.#retiring||this.#storageChanged)throw managedSourceUnavailable();});
  this.#work=heldMetadataWork(options.storage.core,()=>true,()=>new SharedRelayError('version_recovery_in_use'),held);registerHeldMetadataOwner(this,held);this.#work.registerOwner(this);
  const state=VersionCatalogStore.prototype.state.bind(this),subscribe=VersionCatalogStore.prototype.subscribe.bind(this),queued=VersionCatalogStore.prototype.queued.bind(this),entry=VersionCatalogStore.prototype.entry.bind(this),packet=VersionCatalogStore.prototype.packet.bind(this),versionStatus=VersionCatalogStore.prototype.versionStatus.bind(this),source=atomic?retainedStoreOwner(atomic,options.storage.core):recordSource;
  registerVersionNativeStore(this,{core:options.storage.core,source,open:(port,fresh)=>this.#lendNative(port,fresh,{state,subscribe,queued,entry,packet,versionStatus}) as NativeVersionStoreLoan});

  if(db)db.onversionchange=()=>{this.#storageChanged=true;db.close();this.#failure=new SharedRelayError("version_cache_versionchange");this.#notify();};
 }
 static{readOriginalVersion=async(owner,provided,signal)=>{
  const fail=(suffix:string)=>new SharedRelayError('version_record_read_'+suffix);
  if(!owner||typeof owner!=='object'||!(#record in owner))throw fail('source');if(owner.#atomic||!owner.#db||!owner.#recordSource)throw fail('family');const authority=participantAuthority(provided);if(owner.#recordReaders.size>=8)throw fail('busy');
  const o=owner.#recordOptions,core=o.storage.core,source=owner.#recordSource,record=owner.#record,pending=owner.#pending,durable=owner.#durable,saved=owner.#saved,epoch=owner.#recordReadEpoch,token=Object.freeze({});owner.#recordReaders.add(token);
  let released=false,complete=false,finish!:()=>void,observation:ReturnType<typeof observeIndependentRecoveryAbort>|undefined,result:OriginalRecordRead<OriginalVersionRecords>|undefined;const held=new Promise<void>(resolve=>{finish=resolve;}),release=()=>{if(!released){released=true;owner.#recordReaders.delete(token);observation?.release();finish();}};
  const current=()=>{if(released||!owner.#recordReaders.has(token))throw fail('closed');checkManagedSourceBindings(owner);owner.#live(false);if(owner.#retiring||owner.#storageChanged||owner.#running||owner.#work.hasPendingWork()||owner.#recordReadEpoch!==epoch||owner.#record!==record||owner.#pending!==pending||owner.#durable!==durable||owner.#saved!==saved)throw fail('changed');checkManagedSource(source,core);if(observation?.aborted())throw fail('aborted');};
  const check=()=>{current();authority();current();},readStored=async()=>{try{return await readCatalogRecord(owner.#db!,o.identity);}catch(error){throw retainInternalFailureCause(fail('record'),error);}};
  try{observation=observeIndependentRecoveryAbort(signal,held);check();const committed=await readStored();check();if(!committed)throw fail('missing');const json=JSON.stringify(committed);result=createOriginalRecordRead({format:'breditor/persistent-original-version-record-read',formatVersion:1,scope:'original-version-committed-pending-live',committed,pending:pending??null,live:record},{check,current,verify:async()=>{check();const actual=await readStored();check();if(JSON.stringify(actual)!==json)throw fail('changed');},release});result.check();complete=true;return result;}
  finally{if(!complete){result?.dispose();release();}}
 };}
 static async open<Q extends SharedSelectionPolicy>(input:SharedDocumentVersionsOptions<Q>):Promise<VersionCatalogStore<Q>>{
  return VersionCatalogStore.#open(input);
 }
 static async restoreBackup<Q extends SharedSelectionPolicy>(input:SharedDocumentVersionsBackupOptions<Q>):Promise<VersionCatalogStore<Q>>{
  checkRetainedStoreRecovery(input);if(input.autoConnect!==undefined&&input.autoConnect!==false)throw new SharedEditorError("backup_policy","Restoration must not automatically connect a version catalog");
  const {backupJson,writerRecovery:_authority,signal,...options}={...input},source=options.storage,core=source.core,identity=versionIdentity(options.identity),recovered=await decodeRetainedStoreBackup("version-catalog",backupJson,value=>checkCatalogRecord(value,identity),signal);
  if(source.core!==core)throw new SharedRelayError("version_source_replaced");return VersionCatalogStore.#open({...options,identity,autoConnect:false},recovered,signal);
 }
 static async #open<Q extends SharedSelectionPolicy>(input:SharedDocumentVersionsOptions<Q>,recovered?:SharedVersionCatalogRecord,signal?:AbortSignal):Promise<VersionCatalogStore<Q>>{
  const source=input.storage,core=source.core,atomic=selectedRetainedStorePort(input,"versions"),held=selectedHeldMetadataOpen(input,core,atomic,()=>new SharedRelayError('version_recovery_in_use'));
  checkManagedCore(core);
  const storage=Object.freeze({core,save():void{assertSource();source.save();assertSource();},async flush():Promise<void>{assertSource();await source.flush();assertSource();}});
  const options=Object.freeze({...input,identity:Object.freeze(versionIdentity(input.identity)),storage}),identity=options.identity;
  const assertSource=():void=>{if(source.core!==core||options.storage!==storage||storage.core!==core)throw new SharedRelayError("version_source_replaced");atomic?.check();};
  assertSource();
  if(!core.supportsVersionSourceProofs())throw new SharedRelayError("version_source_unavailable");
  if(atomic)atomic.check();else checkSourceCheckpoint(core,identity.room,identity.documentWriter);
  checkManagedCore(core);checkRetainedStoreSignal(signal);const lease=await VersionCatalogLease.acquire(identity);let db:IDBDatabase|undefined,store:VersionCatalogStore<Q>|undefined;
  try{held?.check();assertSource();checkManagedCore(core);checkRetainedStoreSignal(signal);const retained=isOperationalComponent(input)?await existingOperationalComponent(options.database,"catalogs",cacheKey(identity)):undefined;if(!atomic)db=retained?.db??await openCatalogDatabase(options.database);assertSource();let saved:SharedVersionCatalogRecord|null;
   if(recovered){if(await retainedStoreDestinationExists(db!,"catalogs",cacheKey(identity),signal))throw new SharedEditorError("backup_destination_exists","Retained restore destination already contains a record");saved=recovered;}else saved=atomic?checkCatalogRecord(atomic.read(),identity):await readCatalogRecord(db!,identity);
   if(retained&&(!saved||JSON.stringify(saved)!==JSON.stringify(retained.record)))throw operationFailure("operation_diverged");
   let recordSource:object|undefined;try{if(managedSourceCore(source)===core)recordSource=source;}catch{/* Custom borrowed storage keeps its old editing API, not new managed-read custody. */}
   assertSource();checkManagedCore(core);const record=saved??{format:"breditor/shared-version-catalog-cache" as const,formatVersion:1 as const,identity,catalog:null,packets:[]},create=()=>new VersionCatalogStore(constructionKey,options,db,lease,record,assertSource,atomic,recordSource,held);store=recovered?retainedStoreNativeAdmission(create):create();checkManagedCore(core);retained?.assertCurrent();store.#restoreInsert=recovered!==undefined;store.#restoreSignal=signal;if(held){held.check();if(!saved||recovered||!atomic)throw new SharedRelayError('metadata_preparation_policy');store.#saved=JSON.stringify(record);store.#durable=new Map(record.packets.map(value=>[core.readVersion(value.packet).id,structuredClone(value)]));}else if(isCompletedOperationalComponent(input)){if(!retained||!saved||recovered||atomic)throw operationFailure('operation_diverged');store.#saved=JSON.stringify(record);store.#durable=new Map(record.packets.map(value=>[core.readVersion(value.packet).id,structuredClone(value)]));}else{store.#pending=record;store.#start();await store.flush();}held?.check();assertSource();checkManagedCore(core);checkRetainedStoreSignal(signal);return store;}
  catch(error){if(store)await store.discardAndClose();else{db?.close();await lease.close();}throw error;}
 }
 #live(checkSource=true):void{if(this.#closed)throw new SharedRelayError("version_cache_closed");this.#lease.assertLive();if(checkSource)this.#assertSource();}
 #writable():void{this.#work.checkAllowed();this.#live();checkManagedCore(this.options.storage.core);this.#atomic?.writable();if(this.#retiring)throw new SharedRelayError("version_cache_closing");}
 #admit(record:SharedVersionCatalogRecord):Map<string,Retained>{
  return admitVersionRecord(this.options.storage.core,record);
 }
 #mark(record:SharedVersionCatalogRecord,job?:NativeVersionJob):void{const stage=()=>{
  checkManagedCore(this.options.storage.core);
  this.#recordReadEpoch=Object.freeze({});
  const checked=checkCatalogRecord(record,this.options.identity),encoded=JSON.stringify(checked);
  const retained=encoded!==JSON.stringify(this.#record)?this.#admit(checked):undefined;
  checkManagedCore(this.options.storage.core);
  if(retained){this.#atomic?.stage(checked);this.#record=checked;this.#retained=retained;}
  if(encoded===this.#saved&&!this.#pending&&!this.#running&&!this.#failure)return;
  this.#pending=structuredClone(checked);this.#notify();if(job)this.#startNative(job);else this.#start();
 };if(job){job.check();this.#work.runSyncAdmitted(job.port.admission,stage);}else this.#work.runSync(stage);}
 #start():void{if(this.#running||this.#closed||!this.#pending||this.#failure)return;this.#running=this.#work.run(()=>this.#drain()).catch(error=>{this.#failure=error??new SharedRelayError("local_save_failed");this.#notify();}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure)this.#start();});}
 async #drain():Promise<void>{while(this.#pending&&!this.#closed){this.#lease.assertLive();const next=this.#pending;this.#pending=undefined;
  try{this.#assertSource();checkRetainedStoreSignal(this.#restoreSignal);if(this.#atomic)await this.#atomic.write(next);else{this.options.storage.save();await this.options.storage.flush();this.#assertSource();
   if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,"catalogs",cacheKey(this.options.identity),next,this.#restoreSignal);this.#restoreInsert=false;checkRetainedStoreSignal(this.#restoreSignal);this.#restoreSignal=undefined;}else await writeCatalogRecord(this.#db!,this.options.identity,next);}
   this.#assertSource();}catch(error){this.#pending??=next;throw error;}
  this.#saved=JSON.stringify(next);this.#durable=new Map(next.packets.map(value=>[this.options.storage.core.readVersion(value.packet).id,structuredClone(value)]));this.#notify();
 }}
 /** A held write records actual committed bytes before any post-await authority
  * callback can refuse success. No native method is needed after DB commitment. */
 async #drainNative(job:NativeVersionJob):Promise<void>{
  while(this.#pending&&!this.#closed){
   job.check();this.#lease.assertLive();const next=this.#pending,encoded=JSON.stringify(next),admitted=this.#admit(next),durable=new Map([...admitted].map(([id,row])=>[id,structuredClone(row.value)]));
   this.#pending=undefined;
   try{
    this.#assertSource();checkRetainedStoreSignal(this.#restoreSignal);
    if(this.#atomic)await this.#atomic.write(next);
    else{
     await job.persistSource();job.check();
     if(this.#restoreInsert){await insertRetainedStoreRecord(this.#db!,'catalogs',cacheKey(this.#recordOptions.identity),next,this.#restoreSignal);this.#restoreInsert=false;this.#restoreSignal=undefined;}
     else await writeCatalogRecord(this.#db!,this.#recordOptions.identity,next);
    }
   }catch(error){this.#pending??=next;throw error;}
   this.#saved=encoded;this.#durable=durable;this.#notify();
   job.check();
  }
 }
 #startNative(job:NativeVersionJob):void{
  if(this.#running||this.#closed||!this.#pending||this.#failure)return;
  this.#running=this.#work.runAdmitted(job.port.admission,()=>Promise.resolve().then(()=>this.#drainNative(job))).catch(error=>{this.#failure=error??new SharedRelayError('local_save_failed');this.#notify();}).finally(()=>{this.#running=undefined;this.#notify();if(!this.#failure&&this.#pending)this.#startNative(job);});
 }
 #lendNative(port:NativeRelayDeliveryPort,fresh:NativeVersionDeliveryOptions,reads:Pick<VersionSyncStore<P>,'state'|'subscribe'|'queued'|'entry'|'packet'|'versionStatus'>):NativeVersionStoreLoan<P>{
  if(this.#nativeLoan||this.#retiring||this.#running||this.#work.hasPendingWork()||this.#recordReaders.size)throw new SharedRelayError('version_native_delivery_in_use');
  const thisStore=this,key=Object.freeze({});this.#nativeLoan=key;let closed=false,ending:Promise<void>|undefined;const calls=new Set<Promise<void>>();
  const current=()=>{if(closed||this.#nativeLoan!==key||this.#retiring||this.#storageChanged)throw new SharedRelayError('version_native_delivery_closed');checkManagedSourceBindings(this);this.#live();};
  const check=()=>{port.check();current();port.check();},source=()=>port.persistLocal(),job:NativeVersionJob=Object.freeze({port,check,persistSource:source});
  const close=()=>{closed=true;if(ending)return ending;const release=()=>{if(this.#nativeLoan===key)this.#nativeLoan=undefined;};
   if(!this.#running&&!calls.size){release();return Promise.resolve();}
   ending=(async()=>{while(this.#running||calls.size)await Promise.all([...calls,...(this.#running?[this.#running]:[])]);release();})().finally(()=>{ending=undefined;});return ending;
  };
  const track=<T>(start:()=>Promise<T>):Promise<T>=>{
   if(closed||this.#nativeLoan!==key)return Promise.reject(new SharedRelayError('version_native_delivery_closed'));
   let resolve!:()=>void;const done=new Promise<void>(finish=>{resolve=finish;});calls.add(done);
   const finish=()=>{calls.delete(done);resolve();};
   try{return this.#work.runAdmitted(port.admission,()=>Promise.resolve().then(()=>{check();return start();})).then(value=>{finish();return value;},error=>{finish();throw error;});}
   catch(error){finish();return Promise.reject(error);}
  };
  try{
   check();const allowed=new Set(['getToken','flushDocument','requestTimeoutMs','reconnectMinimumMs','reconnectMaximumMs','onState','onError']);
   if(!fresh||typeof fresh!=='object'||Reflect.ownKeys(fresh).some(name=>typeof name!=='string'||!allowed.has(name)))throw new SharedRelayError('version_native_delivery_options');
   const copied={...fresh};if(typeof copied.getToken!=='function')throw new SharedRelayError('version_native_delivery_options');check();
   const options=Object.freeze({identity:this.#recordOptions.identity,database:this.#recordOptions.database,storage:Object.freeze({core:this.#recordOptions.storage.core}),...copied,autoConnect:false});
   const flush=async()=>{check();if(this.#pending&&!this.#failure)this.#startNative(job);while(this.#running)await this.#running;if(this.#failure)throw this.#failure;check();};
   const store:VersionSyncStore<P>=Object.freeze({options,...reads,flush:()=>track(flush),
    adoptCatalog:(input:VersionCatalogSnapshot)=>track(async()=>{check();this.#mark(this.#catalogRecord(input),job);await flush();}),
    accept:(id:string,input:SharedDocumentVersionEntry)=>track(async()=>{check();this.#mark(this.#acceptedRecord(id,input),job);await flush();}),
    cachePacket:(input:string,entry:SharedDocumentVersionEntry)=>track(async()=>{check();const next=this.#cachedRecord(input,entry);if(next.record)this.#mark(next.record,job);await flush();return next.packet;})
   });
   registerNativeVersionView(store,port);
   return Object.freeze({port,store,retryLocal:()=>track(async()=>{check();if(thisStore.#running)await thisStore.#running;check();thisStore.#failure=undefined;thisStore.#pending=structuredClone(thisStore.#record);thisStore.#startNative(job);await flush();}),close});
  }catch(error){void close();throw error;}
 }
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
 #catalogRecord(input:VersionCatalogSnapshot):SharedVersionCatalogRecord{
  const next=catalogSnapshot(input),before=this.#record.catalog;
  if(before&&(BigInt(next.through)<BigInt(before.through)||before.entries.length>next.entries.length||before.entries.some((entry,i)=>!sameEntry(entry,next.entries[i]!))))throw new SharedRelayError("version_server_rollback");
  const packets=this.#record.packets.map(value=>{const info=this.options.storage.core.readVersion(value.packet),listed=next.entries.find(entry=>entry.version.id===info.id);
   if(value.accepted&&(BigInt(next.through)<BigInt(value.accepted.sequence)||!listed||!sameEntry(value.accepted,listed)))throw new SharedRelayError("version_server_rollback");
   if(listed&&!sameInfo(info,listed.version))throw new SharedRelayError("version_receipt_mismatch");return {...value,publish:listed?false:value.publish,accepted:listed??value.accepted};
  });return {...this.#record,catalog:next,packets};
 }
 async adoptCatalog(input:VersionCatalogSnapshot):Promise<void>{this.#writable();this.#mark(this.#catalogRecord(input));await this.flush();}
 #acceptedRecord(id:string,input:SharedDocumentVersionEntry):SharedVersionCatalogRecord{
  const entry=versionEntry(input),row=this.#retained.get(id);if(!row||!sameInfo(row.info,entry.version)||row.value.accepted&&!sameEntry(row.value.accepted,entry))throw new SharedRelayError("version_receipt_mismatch");
  return {...this.#record,packets:this.#record.packets.map(value=>value===row.value?{...value,publish:false,accepted:entry}:value)};
 }
 async accept(id:string,input:SharedDocumentVersionEntry):Promise<void>{this.#writable();this.#mark(this.#acceptedRecord(id,input));await this.flush();}
 #cachedRecord(input:string,expected:SharedDocumentVersionEntry):{packet:string;record?:SharedVersionCatalogRecord}{
  const packet=packetText(input),info=this.options.storage.core.readVersion(packet),entry=this.entry(expected.version.id);this.options.storage.core.verifyVersionSource(packet);
  if(!entry||!sameEntry(entry,expected)||!sameInfo(info,expected.version))throw new SharedRelayError("version_receipt_mismatch");
  const known=this.#retained.get(info.id);if(known)return {packet:known.value.packet};
  return {packet,record:{...this.#record,packets:[...this.#record.packets,{packet,origin:"remote",publish:false,accepted:entry}]}};
 }
 async cachePacket(input:string,expected:SharedDocumentVersionEntry):Promise<string>{this.#writable();const next=this.#cachedRecord(input,expected);if(next.record)this.#mark(next.record);await this.flush();return next.packet;}
 /** Explicit local packet eviction only. A queued publication is never silently discarded. */
 forgetCachedPacket(id:string):void{this.#writable();const row=this.#retained.get(id);if(!row)return;if(row.value.publish)throw new SharedRelayError("version_still_queued");if(row.value.accepted&&!this.#record.catalog?.entries.some(entry=>entry.version.id===id))throw new SharedRelayError("version_catalog_refresh_required");this.#mark({...this.#record,packets:this.#record.packets.filter(value=>value!==row.value)});}
 /** Stops retries, not a server transaction already received. Any later discovered acceptance wins. */
 stopRetrying(id:string):void{this.#writable();const row=this.#retained.get(id);if(!row||!row.value.publish)return;this.#mark({...this.#record,packets:this.#record.packets.map(value=>value===row.value?{...value,publish:false}:value)});}
 async flush():Promise<void>{this.#live();while(this.#running){await this.#running;if(this.#failure)throw this.#failure;}if(this.#failure)throw this.#failure;}
 async retry():Promise<void>{return this.#work.run(()=>this.#retry());}
 async #retry():Promise<void>{this.#live();this.#recordReadEpoch=Object.freeze({});if(this.#running)await this.#running;this.#failure=undefined;this.#pending=structuredClone(this.#record);this.#start();await this.flush();}
 close():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();if(this.#closing)return this.#closing;this.#retiring=true;this.#closing=Promise.resolve().then(async()=>{if(this.#pending||this.#running||this.#failure)await this.flush();await this.discardAndClose();}).finally(()=>{this.#closing=undefined;});return this.#closing;}
 discardAndClose():Promise<void>{if(this.#closed)return this.#released??Promise.resolve();this.#closed=true;this.#retiring=true;this.#pending=undefined;this.#db?.close();this.#released=(this.#running??Promise.resolve()).then(async()=>{this.#listeners.clear();await this.#lease.close();this.#work.retire(()=>{});});return this.#released;}
}
/** Private original-store reader. Atomic generation/delivery ports require their
 * complete driver; independently reading a child would not describe one cut. */
export function captureOriginalVersionStoreRecords<P extends SharedSelectionPolicy>(owner:VersionCatalogStore<P>,checkAuthority:()=>void,signal?:AbortSignal){return readOriginalVersion(owner as unknown as VersionCatalogStore,checkAuthority,signal);}
