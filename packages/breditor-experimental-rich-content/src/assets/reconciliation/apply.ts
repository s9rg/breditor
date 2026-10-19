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
  if (old.some(row => !nextIds.has(row.asset) || !sameAssetPayload(row, nextIds.get(row.asset)!))) throw new RichAssetReconciliationError("asset_reconciliation_immutable", "Recovery cannot remove or replace retained raster bytes");
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["assets", "metadata"], "readwrite"), assets = tx.objectStore("assets"), metadata = tx.objectStore("metadata");
    let actual: AssetRecord[] | undefined, budget: unknown, keys: IDBValidKey[] | undefined, readBudget = false, failure: unknown, result: "applied" | "already-applied" | undefined;
    const abort = () => {failure = new RichAssetReconciliationError("asset_reconciliation_aborted", "Asset reconciliation was cancelled"); try {tx.abort();} catch {}};
    signal?.addEventListener("abort", abort, {once: true});
    tx.oncomplete = () => {signal?.removeEventListener("abort", abort); if (!result) reject(new RichAssetReconciliationError("asset_reconciliation_storage", "Asset recovery did not compare its target")); else resolve(result);};
    tx.onabort = () => {signal?.removeEventListener("abort", abort); reject(failure ?? new RichAssetReconciliationError("asset_reconciliation_storage", "Asset recovery did not commit"));};
    try {checkAssetReconciliationSchema(db,tx);} catch(error) {failure=error;tx.abort();return;}
    const ready = () => {
      if (!actual || !keys || !readBudget) return;
      try {
        checkAssetReconciliationSource(check, signal);
        if (keys.length !== 1 || keys[0] !== "bytes" || budget !== actual.reduce((sum, row) => sum + row.bytes, 0)) throw new RichAssetReconciliationError("asset_reconciliation_target_changed", "The target asset budget or metadata changed");
        const current = sorted(actual), equal = (rows: readonly AssetRecord[]) => rows.length === current.length && rows.every((row, i) => sameAssetRecord(row, current[i]!, limits));
        if (equal(next)) {result = "already-applied"; return;}
        if (!equal(old)) throw new RichAssetReconciliationError("asset_reconciliation_target_changed", "The target asset records changed after the retained snapshot");
        checkAssetReconciliationSource(check, signal);
        for (const row of next) assets.put(row);
        metadata.put(expectedBytes, "bytes"); result = "applied";
      } catch (error) {failure = error; try {tx.abort();} catch {}}
    };
    assets.getAll().onsuccess = event => {actual = (event.target as IDBRequest<AssetRecord[]>).result; ready();};
    metadata.get("bytes").onsuccess = event => {budget = (event.target as IDBRequest).result; readBudget = true; ready();};
    metadata.getAllKeys().onsuccess = event => {keys = (event.target as IDBRequest<IDBValidKey[]>).result; ready();};
  });
}
