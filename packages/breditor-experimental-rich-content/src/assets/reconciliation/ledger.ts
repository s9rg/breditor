/** Separate V1 attempt storage. Old asset databases and archive formats do not change.
 * Both exact input files precede decisions and target writes. Phase transitions compare
 * the actual record and every retained file in the same transaction; no file is overwritten. */
import {checkedAssetLimits} from "../limits.js";
import type {AssetLimits} from "../types.js";
import {MAX_ASSET_BACKUP_BYTES} from "../archive/codec.js";
import {MAX_ASSET_BACKUP_HEADER_BYTES} from "../archive/types.js";
import {RichAssetReconciliationError} from "./error.js";
import type {RichAssetReconciliationChoice} from "./types.js";
import {equalAssetBytes} from "./equal_bytes.js";

export interface AssetReconciliationRecord {
  format: "breditor/asset-store-reconciliation"; formatVersion: 1;
  assetDatabase: string; limits: Readonly<AssetLimits>;
  files: {current: {bytes: number; sha256: string}; original: {bytes: number; sha256: string}};
  phase: "prepared" | "decided" | "applied";
  choices: readonly RichAssetReconciliationChoice[] | null;
}
export interface AssetReconciliationFiles {current: ArrayBuffer; original: ArrayBuffer}
export const reconciliationName = (value: unknown): string => {
  if (typeof value !== "string" || !value || value.length > 200) throw new RichAssetReconciliationError("asset_reconciliation_policy", "Use a dedicated reconciliation database name");
  return value;
};
const fail = () => new RichAssetReconciliationError("asset_reconciliation_format", "Asset reconciliation storage is not the complete original attempt");
export const sameBytes = (a: unknown, b: ArrayBuffer): boolean => {
  if (!(a instanceof ArrayBuffer) || a.byteLength !== b.byteLength) return false;
  return equalAssetBytes(a,b);
};

export function checkReconciliationRecord(value: unknown): AssetReconciliationRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "assetDatabase,choices,files,format,formatVersion,limits,phase") throw fail();
  const r = value as AssetReconciliationRecord;
  if (r.format !== "breditor/asset-store-reconciliation" || r.formatVersion !== 1 || !["prepared", "decided", "applied"].includes(r.phase) || !r.files || Array.isArray(r.files) || Object.keys(r.files).sort().join(",") !== "current,original" || (r.phase === "prepared" ? r.choices !== null : !Array.isArray(r.choices))) throw fail();
  reconciliationName(r.assetDatabase);
  try {if (!r.limits || Array.isArray(r.limits) || Object.keys(r.limits).sort().join(",") !== "maxDimension,maxFileBytes,maxPixels,maxStoredBytes") throw Error(); checkedAssetLimits(r.limits);} catch {throw fail();}
  for (const f of [r.files.current, r.files.original]) if (!f || Array.isArray(f) || Object.keys(f).sort().join(",") !== "bytes,sha256" || !Number.isSafeInteger(f.bytes) || f.bytes < 1 || f.bytes > MAX_ASSET_BACKUP_BYTES || typeof f.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(f.sha256)) throw fail();
  if (new TextEncoder().encode(JSON.stringify(r)).length > MAX_ASSET_BACKUP_HEADER_BYTES) throw new RichAssetReconciliationError("asset_reconciliation_budget", "Asset reconciliation choices exceed their record budget");
  return structuredClone(r);
}

