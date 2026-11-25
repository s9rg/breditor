/** Atomic compare/apply of an already admitted, explicitly selected whole-store union.
 * Both source files must be durable before entry. This never decodes, uploads or deletes.
 * An abort leaves the original target intact; an exact post-commit retry adds nothing. */
import type {AssetLimits, AssetRecord} from "../types.js";
import {assetArchiveEntry} from "../archive/metadata.js";
import {RichAssetReconciliationError, checkAssetReconciliationSource} from "./error.js";
import {sameAssetPayload, sameAssetRecord} from "./plan.js";
import {checkAssetReconciliationSchema} from "./snapshot.js";

export function applyRetainedAssetPlan(db: IDBDatabase, before: readonly AssetRecord[], after: readonly AssetRecord[], limits: Readonly<AssetLimits>, check: () => void, signal?: AbortSignal): Promise<"applied" | "already-applied"> {
  checkAssetReconciliationSource(check, signal);
  const sorted = (rows: readonly AssetRecord[]) => [...rows].sort((a, b) => a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0), old = sorted(before), next = sorted(after), nextIds = new Map<string, AssetRecord>(); let expectedBytes = 0;
  for (const row of next) {assetArchiveEntry(row, expectedBytes, limits); expectedBytes += row.bytes; if (nextIds.has(row.asset)) throw new RichAssetReconciliationError("asset_reconciliation_format", "Recovery output has duplicate assets"); nextIds.set(row.asset, row);}
  if (expectedBytes > limits.maxStoredBytes) throw new RichAssetReconciliationError("asset_reconciliation_budget", "Recovery output exceeds the existing store budget");
  const changedIds = new Set(nextIds.keys());
  for (const row of old) {
    const replacement = nextIds.get(row.asset);
    if (!replacement || !sameAssetPayload(row, replacement)) throw new RichAssetReconciliationError("asset_reconciliation_immutable", "Recovery cannot remove or replace retained raster bytes");
    // Immutable equality is already proved. Reclone the raster only if its queue record changes.
    if (row.status === replacement.status && row.attempts === replacement.attempts && row.epoch === replacement.epoch &&
        row.failure === replacement.failure && row.storageRef === replacement.storageRef) changedIds.delete(row.asset);
  }
  const oldBytes=old.reduce((sum,row)=>sum+row.bytes,0);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["assets", "metadata"], "readwrite"), assets = tx.objectStore("assets"), metadata = tx.objectStore("metadata");
    let count:number|undefined,budget:unknown,keys:IDBValidKey[]|undefined,readBudget=false,failure:unknown,result:"applied"|"already-applied"|undefined;
    const diverged=()=>new RichAssetReconciliationError("asset_reconciliation_target_changed", "The target asset records or exact byte budget changed after the retained snapshot");
    const abort = () => {failure = new RichAssetReconciliationError("asset_reconciliation_aborted", "Asset reconciliation was cancelled"); try {tx.abort();} catch {}};
    signal?.addEventListener("abort", abort, {once: true});
    tx.oncomplete = () => {signal?.removeEventListener("abort", abort); if (!result) reject(new RichAssetReconciliationError("asset_reconciliation_storage", "Asset recovery did not compare its target")); else resolve(result);};
    tx.onabort = () => {signal?.removeEventListener("abort", abort); reject(failure ?? new RichAssetReconciliationError("asset_reconciliation_storage", "Asset recovery did not commit"));};
    try {checkAssetReconciliationSchema(db,tx);} catch(error) {failure=error;tx.abort();return;}
    const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{}};
    const compare=(actual:AssetRecord[])=>{
      try {
        checkAssetReconciliationSource(check, signal);
        if (count!==actual.length||budget!==actual.reduce((sum,row)=>sum+row.bytes,0))throw diverged();
        const current = sorted(actual), equal = (rows: readonly AssetRecord[]) => rows.length === current.length && rows.every((row, i) => sameAssetRecord(row, current[i]!, limits));
        if (equal(next)) {result = "already-applied"; return;}
        if (!equal(old)) throw diverged();
        checkAssetReconciliationSource(check, signal);
        for (const row of next) if (changedIds.has(row.asset)) assets.put(row);
        metadata.put(expectedBytes, "bytes"); result = "applied";
      } catch (error) {fail(error);}
    };
    const ready=()=>{
      if(count===undefined||!keys||!readBudget)return;
      try{
        checkAssetReconciliationSource(check,signal);
        if(keys.length!==1||keys[0]!=="bytes"||
           !(count===old.length&&budget===oldBytes||count===next.length&&budget===expectedBytes))throw diverged();
        // Compare every eligible payload in the same transaction before issuing any writes.
        if(count===0)compare([]);
        else {const read=assets.getAll(undefined,count);read.onsuccess=()=>compare(read.result);}
      }catch(error){fail(error);}
    };
    assets.count().onsuccess = event => {count = (event.target as IDBRequest<number>).result; ready();};
    metadata.get("bytes").onsuccess = event => {budget = (event.target as IDBRequest).result; readBudget = true; ready();};
    metadata.getAllKeys(undefined,2).onsuccess = event => {keys = (event.target as IDBRequest<IDBValidKey[]>).result; ready();};
  });
}
