import type {AssetInfo} from "../types.js";

/** Epochs and attempt counters are local state, never an ordering between copies. */
export interface RichAssetUploadState extends Readonly<AssetInfo> {readonly epoch: number}
export interface RichAssetReconciliationConflict {
  readonly asset: string;
  readonly current: RichAssetUploadState;
  readonly original: RichAssetUploadState;
}
/** Every conflicting asset requires exactly one explicit original/current choice. */
export interface RichAssetReconciliationChoice {readonly asset: string; readonly keep: "current" | "original"}
export interface RichAssetReconciliationPreview {
  readonly currentAssets: number;
  readonly originalAssets: number;
  readonly unionAssets: number;
  readonly unionBytes: number;
  readonly added: number;
  readonly unchanged: number;
  readonly conflicts: readonly RichAssetReconciliationConflict[];
}