export function openReconciliationLedger(name: string, create: boolean, check: () => void): Promise<{db: IDBDatabase; check: () => void}> {
  reconciliationName(name); check();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1); let stopped = false, failure: unknown, live = true;
    request.onupgradeneeded = () => {try {check(); if (stopped || !create || request.transaction!.db.version !== 1 || request.result.objectStoreNames.length) throw fail(); request.result.createObjectStore("record"); request.result.createObjectStore("files");} catch (error) {failure = error; request.transaction!.abort();}};
    request.onblocked = () => {stopped = true; reject(new RichAssetReconciliationError("asset_reconciliation_busy", "Asset reconciliation storage is held by another owner"));};
    request.onerror = () => reject(failure ?? new RichAssetReconciliationError("asset_reconciliation_storage", "Asset reconciliation storage did not open"));
    request.onsuccess = () => {
      const db = request.result;
      try {check(); if (stopped || db.version !== 1 || [...db.objectStoreNames].sort().join(",") !== "files,record") throw fail();
        const tx = db.transaction(["record", "files"], "readonly"); for (const name of ["record", "files"]) {const s = tx.objectStore(name); if (s.keyPath !== null || s.autoIncrement || s.indexNames.length) throw fail();}
        db.onversionchange = () => {live = false; db.close();}; resolve({db, check: () => {if (!live) throw new RichAssetReconciliationError("asset_reconciliation_closed", "Asset reconciliation storage changed version");}});
      } catch (error) {db.close(); reject(error);}
    };
  });
}

/** Read record and files at one cut. Missing/extra data refuses rather than reconstructing it. */
export function readReconciliationLedger(db: IDBDatabase): Promise<{record: AssetReconciliationRecord; files: AssetReconciliationFiles}> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["record", "files"], "readonly"); let record: unknown, current: unknown, original: unknown, rk: IDBValidKey[] = [], fk: IDBValidKey[] = [];
    tx.onabort = () => reject(new RichAssetReconciliationError("asset_reconciliation_storage", "Asset reconciliation did not read"));
    tx.oncomplete = () => {try {if (rk.length !== 1 || rk[0] !== "attempt" || fk.length !== 2 || fk[0] !== "current" || fk[1] !== "original" || !(current instanceof ArrayBuffer) || !(original instanceof ArrayBuffer)) throw fail(); const checked = checkReconciliationRecord(record); if (current.byteLength !== checked.files.current.bytes || original.byteLength !== checked.files.original.bytes) throw fail(); resolve({record: checked, files: {current, original}});} catch (error) {reject(error);}};
    tx.objectStore("record").get("attempt").onsuccess = e => {record = (e.target as IDBRequest).result;};
    tx.objectStore("record").getAllKeys().onsuccess = e => {rk = (e.target as IDBRequest<IDBValidKey[]>).result;};
    tx.objectStore("files").get("current").onsuccess = e => {current = (e.target as IDBRequest).result;};
    tx.objectStore("files").get("original").onsuccess = e => {original = (e.target as IDBRequest).result;};
    tx.objectStore("files").getAllKeys().onsuccess = e => {fk = (e.target as IDBRequest<IDBValidKey[]>).result;};
  });
}

/** Initial add or guarded phase transition. Never rewrites the two retained source files. */
export function writeReconciliationLedger(db: IDBDatabase, before: AssetReconciliationRecord | null, next: AssetReconciliationRecord, files: AssetReconciliationFiles, check: () => void): Promise<void> {
  checkReconciliationRecord(next); check();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["record", "files"], "readwrite"), records = tx.objectStore("record"), blobs = tx.objectStore("files"); let count = 0, failure: unknown; const values: unknown[] = [];
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(failure ?? new RichAssetReconciliationError("asset_reconciliation_storage", "Asset reconciliation did not commit"));
    const ready = () => {if (++count !== 5) return; try {check(); const [record, rk, fk, current, original] = values as [unknown, IDBValidKey[], IDBValidKey[], unknown, unknown];
      if (before === null) {if (rk.length || fk.length || record !== undefined) throw new RichAssetReconciliationError("asset_reconciliation_destination_exists", "The reconciliation destination already contains data"); records.add(next, "attempt"); blobs.add(files.current, "current"); blobs.add(files.original, "original");}
      else {if (rk.length !== 1 || rk[0] !== "attempt" || fk.length !== 2 || fk[0] !== "current" || fk[1] !== "original" || JSON.stringify(record) !== JSON.stringify(before) || !sameBytes(current, files.current) || !sameBytes(original, files.original)) throw fail(); records.put(next, "attempt");}
    } catch (error) {failure = error; tx.abort();}};
    for (const [i, request] of [records.get("attempt"), records.getAllKeys(), blobs.getAllKeys(), blobs.get("current"), blobs.get("original")].entries()) request.onsuccess = () => {values[i] = request.result; ready();};
  });
}
