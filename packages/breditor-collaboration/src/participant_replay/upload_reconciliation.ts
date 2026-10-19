/** Bind local whole-upload reconciliation to the exact original participant file and actual
 * current native continuity. A local phase is not a provider receipt or activation grant. */
import {RichAssetStore,RichAssetReconciliationError,type RichAssetReconciliation} from "@breditor/experimental-rich-content";
import {SharedParticipantReplay} from "./read.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";

export interface SharedParticipantUploadReconciliationOptions {readonly database: string; readonly signal?: AbortSignal}
/** @internal Only the replay supplies its private admitted original upload file. */
export async function reconcileReplayedUploads<P extends SharedSelectionPolicy>(replay: SharedParticipantReplay, current: SharedRichEditor<P>, store: RichAssetStore, original: Blob, input: SharedParticipantUploadReconciliationOptions, mode: "begin" | "resume"): Promise<RichAssetReconciliation> {
  const options = {...input}, checkSource = () => SharedParticipantReplay.prototype.verifyCurrent.call(replay,current);
  checkSource();
  const supplied = {...options,checkSource}, attempt = mode === "begin"
    ? await RichAssetStore.prototype.beginReconciliation.call(store,original,supplied)
    : await RichAssetStore.prototype.resumeReconciliation.call(store,supplied);
  try {
    checkSource();
    const actual = new Uint8Array(await attempt.file("original").arrayBuffer()); checkSource();
    const expected = new Uint8Array(await original.arrayBuffer()); checkSource();
    if (actual.length !== expected.length || actual.some((value,i) => value !== expected[i])) throw new RichAssetReconciliationError("asset_reconciliation_source","The attempt retains a different original participant upload file");
    attempt.file("original"); checkSource(); return attempt;
  } catch (error) {await attempt.close(); throw error;}
}
