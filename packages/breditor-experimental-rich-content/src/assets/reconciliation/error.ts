/** Redacted local asset recovery failures. No error is a provider or writer grant. */
export class RichAssetReconciliationError extends Error {
  constructor(readonly code:
    | "asset_reconciliation_busy" | "asset_reconciliation_closed"
    | "asset_reconciliation_source" | "asset_reconciliation_choices"
    | "asset_reconciliation_immutable" | "asset_reconciliation_budget"
    | "asset_reconciliation_target_changed" | "asset_reconciliation_storage"
    | "asset_reconciliation_destination_exists" | "asset_reconciliation_format"
    | "asset_reconciliation_policy" | "asset_reconciliation_aborted",
    message: string) { super(message); this.name = "RichAssetReconciliationError"; }
}

/** A callback must synchronously return void. Boolean/Promise values are not checks. */
export function checkAssetReconciliationSource(check: () => void, signal?: AbortSignal): void {
  if (signal?.aborted) throw new RichAssetReconciliationError("asset_reconciliation_aborted", "Asset reconciliation was cancelled");
  try {
    if (typeof check !== "function") throw Error();
    const result: unknown = check();
    if (result !== undefined) {
      if (result && (typeof result === "object" || typeof result === "function") && typeof (result as {then?: unknown}).then === "function") void Promise.resolve(result).catch(() => {});
      throw Error();
    }
  } catch (error) {
    if (error instanceof RichAssetReconciliationError) throw error;
    throw new RichAssetReconciliationError("asset_reconciliation_source", "The selected asset recovery source is no longer usable");
  }
  if (signal?.aborted) throw new RichAssetReconciliationError("asset_reconciliation_aborted", "Asset reconciliation was cancelled");
}
