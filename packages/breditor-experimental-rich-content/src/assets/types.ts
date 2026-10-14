/** Binary asset state is host storage, never rich-document history. */
export type RasterMime = "image/png" | "image/jpeg" | "image/webp";
export type AssetStatus = "pending" | "failed" | "cancelled" | "uploaded";
export interface AssetInfo {
  asset: string;
  mime: RasterMime;
  bytes: number;
  width: number;
  height: number;
  status: AssetStatus;
  attempts: number;
  storageRef: string | null;
  failure: "upload_failed" | null;
}
export interface AssetRecord extends AssetInfo {
  payload: ArrayBuffer;
  epoch: number;
}
export interface AssetLimits {
  maxFileBytes: number;
  maxPixels: number;
  maxDimension: number;
  maxStoredBytes: number;
}
export const defaultAssetLimits: Readonly<AssetLimits> = Object.freeze({
  maxFileBytes: 10 * 1024 * 1024,
  maxPixels: 32_000_000,
  maxDimension: 16_384,
  maxStoredBytes: 100 * 1024 * 1024
});
/** Must be idempotent by asset ID: a crash may occur after upload but before local ack. */
export type AssetUploader = (asset: Readonly<AssetInfo>, blob: Blob, signal: AbortSignal) => Promise<string>;
export function assetInfo(record: AssetRecord): AssetInfo {
  const {asset, mime, bytes, width, height, status, attempts, storageRef, failure} = record;
  return {asset, mime, bytes, width, height, status, attempts, storageRef, failure};
}
