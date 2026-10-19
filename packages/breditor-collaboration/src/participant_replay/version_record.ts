/** Materialize an exact admitted cache record from a genuine private native original replay. */
import {SharedParticipantReplay} from "./read.js";
import {SharedParticipantReplayError} from "./errors.js";
import {SharedAssetReferenceCapture} from "../asset_references_capture.js";
import {SharedRelayError} from "../relay/validation.js";
import {checkCatalogRecord} from "../versions/database.js";
import type {SharedDocumentVersionsIdentity,SharedVersionCatalogRecord} from "../versions/types.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
export function replayVersionRecord<P extends SharedSelectionPolicy>(replay:SharedParticipantReplay,current:SharedRichEditor<P>,identity:SharedDocumentVersionsIdentity):SharedVersionCatalogRecord{
 try{
 const source=SharedParticipantReplay.prototype.references.call(replay),records=SharedAssetReferenceCapture.prototype.records.call(source),text=records.find(row=>row.kind==="version-catalog")?.json;
 if(text===undefined)throw new SharedRelayError("version_recovery_source");const record=checkCatalogRecord(JSON.parse(text),identity);
 // Finish after all source authority callbacks; no callback follows the final native comparison.
 SharedParticipantReplay.prototype.verifyCurrent.call(replay,current);return record;
 }catch(error){if(error instanceof SharedParticipantReplayError||error instanceof SharedRelayError)throw error;throw new SharedRelayError("version_recovery_source");}
}
