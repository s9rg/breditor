import type {AssetRecord} from "./types.js";

/** Version 1 owns immutable raster bytes and one atomically maintained byte budget. */
export function openDatabase(name: string): Promise<IDBDatabase> {
  if (!name || name.length > 200) throw Error("Asset database name must contain 1–200 characters");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("assets", {keyPath: "asset"});
      const metadata = db.createObjectStore("metadata");
      metadata.put(0, "bytes");
    };
    request.onerror = () => reject(request.error ?? Error("Cannot open asset storage"));
    request.onblocked = () => { blocked = true; reject(Error("Asset storage upgrade is blocked by another tab")); };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

/** Resolve only on transaction completion, not on an individual request's success. */
export function transact<T>(db: IDBDatabase, mode: IDBTransactionMode,
  work: (tx: IDBTransaction, result: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["assets", "metadata"], mode);
    let value: T;
    tx.oncomplete = () => resolve(value);
    tx.onabort = () => reject(tx.error ?? Error("Asset storage transaction aborted"));
    tx.onerror = () => { /* The abort handler owns the final outcome. */ };
    try { work(tx, result => { value = result; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export function readAsset(db: IDBDatabase, asset: string): Promise<AssetRecord | undefined> {
  return transact(db, "readonly", (tx, result) => {
    const request = tx.objectStore("assets").get(asset);
    request.onsuccess = () => result(request.result as AssetRecord | undefined);
  });
}

/** Atomic compare/update is used for upload epochs; callbacks must not await. */
export function updateAsset(db: IDBDatabase, asset: string,
  update: (record: AssetRecord) => AssetRecord): Promise<AssetRecord> {
  return transact(db, "readwrite", (tx, result) => {
    const store = tx.objectStore("assets"), request = store.get(asset);
    request.onsuccess = () => {
      const current = request.result as AssetRecord | undefined;
      if (!current) { tx.abort(); return; }
      try {
        const next = update(current);
        store.put(next);
        result(next);
      } catch { tx.abort(); }
    };
  });
}
