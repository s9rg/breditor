/** Pure retained union after full raster admission. No clocks, network, writes or eviction.
 * Same-ID immutable differences always refuse. Only an explicit choice may select different
 * queue metadata; both complete input archives must be retained before this plan is applied. */
import {assetInfo, type AssetLimits, type AssetRecord} from "../types.js";
import {assetArchiveEntry, canonicalAssetArchiveEntry} from "../archive/metadata.js";
import {MAX_ASSET_BACKUP_HEADER_BYTES} from "../archive/types.js";
import {RichAssetReconciliationError} from "./error.js";
import type {RichAssetReconciliationChoice, RichAssetReconciliationPreview, RichAssetUploadState} from "./types.js";
import {equalAssetBytes} from "./equal_bytes.js";

export function sameAssetPayload(a: AssetRecord, b: AssetRecord): boolean {
  if (a.asset !== b.asset || a.mime !== b.mime || a.bytes !== b.bytes || a.width !== b.width || a.height !== b.height || a.payload.byteLength !== b.payload.byteLength) return false;
  return equalAssetBytes(a.payload,b.payload);
}
export function sameAssetRecord(a: AssetRecord, b: AssetRecord, limits: Readonly<AssetLimits>): boolean {
  return JSON.stringify(canonicalAssetArchiveEntry(assetArchiveEntry(a, 0, limits))) === JSON.stringify(canonicalAssetArchiveEntry(assetArchiveEntry(b, 0, limits))) && sameAssetPayload(a, b);
}
function recordsById(records: readonly AssetRecord[], limits: Readonly<AssetLimits>): Map<string, AssetRecord> {
  const result = new Map<string, AssetRecord>(); let bytes = 0;
  for (const record of records) {
    assetArchiveEntry(record, bytes, limits);
    if (result.has(record.asset)) throw new RichAssetReconciliationError("asset_reconciliation_format", "Asset recovery records must have unique identities");
    result.set(record.asset, record); bytes += record.bytes;
    if (bytes > limits.maxStoredBytes) throw new RichAssetReconciliationError("asset_reconciliation_budget", "Asset recovery exceeds the existing store budget");
  }
  return result;
}
const state = (r: AssetRecord): RichAssetUploadState => Object.freeze({...assetInfo(r), epoch: r.epoch});

export function planRetainedAssets(current: readonly AssetRecord[], original: readonly AssetRecord[], limits: Readonly<AssetLimits>, input?: readonly RichAssetReconciliationChoice[]): {preview: RichAssetReconciliationPreview; records: readonly AssetRecord[] | null; choices: readonly RichAssetReconciliationChoice[] | null} {
  const left = recordsById(current, limits), right = recordsById(original, limits), conflicts: {asset: string; current: RichAssetUploadState; original: RichAssetUploadState}[] = [];
  let added = 0, unchanged = 0, bytes = 0;
  const ids = [...new Set([...left.keys(), ...right.keys()])].sort();
  for (const id of ids) {
    const a = left.get(id), b = right.get(id), value = a ?? b!; bytes += value.bytes;
    if (bytes > limits.maxStoredBytes) throw new RichAssetReconciliationError("asset_reconciliation_budget", "The complete retained union exceeds the existing store budget");
    if (!a) added++;
    else if (b) {
      if (!sameAssetPayload(a, b)) throw new RichAssetReconciliationError("asset_reconciliation_immutable", "One asset identity has different immutable bytes or raster metadata");
      if (sameAssetRecord(a, b, limits)) unchanged++;
      else conflicts.push(Object.freeze({asset: id, current: state(a), original: state(b)}));
    }
  }
  const preview = Object.freeze({currentAssets: current.length, originalAssets: original.length, unionAssets: ids.length, unionBytes: bytes, added, unchanged, conflicts: Object.freeze(conflicts)});
  if (input === undefined) return {preview, records: null, choices: null};
  if (!Array.isArray(input) || input.length !== conflicts.length) throw new RichAssetReconciliationError("asset_reconciliation_choices", "Supply exactly one explicit choice for every conflicting asset");
  const selected = new Map<string, "current" | "original">(), required = new Set(conflicts.map(c => c.asset));
  for (const choice of input) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice) || Object.keys(choice).sort().join(",") !== "asset,keep" || !required.has(choice.asset) || selected.has(choice.asset) || !["current", "original"].includes(choice.keep)) throw new RichAssetReconciliationError("asset_reconciliation_choices", "Asset recovery choices must be exact, unique and complete");
    selected.set(choice.asset, choice.keep);
  }
  const records = ids.map(id => selected.get(id) === "original" ? right.get(id)! : left.get(id) ?? right.get(id)!);
  let offset = 0;
  const entries = records.map(r => {const entry = assetArchiveEntry(r, offset, limits); offset += r.bytes; return canonicalAssetArchiveEntry(entry);});
  if (new TextEncoder().encode(JSON.stringify({format: "breditor/raster-asset-archive", formatVersion: 1, records: entries, sha256: "0".repeat(64)})).length > MAX_ASSET_BACKUP_HEADER_BYTES) throw new RichAssetReconciliationError("asset_reconciliation_budget", "The complete retained union exceeds the existing archive header budget");
  return {preview, records, choices: Object.freeze([...selected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([asset, keep]) => Object.freeze({asset, keep})))};
}
