import {openDatabase, readAsset, transact, updateAsset} from "./database.js";
import {ingestFile} from "./ingest_file.js";
import {uploadAsset} from "./upload_queue.js";
import {assetInfo, type AssetInfo, type AssetLimits, type AssetRecord, type AssetUploader} from "./types.js";
import {checkedAssetLimits} from "./limits.js";
import {exportAssetBackup,encodeAssetArchiveSnapshot,validateRetainedAssetArchive} from "./archive/export_backup.js";
import {importAssetBackup} from "./archive/import_backup.js";
import {insertAssetArchive} from "./archive/database.js";
import {captureAssetArchiveSnapshot} from "./archive/database.js";
import {RichAssetBackupError,checkAssetBackupSignal} from "./archive/error.js";
import {openRetainedAssetDatabase} from "./archive/open_retained.js";
import {heldAssetRestorePolicy,type RichAssetHeldRestoreOptions} from './archive/held_restore_policy.js';
import {insertHeldAssetArchive} from './archive/insert_held.js';
import {openHeldAssetDestination} from './archive/open_held_destination.js';
import type {RichAssetBackupOptions,RichAssetRestoreOptions,RichAssetSourceBackup} from "./archive/types.js";
import {beginAssetReconciliation,resumeAssetReconciliation,type AssetReconciliationPort,type RichAssetReconciliationOptions,type RichAssetReconciliation} from "./reconciliation/coordinator.js";
import {RichAssetReconciliationError} from "./reconciliation/error.js";
import {applyRetainedAssetPlan} from "./reconciliation/apply.js";
import {captureAssetReconciliationSnapshot} from "./reconciliation/snapshot.js";
import {heldAssetReconciliationPort} from './reconciliation/held_port.js';
import {RichAssetStoreCustody,RichAssetCustodyError,acquireAssetStoreCustody,withAssetMutationLock,withAssetExclusiveLock,checkAssetStoreCustody,releaseAssetStoreCustody,closeAssetStoreCustody,type AssetCustodyLocks} from "./custody.js";

export interface RichAssetOptions {
  limits?: Partial<AssetLimits>;
  onChange?: (asset: Readonly<AssetInfo>) => void;
}

/** Retains bytes across cancel, deletion and history. Collection is never implicit. */
export class RichAssetStore {
  readonly limits: Readonly<AssetLimits>;
  #db: IDBDatabase;
  #name: string;
  #options: RichAssetOptions;
  #urls = new Map<string, string>();
  #active = new Map<string, AbortController>();
  #draining: Promise<void> | undefined;
  #closed = false;
  readonly #factory:IDBFactory;
  #tasks = 0;
  #reconciling = false;
  readonly #custodyLocks:AssetCustodyLocks|undefined;
  #custody:RichAssetStoreCustody|undefined;
  #custodyOpening=false;
  #custodyReleasing:Promise<void>|undefined;

  private constructor(db: IDBDatabase, name: string, options: RichAssetOptions,factory:IDBFactory) {
    this.#db = db; this.#name = name; this.#options = options;
    this.#factory=factory;
    this.#custodyLocks=globalThis.navigator?.locks;
    this.limits = checkedAssetLimits(options.limits);
    db.onversionchange = () => this.#close();
  }

  static async open(name: string, options: RichAssetOptions = {}): Promise<RichAssetStore> {
    const factory=globalThis.indexedDB;
    const db = await openDatabase(name);
    try { return new RichAssetStore(db, name, options,factory); }
    catch (error) { db.close(); throw error; }
  }

