import {transact} from "./database.js";
import {admitRaster} from "./admit_raster.js";
import type {AssetLimits, AssetRecord} from "./types.js";
import {assetArchiveEntry} from "./archive/metadata.js";
import {sameAssetPayload} from "./reconciliation/plan.js";

/** Admit first, then atomically store bytes before a host inserts their reference. */
export async function ingestFile(db: IDBDatabase, file: Blob, limits: Readonly<AssetLimits>, remote?: {asset:string;storageRef:string}): Promise<AssetRecord> {
  const {blob:_decodedBlob,...admitted} = await admitRaster(file, limits);
  if (remote && admitted.asset !== remote.asset) throw Error("Downloaded asset digest differs");
  const record: AssetRecord = {...admitted, bytes: admitted.payload.byteLength, status: remote ? "uploaded" : "pending", attempts: 0, epoch: 0, storageRef: remote?.storageRef ?? null, failure: null};
  let conflict: Error | undefined;
  return transact<AssetRecord>(db, "readwrite", (tx, result) => {
    const assets = tx.objectStore("assets"), existing = assets.get(admitted.asset);
    existing.onsuccess = () => {
      if (existing.result !== undefined) {
        try {
          const retained = existing.result as AssetRecord;
          assetArchiveEntry(retained, 0, limits);
          if (!sameAssetPayload(retained, record)) throw Error("Retained raster differs");
          result(retained);
        } catch {
          conflict = Object.assign(Error("Retained raster differs from the admitted image"), {code: "asset_raster_conflict"});
          tx.abort();
        }
        return;
      }
      const metadata = tx.objectStore("metadata"), budget = metadata.get("bytes");
      budget.onsuccess = () => {
        const total = budget.result as number;
        if (!Number.isSafeInteger(total) || total < 0 || total + admitted.payload.byteLength > limits.maxStoredBytes) { tx.abort(); return; }
        assets.add(record);
        metadata.put(total + record.bytes, "bytes");
        result(record);
      };
    };
  }).catch(error => {throw conflict ?? error;});
}
