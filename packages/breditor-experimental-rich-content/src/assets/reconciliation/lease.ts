import {RichAssetReconciliationError} from "./error.js";

/** One cooperative owner for a durable attempt. Never steals an existing lock. */
export async function acquireAssetReconciliationLease(database: string): Promise<() => Promise<void>> {
  if (typeof navigator === "undefined" || !navigator.locks?.request) throw new RichAssetReconciliationError("asset_reconciliation_policy", "Asset reconciliation requires Web Locks");
  let start!: (release: () => Promise<void>) => void, fail!: (error: unknown) => void, end!: () => void;
  const held = new Promise<void>(resolve => {end = resolve;}), acquired = new Promise<() => Promise<void>>((resolve, reject) => {start = resolve; fail = reject;});
  const work = Promise.resolve().then(() => navigator.locks.request(`breditor/asset-reconciliation/${database}`, {mode: "exclusive", ifAvailable: true}, async lock => {
    if (!lock) throw new RichAssetReconciliationError("asset_reconciliation_busy", "Another owner holds this asset reconciliation attempt");
    start(async () => {end(); await work;}); await held;
  }));
  void work.catch(error => fail(error instanceof RichAssetReconciliationError ? error : new RichAssetReconciliationError("asset_reconciliation_storage", "The asset reconciliation lease failed")));
  return acquired;
}
