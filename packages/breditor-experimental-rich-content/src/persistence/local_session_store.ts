/** Optional host persistence of exact rich checkpoints; not a shared sync acknowledgement. */
export class RichLocalSessionStore {
  #db: IDBDatabase;
  #tail: Promise<void> = Promise.resolve();
  #closed = false;
  #pendingBytes = 0;
  #pendingWrites = 0;
  readonly maxBytes: number;

  private constructor(db: IDBDatabase, maxBytes: number) {
    this.#db = db; this.maxBytes = maxBytes;
    db.onversionchange = () => this.close();
  }
  static async open(name: string, maxBytes = 16 * 1024 * 1024): Promise<RichLocalSessionStore> {
    if (!name || name.length > 200 || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16 * 1024 * 1024) throw Error("Invalid local session storage configuration");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1); let blocked = false;
      request.onupgradeneeded = () => { request.result.createObjectStore("checkpoint"); };
      request.onerror = () => reject(request.error ?? Error("Cannot open local session storage"));
      request.onblocked = () => { blocked = true; reject(Error("Local session upgrade is blocked")); };
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    });
    return new RichLocalSessionStore(db, maxBytes);
  }
  #live(): void { if (this.#closed) throw Error("Local session storage is closed"); }
  async load(): Promise<string | null> {
    this.#live(); await this.#tail; this.#live();
    return new Promise((resolve, reject) => {
      const tx = this.#db.transaction("checkpoint", "readonly"), request = tx.objectStore("checkpoint").get("current");
      let value: string | null = null;
      request.onsuccess = () => { value = typeof request.result === "string" ? request.result : null; };
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(tx.error ?? Error("Local checkpoint read failed"));
    });
  }
  /** Capture the JSON before queueing; one completed transaction acknowledges this local write. */
  save(checkpointJson: string): Promise<void> {
    this.#live();
    if (typeof checkpointJson !== "string") throw Error("Local checkpoint must be JSON text");
    const bytes = new TextEncoder().encode(checkpointJson).byteLength;
    if (bytes > this.maxBytes) throw Error("Local checkpoint exceeds its byte budget");
    if (this.#pendingWrites >= 64 || this.#pendingBytes + bytes > 32 * 1024 * 1024) throw Error("Local checkpoint write queue exceeds its budget");
    this.#pendingWrites++; this.#pendingBytes += bytes;
    const write = this.#tail.catch(() => {}).then(() => {
      this.#live();
      return new Promise<void>((resolve, reject) => {
        const tx = this.#db.transaction("checkpoint", "readwrite");
        tx.objectStore("checkpoint").put(checkpointJson, "current");
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? Error("Local checkpoint write failed"));
      });
    });
    const tracked = write.finally(() => { this.#pendingWrites--; this.#pendingBytes -= bytes; });
    this.#tail = tracked; return tracked;
  }
  /** Await the last scheduled write. This acknowledges no server or asset upload. */
  flush(): Promise<void> { this.#live(); return this.#tail; }
  /** A caller should await flush before closing when it requires the last local write. */
  close(): void { if (this.#closed) return; this.#closed = true; this.#db.close(); }
}
