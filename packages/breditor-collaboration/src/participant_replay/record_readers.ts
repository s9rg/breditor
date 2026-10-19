/** Admit every selected original record against an actual private native replay, without IDB. */
import type {PreparedRecovery} from "../participant_recovery/prepare.js";
import {SharedEditorError} from "../core.js";
import type {SharedRichEditor} from "../core.js";
import type {SharedSelectionPolicy} from "../types.js";
import type {SharedAssetCaptureSourceKind,SharedAssetRecordReader} from "../asset_references_capture.js";
import {readPairedBackupRecord} from "../backups/paired.js";
import {admitPairedVersions,checkPairedNativeProgress} from "../persistence/review_record_admission.js";
import {checkSourceCheckpoint} from "../persistence/source_checkpoint.js";
import {checkQueueRecord} from "../suggestions/database.js";
import {admitSuggestionRecord,checkSuggestionRecordSource} from "../suggestions/record_admission.js";
import {checkRevisionRecord} from "../suggestion_revisions/database.js";
import {admitRevisionRecord} from "../suggestion_revisions/record_admission.js";
import {checkCatalogRecord} from "../versions/database.js";
import {admitVersionRecord} from "../versions/record_admission.js";

/** Returned readers retain exact canonical record bytes, not fake queue/session instances. */
export function participantReplayReaders(p:PreparedRecovery<SharedSelectionPolicy>,core:SharedRichEditor<SharedSelectionPolicy>):readonly SharedAssetRecordReader[]{
 p.guard();checkSourceCheckpoint(core,p.expected.identity.source.room,p.expected.identity.source.writer);
 const readers:SharedAssetRecordReader[]=[];
 const record=<T>(kind:SharedAssetCaptureSourceKind,admit:(text:string)=>T):T=>{
  const text=p.records.get(kind);if(text===undefined)throw new SharedEditorError("backup_record_identity","Missing declared replay record");
  const value=admit(text);if(JSON.stringify(value)!==text)throw new SharedEditorError("backup_format","Replay records must retain canonical original bytes");return value;
 };
 if(p.expected.identity.stores.includes("paired-session")){
  const value=record("paired-session",text=>readPairedBackupRecord(text,p.expected.identity.source));
  if(core.checkpointJson()!==value.documentCheckpointJson||core.reviewCheckpoint()!==value.reviewCheckpointJson)throw new SharedEditorError("backup_native_replay","Both native replay journals must match the original record");
  admitPairedVersions(core,value.versions);
  const relay="relay"in value?value.relay:undefined,progress="progress"in value?value.progress:undefined;
  if(relay&&!core.supportsReviewTransport())throw new SharedEditorError("review_transport_unavailable","Paired relay storage needs matching native lineage proofs");
  if(progress)checkPairedNativeProgress(core,relay??undefined,value.principal,progress);
  readers.push({kind:"paired-session",read:()=>value});
 }
 if(p.versions){
  if(!core.supportsVersionSourceProofs())throw new SharedEditorError("backup_native_replay","Matching native version source proofs are required");
  const value=record("version-catalog",text=>checkCatalogRecord(JSON.parse(text),p.versions!.identity));admitVersionRecord(core,value);readers.push({kind:"version-catalog",read:()=>value});
 }
 if(p.suggestions){
  const value=record("suggestions",text=>checkQueueRecord(JSON.parse(text),p.suggestions!.identity,p.suggestions!.ownedHistory));
  checkSuggestionRecordSource(core,p.suggestions.identity,p.suggestions.ownedHistory);admitSuggestionRecord(core,value,p.suggestions.ownedHistory);readers.push({kind:"suggestions",read:()=>value});
 }
 if(p.revisions){
  if(!core.supportsSuggestionRevisions())throw new SharedEditorError("backup_native_replay","Matching native revision source proofs are required");
  const value=record("suggestion-revisions",text=>checkRevisionRecord(JSON.parse(text),p.suggestions!.identity,p.revisions!.binding));admitRevisionRecord(core,value);readers.push({kind:"suggestion-revisions",read:()=>value});
 }
 p.guard();return Object.freeze(readers.map(reader=>Object.freeze(reader)));
}