  /** Existing complete retained storage only. Fully admit all bytes without initializing or uploading. */
  static async openRetained(name:string,options:RichAssetOptions={}):Promise<RichAssetStore>{
    const selected={...options,limits:checkedAssetLimits(options.limits)},factory=globalThis.indexedDB,retained=await openRetainedAssetDatabase(name);let store:RichAssetStore|undefined;
    try{retained.assertCurrent();store=new RichAssetStore(retained.db,name,selected,factory);await validateRetainedAssetArchive(retained.db,store.limits);retained.assertCurrent();store.#live();return store;}
    catch(error){store?.close();retained.db.close();throw error;}
  }

  /** Explicit empty-destination import. Preserve queue epochs/statuses; do not start network work. */
  static async restoreBackup(name:string,backup:Blob,input:RichAssetRestoreOptions):Promise<RichAssetStore>{
    const {uploadState,signal,...supplied}={...input};if(uploadState!=="preserve")throw new RichAssetBackupError("asset_backup_policy","Explicit preservation of archived upload state is required");
    const options={...supplied,limits:checkedAssetLimits(supplied.limits)},records=await importAssetBackup(backup,options.limits,signal);checkAssetBackupSignal(signal);
    let store:RichAssetStore|undefined,db:IDBDatabase|undefined;
    try{const factory=globalThis.indexedDB;db=await openDatabase(name);store=new RichAssetStore(db,name,options,factory);const target=db;await store.#write(()=>insertAssetArchive(target,records,signal));store.#live();checkAssetBackupSignal(signal);return store;}
    catch(error){store?.close();db?.close();if(error instanceof RichAssetBackupError)throw error;throw new RichAssetBackupError("asset_backup_storage","Asset archive destination could not commit");}
  }

  /** Restore while retaining actual cooperative exclusion before insertion through return.
   * The returned custody owns exclusion, not permission; later steps must recheck host policy. */
  static async restoreBackupHeld(name:string,backup:Blob,input:RichAssetHeldRestoreOptions):Promise<Readonly<{store:RichAssetStore;custody:RichAssetStoreCustody}>>{
    const policy=heldAssetRestorePolicy(input),{signal,limits,onChange}=policy.selected,options={limits:checkedAssetLimits(limits),...(onChange?{onChange}:{})};
    const records=await importAssetBackup(backup,options.limits,signal);policy.check();let store:RichAssetStore|undefined,db:IDBDatabase|undefined,custody:RichAssetStoreCustody|undefined;
    try{
      const factory=globalThis.indexedDB;db=await openHeldAssetDestination(name,policy.check);policy.check();store=new RichAssetStore(db,name,options,factory);custody=await store.acquireRecoveryCustody();
      const owned=store,held=custody,check=()=>{policy.check();owned.#live();if(owned.#custody!==held)throw new RichAssetCustodyError('asset_custody_closed');checkAssetStoreCustody(held);};
      check();await insertHeldAssetArchive(db,records,check,signal);check();return Object.freeze({store:owned,custody:held});
    }catch(error){try{if(custody)await closeAssetStoreCustody(custody);}finally{try{if(store)store.#close();}finally{db?.close();}}throw error;}
  }

  /** One atomic retained snapshot, including cancelled/failed uploads and assets used only by history. */
  async exportBackup(options:RichAssetBackupOptions={}):Promise<Blob>{this.#live();return exportAssetBackup(this.#db,this.limits,options);}

  /** Retain both whole input files durably before reviewing explicit upload-state choices.
   * No upload starts, receipt is authenticated, native journal changes or asset is evicted. */
  async beginReconciliation(original: Blob, options: RichAssetReconciliationOptions): Promise<RichAssetReconciliation> {
    this.#live(); return beginAssetReconciliation(this.#reconciliationPort(), original, options);
  }
  /** Reopen an existing attempt only; missing files or a changed target are not repaired. */
  async resumeReconciliation(options: RichAssetReconciliationOptions): Promise<RichAssetReconciliation> {
    this.#live(); return resumeAssetReconciliation(this.#reconciliationPort(), options);
  }
  /** Reconcile while the caller retains this exact store's genuine recovery
   * custody. Ordinary writers remain excluded; this never releases/reacquires
   * the lease, uploads bytes, authenticates receipts or activates a room.
   * Both complete files and explicit queue conflicts use the unchanged ledger. */
  async beginHeldReconciliation(custody:RichAssetStoreCustody,original:Blob,options:RichAssetReconciliationOptions):Promise<RichAssetReconciliation>{
    return beginAssetReconciliation(this.#heldReconciliationPort(custody),original,options);
  }
  /** Resume requires a currently held lease for this actual store. The saved
   * phase supplies neither custody nor permission; source checks stay fresh. */
  async resumeHeldReconciliation(custody:RichAssetStoreCustody,options:RichAssetReconciliationOptions):Promise<RichAssetReconciliation>{
    return resumeAssetReconciliation(this.#heldReconciliationPort(custody),options);
  }
  #heldReconciliationPort(custody:RichAssetStoreCustody):AssetReconciliationPort{
    const check=()=>{this.#live();if(globalThis.indexedDB!==this.#factory||globalThis.navigator?.locks!==this.#custodyLocks)throw new RichAssetReconciliationError('asset_reconciliation_policy','Held reconciliation storage context changed');if(!this.#custody||this.#custody!==custody)throw new RichAssetCustodyError('asset_custody_closed');checkAssetStoreCustody(custody);};
    check();return heldAssetReconciliationPort({name:this.#name,db:this.#db,limits:this.limits,check,use:async<T>(work:()=>Promise<T>)=>{
      check();if(this.#reconciling||this.#tasks||this.#draining||this.#custodyOpening)throw new RichAssetReconciliationError('asset_reconciliation_busy','A retained asset operation already owns this store');
      this.#reconciling=true;try{check();return await work();}finally{this.#reconciling=false;}
    },checkApplying:()=>{check();if(!this.#reconciling)throw new RichAssetReconciliationError('asset_reconciliation_policy','Held recovery requires an exclusive checked store operation');}});
  }
  #reconciliationPort(): AssetReconciliationPort {
    return {name: this.#name, limits: this.limits, check: () => this.#live(), use: work => this.#useReconciliation(work), snapshot: async () => {this.#live(); const rows=await captureAssetReconciliationSnapshot(this.#db,this.limits);this.#live();return encodeAssetArchiveSnapshot(rows,this.limits);}, apply: async (before, after, check, signal) => {
      this.#live(); if (!this.#reconciling) throw new RichAssetReconciliationError("asset_reconciliation_policy", "Asset recovery requires an exclusive store operation");
      return applyRetainedAssetPlan(this.#db, before, after, this.limits, check, signal);
    }};
  }
  async #useReconciliation<T>(work: () => Promise<T>): Promise<T> {
    this.#live(); if (this.#reconciling || this.#tasks || this.#draining || this.#custody || this.#custodyOpening) throw new RichAssetReconciliationError("asset_reconciliation_busy", "Settle asset writes and uploads before reconciliation");
    if (!this.#custodyLocks?.request) throw new RichAssetReconciliationError("asset_reconciliation_policy", "Asset reconciliation requires Web Locks");
    this.#reconciling = true;
    try {if(this.#custodyReleasing)await this.#custodyReleasing;this.#live();return await withAssetExclusiveLock(this.#custodyLocks,this.#name,()=>this.#custodyLocks!.request(`breditor/assets/${this.#name}`, {mode: "exclusive", ifAvailable: true}, async lock => {
      if (!lock) throw new RichAssetReconciliationError("asset_reconciliation_busy", "Another owner is using the asset store"); this.#live(); return work();
    }));}catch(error){if(error instanceof RichAssetCustodyError&&error.code==='asset_custody_busy')throw new RichAssetReconciliationError('asset_reconciliation_busy','Another custody operation owns the retained asset store');throw error;} finally {this.#reconciling = false;}
  }
  #writable(): void {this.#live();if(this.#custody||this.#custodyOpening)throw new RichAssetCustodyError('asset_custody_busy');if (this.#reconciling) throw new RichAssetReconciliationError("asset_reconciliation_busy", "An asset reconciliation operation owns this store");}
  async #write<T>(work: () => Promise<T>): Promise<T> {this.#writable(); this.#tasks++; try {if(this.#custodyReleasing)await this.#custodyReleasing;return await withAssetMutationLock(this.#custodyLocks,this.#name,async()=>{this.#writable();return work();});} finally {this.#tasks--;}}

  /** Hold real cooperative exclusion across asynchronous native/source checks and final handoff.
   * Reads remain allowed; ordinary cooperating handles cannot write or upload while held.
   * Settle selected-owner tasks first. No bytes, epochs, receipts or upload state are changed. */
  async acquireRecoveryCustody():Promise<RichAssetStoreCustody>{
    this.#writable();if(this.#tasks||this.#draining)throw new RichAssetCustodyError('asset_custody_busy');this.#custodyOpening=true;let custody:RichAssetStoreCustody|undefined,complete=false;
    try{if(this.#custodyReleasing)await this.#custodyReleasing;this.#live();custody=await acquireAssetStoreCustody(this.#custodyLocks,this.#name,()=>this.#live(),owner=>{if(this.#custody===owner){this.#custody=undefined;const releasing=closeAssetStoreCustody(owner);this.#custodyReleasing=releasing;void releasing.then(()=>{if(this.#custodyReleasing===releasing)this.#custodyReleasing=undefined;},()=>{/* Retain the actual failed release for subsequent operations/cleanup. */});}});this.#live();this.#custody=custody;checkAssetStoreCustody(custody);complete=true;return custody;}
    finally{this.#custodyOpening=false;if(!complete&&custody)await closeAssetStoreCustody(custody);}
  }

  /** Capture immutable source data in the same active asset snapshot before asynchronous encoding.
   * No flush, upload or notification. The callback must be synchronous; it may run before a later
   * failure, so retain/dispose any borrowed source handles explicitly on failure. */
  async captureBackup<T>(captureSource:()=>T&(T extends PromiseLike<unknown>?never:unknown),options:RichAssetBackupOptions={}):Promise<RichAssetSourceBackup<T>>{
    this.#live();if(typeof captureSource!=="function")throw new RichAssetBackupError("asset_backup_source","A synchronous source capture is required");
    const {signal}={...options},snapshot=await captureAssetArchiveSnapshot(this.#db,this.limits,()=>{this.#live();return captureSource();},signal);
    const backup=await encodeAssetArchiveSnapshot(snapshot.records,this.limits,signal);checkAssetBackupSignal(signal);
    return Object.freeze({source:snapshot.source,backup});
  }

  #live(): void { if (this.#closed) throw Error("Asset store is closed"); }
  /** Synchronous live-owner check for composite handoff. Does no storage I/O, upload,
   * notification or mutation; it is not a flush, idle barrier or reference-closure proof. */
  checkOpen(): void { this.#live(); }
  #notify(record: AssetRecord): void {
    try { this.#options.onChange?.(assetInfo(record)); } catch { /* Observers cannot undo durability. */ }
  }
  async ingest(file: Blob): Promise<AssetInfo> {
    return this.#write(async () => {
    const record = await ingestFile(this.#db, file, this.limits);
    this.#notify(record); return assetInfo(record);
    });
  }
  /** Cache independently verified remote bytes without echoing them into the upload queue.
   * An existing local record (including a cancellation epoch) is never rewritten by a download. */
  async cacheRemote(asset: string, file: Blob, storageRef: string): Promise<AssetInfo> {
    return this.#write(async () => {
    if (!/^sha256:[0-9a-f]{64}$/.test(asset) || typeof storageRef !== "string" || !storageRef || storageRef.length > 4096) throw Error("Invalid remote asset identity/receipt");
    const record = await ingestFile(this.#db, file, this.limits, {asset,storageRef});
    this.#notify(record); return assetInfo(record);
    });
  }
  async get(asset: string): Promise<AssetInfo | undefined> {
    this.#live(); const record = await readAsset(this.#db, asset);
    return record ? assetInfo(record) : undefined;
  }
  async list(): Promise<readonly AssetInfo[]> {
    this.#live();
    return transact(this.#db, "readonly", (tx, result) => {
      const metadata: AssetInfo[] = [];
      const request = tx.objectStore("assets").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { result(metadata); return; }
        // Keep metadata in primary-key order without materializing an array of raster payloads.
        metadata.push(assetInfo(cursor.value as AssetRecord));
        cursor.continue();
      };
    });
  }
  async blob(asset: string): Promise<Blob | undefined> {
    this.#live(); const record = await readAsset(this.#db, asset);
    return record ? new Blob([record.payload], {type: record.mime}) : undefined;
  }
  async resolve(asset: string): Promise<string | undefined> {
    this.#live(); const cached = this.#urls.get(asset); if (cached) return cached;
    const blob = await this.blob(asset);
    if (!blob || this.#closed) return undefined;
    // Concurrent renders may resolve the same hash; retain one object URL.
    const current = this.#urls.get(asset); if (current) return current;
    const url = URL.createObjectURL(blob); this.#urls.set(asset, url); return url;
  }
  async cancel(asset: string): Promise<AssetInfo> {
    return this.#write(async () => { this.#active.get(asset)?.abort();
    const record = await updateAsset(this.#db, asset, value => value.status === "uploaded" ? value
      : {...value, status: "cancelled", epoch: value.epoch + 1, failure: null});
    this.#notify(record); return assetInfo(record);
    });
  }
  async retry(asset: string): Promise<AssetInfo> {
    return this.#write(async () => {
    const record = await updateAsset(this.#db, asset, value => value.status === "failed" || value.status === "cancelled"
      ? {...value, status: "pending", epoch: value.epoch + 1, failure: null} : value);
    this.#notify(record); return assetInfo(record);
    });
  }

  /** Explicit opt-in network work. No provider means no upload or timer. */
  flush(uploader: AssetUploader): Promise<void> {
    this.#writable();
    if (this.#draining) return this.#draining;
    const drain = async (): Promise<void> => {
      if (this.#closed) return;
      const records = await this.list();
      for (const record of records) {
        if (this.#closed) return;
        if (record.status !== "pending") continue;
        const controller = new AbortController(); this.#active.set(record.asset, controller);
        try {
          const updated = await uploadAsset(this.#db, record.asset, uploader, controller.signal);
          if (updated) this.#notify(updated);
        } finally { this.#active.delete(record.asset); }
      }
    };
    // Web Locks coordinate live tabs. Receipts still require host idempotence after crashes.
    const work = (async()=>{if(this.#custodyReleasing)await this.#custodyReleasing;return withAssetMutationLock(this.#custodyLocks,this.#name,async()=>{this.#writable();return this.#custodyLocks ? this.#custodyLocks.request(`breditor/assets/${this.#name}`, drain) : drain();});})();
    this.#draining = work.finally(() => { this.#draining = undefined; });
    return this.#draining;
  }

  /** Abort live network work and revoke this owner's URLs, but retain durable bytes. */
  close(): void {
    if(this.#custody||this.#custodyOpening)throw new RichAssetCustodyError('asset_custody_busy');
    if (this.#reconciling) throw new RichAssetReconciliationError("asset_reconciliation_busy", "Wait for the active asset reconciliation operation");
    this.#close();
  }
  #close(): void {
    if (this.#closed) return; this.#closed = true;
    if(this.#custody)releaseAssetStoreCustody(this.#custody);
    for (const controller of this.#active.values()) controller.abort();
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
    this.#urls.clear(); this.#db.close();
  }
}
