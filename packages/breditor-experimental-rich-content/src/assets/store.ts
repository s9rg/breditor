import {openDatabase, readAsset, transact, updateAsset} from "./database.js";
import {ingestFile} from "./ingest_file.js";
import {uploadAsset} from "./upload_queue.js";
import {assetInfo, defaultAssetLimits, type AssetInfo, type AssetLimits, type AssetRecord, type AssetUploader} from "./types.js";

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

  private constructor(db: IDBDatabase, name: string, options: RichAssetOptions) {
    this.#db = db; this.#name = name; this.#options = options;
    const limits = {...defaultAssetLimits, ...options.limits};
    for (const [key, value] of Object.entries(limits)) {
      if (!(key in defaultAssetLimits) || !Number.isSafeInteger(value) || value < 1 || value > defaultAssetLimits[key as keyof AssetLimits]) throw Error("Asset limits can only tighten defaults");
    }
    this.limits = Object.freeze(limits);
    db.onversionchange = () => this.close();
  }

  static async open(name: string, options: RichAssetOptions = {}): Promise<RichAssetStore> {
    const db = await openDatabase(name);
    try { return new RichAssetStore(db, name, options); }
    catch (error) { db.close(); throw error; }
  }

  #live(): void { if (this.#closed) throw Error("Asset store is closed"); }
  #notify(record: AssetRecord): void {
    try { this.#options.onChange?.(assetInfo(record)); } catch { /* Observers cannot undo durability. */ }
  }
  async ingest(file: Blob): Promise<AssetInfo> {
    this.#live();
    const record = await ingestFile(this.#db, file, this.limits);
    this.#notify(record); return assetInfo(record);
  }
  /** Cache independently verified remote bytes without echoing them into the upload queue.
   * An existing local record (including a cancellation epoch) is never rewritten by a download. */
  async cacheRemote(asset: string, file: Blob, storageRef: string): Promise<AssetInfo> {
    this.#live();
    if (!/^sha256:[0-9a-f]{64}$/.test(asset) || typeof storageRef !== "string" || !storageRef || storageRef.length > 4096) throw Error("Invalid remote asset identity/receipt");
    const record = await ingestFile(this.#db, file, this.limits, {asset,storageRef});
    this.#notify(record); return assetInfo(record);
  }
  async get(asset: string): Promise<AssetInfo | undefined> {
    this.#live(); const record = await readAsset(this.#db, asset);
    return record ? assetInfo(record) : undefined;
  }
  async list(): Promise<readonly AssetInfo[]> {
    this.#live();
    return transact(this.#db, "readonly", (tx, result) => {
      const request = tx.objectStore("assets").getAll();
      request.onsuccess = () => result((request.result as AssetRecord[]).map(assetInfo));
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
    this.#live(); this.#active.get(asset)?.abort();
    const record = await updateAsset(this.#db, asset, value => value.status === "uploaded" ? value
      : {...value, status: "cancelled", epoch: value.epoch + 1, failure: null});
    this.#notify(record); return assetInfo(record);
  }
  async retry(asset: string): Promise<AssetInfo> {
    this.#live();
    const record = await updateAsset(this.#db, asset, value => value.status === "failed" || value.status === "cancelled"
      ? {...value, status: "pending", epoch: value.epoch + 1, failure: null} : value);
    this.#notify(record); return assetInfo(record);
  }

  /** Explicit opt-in network work. No provider means no upload or timer. */
  flush(uploader: AssetUploader): Promise<void> {
    this.#live();
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
    const work = navigator.locks ? navigator.locks.request(`breditor/assets/${this.#name}`, drain) : drain();
    this.#draining = work.finally(() => { this.#draining = undefined; });
    return this.#draining;
  }

  /** Abort live network work and revoke this owner's URLs, but retain durable bytes. */
  close(): void {
    if (this.#closed) return; this.#closed = true;
    for (const controller of this.#active.values()) controller.abort();
    for (const url of this.#urls.values()) URL.revokeObjectURL(url);
    this.#urls.clear(); this.#db.close();
  }
}
