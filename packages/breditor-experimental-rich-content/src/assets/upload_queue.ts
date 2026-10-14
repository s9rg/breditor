import {assetInfo, type AssetRecord, type AssetUploader} from "./types.js";
import {readAsset, updateAsset} from "./database.js";

function invokeProvider(uploader: AssetUploader, record: AssetRecord, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const aborted = (): void => reject(new DOMException("Asset upload was cancelled", "AbortError"));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, {once: true});
    // Observe late completion/rejection even if cancellation wins, but never publish it.
    Promise.resolve().then(() => uploader(assetInfo(record), new Blob([record.payload], {type: record.mime}), signal))
      .then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}

/** Completion changes asset-host state only; no image/node/history publication. */
export async function uploadAsset(db: IDBDatabase, asset: string, uploader: AssetUploader, signal: AbortSignal): Promise<AssetRecord | undefined> {
  const original = await readAsset(db, asset);
  if (!original || original.status !== "pending" || signal.aborted) return original;
  const started = await updateAsset(db, asset, record => record.status === "pending" && record.epoch === original.epoch
    ? {...record, attempts: record.attempts + 1} : record);
  if (started.status !== "pending" || started.epoch !== original.epoch) return started;
  try {
    const storageRef = await invokeProvider(uploader, started, signal);
    if (signal.aborted) return undefined;
    if (typeof storageRef !== "string" || storageRef.length === 0 || storageRef.length > 4096) throw Error("Invalid asset upload receipt");
    return updateAsset(db, asset, record => record.status === "pending" && record.epoch === started.epoch
      ? {...record, status: "uploaded", storageRef, failure: null} : record);
  } catch {
    if (signal.aborted) return undefined;
    return updateAsset(db, asset, record => record.status === "pending" && record.epoch === started.epoch
      ? {...record, status: "failed", failure: "upload_failed"} : record);
  }
}
