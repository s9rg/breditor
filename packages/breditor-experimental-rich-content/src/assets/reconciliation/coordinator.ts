/** Durable explicit upload-state recovery. This changes host storage, never document history.
 * Original/current archives survive every phase; receipts remain unauthenticated host data. */
import type {AssetLimits, AssetRecord} from "../types.js";
import {importAssetBackup} from "../archive/import_backup.js";
import {MAX_ASSET_BACKUP_BYTES} from "../archive/codec.js";
import {ASSET_BACKUP_MIME} from "../archive/types.js";
import {RichAssetReconciliationError, checkAssetReconciliationSource} from "./error.js";
import {acquireAssetReconciliationLease} from "./lease.js";
import {planRetainedAssets} from "./plan.js";
import {openReconciliationLedger, readReconciliationLedger, writeReconciliationLedger, reconciliationName, sameBytes, type AssetReconciliationRecord, type AssetReconciliationFiles} from "./ledger.js";
import type {RichAssetReconciliationChoice, RichAssetReconciliationPreview} from "./types.js";

export interface RichAssetReconciliationOptions {database: string; checkSource: () => void; signal?: AbortSignal}
/** @internal Ports are created only inside a genuine RichAssetStore method. */
export interface AssetReconciliationPort {
  readonly name: string; readonly limits: Readonly<AssetLimits>;
  use<T>(work: () => Promise<T>): Promise<T>; check(): void;
  snapshot(): Promise<Blob>;
  apply(before: readonly AssetRecord[], after: readonly AssetRecord[], check: () => void, signal?: AbortSignal): Promise<"applied" | "already-applied">;
}
const key = Object.freeze({});
let begin: (port: AssetReconciliationPort, file: Blob, options: RichAssetReconciliationOptions) => Promise<RichAssetReconciliation>;
let resume: (port: AssetReconciliationPort, options: RichAssetReconciliationOptions) => Promise<RichAssetReconciliation>;
/** @internal The package exports only genuine store instance entry points. */
export const beginAssetReconciliation = (port: AssetReconciliationPort, file: Blob, options: RichAssetReconciliationOptions): Promise<RichAssetReconciliation> => begin(port, file, options);
export const resumeAssetReconciliation = (port: AssetReconciliationPort, options: RichAssetReconciliationOptions): Promise<RichAssetReconciliation> => resume(port, options);
async function digest(bytes: ArrayBuffer): Promise<string> {const hash = await crypto.subtle.digest("SHA-256", bytes); return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");}
async function admit(file: Blob, limits: Readonly<AssetLimits>, check: () => void, signal?: AbortSignal): Promise<{bytes: ArrayBuffer; hash: string; records: AssetRecord[]}> {
  check(); if (!(file instanceof Blob) || file.size > MAX_ASSET_BACKUP_BYTES) throw new RichAssetReconciliationError("asset_reconciliation_budget", "The retained asset file exceeds the original archive budget");
  const records = await importAssetBackup(file, limits, signal); check(); const bytes = await file.arrayBuffer(); check(); const hash = await digest(bytes); check(); return {bytes, hash, records};
}

export class RichAssetReconciliation {
  #port: AssetReconciliationPort | undefined; #options: RichAssetReconciliationOptions | undefined;
  readonly #db: IDBDatabase; readonly #fence: () => void; readonly #release: () => Promise<void>;
  #files: AssetReconciliationFiles; #before: readonly AssetRecord[]; #original: readonly AssetRecord[];
  readonly #preview: RichAssetReconciliationPreview; #record: AssetReconciliationRecord; #busy = false; #closed = false;
  private constructor(token: object, port: AssetReconciliationPort, options: RichAssetReconciliationOptions, db: IDBDatabase, fence: () => void, release: () => Promise<void>, record: AssetReconciliationRecord, files: AssetReconciliationFiles, before: readonly AssetRecord[], original: readonly AssetRecord[]) {
    if (token !== key) throw new RichAssetReconciliationError("asset_reconciliation_policy", "Use a genuine asset store recovery method");
    this.#port = port; this.#options = options; this.#db = db; this.#fence = fence; this.#release = release; this.#record = record; this.#files = files; this.#before = before; this.#original = original;
    this.#preview = planRetainedAssets(before, original, port.limits).preview;
    if (record.choices !== null) {const plan = planRetainedAssets(before, original, port.limits, record.choices); if (JSON.stringify(plan.choices) !== JSON.stringify(record.choices)) throw new RichAssetReconciliationError("asset_reconciliation_format", "Stored asset choices are not canonical");}
  }
  /** Detached original conflict state; this is not current provider availability or authorization. */
  preview(): RichAssetReconciliationPreview {return this.#preview;}
  progress(): Readonly<{phase: "prepared" | "decided" | "applied"; choices: readonly RichAssetReconciliationChoice[] | null}> {return structuredClone({phase: this.#record.phase, choices: this.#record.choices});}
  file(which: "current" | "original"): Blob {this.#live(); if (which !== "current" && which !== "original") throw new RichAssetReconciliationError("asset_reconciliation_policy", "Select one retained asset source file"); return new Blob([this.#files[which]], {type: ASSET_BACKUP_MIME});}
  #live(): void {if (this.#closed) throw new RichAssetReconciliationError("asset_reconciliation_closed", "The asset reconciliation attempt is closed"); this.#fence();}
  #check = (): void => {this.#live(); const port=this.#port!,options=this.#options!;port.check(); checkAssetReconciliationSource(options.checkSource, options.signal); this.#live(); port.check();};
  /** Persist exact choices before the target transaction. Retry re-reads durable phase/files;
   * an exact already-applied union is acknowledged rather than applied a second time. */
  async commit(input: readonly RichAssetReconciliationChoice[]): Promise<Readonly<{phase: "applied"; retained: number; bytes: number}>> {
    this.#live(); if (this.#busy) throw new RichAssetReconciliationError("asset_reconciliation_busy", "An asset reconciliation operation is already running");
    this.#busy = true;
    try {const port=this.#port!,plan = planRetainedAssets(this.#before, this.#original, port.limits, input); return await port.use(async () => {
      this.#check(); const actual = await readReconciliationLedger(this.#db); this.#check();
      if (JSON.stringify(actual.record.files) !== JSON.stringify(this.#record.files) || actual.record.assetDatabase !== this.#record.assetDatabase || JSON.stringify(actual.record.limits) !== JSON.stringify(this.#record.limits) || !sameBytes(actual.files.current, this.#files.current) || !sameBytes(actual.files.original, this.#files.original)) throw new RichAssetReconciliationError("asset_reconciliation_format", "The retained asset attempt changed");
      const phases = ["prepared","decided","applied"];
      if (phases.indexOf(actual.record.phase) < phases.indexOf(this.#record.phase) || this.#record.choices !== null && JSON.stringify(actual.record.choices) !== JSON.stringify(this.#record.choices)) throw new RichAssetReconciliationError("asset_reconciliation_format","The recorded asset choices or durable phase moved backwards");
      this.#record = actual.record;
      if (this.#record.choices !== null && JSON.stringify(this.#record.choices) !== JSON.stringify(plan.choices)) throw new RichAssetReconciliationError("asset_reconciliation_choices", "The attempt already recorded different explicit choices");
      if (this.#record.phase === "prepared") {const next = {...this.#record, phase: "decided" as const, choices: plan.choices}; await writeReconciliationLedger(this.#db, this.#record, next, this.#files, this.#check); this.#record = next;}
      await port.apply(this.#record.phase === "applied" ? plan.records! : this.#before, plan.records!, this.#check, this.#options!.signal);
      this.#check(); if (this.#record.phase !== "applied") {const next = {...this.#record, phase: "applied" as const}; await writeReconciliationLedger(this.#db, this.#record, next, this.#files, this.#check); this.#record = next;}
      return Object.freeze({phase: "applied" as const, retained: this.#preview.unionAssets, bytes: this.#preview.unionBytes});
    });} finally {this.#busy = false;}
  }
  async close(): Promise<void> {if (this.#closed) return; if (this.#busy) throw new RichAssetReconciliationError("asset_reconciliation_busy", "Wait for the active asset reconciliation operation"); this.#closed = true; this.#db.close(); this.#port=undefined;this.#options=undefined;this.#files={current:new ArrayBuffer(0),original:new ArrayBuffer(0)};this.#before=[];this.#original=[];await this.#release();}
  static {begin = RichAssetReconciliation.#begin; resume = RichAssetReconciliation.#resume;}
  static async #begin(port: AssetReconciliationPort, originalFile: Blob, input: RichAssetReconciliationOptions): Promise<RichAssetReconciliation> {
    const options = {...input}, database = reconciliationName(options.database); if (database === port.name) throw new RichAssetReconciliationError("asset_reconciliation_policy", "The attempt must not use the asset database name");
    const release = await acquireAssetReconciliationLease(database); let db: IDBDatabase | undefined;
    try {return await port.use(async () => {
      const check = () => {port.check(); checkAssetReconciliationSource(options.checkSource, options.signal); port.check();}; check();
      const original = await admit(originalFile, port.limits, check, options.signal), current = await admit(await port.snapshot(), port.limits, check, options.signal); check();
      planRetainedAssets(current.records, original.records, port.limits);
      const opened = await openReconciliationLedger(database, true, check); db = opened.db; const fenced = () => {opened.check(); check();};
      const files = {current: current.bytes, original: original.bytes}, record: AssetReconciliationRecord = {format: "breditor/asset-store-reconciliation", formatVersion: 1, assetDatabase: port.name, limits: port.limits, files: {current: {bytes: current.bytes.byteLength, sha256: current.hash}, original: {bytes: original.bytes.byteLength, sha256: original.hash}}, phase: "prepared", choices: null};
      await writeReconciliationLedger(db, null, record, files, fenced); fenced();
      return new RichAssetReconciliation(key, port, options, db, opened.check, release, record, files, current.records, original.records);
    });} catch (error) {db?.close(); await release(); throw error;}
  }
  static async #resume(port: AssetReconciliationPort, input: RichAssetReconciliationOptions): Promise<RichAssetReconciliation> {
    const options = {...input}, database = reconciliationName(options.database); if (database === port.name) throw new RichAssetReconciliationError("asset_reconciliation_policy", "The attempt must not use the asset database name");
    const release = await acquireAssetReconciliationLease(database); let db: IDBDatabase | undefined;
    try {return await port.use(async () => {
      const check = () => {port.check(); checkAssetReconciliationSource(options.checkSource, options.signal); port.check();}; check();
      const opened = await openReconciliationLedger(database, false, check); db = opened.db; const fenced = () => {opened.check(); check();};
      const saved = await readReconciliationLedger(db); fenced(); if (saved.record.assetDatabase !== port.name || JSON.stringify(saved.record.limits) !== JSON.stringify(port.limits)) throw new RichAssetReconciliationError("asset_reconciliation_policy", "Reopen with the original target asset store and limits");
      const current = await admit(new Blob([saved.files.current]), port.limits, fenced, options.signal), original = await admit(new Blob([saved.files.original]), port.limits, fenced, options.signal);
      if (current.hash !== saved.record.files.current.sha256 || original.hash !== saved.record.files.original.sha256) throw new RichAssetReconciliationError("asset_reconciliation_format", "Retained asset recovery files changed");
      return new RichAssetReconciliation(key, port, options, db, opened.check, release, saved.record, saved.files, current.records, original.records);
    });} catch (error) {db?.close(); await release(); throw error;}
  }
}
